/**
 * MCP Tool: get_research_status
 * Get the status of a research session
 */

import { z } from 'zod';
import { getResearchOrchestrator } from '../../core/ResearchOrchestrator.js';

export const getResearchStatusSchema = z.object({
  sessionId: z.string().describe('Session ID to check'),
});

export type GetResearchStatusInput = z.infer<typeof getResearchStatusSchema>;

export async function getResearchStatus(input: GetResearchStatusInput) {
  const orchestrator = getResearchOrchestrator();

  try {
    const status = orchestrator.getResearchStatus(input.sessionId);

    if (!status) {
      return {
        success: false,
        error: 'Session not found',
        message: `No session found with ID: ${input.sessionId}`,
      };
    }

    return {
      success: true,
      ...status,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: 'Failed to get research status',
    };
  }
}
