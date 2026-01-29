/**
 * Web search provider supporting Brave Search and Exa APIs
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import type { SearchProvider, SearchResult, HealthStatus } from '../../core/types.js';
import { createRateLimiterFromConfig } from '../../utils/ratelimiter.js';
import { logInfo, logError } from '../../utils/logger.js';
import { nanoid } from 'nanoid';

export type WebSearchEngine = 'brave' | 'exa';

export interface WebSearchConfig {
  engine: WebSearchEngine;
  apiKey: string;
  endpoint?: string;
  rateLimit?: {
    maxRequests: number;
    perMinutes?: number;
    perSeconds?: number;
  };
  defaultParams?: Record<string, unknown>;
}

export class WebSearchProvider implements SearchProvider {
  name: string;
  type = 'web' as const;
  private config: WebSearchConfig;
  private client: AxiosInstance;
  private rateLimiter;

  constructor(config: WebSearchConfig) {
    this.config = config;
    this.name = `web-search-${config.engine}`;

    // Create axios client with retry logic
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.engine === 'brave' && {
          'X-Subscription-Token': config.apiKey,
          'Accept': 'application/json',
        }),
        ...(config.engine === 'exa' && {
          'x-api-key': config.apiKey,
        }),
      },
    });

    // Configure retry logic
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 ||
          error.response?.status === 503;
      },
    });

    // Setup rate limiting
    if (config.rateLimit) {
      this.rateLimiter = createRateLimiterFromConfig(
        this.name,
        config.rateLimit
      );
    } else {
      // Default rate limits
      const defaultLimits = config.engine === 'brave'
        ? { maxRequests: 15, perMinutes: 1 }
        : { maxRequests: 10, perMinutes: 1 };
      this.rateLimiter = createRateLimiterFromConfig(this.name, defaultLimits);
    }

    logInfo(`WebSearchProvider initialized: ${this.name}`);
  }

  /**
   * Search using the configured engine
   */
  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    return this.rateLimiter.schedule(async () => {
      if (this.config.engine === 'brave') {
        return this.searchBrave(query, limit);
      } else {
        return this.searchExa(query, limit);
      }
    });
  }

  /**
   * Search using Brave Search API
   */
  private async searchBrave(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const endpoint = this.config.endpoint || 'https://api.search.brave.com/res/v1/web/search';

      const params = {
        q: query,
        count: Math.min(limit, 20), // Brave max is 20
        ...this.config.defaultParams,
      };

      logInfo(`Brave Search query`, { query, limit });

      const response = await this.client.get(endpoint, { params });

      if (!response.data?.web?.results) {
        logError('Brave Search returned unexpected response format', null, { response: response.data });
        return [];
      }

      const results: SearchResult[] = response.data.web.results.map((item: any) => ({
        id: nanoid(),
        url: item.url,
        title: item.title || 'No title',
        snippet: item.description || '',
        source: 'web' as const,
        relevanceScore: item.page_age ? this.calculateRecencyScore(item.page_age) : 0.5,
        publishedDate: item.page_age ? new Date(Date.now() - item.page_age * 24 * 60 * 60 * 1000) : undefined,
        metadata: {
          engine: 'brave',
          age: item.page_age,
          language: item.language,
          family_friendly: item.family_friendly,
        },
      }));

      logInfo(`Brave Search returned ${results.length} results`, { query });
      return results;
    } catch (error) {
      logError('Brave Search failed', error, { query });
      throw error;
    }
  }

  /**
   * Search using Exa API (semantic search)
   */
  private async searchExa(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const endpoint = this.config.endpoint || 'https://api.exa.ai/search';

      const payload = {
        query,
        numResults: Math.min(limit, 10), // Exa max is 10
        useAutoprompt: true,
        type: 'neural',
        ...this.config.defaultParams,
      };

      logInfo(`Exa Search query`, { query, limit });

      const response = await this.client.post(endpoint, payload);

      if (!response.data?.results) {
        logError('Exa Search returned unexpected response format', null, { response: response.data });
        return [];
      }

      const results: SearchResult[] = response.data.results.map((item: any) => ({
        id: nanoid(),
        url: item.url,
        title: item.title || 'No title',
        snippet: item.text || item.snippet || '',
        source: 'web' as const,
        relevanceScore: item.score || 0.5,
        publishedDate: item.publishedDate ? new Date(item.publishedDate) : undefined,
        metadata: {
          engine: 'exa',
          author: item.author,
          score: item.score,
        },
      }));

      logInfo(`Exa Search returned ${results.length} results`, { query });
      return results;
    } catch (error) {
      logError('Exa Search failed', error, { query });
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Simple test query
      const results = await this.search('test', 1);

      return {
        healthy: true,
        message: `${this.name} is operational (returned ${results.length} results)`,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: `${this.name} health check failed: ${(error as Error).message}`,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Calculate recency score based on page age (days)
   */
  private calculateRecencyScore(ageDays: number): number {
    // Half-life decay model: score = 0.5^(age/halfLife)
    const halfLife = 180; // 6 months
    return Math.pow(0.5, ageDays / halfLife);
  }
}

/**
 * Create a Brave Search provider
 */
export function createBraveSearchProvider(apiKey: string, config?: Partial<WebSearchConfig>): WebSearchProvider {
  return new WebSearchProvider({
    engine: 'brave',
    apiKey,
    ...config,
  });
}

/**
 * Create an Exa Search provider
 */
export function createExaSearchProvider(apiKey: string, config?: Partial<WebSearchConfig>): WebSearchProvider {
  return new WebSearchProvider({
    engine: 'exa',
    apiKey,
    ...config,
  });
}
