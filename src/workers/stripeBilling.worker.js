import 'dotenv/config';
import { Worker } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { STRIPE_WEBHOOK_QUEUE_NAME } from '../queues/stripeWebhook.queue.js';
import { processStripeWebhookEvent } from '../services/stripeBilling.service.js';
import {
  markStripeWebhookFailed,
  markStripeWebhookProcessed,
  markStripeWebhookProcessing,
} from '../services/stripeWebhookEvents.service.js';

const worker = new Worker(
  STRIPE_WEBHOOK_QUEUE_NAME,
  async (job) => {
    const event = {
      id: job.data.eventId,
      type: job.data.type,
      created: job.data.created,
      livemode: job.data.livemode,
      data: job.data.data,
    };

    console.log(`[stripe-worker] Processing ${event.id} (${event.type})`);
    await markStripeWebhookProcessing(event.id, job.attemptsMade + 1);
    const result = await processStripeWebhookEvent(event);
    await markStripeWebhookProcessed(event.id, result?.status === 'ignored' ? 'ignored' : 'processed');
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: Number(process.env.STRIPE_WEBHOOK_WORKER_CONCURRENCY || 5),
  },
);

worker.on('completed', (job) => {
  console.log(`[stripe-worker] Completed job ${job.id} (${job.name})`);
});

worker.on('failed', (job, error) => {
  console.error(`[stripe-worker] Failed job ${job?.id} (${job?.name}):`, error.message);
  if (job?.data?.eventId) {
    markStripeWebhookFailed(job.data.eventId, error, job.attemptsMade).catch(markError => {
      console.error('[stripe-worker] Failed to record webhook failure:', markError.message);
    });
  }
});

worker.on('error', (error) => {
  console.error('[stripe-worker] Worker error:', error.message);
});

async function shutdown(signal) {
  console.log(`[stripe-worker] Received ${signal}, closing worker...`);
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log(`[stripe-worker] Listening on queue "${STRIPE_WEBHOOK_QUEUE_NAME}"`);
