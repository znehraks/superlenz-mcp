/**
 * Factory function that creates a SearchEngine with providers
 * configured based on available environment variables.
 */

import { getSearchEngine, SearchEngine } from './SearchEngine.js';
import { createBraveSearchProvider, createExaSearchProvider } from './providers/WebSearchProvider.js';
import { createArxivProvider, createSemanticScholarProvider } from './providers/AcademicProvider.js';
import { createGitHubProvider } from './providers/GitHubProvider.js';
import { logInfo, logWarn } from '../utils/logger.js';

let configured = false;

/**
 * Returns the singleton SearchEngine with all available providers registered.
 * Providers are registered based on environment variable availability.
 */
export function createConfiguredSearchEngine(): SearchEngine {
  const engine = getSearchEngine();

  if (configured) {
    return engine;
  }
  configured = true;

  let count = 0;

  // arXiv — always available (no API key needed)
  engine.registerProvider(createArxivProvider());
  count++;

  // Brave Search
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    engine.registerProvider(createBraveSearchProvider(braveKey));
    count++;
  }

  // Exa Search
  const exaKey = process.env.EXA_API_KEY;
  if (exaKey) {
    engine.registerProvider(createExaSearchProvider(exaKey));
    count++;
  }

  // Semantic Scholar
  const ssKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  engine.registerProvider(createSemanticScholarProvider(ssKey));
  count++;

  // GitHub
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    engine.registerProvider(createGitHubProvider(githubToken));
    count++;
  }

  if (count === 0) {
    logWarn('No search providers could be registered — search will return empty results');
  } else {
    logInfo(`Search engine configured with ${count} provider(s)`);
  }

  return engine;
}

/**
 * Reset the configured flag (useful for testing).
 */
export function resetConfiguredSearchEngine(): void {
  configured = false;
}
