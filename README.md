# nest-cache-io

[![npm version](https://badge.fury.io/js/nest-cache-io.svg)](https://www.npmjs.com/package/nest-cache-io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

A simplified, high-performance NestJS Redis cache module using ioredis with fire-and-forget support and debug logging.

## Features

✨ **Simple API** - Clean methods: `get`, `set`, `getOrSet`, `delKey`, `delKeys`, `delPattern`, `delPatterns`, `getKeysByPattern`, `reset`, `getStats`  
🚀 **Fire and Forget Mode** - Optional non-blocking cache operations (global + method-level override)  
🌍 **Global Module** - Register as global module by default (configurable)  
🐛 **Debug Logging** - Built-in debug mode for cache operations  
⚡ **SCAN instead of KEYS** - Non-blocking pattern deletion  
⏱️ **TTL in Seconds** - Uses Redis `EX` command for better compatibility  
🔧 **Full ioredis Config** - Access all ioredis configuration options  
� **Cache Statistics** - Monitor cache performance with built-in stats  
📦� **TypeScript First** - Full type safety and autocomplete

## Installation

```bash
# npm will automatically install peer dependencies (npm 7+)
npm install nest-cache-io
```

**Note:** This package has the following peer dependencies that will be automatically installed with npm 7+:
- `ioredis` (^5.0.0)
- `@nestjs/common` (^9.0.0 || ^10.0.0 || ^11.0.0)
- `reflect-metadata` (^0.1.13 || ^0.2.0)
- `rxjs` (^7.0.0)

## Quick Start

### 1. Import the Module

```typescript
import { Module } from "@nestjs/common";
import { RedisCacheModule } from "nest-cache-io";

@Module({
  imports: [
    RedisCacheModule.forRoot({
      redisOptions: {
        host: "localhost",
        port: 6379,
        password: "your-password", // optional
      },
      ttl: 3600, // Default TTL in seconds (optional)
      fireAndForget: false, // Set to true for non-blocking operations
      debug: false, // Set to true to enable debug logging
      isGlobal: true, // Register as global module (default: true)
    }),
  ],
})
export class AppModule {}
```

### 2. Use the Service

```typescript
import { Injectable } from "@nestjs/common";
import { RedisCacheService } from "nest-cache-io";

@Injectable()
export class UserService {
  constructor(private readonly cache: RedisCacheService) {}

  async getUser(id: string) {
    // Try to get from cache, or compute and cache
    return this.cache.getOrSet(
      `user:${id}`,
      async () => {
        // This function only runs if cache misses
        const user = await this.db.findUser(id);
        return user;
      },
      3600 // TTL in seconds
    );
  }

  async updateUser(id: string, data: any) {
    await this.db.updateUser(id, data);

    // Invalidate cache
    await this.cache.delKey(`user:${id}`);
  }
}
```

## API Reference

### Configuration Options

```typescript
interface RedisCacheModuleOptions {
  redisOptions?: RedisOptions; // All ioredis options
  ttl?: number; // Default TTL in seconds
  fireAndForget?: boolean; // Non-blocking mode (default: false)
  debug?: boolean; // Enable debug logs (default: false)
  isGlobal?: boolean; // Register as global module (default: true)
}
```

### Methods

#### `get<T>(key: string): Promise<T | null>`

Get a value from cache.

```typescript
const user = await cache.get<User>("user:123");
if (user) {
  console.log("Cache hit!", user);
}
```

#### `set<T>(key: string, value: T, ttl?: number, options?: { fireAndForget?: boolean }): Promise<void>`

Set a value in cache with optional TTL (in seconds). Optionally override global fireAndForget setting.

```typescript
await cache.set("user:123", { name: "John" }, 3600);

// Override fireAndForget for this operation
await cache.set("analytics:view", data, 60, { fireAndForget: true });
```

#### `getOrSet<T>(key: string, fn: () => Promise<T> | T, ttl?: number): Promise<T>`

Get from cache or compute and cache the result.

```typescript
const user = await cache.getOrSet(
  "user:123",
  async () => await fetchUserFromDB(123),
  3600
);
```

#### `delKey(key: string, options?: { fireAndForget?: boolean }): Promise<number>`

Delete a single key. Returns the number of keys deleted. Optionally override global fireAndForget setting.

```typescript
const deleted = await cache.delKey("user:123");
console.log(`Deleted ${deleted} key(s)`);

// Override fireAndForget for this operation
await cache.delKey("temp:data", { fireAndForget: true });
```

#### `delKeys(keys: string[], options?: { fireAndForget?: boolean }): Promise<number>`

Delete multiple keys at once. Optionally override global fireAndForget setting.

```typescript
await cache.delKeys(["user:1", "user:2", "user:3"]);

// Fire and forget
await cache.delKeys(["temp:1", "temp:2"], { fireAndForget: true });
```

#### `delPattern(pattern: string): Promise<number>`

Delete all keys matching a pattern using SCAN (non-blocking).

**Automatically handles `keyPrefix`:** If you configured a `keyPrefix` in Redis options (e.g., `keyPrefix: 'myapp:'`), the package automatically adds it when scanning and removes it when deleting. You don't need to include the prefix in your pattern!

```typescript
// If keyPrefix is 'myapp:', this automatically scans for 'myapp:user:*'
await cache.delPattern("user:*");

// Delete specific pattern
await cache.delPattern("session:2024:*");

// With keyPrefix 'myapp:', actual Redis keys: 'myapp:session:2024:*'
// But you just pass the pattern without prefix!
```

#### `delPatterns(patterns: string[]): Promise<number>`

Delete multiple patterns efficiently.

```typescript
await cache.delPatterns(["user:*", "session:*", "temp:*"]);
// Each pattern automatically gets the keyPrefix if configured
```

#### `reset(options?: { fireAndForget?: boolean }): Promise<void>`

Clear all cache (flushdb). Optionally override global fireAndForget setting.

```typescript
await cache.reset(); // ⚠️ Use with caution!

// Fire and forget
await cache.reset({ fireAndForget: true });
```

#### `getKeysByPattern(pattern: string): Promise<string[]>`

Get all keys matching a pattern using SCAN (non-blocking). Returns keys without the prefix.

**Automatically handles `keyPrefix`:** Just like `delPattern`, this method automatically adds the keyPrefix when scanning and removes it from the returned keys.

```typescript
// Get all user keys (automatically handles keyPrefix)
const userKeys = await cache.getKeysByPattern("user:*");
console.log(userKeys); // ['user:1', 'user:2', 'user:3']
// Note: No prefix in returned keys, even if keyPrefix is configured!

// Get session keys for specific date
const sessionKeys = await cache.getKeysByPattern("session:2024-12:*");

// Useful for debugging or monitoring
const allKeys = await cache.getKeysByPattern("*");
console.log(`Total keys: ${allKeys.length}`);
```

#### `getStats(): Promise<CacheStats>`

Get Redis cache statistics including key count, memory usage, and connection status.

```typescript
const stats = await cache.getStats();
console.log(stats);
// {
//   connected: true,
//   keyCount: 1250,
//   memoryUsed: '2.5M',
//   memoryPeak: '3.1M',
//   memoryFragmentationRatio: '1.05'
// }
```

#### `getClient(): Redis`

Get the underlying ioredis client for advanced operations.

```typescript
const client = cache.getClient();
await client.ping(); // Direct ioredis access
```

## Advanced Configuration

### Async Configuration

```typescript
import { RedisCacheModule } from "nest-cache-io";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    RedisCacheModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redisOptions: {
          host: configService.get("REDIS_HOST"),
          port: configService.get("REDIS_PORT"),
          password: configService.get("REDIS_PASSWORD"),
          db: configService.get("REDIS_DB", 0),
          keyPrefix: "myapp:", // Add prefix to all keys
          retryStrategy: (times) => Math.min(times * 50, 2000),
        },
        ttl: 3600,
        fireAndForget: false,
        debug: configService.get("NODE_ENV") === "development",
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Global vs Non-Global Module

By default, the module is registered as **global** (available everywhere without re-importing). You can change this:

```typescript
// Global (default) - available in all modules
RedisCacheModule.forRoot({
  isGlobal: true, // default
  redisOptions: {
    /* ... */
  },
});

// Non-global - must import in each module that needs it
RedisCacheModule.forRoot({
  isGlobal: false,
  redisOptions: {
    /* ... */
  },
});
```

### Full ioredis Configuration

All ioredis options are supported:

```typescript
RedisCacheModule.forRoot({
  redisOptions: {
    host: "localhost",
    port: 6379,
    password: "secret",
    db: 0,
    keyPrefix: "myapp:",

    // Connection
    connectTimeout: 10000,
    lazyConnect: false,
    keepAlive: 30000,

    // Retry
    retryStrategy: (times) => Math.min(times * 100, 3000),
    maxRetriesPerRequest: 3,

    // TLS
    tls: {
      ca: fs.readFileSync("ca.crt"),
    },

    // Sentinel
    sentinels: [
      { host: "sentinel1", port: 26379 },
      { host: "sentinel2", port: 26379 },
    ],
    name: "mymaster",
  },
  ttl: 3600,
  debug: true,
});
```

## Fire and Forget Mode

When `fireAndForget: true`, cache operations don't wait for Redis responses:

```typescript
RedisCacheModule.forRoot({
  fireAndForget: true, // Global non-blocking mode
  redisOptions: { host: "localhost", port: 6379 },
});

// This returns immediately without waiting for Redis
await cache.set("key", "value"); // Fires and forgets

// Note: get() always waits for response
const value = await cache.get("key"); // Always waits
```

### Method-Level Override

You can override the global `fireAndForget` setting for individual operations:

```typescript
// Global setting: fireAndForget = false (wait for responses)
RedisCacheModule.forRoot({
  fireAndForget: false,
  redisOptions: {
    /* ... */
  },
});

// In your service:
// Wait for this operation (uses global setting)
await cache.set("important:data", value, 3600);

// Fire and forget for this specific operation
await cache.set("analytics:event", data, 60, { fireAndForget: true });

// Same for delete operations
await cache.delKey("temp:data", { fireAndForget: true });
await cache.delKeys(["temp:1", "temp:2"], { fireAndForget: true });
await cache.reset({ fireAndForget: true });
```

**Use cases:**

- High-throughput applications
- When cache failures shouldn't block requests
- Fire-and-forget cache warming
- Analytics/logging that doesn't need confirmation
- Temporary data that can be lost

## Debug Mode

Enable debug logging to see all cache operations:

```typescript
RedisCacheModule.forRoot({
  debug: true,
  redisOptions: { host: "localhost", port: 6379 },
});
```

**Example debug output:**

```
[RedisCacheService] DEBUG GET key: user:123 - HIT
[RedisCacheService] DEBUG SET key: user:456, ttl: 3600s
[RedisCacheService] DEBUG DEL pattern: session:* - deleted 25 keys
[RedisCacheService] DEBUG GETORSET key: user:789
[RedisCacheService] DEBUG GETORSET key: user:789 - computing value
[RedisCacheService] DEBUG SET key: user:789, ttl: 3600s
```

## Examples

### Cache User Data

```typescript
@Injectable()
export class UserService {
  constructor(private cache: RedisCacheService) {}

  async findOne(id: string): Promise<User> {
    return this.cache.getOrSet(
      `user:${id}`,
      () => this.userRepository.findOne(id),
      3600 // 1 hour
    );
  }

  async update(id: string, data: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.update(id, data);

    // Invalidate cache
    await this.cache.delKey(`user:${id}`);

    return user;
  }

  async delete(id: string): Promise<void> {
    await this.userRepository.delete(id);
    await this.cache.delKey(`user:${id}`);
  }
}
```

### Cache API Responses

```typescript
@Injectable()
export class ApiService {
  constructor(private cache: RedisCacheService) {}

  async fetchData(endpoint: string): Promise<any> {
    const cacheKey = `api:${endpoint}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const response = await fetch(endpoint);
        return response.json();
      },
      300 // 5 minutes
    );
  }
}
```

### Batch Invalidation

```typescript
@Injectable()
export class CacheService {
  constructor(private cache: RedisCacheService) {}

  async clearUserCache(userId: string): Promise<void> {
    // Clear all user-related cache
    await this.cache.delPatterns([
      `user:${userId}:*`,
      `profile:${userId}:*`,
      `permissions:${userId}:*`,
    ]);
  }

  async clearAllSessions(): Promise<void> {
    const deleted = await this.cache.delPattern("session:*");
    console.log(`Cleared ${deleted} sessions`);
  }
}
```

### Session Management

```typescript
@Injectable()
export class SessionService {
  constructor(private cache: RedisCacheService) {}

  async createSession(userId: string, data: any): Promise<string> {
    const sessionId = generateId();
    const key = `session:${sessionId}`;

    await this.cache.set(key, { userId, ...data }, 86400); // 24 hours

    return sessionId;
  }

  async getSession(sessionId: string): Promise<any> {
    return this.cache.get(`session:${sessionId}`);
  }

  async destroySession(sessionId: string): Promise<void> {
    await this.cache.delKey(`session:${sessionId}`);
  }

  async destroyUserSessions(userId: string): Promise<number> {
    // Find and delete all sessions for user
    return this.cache.delPattern(`session:*:${userId}`);
  }
}
```

### Monitor Cache Performance

```typescript
@Injectable()
export class MonitoringService {
  constructor(private cache: RedisCacheService) {}

  async getCacheHealth(): Promise<any> {
    const stats = await this.cache.getStats();

    return {
      status: stats.connected ? "healthy" : "unhealthy",
      metrics: {
        totalKeys: stats.keyCount,
        memoryUsed: stats.memoryUsed,
        memoryPeak: stats.memoryPeak,
        fragmentationRatio: stats.memoryFragmentationRatio,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async checkCacheLimit(): Promise<void> {
    const stats = await this.cache.getStats();

    if (stats.keyCount > 10000) {
      this.logger.warn(`Cache has ${stats.keyCount} keys - consider cleanup`);
    }

    // Parse memory (e.g., "2.5M" -> 2.5)
    const memoryMB = parseFloat(stats.memoryUsed);
    if (memoryMB > 100) {
      this.logger.warn(
        `Cache using ${stats.memoryUsed} - consider optimization`
      );
    }
  }
}
```

## Best Practices

### 1. Use Consistent Key Patterns

```typescript
// Good: namespace:entity:id
user:123
user:123:profile
user:123:permissions
session:abc123
product:456

// Makes pattern deletion easier
await cache.delPattern('user:123:*');
```

### 2. Set Appropriate TTLs

```typescript
// Short-lived data
await cache.set("rate-limit:user:123", count, 60); // 1 minute

// Medium-lived data
await cache.set("user:123", user, 3600); // 1 hour

// Long-lived data
await cache.set("config:app", config, 86400); // 24 hours
```

### 3. Handle Cache Misses Gracefully

```typescript
async getUser(id: string): Promise<User | null> {
  try {
    return await this.cache.getOrSet(
      `user:${id}`,
      () => this.db.findUser(id),
      3600
    );
  } catch (error) {
    // Log error but don't fail request
    this.logger.error('Cache error:', error);
    return this.db.findUser(id); // Fallback to DB
  }
}
```

### 4. Use Fire-and-Forget for Non-Critical Cache

```typescript
// Configure fire-and-forget for specific module
@Module({
  imports: [
    RedisCacheModule.register({
      fireAndForget: true, // Don't block on cache writes
      redisOptions: {
        /* ... */
      },
    }),
  ],
})
export class AnalyticsModule {}
```

## TypeScript Support

Full TypeScript support with generics:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

// Type-safe cache operations
const user = await cache.get<User>("user:123");
if (user) {
  console.log(user.name); // TypeScript knows this is a string
}

await cache.set<User>("user:123", {
  id: "123",
  name: "John",
  email: "john@example.com",
});

const users = await cache.get<User[]>("users:active");
```

## Testing

Mock the cache service in tests:

```typescript
import { Test } from "@nestjs/testing";
import { RedisCacheService } from "nest-cache-io";

describe("UserService", () => {
  let service: UserService;
  let cache: RedisCacheService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: RedisCacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            getOrSet: jest.fn(),
            delKey: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    cache = module.get<RedisCacheService>(RedisCacheService);
  });

  it("should get user from cache", async () => {
    const mockUser = { id: "123", name: "John" };
    jest.spyOn(cache, "get").mockResolvedValue(mockUser);

    const result = await service.getUser("123");

    expect(cache.get).toHaveBeenCalledWith("user:123");
    expect(result).toEqual(mockUser);
  });
});
```

## Troubleshooting

### Connection Issues

Enable debug mode to see connection logs:

```typescript
RedisCacheModule.register({
  debug: true,
  redisOptions: {
    host: "localhost",
    port: 6379,
    retryStrategy: (times) => {
      console.log(`Retry attempt ${times}`);
      return Math.min(times * 100, 3000);
    },
  },
});
```

### Memory Issues

Monitor Redis memory and set maxmemory policy:

```bash
# In redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

### Performance Issues

- Use `fireAndForget: true` for high-throughput scenarios
- Use `delPattern()` instead of multiple `delKey()` calls
- Batch operations with `delKeys()` instead of individual deletes
- Set appropriate TTLs to prevent memory bloat

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

- GitHub Issues: [Report a bug](https://github.com/Istiak-A-Tashrif/nest-cache-io/issues)
- Documentation: [Full docs](https://github.com/Istiak-A-Tashrif/nest-cache-io#readme)
