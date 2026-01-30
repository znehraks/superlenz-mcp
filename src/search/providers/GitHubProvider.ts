/**
 * GitHub search provider — searches repositories and code via GitHub Search API
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import type { SearchProvider, SearchResult, HealthStatus } from '../../core/types.js';
import { createRateLimiterFromConfig } from '../../utils/ratelimiter.js';
import { logInfo, logError } from '../../utils/logger.js';
import { nanoid } from 'nanoid';

export interface GitHubSearchConfig {
  token?: string;
  rateLimit?: {
    maxRequests: number;
    perMinutes?: number;
    perSeconds?: number;
  };
}

export class GitHubProvider implements SearchProvider {
  name = 'github';
  type = 'github' as const;
  private client: AxiosInstance;
  private rateLimiter;

  constructor(config: GitHubSearchConfig = {}) {

    this.client = axios.create({
      baseURL: 'https://api.github.com',
      timeout: 30000,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(config.token && { Authorization: `Bearer ${config.token}` }),
      },
    });

    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        error.response?.status === 403 ||
        error.response?.status === 429,
    });

    const defaultLimits = config.token
      ? { maxRequests: 30, perMinutes: 1 } // authenticated
      : { maxRequests: 10, perMinutes: 1 }; // unauthenticated
    this.rateLimiter = createRateLimiterFromConfig(
      this.name,
      config.rateLimit || defaultLimits,
    );

    logInfo(`GitHubProvider initialized (authenticated: ${!!config.token})`);
  }

  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    return this.rateLimiter.schedule(async () => {
      return this.searchRepositories(query, limit);
    });
  }

  private async searchRepositories(query: string, limit: number): Promise<SearchResult[]> {
    try {
      logInfo('GitHub repository search', { query, limit });

      const response = await this.client.get('/search/repositories', {
        params: {
          q: query,
          sort: 'stars',
          order: 'desc',
          per_page: Math.min(limit, 30),
        },
      });

      if (!response.data?.items) {
        logError('GitHub returned unexpected response format', null);
        return [];
      }

      const results: SearchResult[] = response.data.items.map((repo: any) => {
        const relevance = this.calculateRelevance(repo);
        return {
          id: nanoid(),
          url: repo.html_url,
          title: `${repo.full_name}: ${repo.description || 'No description'}`,
          snippet: [
            repo.description || '',
            `Stars: ${repo.stargazers_count}`,
            `Forks: ${repo.forks_count}`,
            repo.language ? `Language: ${repo.language}` : '',
            repo.topics?.length ? `Topics: ${repo.topics.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join(' | '),
          source: 'github' as const,
          relevanceScore: relevance,
          publishedDate: repo.pushed_at ? new Date(repo.pushed_at) : undefined,
          metadata: {
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            language: repo.language,
            topics: repo.topics,
            license: repo.license?.spdx_id,
            openIssues: repo.open_issues_count,
            owner: repo.owner?.login,
          },
        };
      });

      logInfo(`GitHub returned ${results.length} results`, { query });
      return results;
    } catch (error) {
      logError('GitHub search failed', error, { query });
      throw error;
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const response = await this.client.get('/rate_limit');
      return {
        healthy: true,
        message: `GitHub API operational. Rate limit remaining: ${response.data?.rate?.remaining ?? 'unknown'}`,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: `GitHub health check failed: ${(error as Error).message}`,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Calculate relevance from stars and forks using logarithmic scaling.
   */
  private calculateRelevance(repo: any): number {
    const stars = repo.stargazers_count || 0;
    const forks = repo.forks_count || 0;

    // stars contribute more than forks
    const starScore = Math.min(1, Math.log10(stars + 1) / Math.log10(100001)); // 100k stars = 1.0
    const forkScore = Math.min(1, Math.log10(forks + 1) / Math.log10(50001));

    return Math.min(1, starScore * 0.7 + forkScore * 0.3);
  }
}

export function createGitHubProvider(token?: string, config?: Partial<GitHubSearchConfig>): GitHubProvider {
  return new GitHubProvider({ token, ...config });
}
