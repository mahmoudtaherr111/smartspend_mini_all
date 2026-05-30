import { createClient, type RedisClientType } from "redis";
import { env } from "./env";

let redisClient: RedisClientType | null = null;
let isConnecting = false;

/**
 * Initializes and returns the Redis client singleton.
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  if (redisClient) return redisClient;
  if (!env.REDIS_URL) {
    console.warn("⚠️ REDIS_URL not provided. Redis caching disabled.");
    return null;
  }
  if (isConnecting) {
    // Wait slightly if another call is currently connecting
    await new Promise((resolve) => setTimeout(resolve, 500));
    return redisClient;
  }

  isConnecting = true;
  try {
    const client = createClient({
      url: env.REDIS_URL,
    });

    client.on("error", (err) => {
      console.error("❌ Redis Client Error", err);
    });

    client.on("connect", () => {
      console.log("✅ Redis Connected");
    });

    await client.connect();
    redisClient = client as RedisClientType;
    return redisClient;
  } catch (error) {
    console.error("❌ Failed to connect to Redis", error);
    return null;
  } finally {
    isConnecting = false;
  }
}

/**
 * Wrapper for getting cached value or computing it
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const client = await getRedisClient();
  if (!client) {
    return compute();
  }

  try {
    const cached = await client.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    console.warn(`Redis get error for key ${key}:`, err);
  }

  const result = await compute();

  try {
    if (result !== undefined && result !== null) {
      await client.setEx(key, ttlSeconds, JSON.stringify(result));
    }
  } catch (err) {
    console.warn(`Redis set error for key ${key}:`, err);
  }

  return result;
}
