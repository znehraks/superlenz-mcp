/**
 * MCP Tool: list_sessions
 * List all research sessions
 */

import { z } from 'zod';
import { getResearchOrchestrator } from '../../core/ResearchOrchestrator.js';

export const listSessionsSchema = z.object({
  status: z
    .enum(['initializing', 'searching', 'collecting', 'verifying', 'generating', 'saving', 'completed', 'failed'])
    .optional()
    .describe('Filter by status'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of sessions to return'),
});

export type ListSessionsInput = z.infer<typeof listSessionsSchema>;

export async function listSessions(input: ListSessionsInput = { limit: 20 }) {
  const orchestrator = getResearchOrchestrator();

  try {
    let sessions = orchestrator.listSessions();

    // Filter by status if provided
    if (input.status) {
      sessions = sessions.filter((s) => s.status === input.status);
    }

    // Apply limit
    sessions = sessions.slice(0, input.limit);

    return {
      success: true,
      count: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        topic: s.topic,
        status: s.status,
        progress: s.progress,
        depth: s.depth,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        error: s.error,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: 'Failed to list sessions',
    };
  }
}
