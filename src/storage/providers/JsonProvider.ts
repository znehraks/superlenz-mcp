/**
 * JSON storage provider — saves/loads ResearchDocument as JSON files
 */

import fs from 'fs/promises';
import path from 'path';
import type {
  StorageProvider,
  ResearchDocument,
  SaveResult,
  SearchQuery,
  HealthStatus,
  StorageConfig,
} from '../../core/types.js';
import { logInfo, logError } from '../../utils/logger.js';

export interface JsonConfig extends StorageConfig {
  basePath: string;
}

export class JsonProvider implements StorageProvider {
  name = 'json';
  version = '1.0.0';
  priority = 2;
  supportsImages = false;
  supportsRichText = false;

  private config: Required<JsonConfig>;

  constructor(config: JsonConfig) {
    this.config = {
      ...config,
    } as Required<JsonConfig>;
    this.priority = config.priority;
  }

  async initialize(config: StorageConfig): Promise<void> {
    this.config = { ...this.config, ...config } as Required<JsonConfig>;
    try {
      await fs.mkdir(this.config.basePath, { recursive: true });
      logInfo(`JsonProvider initialized at: ${this.config.basePath}`);
    } catch (error) {
      logError('Failed to initialize JsonProvider', error);
      throw error;
    }
  }

  async saveDocument(doc: ResearchDocument, destination?: string): Promise<SaveResult> {
    try {
      const filename = destination || this.generateFilename(doc);
      const filepath = path.join(this.config.basePath, filename);

      await fs.mkdir(path.dirname(filepath), { recursive: true });
      await fs.writeFile(filepath, JSON.stringify(doc, null, 2), 'utf-8');

      logInfo(`Document saved to: ${filepath}`);

      return {
        success: true,
        destination: filepath,
        provider: this.name,
      };
    } catch (error) {
      logError('Failed to save JSON document', error);
      return {
        success: false,
        destination: '',
        provider: this.name,
        error: (error as Error).message,
      };
    }
  }

  async getDocument(id: string): Promise<ResearchDocument | null> {
    try {
      // Try direct path first
      let filepath = path.join(this.config.basePath, id);
      if (!filepath.endsWith('.json')) {
        filepath += '.json';
      }

      const content = await fs.readFile(filepath, 'utf-8');
      const doc = JSON.parse(content) as ResearchDocument;

      // Revive Date objects
      if (doc.metadata) {
        doc.metadata.createdAt = new Date(doc.metadata.createdAt);
        doc.metadata.updatedAt = new Date(doc.metadata.updatedAt);
      }

      logInfo(`Document retrieved: ${filepath}`);
      return doc;
    } catch (error) {
      logError('Failed to get JSON document', error);
      return null;
    }
  }

  async searchDocuments(query: SearchQuery): Promise<ResearchDocument[]> {
    try {
      const files = await this.listJsonFiles();
      const results: ResearchDocument[] = [];
      const searchTerm = query.query.toLowerCase();

      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const doc = JSON.parse(content) as ResearchDocument;

          const matchesTitle = doc.title?.toLowerCase().includes(searchTerm);
          const matchesTopic = doc.topic?.toLowerCase().includes(searchTerm);
          const matchesTags = doc.metadata?.tags?.some(
            (t: string) => t.toLowerCase().includes(searchTerm)
          );

          if (matchesTitle || matchesTopic || matchesTags) {
            // Revive dates
            if (doc.metadata) {
              doc.metadata.createdAt = new Date(doc.metadata.createdAt);
              doc.metadata.updatedAt = new Date(doc.metadata.updatedAt);
            }
            results.push(doc);
          }
        } catch {
          // Skip malformed files
        }

        if (query.limit && results.length >= query.limit) break;
      }

      logInfo(`Search found ${results.length} JSON documents`, { query: query.query });
      return results;
    } catch (error) {
      logError('Failed to search JSON documents', error);
      return [];
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      await fs.access(this.config.basePath);
      return {
        healthy: true,
        message: `JsonProvider is operational at ${this.config.basePath}`,
        lastCheck: new Date(),
      };
    } catch {
      return {
        healthy: false,
        message: `JsonProvider basePath not accessible: ${this.config.basePath}`,
        lastCheck: new Date(),
      };
    }
  }

  private generateFilename(doc: ResearchDocument): string {
    const slug = doc.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
    return `${slug}-${Date.now()}.json`;
  }

  private async listJsonFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.config.basePath, { withFileTypes: true });
      return entries
        .filter(e => e.isFile() && e.name.endsWith('.json'))
        .map(e => path.join(this.config.basePath, e.name));
    } catch {
      return [];
    }
  }
}

export function createJsonProvider(config: JsonConfig): JsonProvider {
  return new JsonProvider(config);
}
