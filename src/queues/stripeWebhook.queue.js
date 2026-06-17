import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';

export const STRIPE_WEBHOOK_QUEUE_NAME = 'stripe-webhooks';

export const stripeWebhookQueue = new Queue(STRIPE_WEBHOOK_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 60 * 60 * 24 * 7,
      count: 1000,
    },
    removeOnFail: {
      age: 60 * 60 * 24 * 30,
    },
  },
});

stripeWebhookQueue.on('error', (error) => {
  console.error('[stripe-queue] Redis/queue error:', error.message);
});

export async function enqueueStripeWebhookEvent(event) {
  return stripeWebhookQueue.add(
    event.type,
    {
      eventId: event.id,
      type: event.type,
      created: event.created,
      livemode: event.livemode,
      data: event.data,
    },
    {
      jobId: event.id,
    },
  );
}
