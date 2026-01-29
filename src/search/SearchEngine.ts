/**
 * Core search engine that coordinates multiple search providers
 */

import type { SearchProvider, SearchResult, SourceType } from '../core/types.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import { getCache } from '../utils/cache.js';

export interface SearchOptions {
  limit?: number;
  cacheResults?: boolean;
  cacheTTL?: number; // seconds
  timeout?: number; // milliseconds
}

export interface SearchEngineConfig {
  enableCaching?: boolean;
  defaultLimit?: number;
  defaultTimeout?: number;
}

export class SearchEngine {
  private providers: Map<SourceType, SearchProvider[]> = new Map();
  private config: Required<SearchEngineConfig>;
  private cache = getCache();

  constructor(config: SearchEngineConfig = {}) {
    this.config = {
      enableCaching: config.enableCaching ?? true,
      defaultLimit: config.defaultLimit ?? 10,
      defaultTimeout: config.defaultTimeout ?? 30000,
    };

    logInfo('SearchEngine initialized', this.config);
  }

  /**
   * Register a search provider
   */
  registerProvider(provider: SearchProvider): void {
    const providers = this.providers.get(provider.type) || [];
    providers.push(provider);
    this.providers.set(provider.type, providers);

    logInfo(`Search provider registered: ${provider.name}`, { type: provider.type });
  }

  /**
   * Unregister a search provider
   */
  unregisterProvider(providerName: string): boolean {
    for (const [type, providers] of this.providers.entries()) {
      const index = providers.findIndex(p => p.name === providerName);
      if (index !== -1) {
        providers.splice(index, 1);
        if (providers.length === 0) {
          this.providers.delete(type);
        }
        logInfo(`Search provider unregistered: ${providerName}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Get all providers of a specific type
   */
  getProviders(type: SourceType): SearchProvider[] {
    return this.providers.get(type) || [];
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): SearchProvider[] {
    const allProviders: SearchProvider[] = [];
    for (const providers of this.providers.values()) {
      allProviders.push(...providers);
    }
    return allProviders;
  }

  /**
   * Search using a specific provider
   */
  async searchWithProvider(
    provider: SearchProvider,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const limit = options.limit ?? this.config.defaultLimit;
    const cacheKey = `search:${provider.name}:${query}:${limit}`;

    // Check cache
    if (this.config.enableCaching && options.cacheResults !== false) {
      const cached = this.cache.get<SearchResult[]>(cacheKey);
      if (cached) {
        logInfo(`Cache hit for provider ${provider.name}`, { query });
        return cached;
      }
    }

    try {
      logInfo(`Searching with provider ${provider.name}`, { query, limit });

      const results = await this.withTimeout(
        provider.search(query, limit),
        options.timeout ?? this.config.defaultTimeout
      );

      // Cache results
      if (this.config.enableCaching && options.cacheResults !== false) {
        const ttl = options.cacheTTL || 600; // 10 minutes default
        this.cache.set(cacheKey, results, ttl);
      }

      logInfo(`Provider ${provider.name} returned ${results.length} results`, { query });
      return results;
    } catch (error) {
      logError(`Search failed with provider ${provider.name}`, error, { query });
      return [];
    }
  }

  /**
   * Search using all providers of a specific type
   */
  async searchByType(
    type: SourceType,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const providers = this.getProviders(type);

    if (providers.length === 0) {
      logWarn(`No providers registered for type: ${type}`, { query });
      return [];
    }

    logInfo(`Searching with ${providers.length} providers`, { type, query });

    const results = await Promise.all(
      providers.map(provider => this.searchWithProvider(provider, query, options))
    );

    // Flatten and deduplicate results
    const allResults = results.flat();
    const deduped = this.deduplicateResults(allResults);

    logInfo(`Type ${type} search complete`, {
      query,
      totalResults: allResults.length,
      dedupedResults: deduped.length,
    });

    return deduped;
  }

  /**
   * Search across multiple source types
   */
  async searchMultipleTypes(
    types: SourceType[],
    query: string,
    options: SearchOptions = {}
  ): Promise<Map<SourceType, SearchResult[]>> {
    logInfo(`Multi-type search initiated`, { types, query });

    const results = new Map<SourceType, SearchResult[]>();

    await Promise.all(
      types.map(async type => {
        const typeResults = await this.searchByType(type, query, options);
        results.set(type, typeResults);
      })
    );

    return results;
  }

  /**
   * Search all available providers
   */
  async searchAll(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const types = Array.from(this.providers.keys());

    if (types.length === 0) {
      logWarn('No search providers registered', { query });
      return [];
    }

    logInfo(`Searching all types`, { types, query });

    const resultsByType = await this.searchMultipleTypes(types, query, options);
    const allResults: SearchResult[] = [];

    for (const results of resultsByType.values()) {
      allResults.push(...results);
    }

    const deduped = this.deduplicateResults(allResults);

    logInfo(`All-type search complete`, {
      query,
      totalResults: allResults.length,
      dedupedResults: deduped.length,
    });

    return deduped;
  }

  /**
   * Health check for all providers
   */
  async healthCheck(): Promise<Map<string, { healthy: boolean; message?: string }>> {
    const results = new Map<string, { healthy: boolean; message?: string }>();
    const allProviders = this.getAllProviders();

    await Promise.all(
      allProviders.map(async provider => {
        try {
          const status = await provider.healthCheck();
          results.set(provider.name, {
            healthy: status.healthy,
            message: status.message,
          });
        } catch (error) {
          results.set(provider.name, {
            healthy: false,
            message: (error as Error).message,
          });
        }
      })
    );

    return results;
  }

  /**
   * Get statistics about registered providers
   */
  getStatistics(): {
    totalProviders: number;
    providersByType: Record<SourceType, number>;
    providerNames: string[];
  } {
    const providersByType: Record<string, number> = {};
    const providerNames: string[] = [];

    for (const [type, providers] of this.providers.entries()) {
      providersByType[type] = providers.length;
      providerNames.push(...providers.map(p => p.name));
    }

    return {
      totalProviders: this.getAllProviders().length,
      providersByType: providersByType as Record<SourceType, number>,
      providerNames,
    };
  }

  /**
   * Deduplicate search results by URL
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const deduped: SearchResult[] = [];

    for (const result of results) {
      const normalizedUrl = this.normalizeUrl(result.url);
      if (!seen.has(normalizedUrl)) {
        seen.add(normalizedUrl);
        deduped.push(result);
      }
    }

    return deduped;
  }

  /**
   * Normalize URL for deduplication
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slash, query params, and hash
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Execute a promise with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.cache.clear();
    logInfo('Search cache cleared');
  }
}

// Singleton instance
let instance: SearchEngine | null = null;

export function getSearchEngine(config?: SearchEngineConfig): SearchEngine {
  if (!instance) {
    instance = new SearchEngine(config);
  }
  return instance;
}

export function resetSearchEngine(): void {
  instance = null;
}
