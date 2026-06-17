import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// Stripe client — null when key not configured (prevents crashes in dev without Stripe)
const stripe = stripeSecretKey && !stripeSecretKey.includes('REPLACE_ME')
  ? new Stripe(stripeSecretKey, { apiVersion: '2026-05-27.dahlia' })
  : null;

export default stripe;
