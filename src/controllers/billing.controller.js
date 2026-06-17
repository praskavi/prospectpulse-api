import stripe from '../config/stripe.js';
import supabase from '../config/supabaseClient.js';
import { PLAN_LIMITS, PLAN_RETENTION_DAYS } from '../config/plans.js';
import { AppError } from '../middleware/errorHandler.js';
import { enqueueStripeWebhookEvent } from '../queues/stripeWebhook.queue.js';
import {
  markStripeWebhookQueued,
  recordStripeWebhookReceived,
} from '../services/stripeWebhookEvents.service.js';

function getPriceId(plan) {
  const priceMap = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
  };
  return priceMap[plan] || null;
}

function getPlanFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_GROWTH) return 'growth';
  return null;
}

async function findStripeCustomerByEmail(email) {
  if (!email) return null;

  const customers = await stripe.customers.search({
    query: `email:'${email.replace(/'/g, "\\'")}'`,
    limit: 10,
  });

  return customers.data
    .filter(customer => !customer.deleted)
    .sort((a, b) => b.created - a.created)[0] || null;
}

async function ensureStripeCustomer({ profile, user }) {
  if (profile?.stripe_customer_id) {
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
    if (customer && !customer.deleted) return customer;
  }

  const existingCustomer = await findStripeCustomerByEmail(user.email);
  if (existingCustomer) {
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: existingCustomer.id })
      .eq('id', user.id);

    return existingCustomer;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: {
      userId: user.id,
    },
  });

  await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', user.id);

  return customer;
}

export async function getBillingPlans(req, res, next) {
  try {
    const plans = Object.entries(PLAN_LIMITS).map(([code, limits]) => ({
      code,
      label: limits.label,
      credits: limits.credits,
      maxResults: limits.maxResults,
      categoryTerms: limits.categoryTerms,
      scrapeContacts: limits.scrapeContacts,
      maxLeadsPerPlace: limits.maxLeadsPerPlace,
      emailVerification: limits.emailVerification,
      contactUnlock: limits.contactUnlock,
      unlockCost: limits.unlockCost,
      retentionDays: PLAN_RETENTION_DAYS[code],
    }));

    res.status(200).json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
}

async function getActiveSubscription(customerId) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
    expand: ['data.items.data.price'],
  });

  return subscriptions.data.find(subscription =>
    ['active', 'trialing', 'past_due', 'unpaid'].includes(subscription.status) &&
    !subscription.cancel_at_period_end
  ) || null;
}

async function updateExistingSubscription({ subscription, targetPlan, targetPriceId }) {
  const currentItem = subscription.items.data[0];
  const currentPlan = getPlanFromPriceId(currentItem?.price?.id);

  if (currentPlan === targetPlan) {
    throw new AppError(`You are already on the ${targetPlan} plan.`, 400);
  }

  const isGrowthToStarter = currentPlan === 'growth' && targetPlan === 'starter';
  const isStarterToGrowth = currentPlan === 'starter' && targetPlan === 'growth';

  await stripe.subscriptions.update(subscription.id, {
    cancel_at_period_end: false,
    ...(isStarterToGrowth ? { billing_cycle_anchor: 'now' } : {}),
    items: [{
      id: currentItem.id,
      price: targetPriceId,
    }],
    metadata: {
      ...subscription.metadata,
      plan: targetPlan,
      creditRule: isGrowthToStarter
        ? 'reset_to_starter'
        : isStarterToGrowth
          ? 'add_growth_credits'
          : 'plan_change',
    },
    proration_behavior: 'none',
  });

  return { currentPlan, isGrowthToStarter };
}

export async function createCheckoutSession(req, res, next) {
  try {
    if (!stripe) throw new AppError('Stripe is not configured on this server.', 503);

    const { plan } = req.body;
    if (!plan || !['starter', 'growth'].includes(plan)) {
      throw new AppError('plan must be "starter" or "growth"', 400);
    }

    const priceId = getPriceId(plan);
    if (!priceId || priceId.includes('REPLACE_ME')) {
      throw new AppError(`Stripe price ID for plan "${plan}" is not configured.`, 503);
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, plan_code, credits_remaining')
      .eq('id', req.user.id)
      .maybeSingle();

    const customer = await ensureStripeCustomer({ profile, user: req.user });

    if (customer?.id) {
      const subscription = await getActiveSubscription(customer.id);

      if (subscription) {
        const update = await updateExistingSubscription({
          subscription,
          targetPlan: plan,
          targetPriceId: priceId,
        });

        const portalSession = await stripe.billingPortal.sessions.create({
          customer: customer.id,
          return_url: `${appUrl}/app.html`,
        });

        return res.status(200).json({
          success: true,
          url: portalSession.url,
          message: update.isGrowthToStarter
            ? 'Plan changed to Starter. Credits will reset to the Starter allocation.'
            : `Plan changed to ${plan}.`,
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: req.user.id,
      customer: customer.id,
      metadata: { plan, userId: req.user.id },
      subscription_data: {
        metadata: { plan, userId: req.user.id },
      },
      success_url: `${appUrl}/billing-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/app.html`,
    });

    res.status(200).json({ success: true, url: session.url });
  } catch (error) {
    next(error);
  }
}

export async function handleWebhook(req, res, next) {
  try {
    if (!stripe) return res.status(200).json({ received: true });

    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || webhookSecret.includes('REPLACE_ME')) {
      throw new AppError('Stripe webhook secret is not configured on this server.', 503);
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error) {
      console.error('[webhook] Signature verification failed:', error.message);
      return res.status(400).json({ error: `Webhook Error: ${error.message}` });
    }

    await recordStripeWebhookReceived(event);
    const job = await enqueueStripeWebhookEvent(event);
    await markStripeWebhookQueued(event.id, job.id);
    console.log(`[webhook] Queued Stripe event ${event.id} (${event.type}) as job ${job.id}`);

    res.status(200).json({ received: true, queued: true });
  } catch (error) {
    next(error);
  }
}

export async function createPortalSession(req, res, next) {
  try {
    if (!stripe) throw new AppError('Stripe is not configured on this server.', 503);

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', req.user.id)
      .single();

    if (error || !profile?.stripe_customer_id) {
      throw new AppError('No active subscription found. Please upgrade first.', 400);
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/app.html`,
    });

    res.status(200).json({ success: true, url: session.url });
  } catch (error) {
    next(error);
  }
}
