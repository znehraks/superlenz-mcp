/**
 * MCP Tool: save_to_storage
 * Save a previously generated research document to a storage provider
 */

import { z } from 'zod';
import { getResearchOrchestrator } from '../../core/ResearchOrchestrator.js';
import { MarkdownProvider } from '../../storage/providers/MarkdownProvider.js';
import { JsonProvider } from '../../storage/providers/JsonProvider.js';
import { logInfo } from '../../utils/logger.js';

export const saveToStorageSchema = z.object({
  sessionId: z.string().min(1).describe('Session ID of the research to save'),
  provider: z
    .enum(['markdown', 'json'])
    .default('markdown')
    .describe('Storage provider to use'),
  destination: z
    .string()
    .optional()
    .describe('Optional custom file path or name'),
});

export type SaveToStorageInput = z.infer<typeof saveToStorageSchema>;

export async function saveToStorage(input: SaveToStorageInput) {
  try {
    const orchestrator = getResearchOrchestrator();
    const doc = orchestrator.getCachedDocument(input.sessionId);

    if (!doc) {
      return {
        success: false,
        error: `No document found for session "${input.sessionId}". The session may not exist or the document was not generated yet.`,
      };
    }

    const basePath = process.env.OUTPUT_PATH || './output';

    let storageProvider;
    switch (input.provider) {
      case 'json':
        storageProvider = new JsonProvider({ enabled: true, priority: 2, basePath });
        break;
      case 'markdown':
      default:
        storageProvider = new MarkdownProvider({ enabled: true, priority: 1, basePath });
        break;
    }

    const result = await storageProvider.saveDocument(doc, input.destination);

    logInfo(`Document saved via save_to_storage`, {
      sessionId: input.sessionId,
      provider: input.provider,
      destination: result.destination,
    });

    return {
      success: result.success,
      provider: input.provider,
      destination: result.destination,
      error: result.error,
      message: result.success
        ? `Document saved to ${result.destination} using ${input.provider} provider`
        : `Failed to save document: ${result.error}`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: 'save_to_storage failed',
    };
  }
}
