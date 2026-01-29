/**
 * MCP Tool: start_research
 * Initiates a new research session
 */

import { z } from 'zod';
import { getResearchOrchestrator } from '../../core/ResearchOrchestrator.js';
import type { ResearchDepth } from '../../core/types.js';

export const startResearchSchema = z.object({
  topic: z.string().min(1).describe('Research topic or question'),
  urls: z
    .array(z.string().url())
    .optional()
    .describe('Initial URLs to include in research'),
  depth: z
    .enum(['quick', 'standard', 'deep'])
    .default('standard')
    .describe('Research depth: quick (5 rounds), standard (10 rounds), deep (15 rounds)'),
  storage: z
    .enum(['markdown', 'notion', 'json', 'html', 'confluence'])
    .default('markdown')
    .describe('Storage provider for final document'),
  template: z
    .enum(['comprehensive', 'executive-summary', 'comparison', 'guide'])
    .default('comprehensive')
    .describe('Document template to use'),
});

export type StartResearchInput = z.infer<typeof startResearchSchema>;

export async function startResearch(input: StartResearchInput) {
  const orchestrator = getResearchOrchestrator();

  try {
    // Execute research workflow
    const document = await orchestrator.executeResearch({
      topic: input.topic,
      initialUrls: input.urls,
      depth: input.depth as ResearchDepth,
      storageProvider: input.storage,
    });

    return {
      success: true,
      sessionId: document.id,
      title: document.title,
      credibilityScore: document.metadata.credibilityScore,
      credibilityLevel: getCredibilityLevel(document.metadata.credibilityScore),
      verificationRounds: document.metadata.verificationRounds,
      sourcesCount: document.metadata.sourcesCount,
      conflictsResolved: document.metadata.conflictsResolved,
      sections: document.sections.length,
      references: document.references.length,
      message: `Research completed successfully with ${(document.metadata.credibilityScore * 100).toFixed(1)}% credibility`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: 'Research failed. Check logs for details.',
    };
  }
}

function getCredibilityLevel(score: number): string {
  if (score >= 0.9) return 'very-high';
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'medium';
  if (score >= 0.4) return 'low';
  return 'very-low';
}
