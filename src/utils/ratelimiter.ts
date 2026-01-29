/**
 * Rate limiter using Bottleneck
 */

import Bottleneck from 'bottleneck';
import { logger } from './logger.js';

export interface RateLimitConfig {
  maxConcurrent?: number;
  minTime?: number; // Minimum time between requests (ms)
  maxRequests?: number; // Maximum requests per reservoir period
  reservoirRefreshInterval?: number; // Reservoir refresh interval (ms)
  reservoirRefreshAmount?: number; // Amount to refresh reservoir
}

export class RateLimiter {
  private limiter: Bottleneck;
  private name: string;

  constructor(name: string, config: RateLimitConfig = {}) {
    this.name = name;

    const reservoir = config.maxRequests && config.reservoirRefreshInterval
      ? config.maxRequests
      : null;

    const reservoirRefreshInterval = config.reservoirRefreshInterval || null;
    const reservoirRefreshAmount = config.reservoirRefreshAmount || config.maxRequests || null;

    this.limiter = new Bottleneck({
      maxConcurrent: config.maxConcurrent || 1,
      minTime: config.minTime || 0,
      reservoir,
      reservoirRefreshInterval,
      reservoirRefreshAmount,
    });

    // Log when jobs fail
    this.limiter.on('failed', (error, jobInfo) => {
      logger.warn(`Rate limiter [${this.name}] job failed`, {
        error: error.message,
        retryCount: jobInfo.retryCount,
      });
    });

    // Log when rate limit is reached
    this.limiter.on('depleted', () => {
      logger.debug(`Rate limiter [${this.name}] depleted`);
    });
  }

  /**
   * Schedule a function to run with rate limiting
   */
  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(fn);
  }

  /**
   * Wrap a function with rate limiting
   */
  wrap<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return this.limiter.wrap(fn) as unknown as T;
  }

  /**
   * Get current counts
   */
  counts(): Bottleneck.Counts {
    return this.limiter.counts();
  }

  /**
   * Check if limiter is currently throttled
   */
  isThrottled(): boolean {
    const counts = this.limiter.counts();
    // Bottleneck doesn't expose maxConcurrent directly, so we check if we have queued items
    return counts.QUEUED > 0;
  }

  /**
   * Get limiter statistics
   */
  getStats(): {
    name: string;
    executing: number;
    queued: number;
    running: number;
    done: number;
    received: number;
  } {
    const counts = this.limiter.counts();
    return {
      name: this.name,
      executing: counts.EXECUTING || 0,
      queued: counts.QUEUED || 0,
      running: counts.RUNNING || 0,
      done: counts.DONE || 0,
      received: counts.RECEIVED || 0,
    };
  }

  /**
   * Stop accepting new jobs
   */
  async stop(): Promise<void> {
    await this.limiter.stop();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.limiter.disconnect();
  }
}

// Rate limiter registry
const limiters = new Map<string, RateLimiter>();

/**
 * Get or create a rate limiter
 */
export function getRateLimiter(name: string, config?: RateLimitConfig): RateLimiter {
  if (!limiters.has(name)) {
    limiters.set(name, new RateLimiter(name, config));
  }
  return limiters.get(name)!;
}

/**
 * Create a rate limiter from API config
 */
export function createRateLimiterFromConfig(
  name: string,
  config: {
    maxRequests?: number;
    perMinutes?: number;
    perSeconds?: number;
    perDay?: number;
  }
): RateLimiter {
  let reservoirRefreshInterval: number | undefined;
  let maxRequests: number | undefined;

  if (config.perMinutes && config.maxRequests) {
    reservoirRefreshInterval = config.perMinutes * 60 * 1000;
    maxRequests = config.maxRequests;
  } else if (config.perSeconds && config.maxRequests) {
    reservoirRefreshInterval = config.perSeconds * 1000;
    maxRequests = config.maxRequests;
  } else if (config.perDay && config.maxRequests) {
    reservoirRefreshInterval = 24 * 60 * 60 * 1000;
    maxRequests = config.maxRequests;
  }

  return getRateLimiter(name, {
    maxConcurrent: 1,
    maxRequests,
    reservoirRefreshInterval,
    reservoirRefreshAmount: maxRequests,
  });
}

/**
 * Get all rate limiters
 */
export function getAllRateLimiters(): Map<string, RateLimiter> {
  return limiters;
}

/**
 * Clear all rate limiters
 */
export function clearRateLimiters(): void {
  for (const limiter of limiters.values()) {
    limiter.disconnect();
  }
  limiters.clear();
}

export default RateLimiter;
