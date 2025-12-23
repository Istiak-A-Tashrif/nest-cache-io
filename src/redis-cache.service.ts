import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CACHE_OPTIONS } from './redis-cache.constants';
import { RedisCacheModuleOptions, CacheOperationOptions } from './redis-cache.interface';

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis;
  private readonly defaultTtl?: number;
  private readonly fireAndForget: boolean;
  private readonly debug: boolean;

  constructor(
    @Inject(REDIS_CACHE_OPTIONS)
    private readonly options: RedisCacheModuleOptions,
  ) {
    this.client = new Redis(options.redisOptions || {});
    this.defaultTtl = options.ttl;
    this.fireAndForget = options.fireAndForget || false;
    this.debug = options.debug || false;

    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis Client Connected');
    });

    this.client.on('reconnecting', () => {
      this.logger.log('Redis reconnecting');
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Get a value from Redis
   * @param key The cache key
   * @returns The cached value or null if not found
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);

      if (value === null) {
        this.debug && this.logger.debug(`GET key: ${key} - MISS`);
        return null;
      }

      this.debug && this.logger.debug(`GET key: ${key} - HIT`);

      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set a value in Redis
   * @param key The cache key
   * @param value The value to cache
   * @param ttl Time to live in seconds (optional)
   * @param options Optional settings including fireAndForget override
   */
  async set<T = any>(key: string, value: T, ttl?: number, options?: CacheOperationOptions): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const ttlToUse = ttl ?? this.defaultTtl;
      const useFireAndForget = options?.fireAndForget !== undefined ? options.fireAndForget : this.fireAndForget;

      this.debug && this.logger.debug(`SET key: ${key}, ttl: ${ttlToUse || 'none'}s`);

      const operation = ttlToUse
        ? this.client.set(key, serialized, 'EX', ttlToUse)
        : this.client.set(key, serialized);

      if (useFireAndForget) {
        // Don't wait for the operation to complete
        operation.catch((err) => {
          this.logger.error(`Error setting key ${key}:`, err);
        });
      } else {
        await operation;
      }
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a value from cache or compute and store it
   * @param key The cache key
   * @param fn Function to compute the value if not cached
   * @param ttl Time to live in seconds (optional)
   * @returns The cached or computed value
   */
  async getOrSet<T = any>(
    key: string,
    fn: () => Promise<T> | T,
    ttl?: number,
  ): Promise<T> {
    try {
      // Try to get from cache first (don't log internal get calls)
      const value = await this.client.get(key);
      
      if (value !== null) {
        this.debug && this.logger.debug(`GETORSET key: ${key} - HIT`);
        return JSON.parse(value) as T;
      }

      this.debug && this.logger.debug(`GETORSET key: ${key} - computing value`);

      // Compute the value
      const result = await fn();

      // Store in cache (will log SET separately if needed)
      await this.set(key, result, ttl);

      return result;
    } catch (error) {
      this.logger.error(`Error in getOrSet for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete a single key from Redis
   * @param key The cache key to delete
   * @param options Optional settings including fireAndForget override
   * @returns The number of keys deleted (0 or 1)
   */
  async delKey(key: string, options?: CacheOperationOptions): Promise<number> {
    try {
      const useFireAndForget = options?.fireAndForget !== undefined ? options.fireAndForget : this.fireAndForget;
      
      this.debug && this.logger.debug(`DEL key: ${key}`);

      const operation = this.client.del(key);

      if (useFireAndForget) {
        operation.catch((err) => {
          this.logger.error(`Error deleting key ${key}:`, err);
        });
        return 0;
      }

      const result = await operation;

      this.debug && this.logger.debug(`DEL key: ${key} - deleted: ${result}`);

      return result;
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete multiple keys from Redis
   * @param keys Array of cache keys to delete
   * @param options Optional settings including fireAndForget override
   * @returns The number of keys deleted
   */
  async delKeys(keys: string[], options?: CacheOperationOptions): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    try {
      const useFireAndForget = options?.fireAndForget !== undefined ? options.fireAndForget : this.fireAndForget;
      
      this.debug && this.logger.debug(`DEL keys: [${keys.join(', ')}] (${keys.length} keys)`);

      const operation = this.client.del(...keys);

      if (useFireAndForget) {
        operation.catch((err) => {
          this.logger.error(`Error deleting keys:`, err);
        });
        return 0;
      }

      const result = await operation;

      this.debug && this.logger.debug(`DEL keys - deleted: ${result}`);

      return result;
    } catch (error) {
      this.logger.error(`Error deleting keys:`, error);
      throw error;
    }
  }

  /**
   * Delete all keys matching a pattern using SCAN (non-blocking)
   * Automatically handles keyPrefix from Redis client options
   * @param pattern Redis pattern (e.g., 'user:*')
   * @returns The number of keys deleted
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      // Get the keyPrefix from the client options
      const keyPrefix = this.client.options.keyPrefix || '';
      
      // Build the full pattern with prefix for SCAN
      const fullPattern = `${keyPrefix}${pattern}`;

      let cursor = '0';
      const allKeys: string[] = [];

      // Use SCAN instead of KEYS for better performance
      // SCAN searches the actual Redis keys (with prefix)
      do {
        const result = await this.client.scan(
          cursor,
          'MATCH',
          fullPattern,
          'COUNT',
          100,
        );
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          // Remove prefix from keys since ioredis client automatically adds it
          const keysWithoutPrefix = keyPrefix 
            ? keys.map(key => key.replace(keyPrefix, ''))
            : keys;
          allKeys.push(...keysWithoutPrefix);
        }
      } while (cursor !== '0');

      if (allKeys.length === 0) {
        this.debug && this.logger.debug(`DEL pattern: ${pattern} - no keys found`);
        return 0;
      }

      // Delete keys directly without calling delKeys() to avoid duplicate logs
      const operation = this.client.del(...allKeys);

      let totalDeleted: number;
      if (this.fireAndForget) {
        operation.catch((err) => {
          this.logger.error(`Error deleting pattern ${pattern}:`, err);
        });
        totalDeleted = 0;
      } else {
        totalDeleted = await operation;
      }

      this.debug && this.logger.debug(`DEL pattern: ${pattern} - deleted ${totalDeleted} keys`);

      return totalDeleted;
    } catch (error) {
      this.logger.error(`Error deleting pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Delete all keys matching multiple patterns
   * @param patterns Array of Redis patterns
   * @returns The number of keys deleted
   */
  async delPatterns(patterns: string[]): Promise<number> {
    if (patterns.length === 0) {
      return 0;
    }

    try {
      this.debug && this.logger.debug(`DEL patterns: [${patterns.join(', ')}]`);

      let totalDeleted = 0;

      for (const pattern of patterns) {
        const deleted = await this.delPattern(pattern);
        totalDeleted += deleted;
      }

      this.debug && this.logger.debug(`DEL patterns - total deleted: ${totalDeleted}`);

      return totalDeleted;
    } catch (error) {
      this.logger.error(`Error deleting patterns:`, error);
      throw error;
    }
  }

  /**
   * Get all keys matching a pattern using SCAN (non-blocking)
   * Automatically handles keyPrefix from Redis client options
   * @param pattern Redis pattern (e.g., 'user:*')
   * @returns Array of matching keys (without prefix)
   */
  async getKeysByPattern(pattern: string): Promise<string[]> {
    try {
      // Get the keyPrefix from the client options
      const keyPrefix = this.client.options.keyPrefix || '';
      
      // Build the full pattern with prefix for SCAN
      const fullPattern = `${keyPrefix}${pattern}`;

      let cursor = '0';
      const allKeys: string[] = [];

      // Use SCAN instead of KEYS for better performance
      do {
        const result = await this.client.scan(
          cursor,
          'MATCH',
          fullPattern,
          'COUNT',
          100,
        );
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          // Remove prefix from keys for consistency
          const keysWithoutPrefix = keyPrefix 
            ? keys.map(key => key.replace(keyPrefix, ''))
            : keys;
          allKeys.push(...keysWithoutPrefix);
        }
      } while (cursor !== '0');

      this.debug && this.logger.debug(`GET keys by pattern: ${pattern} - found ${allKeys.length} keys`);

      return allKeys;
    } catch (error) {
      this.logger.error(`Error getting keys by pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Clear all cache (flushdb)
   * @param options Optional settings including fireAndForget override
   * @returns void
   */
  async reset(options?: CacheOperationOptions): Promise<void> {
    try {
      const useFireAndForget = options?.fireAndForget !== undefined ? options.fireAndForget : this.fireAndForget;
      
      this.debug && this.logger.debug('RESET - clearing all cache');

      const operation = this.client.flushdb();

      if (useFireAndForget) {
        operation.catch((err) => {
          this.logger.error('Error resetting cache:', err);
        });
      } else {
        await operation;
      }

      this.debug && this.logger.debug('RESET - cache cleared');
    } catch (error) {
      this.logger.error('Error resetting cache:', error);
      throw error;
    }
  }

  /**
   * Get Redis cache statistics
   * @returns Statistics about cache (keys count, memory usage, connection status)
   */
  async getStats(): Promise<{
    connected: boolean;
    keyCount: number;
    memoryUsed?: string;
    memoryPeak?: string;
    memoryFragmentationRatio?: string;
    error?: string;
  }> {
    try {
      const connected = this.client.status === 'ready';
      
      if (!connected) {
        return {
          connected: false,
          keyCount: 0,
          error: 'Redis not connected',
        };
      }

      const keyCount = await this.client.dbsize();
      const memoryInfo = await this.client.info('memory');

      // Parse memory info
      const memoryUsed = this.parseMemoryInfo(memoryInfo, 'used_memory_human');
      const memoryPeak = this.parseMemoryInfo(memoryInfo, 'used_memory_peak_human');
      const memoryFragmentationRatio = this.parseMemoryInfo(memoryInfo, 'mem_fragmentation_ratio');

      this.debug && this.logger.debug(`STATS - keys: ${keyCount}, memory: ${memoryUsed}`);

      return {
        connected,
        keyCount,
        memoryUsed,
        memoryPeak,
        memoryFragmentationRatio,
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      return {
        connected: false,
        keyCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * Parse memory info from Redis INFO command
   */
  private parseMemoryInfo(info: string, key: string): string | undefined {
    const regex = new RegExp(`${key}:(.+)`);
    const match = info.match(regex);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Get the underlying ioredis client for advanced operations
   * @returns The ioredis client instance
   */
  getClient(): Redis {
    return this.client;
  }
}
