/**
 * Search aggregator that combines results from multiple sources
 * and applies ranking, filtering, and deduplication
 */

import type { SearchResult, SourceType } from '../core/types.js';
import { SearchEngine } from './SearchEngine.js';
import { logInfo } from '../utils/logger.js';

export interface AggregationOptions {
  sources: SourceType[];
  limit: number;
  minRelevanceScore?: number;
  diversify?: boolean; // Ensure diversity of sources
  boostRecent?: boolean; // Boost recently published results
  timeout?: number;
}

export interface AggregatedResults {
  results: SearchResult[];
  sourceBreakdown: Record<SourceType, number>;
  totalResults: number;
  filteredResults: number;
  averageRelevance: number;
}

export class SearchAggregator {
  private searchEngine: SearchEngine;

  constructor(searchEngine: SearchEngine) {
    this.searchEngine = searchEngine;
  }

  /**
   * Aggregate search results from multiple sources
   */
  async aggregate(
    query: string,
    options: AggregationOptions
  ): Promise<AggregatedResults> {
    logInfo('Starting search aggregation', { query, sources: options.sources });

    // Search all specified sources
    const resultsBySource = await this.searchEngine.searchMultipleTypes(
      options.sources,
      query,
      {
        limit: Math.ceil(options.limit * 1.5), // Fetch more for filtering
        timeout: options.timeout,
      }
    );

    // Combine all results
    let allResults: SearchResult[] = [];
    const sourceBreakdown: Record<string, number> = {};

    for (const [source, results] of resultsBySource.entries()) {
      allResults.push(...results);
      sourceBreakdown[source] = results.length;
    }

    const totalResults = allResults.length;
    logInfo(`Collected ${totalResults} results from ${options.sources.length} sources`, { query });

    // Apply filtering
    if (options.minRelevanceScore !== undefined) {
      allResults = allResults.filter(r => r.relevanceScore >= options.minRelevanceScore!);
    }

    // Boost recent results if requested
    if (options.boostRecent) {
      allResults = this.boostRecentResults(allResults);
    }

    // Apply ranking
    allResults = this.rankResults(allResults);

    // Apply diversification if requested
    if (options.diversify) {
      allResults = this.diversifyResults(allResults, options.limit);
    } else {
      allResults = allResults.slice(0, options.limit);
    }

    const averageRelevance = allResults.length > 0
      ? allResults.reduce((sum, r) => sum + r.relevanceScore, 0) / allResults.length
      : 0;

    logInfo('Search aggregation complete', {
      query,
      totalResults,
      filteredResults: allResults.length,
      averageRelevance: averageRelevance.toFixed(3),
    });

    return {
      results: allResults,
      sourceBreakdown: sourceBreakdown as Record<SourceType, number>,
      totalResults,
      filteredResults: allResults.length,
      averageRelevance,
    };
  }

  /**
   * Rank results by composite score
   */
  private rankResults(results: SearchResult[]): SearchResult[] {
    return results.sort((a, b) => {
      // Primary: relevance score
      if (Math.abs(a.relevanceScore - b.relevanceScore) > 0.1) {
        return b.relevanceScore - a.relevanceScore;
      }

      // Secondary: source type priority (academic > web > others)
      const sourcePriority = { academic: 3, web: 2, 'user-provided': 4, github: 1, youtube: 1, reddit: 1 };
      const aPriority = sourcePriority[a.source] || 0;
      const bPriority = sourcePriority[b.source] || 0;

      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }

      // Tertiary: recency (if available)
      if (a.publishedDate && b.publishedDate) {
        return b.publishedDate.getTime() - a.publishedDate.getTime();
      }

      return 0;
    });
  }

  /**
   * Boost scores of recent results
   */
  private boostRecentResults(results: SearchResult[]): SearchResult[] {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;

    return results.map(result => {
      if (!result.publishedDate) {
        return result;
      }

      const age = now - result.publishedDate.getTime();

      let boost = 1.0;
      if (age < thirtyDays) {
        boost = 1.3; // 30% boost for very recent
      } else if (age < ninetyDays) {
        boost = 1.15; // 15% boost for recent
      }

      return {
        ...result,
        relevanceScore: Math.min(1.0, result.relevanceScore * boost),
      };
    });
  }

  /**
   * Diversify results to ensure variety of sources
   */
  private diversifyResults(results: SearchResult[], limit: number): SearchResult[] {
    const diversified: SearchResult[] = [];
    const usedSources = new Map<SourceType, number>();

    // Sort by relevance first
    const sorted = [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Calculate max per source to ensure diversity
    const maxPerSource = Math.ceil(limit / 2); // At most 50% from one source

    for (const result of sorted) {
      if (diversified.length >= limit) {
        break;
      }

      const sourceCount = usedSources.get(result.source) || 0;

      // Add if we haven't reached max for this source
      if (sourceCount < maxPerSource) {
        diversified.push(result);
        usedSources.set(result.source, sourceCount + 1);
      }
    }

    // If we still have room and filtered out good results, add them
    if (diversified.length < limit) {
      for (const result of sorted) {
        if (diversified.length >= limit) {
          break;
        }
        if (!diversified.includes(result)) {
          diversified.push(result);
        }
      }
    }

    return diversified;
  }

  /**
   * Merge and deduplicate results from multiple searches
   */
  async mergeSearches(
    queries: string[],
    options: Omit<AggregationOptions, 'limit'> & { limitPerQuery: number }
  ): Promise<AggregatedResults> {
    logInfo('Merging multiple searches', { queries, count: queries.length });

    const allResults: SearchResult[] = [];
    const sourceBreakdown: Record<string, number> = {};

    // Execute all searches in parallel
    const searchPromises = queries.map(query =>
      this.aggregate(query, { ...options, limit: options.limitPerQuery })
    );

    const searchResults = await Promise.all(searchPromises);

    // Combine results
    for (const result of searchResults) {
      allResults.push(...result.results);

      // Merge source breakdown
      for (const [source, count] of Object.entries(result.sourceBreakdown)) {
        sourceBreakdown[source] = (sourceBreakdown[source] || 0) + count;
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped: SearchResult[] = [];

    for (const result of allResults) {
      const normalizedUrl = this.normalizeUrl(result.url);
      if (!seen.has(normalizedUrl)) {
        seen.add(normalizedUrl);
        deduped.push(result);
      }
    }

    // Rank combined results
    const ranked = this.rankResults(deduped);

    const averageRelevance = ranked.length > 0
      ? ranked.reduce((sum, r) => sum + r.relevanceScore, 0) / ranked.length
      : 0;

    logInfo('Search merge complete', {
      queries,
      totalResults: allResults.length,
      dedupedResults: ranked.length,
    });

    return {
      results: ranked,
      sourceBreakdown: sourceBreakdown as Record<SourceType, number>,
      totalResults: allResults.length,
      filteredResults: ranked.length,
      averageRelevance,
    };
  }

  /**
   * Filter results by criteria
   */
  filterResults(
    results: SearchResult[],
    criteria: {
      minRelevance?: number;
      sources?: SourceType[];
      afterDate?: Date;
      beforeDate?: Date;
      excludeUrls?: string[];
    }
  ): SearchResult[] {
    return results.filter(result => {
      // Relevance filter
      if (criteria.minRelevance !== undefined && result.relevanceScore < criteria.minRelevance) {
        return false;
      }

      // Source filter
      if (criteria.sources && !criteria.sources.includes(result.source)) {
        return false;
      }

      // Date filters
      if (result.publishedDate) {
        if (criteria.afterDate && result.publishedDate < criteria.afterDate) {
          return false;
        }
        if (criteria.beforeDate && result.publishedDate > criteria.beforeDate) {
          return false;
        }
      }

      // URL exclusion
      if (criteria.excludeUrls) {
        const normalizedUrl = this.normalizeUrl(result.url);
        if (criteria.excludeUrls.some(url => this.normalizeUrl(url) === normalizedUrl)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Normalize URL for comparison
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Get aggregation statistics
   */
  getStatistics(results: AggregatedResults): {
    totalSources: number;
    sourceDistribution: Record<SourceType, { count: number; percentage: number }>;
    relevanceDistribution: { min: number; max: number; avg: number; median: number };
    dateRange?: { earliest?: Date; latest?: Date };
  } {
    const sourceDistribution: Record<string, { count: number; percentage: number }> = {};

    for (const [source, count] of Object.entries(results.sourceBreakdown)) {
      sourceDistribution[source] = {
        count,
        percentage: (count / results.totalResults) * 100,
      };
    }

    const relevances = results.results.map(r => r.relevanceScore).sort((a, b) => a - b);
    const median = relevances.length > 0
      ? relevances[Math.floor(relevances.length / 2)]
      : 0;

    const dates = results.results
      .map(r => r.publishedDate)
      .filter((d): d is Date => d !== undefined)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      totalSources: Object.keys(results.sourceBreakdown).length,
      sourceDistribution: sourceDistribution as Record<SourceType, { count: number; percentage: number }>,
      relevanceDistribution: {
        min: relevances[0] || 0,
        max: relevances[relevances.length - 1] || 0,
        avg: results.averageRelevance,
        median,
      },
      dateRange: dates.length > 0 ? {
        earliest: dates[0],
        latest: dates[dates.length - 1],
      } : undefined,
    };
  }
}

export function createSearchAggregator(searchEngine: SearchEngine): SearchAggregator {
  return new SearchAggregator(searchEngine);
}
