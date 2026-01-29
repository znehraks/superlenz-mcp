/**
 * Caching utility with in-memory fallback
 */

import NodeCache from 'node-cache';
import { logger } from './logger.js';

export interface CacheOptions {
  stdTTL?: number; // Standard TTL in seconds
  checkperiod?: number; // Check period in seconds
  useClones?: boolean;
  maxKeys?: number;
}

export class Cache {
  private cache: NodeCache;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: CacheOptions = {}) {
    this.cache = new NodeCache({
      stdTTL: options.stdTTL || 600, // 10 minutes default
      checkperiod: options.checkperiod || 120, // 2 minutes
      useClones: options.useClones ?? true,
      maxKeys: options.maxKeys || 1000,
    });

    // Log cache events
    this.cache.on('set', (key) => {
      logger.debug('Cache set', { key });
    });

    this.cache.on('expired', (key) => {
      logger.debug('Cache expired', { key });
    });

    this.cache.on('del', (key) => {
      logger.debug('Cache deleted', { key });
    });
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | undefined {
    const value = this.cache.get<T>(key);

    if (value !== undefined) {
      this.hits++;
      logger.debug('Cache hit', { key });
    } else {
      this.misses++;
      logger.debug('Cache miss', { key });
    }

    return value;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): boolean {
    return this.cache.set(key, value, ttl || 0);
  }

  /**
   * Delete value from cache
   */
  del(key: string): number {
    return this.cache.del(key);
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get or set pattern - fetch if not in cache
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Get multiple keys
   */
  mget<T>(keys: string[]): Record<string, T> {
    return this.cache.mget(keys) as Record<string, T>;
  }

  /**
   * Set multiple key-value pairs
   */
  mset<T>(keyValuePairs: Array<{ key: string; val: T; ttl?: number }>): boolean {
    return this.cache.mset(keyValuePairs);
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return this.cache.keys();
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.flushAll();
    this.hits = 0;
    this.misses = 0;
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    keys: number;
    hits: number;
    misses: number;
    hitRate: number;
    ksize: number;
    vsize: number;
  } {
    const stats = this.cache.getStats();
    const total = this.hits + this.misses;

    return {
      keys: stats.keys,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      ksize: stats.ksize,
      vsize: stats.vsize,
    };
  }

  /**
   * Get TTL for a key
   */
  getTtl(key: string): number | undefined {
    return this.cache.getTtl(key);
  }

  /**
   * Update TTL for a key
   */
  ttl(key: string, ttl: number): boolean {
    return this.cache.ttl(key, ttl);
  }

  /**
   * Close cache (cleanup)
   */
  close(): void {
    this.cache.close();
  }
}

// Singleton instance
let instance: Cache | null = null;

export function getCache(options?: CacheOptions): Cache {
  if (!instance) {
    instance = new Cache(options);
  }
  return instance;
}

export function resetCache(): void {
  if (instance) {
    instance.close();
  }
  instance = null;
}

export default Cache;
