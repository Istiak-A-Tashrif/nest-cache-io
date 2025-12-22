import { DynamicModule, Module, Provider } from '@nestjs/common';
import { REDIS_CACHE_OPTIONS } from './redis-cache.constants';
import {
  RedisCacheModuleAsyncOptions,
  RedisCacheModuleOptions,
  RedisCacheModuleOptionsFactory,
} from './redis-cache.interface';
import { RedisCacheService } from './redis-cache.service';

@Module({})
export class RedisCacheModule {
  /**
   * Register the Redis Cache module synchronously
   * @param options Configuration options
   * @returns Dynamic module
   */
  static forRoot(options: RedisCacheModuleOptions = {}): DynamicModule {
    const isGlobal = options.isGlobal !== undefined ? options.isGlobal : true;
    
    return {
      global: isGlobal,
      module: RedisCacheModule,
      providers: [
        {
          provide: REDIS_CACHE_OPTIONS,
          useValue: options,
        },
        RedisCacheService,
      ],
      exports: [RedisCacheService],
    };
  }

  /**
   * Register the Redis Cache module asynchronously
   * @param options Async configuration options
   * @returns Dynamic module
   */
  static forRootAsync(options: RedisCacheModuleAsyncOptions): DynamicModule {
    const isGlobal = options.isGlobal !== undefined ? options.isGlobal : true;
    
    return {
      global: isGlobal,
      module: RedisCacheModule,
      imports: options.imports || [],
      providers: [
        ...this.createAsyncProviders(options),
        RedisCacheService,
      ],
      exports: [RedisCacheService],
    };
  }

  private static createAsyncProviders(
    options: RedisCacheModuleAsyncOptions,
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }

    return [
      this.createAsyncOptionsProvider(options),
      {
        provide: options.useClass!,
        useClass: options.useClass!,
      },
    ];
  }

  private static createAsyncOptionsProvider(
    options: RedisCacheModuleAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: REDIS_CACHE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }

    return {
      provide: REDIS_CACHE_OPTIONS,
      useFactory: async (optionsFactory: RedisCacheModuleOptionsFactory) =>
        await optionsFactory.createRedisCacheOptions(),
      inject: [options.useExisting || options.useClass!],
    };
  }
}
