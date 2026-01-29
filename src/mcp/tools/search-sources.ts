/**
 * MCP Tool: search_sources
 * Search for sources across multiple providers
 */

import { z } from 'zod';
import { SearchEngine } from '../../search/SearchEngine.js';

const searchEngine = new SearchEngine();

export const searchSourcesSchema = z.object({
  query: z.string().min(1).describe('Search query'),
  sources: z
    .array(z.enum(['web', 'academic', 'github', 'youtube', 'reddit']))
    .default(['web', 'academic'])
    .describe('Search providers to use'),
  limit: z.number().min(1).max(50).default(10).describe('Maximum results per source'),
  minRelevance: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe('Minimum relevance score (0-1)'),
});

export type SearchSourcesInput = z.infer<typeof searchSourcesSchema>;

export async function searchSources(input: SearchSourcesInput) {
  try {
    const results = [];
    // input.sources are compatible with SourceType
    const sourceTypes = input.sources as ('web' | 'academic' | 'github' | 'youtube' | 'reddit')[];

    for (const sourceType of sourceTypes) {
      try {
        const providerResults = await searchEngine.searchByType(sourceType, input.query, {
          limit: input.limit,
        });

        results.push({
          provider: sourceType,
          count: providerResults.length,
          results: providerResults
            .filter((r) => r.relevanceScore >= input.minRelevance)
            .slice(0, input.limit)
            .map((r) => ({
              id: r.id,
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              relevanceScore: r.relevanceScore.toFixed(3),
              publishedDate: r.publishedDate?.toISOString(),
            })),
        });
      } catch (error) {
        results.push({
          provider: sourceType,
          count: 0,
          error: (error as Error).message,
          results: [],
        });
      }
    }

    const totalResults = results.reduce((sum, r) => sum + r.count, 0);

    return {
      success: true,
      query: input.query,
      totalResults,
      providers: results,
      message: `Found ${totalResults} results across ${input.sources.length} providers`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: 'Search failed',
    };
  }
}
