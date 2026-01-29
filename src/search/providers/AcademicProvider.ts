/**
 * Academic search provider for arXiv, Semantic Scholar, and other academic databases
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import type { SearchProvider, SearchResult, HealthStatus } from '../../core/types.js';
import { createRateLimiterFromConfig } from '../../utils/ratelimiter.js';
import { logInfo, logError } from '../../utils/logger.js';
import { nanoid } from 'nanoid';

export type AcademicSource = 'arxiv' | 'semanticscholar';

export interface AcademicSearchConfig {
  source: AcademicSource;
  apiKey?: string; // Optional for arXiv, required for Semantic Scholar with higher limits
  endpoint?: string;
  rateLimit?: {
    maxRequests: number;
    perSeconds?: number;
    perMinutes?: number;
  };
}

export class AcademicProvider implements SearchProvider {
  name: string;
  type = 'academic' as const;
  private config: AcademicSearchConfig;
  private client: AxiosInstance;
  private rateLimiter;

  constructor(config: AcademicSearchConfig) {
    this.config = config;
    this.name = `academic-${config.source}`;

    // Create axios client
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.source === 'semanticscholar' && config.apiKey && {
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
          error.response?.status === 429;
      },
    });

    // Setup rate limiting
    if (config.rateLimit) {
      this.rateLimiter = createRateLimiterFromConfig(this.name, config.rateLimit);
    } else {
      // Default rate limits
      const defaultLimits = config.source === 'arxiv'
        ? { maxRequests: 3, perSeconds: 1 } // arXiv is strict
        : { maxRequests: 100, perMinutes: 5 }; // Semantic Scholar
      this.rateLimiter = createRateLimiterFromConfig(this.name, defaultLimits);
    }

    logInfo(`AcademicProvider initialized: ${this.name}`);
  }

  /**
   * Search using the configured academic source
   */
  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    return this.rateLimiter.schedule(async () => {
      if (this.config.source === 'arxiv') {
        return this.searchArxiv(query, limit);
      } else {
        return this.searchSemanticScholar(query, limit);
      }
    });
  }

  /**
   * Search arXiv API
   */
  private async searchArxiv(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const endpoint = this.config.endpoint || 'http://export.arxiv.org/api/query';

      const params = {
        search_query: `all:${query}`,
        max_results: Math.min(limit, 100),
        sortBy: 'relevance',
        sortOrder: 'descending',
      };

      logInfo(`arXiv search query`, { query, limit });

      const response = await this.client.get(endpoint, {
        params,
        headers: { 'Accept': 'application/atom+xml' },
      });

      // Parse XML response
      const results = this.parseArxivXML(response.data);

      logInfo(`arXiv returned ${results.length} results`, { query });
      return results;
    } catch (error) {
      logError('arXiv search failed', error, { query });
      throw error;
    }
  }

  /**
   * Parse arXiv XML response
   */
  private parseArxivXML(xml: string): SearchResult[] {
    const results: SearchResult[] = [];

    // Simple XML parsing (in production, use a proper XML parser like xml2js)
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      const id = this.extractXmlTag(entry, 'id');
      const title = this.extractXmlTag(entry, 'title')?.replace(/\s+/g, ' ').trim();
      const summary = this.extractXmlTag(entry, 'summary')?.replace(/\s+/g, ' ').trim();
      const published = this.extractXmlTag(entry, 'published');
      const authors = this.extractAllXmlTags(entry, 'name');

      if (id && title) {
        results.push({
          id: nanoid(),
          url: id,
          title,
          snippet: summary || '',
          source: 'academic' as const,
          relevanceScore: 0.9, // arXiv papers are highly credible
          publishedDate: published ? new Date(published) : undefined,
          metadata: {
            source: 'arxiv',
            authors: authors.join(', '),
            arxivId: id.split('/').pop(),
          },
        });
      }
    }

    return results;
  }

  /**
   * Search Semantic Scholar API
   */
  private async searchSemanticScholar(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const endpoint = this.config.endpoint || 'https://api.semanticscholar.org/graph/v1/paper/search';

      const params = {
        query,
        limit: Math.min(limit, 100),
        fields: 'title,abstract,authors,year,citationCount,url,publicationDate,venue',
      };

      logInfo(`Semantic Scholar search query`, { query, limit });

      const response = await this.client.get(endpoint, { params });

      if (!response.data?.data) {
        logError('Semantic Scholar returned unexpected response format', null, { response: response.data });
        return [];
      }

      const results: SearchResult[] = response.data.data.map((paper: any) => {
        const citationScore = this.calculateCitationScore(paper.citationCount || 0);
        const recencyScore = this.calculateRecencyScore(paper.year);
        const relevanceScore = (citationScore * 0.6 + recencyScore * 0.4);

        return {
          id: nanoid(),
          url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
          title: paper.title || 'No title',
          snippet: paper.abstract || '',
          source: 'academic' as const,
          relevanceScore,
          publishedDate: paper.publicationDate ? new Date(paper.publicationDate) : undefined,
          metadata: {
            source: 'semanticscholar',
            authors: paper.authors?.map((a: any) => a.name).join(', ') || 'Unknown',
            year: paper.year,
            citationCount: paper.citationCount,
            venue: paper.venue,
            paperId: paper.paperId,
          },
        };
      });

      logInfo(`Semantic Scholar returned ${results.length} results`, { query });
      return results;
    } catch (error) {
      logError('Semantic Scholar search failed', error, { query });
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      const results = await this.search('machine learning', 1);

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
   * Extract XML tag content
   */
  private extractXmlTag(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const match = regex.exec(xml);
    return match ? match[1] : undefined;
  }

  /**
   * Extract all XML tag contents
   */
  private extractAllXmlTags(xml: string, tag: string): string[] {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
    const matches: string[] = [];
    let match;

    while ((match = regex.exec(xml)) !== null) {
      matches.push(match[1]);
    }

    return matches;
  }

  /**
   * Calculate citation score (normalized)
   */
  private calculateCitationScore(citations: number): number {
    // Logarithmic scaling: score = log10(citations + 1) / log10(1001)
    // 0 citations = 0, 100 citations ≈ 0.66, 1000 citations = 1.0
    return Math.min(1.0, Math.log10(citations + 1) / Math.log10(1001));
  }

  /**
   * Calculate recency score based on year
   */
  private calculateRecencyScore(year: number): number {
    if (!year) return 0.5;

    const currentYear = new Date().getFullYear();
    const age = currentYear - year;

    // Half-life decay: 5 years
    const halfLife = 5;
    return Math.pow(0.5, age / halfLife);
  }
}

/**
 * Create an arXiv search provider
 */
export function createArxivProvider(config?: Partial<AcademicSearchConfig>): AcademicProvider {
  return new AcademicProvider({
    source: 'arxiv',
    ...config,
  });
}

/**
 * Create a Semantic Scholar search provider
 */
export function createSemanticScholarProvider(apiKey?: string, config?: Partial<AcademicSearchConfig>): AcademicProvider {
  return new AcademicProvider({
    source: 'semanticscholar',
    apiKey,
    ...config,
  });
}
