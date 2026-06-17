const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export function getRedisConnectionOptions() {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export { redisUrl };
