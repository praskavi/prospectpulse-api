import supabase from '../config/supabaseClient.js';
import { FREE_PLAN_REENTRY_LOCKOUT_DAYS, PLAN_LIMITS } from '../config/plans.js';

function getPlanFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_GROWTH) return 'growth';
  return null;
}

async function updateProfileWithOptionalBillingFields({ userId, fields, fallbackFields }) {
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId);

  if (!error) return;

  const fallback = await supabase
    .from('profiles')
    .update(fallbackFields)
    .eq('id', userId);

  if (fallback.error) {
    throw fallback.error;
  }

  console.warn(
    '[stripe-worker] Updated profile without billing metadata columns. ' +
    'Apply the billing profile migrations to persist cancellation metadata.',
  );
}

async function findProfileForBillingEvent({ customerId, userId, select }) {
  if (customerId) {
    const { data, error } = await supabase
      .from('profiles')
      .select(select)
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read profile for customer ${customerId}: ${error.message}`);
    }

    if (data) return data;
  }

  if (userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select(select)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read profile for user ${userId}: ${error.message}`);
    }

    return data;
  }

  return null;
}

export async function processStripeWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      return { status: 'processed' };
    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(event.data.object);
      return { status: 'processed' };
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      return { status: 'processed' };
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object);
      return { status: 'processed' };
    default:
      console.log(`[stripe-worker] Ignored event type: ${event.type}`);
      return { status: 'ignored' };
  }
}

async function handleCheckoutCompleted(session) {
  const userId = session.client_reference_id || session.metadata?.userId;
  const plan = session.metadata?.plan;

  if (!userId || !plan) {
    console.error('[stripe-worker] checkout.session.completed missing userId or plan', session.id);
    return;
  }

  const planConfig = PLAN_LIMITS[plan];
  if (!planConfig) {
    console.error(`[stripe-worker] Unknown plan "${plan}" in session ${session.id}`);
    return;
  }

  try {
    await updateProfileWithOptionalBillingFields({
      userId,
      fallbackFields: {
        plan_code: plan,
        credits_remaining: planConfig.credits,
        stripe_customer_id: session.customer,
      },
      fields: {
        plan_code: plan,
        credits_remaining: planConfig.credits,
        stripe_customer_id: session.customer,
        subscription_cancelled_at: null,
        subscription_cancel_at: null,
        free_plan_eligible_at: null,
        last_paid_plan_code: plan,
      },
    });
  } catch (error) {
    throw new Error(`Failed to update profile for user ${userId}: ${error.message}`);
  }

  console.log(`[stripe-worker] Upgraded user ${userId} to plan="${plan}", credits=${planConfig.credits}`);

  const { error: transactionError } = await supabase.from('credit_transactions').insert({
    user_id: userId,
    transaction_type: 'subscription',
    credits: planConfig.credits,
    description: `Plan upgrade to ${planConfig.label} - ${planConfig.credits} credits added`,
  });

  if (transactionError) {
    throw new Error(`Failed to log subscription credits for user ${userId}: ${transactionError.message}`);
  }
}

async function handleSubscriptionCancelled(subscription) {
  const customerId = subscription.customer;
  if (!customerId) return;

  const profile = await findProfileForBillingEvent({
    customerId,
    userId: subscription.metadata?.userId,
    select: 'id, plan_code, credits_remaining',
  });

  if (!profile) {
    console.warn(`[stripe-worker] customer.subscription.deleted - no profile found for customer ${customerId}`);
    return;
  }

  const cancelledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000)
    : new Date();
  const freeEligibleAt = new Date(cancelledAt);
  freeEligibleAt.setDate(freeEligibleAt.getDate() + FREE_PLAN_REENTRY_LOCKOUT_DAYS);

  try {
    await updateProfileWithOptionalBillingFields({
      userId: profile.id,
      fallbackFields: {
        plan_code: 'free',
        credits_remaining: 0,
      },
      fields: {
        plan_code: 'free',
        credits_remaining: 0,
        subscription_cancelled_at: cancelledAt.toISOString(),
        subscription_cancel_at: null,
        free_plan_eligible_at: freeEligibleAt.toISOString(),
        last_paid_plan_code: profile.plan_code && profile.plan_code !== 'free'
          ? profile.plan_code
          : null,
      },
    });
  } catch (error) {
    throw new Error(`Failed to downgrade customer ${customerId}: ${error.message}`);
  }

  console.log(
    `[stripe-worker] Downgraded customer ${customerId} to restricted free plan ` +
    `(free credits eligible after ${freeEligibleAt.toISOString()})`,
  );

  const { error: transactionError } = await supabase.from('credit_transactions').insert({
    user_id: profile.id,
    transaction_type: 'subscription',
    credits: 0,
    description:
      `Subscription cancelled - free credits locked for ${FREE_PLAN_REENTRY_LOCKOUT_DAYS} days ` +
      `until ${freeEligibleAt.toISOString().split('T')[0]}`,
  });

  if (transactionError) {
    throw new Error(`Failed to log cancellation for customer ${customerId}: ${transactionError.message}`);
  }
}

async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;
  if (!customerId) return;

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = getPlanFromPriceId(priceId);
  if (!plan) {
    console.warn(`[stripe-worker] customer.subscription.updated - unknown price ${priceId}`);
    return;
  }

  const profile = await findProfileForBillingEvent({
    customerId,
    userId: subscription.metadata?.userId,
    select: 'id, plan_code, credits_remaining',
  });

  if (!profile) {
    console.warn(`[stripe-worker] customer.subscription.updated - no profile found for customer ${customerId}`);
    return;
  }

  const scheduledCancelAt = subscription.cancel_at
    ? new Date(subscription.cancel_at * 1000)
    : subscription.cancel_at_period_end && subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

  if (scheduledCancelAt) {
    try {
      await updateProfileWithOptionalBillingFields({
        userId: profile.id,
        fallbackFields: {
          plan_code: profile.plan_code,
          credits_remaining: profile.credits_remaining,
        },
        fields: {
          plan_code: profile.plan_code,
          credits_remaining: profile.credits_remaining,
          stripe_customer_id: customerId,
          subscription_cancel_at: scheduledCancelAt.toISOString(),
          last_paid_plan_code: profile.plan_code && profile.plan_code !== 'free'
            ? profile.plan_code
            : null,
        },
      });
    } catch (error) {
      throw new Error(`Failed to record scheduled cancellation for customer ${customerId}: ${error.message}`);
    }

    const { error: transactionError } = await supabase.from('credit_transactions').insert({
      user_id: profile.id,
      transaction_type: 'subscription',
      credits: 0,
      description: `Subscription scheduled to cancel on ${scheduledCancelAt.toISOString().split('T')[0]} - paid access and credits unchanged`,
    });

    if (transactionError) {
      throw new Error(`Failed to log scheduled cancellation for customer ${customerId}: ${transactionError.message}`);
    }

    console.log(
      `[stripe-worker] Recorded scheduled cancellation for customer ${customerId} at ${scheduledCancelAt.toISOString()}`,
    );
    return;
  }

  const previousPlan = profile.plan_code;
  const isGrowthToStarter = previousPlan === 'growth' && plan === 'starter';
  const isStarterToGrowth = previousPlan === 'starter' && plan === 'growth';
  const nextCredits = isStarterToGrowth
    ? (profile.credits_remaining || 0) + PLAN_LIMITS.growth.credits
    : PLAN_LIMITS[plan].credits;

  try {
    await updateProfileWithOptionalBillingFields({
      userId: profile.id,
      fallbackFields: {
        plan_code: plan,
        credits_remaining: nextCredits,
      },
      fields: {
        plan_code: plan,
        credits_remaining: nextCredits,
        stripe_customer_id: customerId,
        subscription_cancelled_at: null,
        subscription_cancel_at: null,
        free_plan_eligible_at: null,
        last_paid_plan_code: plan,
      },
    });
  } catch (error) {
    throw new Error(`Failed to update subscription plan for customer ${customerId}: ${error.message}`);
  }

  const description = isStarterToGrowth
    ? `Plan changed Starter to Growth - added ${PLAN_LIMITS.growth.credits} Growth credits to remaining balance, new balance ${nextCredits}`
    : isGrowthToStarter
      ? `Plan changed Growth to Starter - credits reset to Starter allocation of ${nextCredits}`
      : `Plan changed to ${PLAN_LIMITS[plan].label} - credits set to ${nextCredits}`;

  const { error: transactionError } = await supabase.from('credit_transactions').insert({
    user_id: profile.id,
    transaction_type: 'subscription',
    credits: 0,
    description,
  });

  if (transactionError) {
    throw new Error(`Failed to log plan change for customer ${customerId}: ${transactionError.message}`);
  }

  console.log(`[stripe-worker] Updated customer ${customerId} to plan="${plan}", credits=${nextCredits}`);
}

async function handleInvoicePaid(invoice) {
  const customerId = invoice.customer;
  const amountPaid = (invoice.amount_paid / 100).toFixed(2);
  const currency = (invoice.currency || 'usd').toUpperCase();
  const invoiceUrl = invoice.hosted_invoice_url;
  const invoicePdf = invoice.invoice_pdf;
  const periodEnd = invoice.period_end
    ? new Date(invoice.period_end * 1000).toISOString().split('T')[0]
    : null;

  console.log(
    `[stripe-worker] invoice.paid - customer=${customerId} amount=${currency} ${amountPaid}` +
    ` period_end=${periodEnd} pdf=${invoicePdf}`,
  );

  const profile = await findProfileForBillingEvent({
    customerId,
    userId: invoice.subscription_details?.metadata?.userId,
    select: 'id, plan_code',
  });

  if (!profile) {
    console.warn(`[stripe-worker] invoice.paid - no profile found for customer ${customerId}`);
    return;
  }

  const { error } = await supabase.from('credit_transactions').insert({
    user_id: profile.id,
    transaction_type: 'subscription',
    credits: 0,
    description: `Invoice paid - ${currency} ${amountPaid}` +
      (periodEnd ? ` (period to ${periodEnd})` : '') +
      (invoiceUrl ? ` - ${invoiceUrl}` : ''),
  });

  if (error) {
    throw new Error(`Failed to log invoice payment for customer ${customerId}: ${error.message}`);
  }
}
