import { ModuleMetadata, Type } from '@nestjs/common';
import { RedisOptions } from 'ioredis';

/**
 * Options for cache operations
 */
export interface CacheOperationOptions {
  /**
   * Override global fireAndForget setting for this operation
   */
  fireAndForget?: boolean;
}

/**
 * Configuration options for the Redis Cache module
 */
export interface RedisCacheModuleOptions {
  /**
   * ioredis configuration options
   * See: https://redis.github.io/ioredis/index.html#RedisOptions
   */
  redisOptions?: RedisOptions;

  /**
   * Default TTL in seconds for cached values
   * @default undefined (no expiration)
   */
  ttl?: number;

  /**
   * Fire and forget mode - don't wait for Redis operations to complete
   * @default false
   */
  fireAndForget?: boolean;

  /**
   * Enable debug logging for cache operations (get, set, del, etc.)
   * @default false
   */
  debug?: boolean;

  /**
   * Register module as global
   * @default true
   */
  isGlobal?: boolean;
}

/**
 * Factory interface for async module configuration
 */
export interface RedisCacheModuleOptionsFactory {
  createRedisCacheOptions(): Promise<RedisCacheModuleOptions> | RedisCacheModuleOptions;
}

/**
 * Async configuration options for the Redis Cache module
 */
export interface RedisCacheModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<RedisCacheModuleOptionsFactory>;
  useClass?: Type<RedisCacheModuleOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<RedisCacheModuleOptions> | RedisCacheModuleOptions;
  inject?: any[];
  
  /**
   * Register module as global
   * @default true
   */
  isGlobal?: boolean;
}
