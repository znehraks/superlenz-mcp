/**
 * Markdown storage provider with frontmatter support
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

export interface MarkdownConfig extends StorageConfig {
  basePath: string;
  imageDirectory?: string;
  frontmatterFormat?: 'yaml' | 'toml' | 'json';
  includeTableOfContents?: boolean;
}

export class MarkdownProvider implements StorageProvider {
  name = 'markdown';
  version = '1.0.0';
  priority = 1; // Highest priority (default)
  supportsImages = true;
  supportsRichText = false;

  private config: Required<MarkdownConfig>;

  constructor(config: MarkdownConfig) {
    this.config = {
      ...config,
      imageDirectory: config.imageDirectory || 'images',
      frontmatterFormat: config.frontmatterFormat || 'yaml',
      includeTableOfContents: config.includeTableOfContents ?? true,
    };

    this.priority = config.priority;
  }

  async initialize(config: StorageConfig): Promise<void> {
    this.config = { ...this.config, ...config } as Required<MarkdownConfig>;

    // Ensure base directory exists
    try {
      await fs.mkdir(this.config.basePath, { recursive: true });
      logInfo(`MarkdownProvider initialized at: ${this.config.basePath}`);
    } catch (error) {
      logError('Failed to initialize MarkdownProvider', error);
      throw error;
    }
  }

  async saveDocument(doc: ResearchDocument, destination?: string): Promise<SaveResult> {
    try {
      const filename = destination || this.generateFilename(doc);
      const filepath = path.join(this.config.basePath, filename);

      // Generate markdown content
      const markdown = this.generateMarkdown(doc);

      // Write file
      await fs.writeFile(filepath, markdown, 'utf-8');

      logInfo(`Document saved to: ${filepath}`);

      return {
        success: true,
        destination: filepath,
        provider: this.name,
      };
    } catch (error) {
      logError('Failed to save document', error);

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
      const filepath = path.join(this.config.basePath, id);
      await fs.readFile(filepath, 'utf-8');

      // Parse markdown (simplified - just return null for now)
      // In production, would parse frontmatter and sections
      logInfo(`Document retrieved: ${filepath}`);

      return null; // Placeholder
    } catch (error) {
      logError('Failed to get document', error);
      return null;
    }
  }

  async searchDocuments(query: SearchQuery): Promise<ResearchDocument[]> {
    // Simplified implementation
    logInfo('Searching documents', { query: query.query });
    return [];
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      // Check if base directory is accessible
      await fs.access(this.config.basePath);

      return {
        healthy: true,
        message: `MarkdownProvider is operational at ${this.config.basePath}`,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: `MarkdownProvider health check failed: ${(error as Error).message}`,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Generate markdown content from document
   */
  private generateMarkdown(doc: ResearchDocument): string {
    const parts: string[] = [];

    // Frontmatter
    parts.push(this.generateFrontmatter(doc));

    // Title
    parts.push(`# ${doc.title}\n`);

    // Summary
    if (doc.summary) {
      parts.push(`> ${doc.summary}\n`);
    }

    // Metadata section
    parts.push('## Document Information\n');
    parts.push(`- **Created**: ${doc.metadata.createdAt.toISOString()}`);
    parts.push(`- **Credibility Score**: ${(doc.metadata.credibilityScore * 100).toFixed(1)}%`);
    parts.push(`- **Verification Rounds**: ${doc.metadata.verificationRounds}`);
    parts.push(`- **Sources**: ${doc.metadata.sourcesCount}`);
    parts.push(`- **Conflicts Resolved**: ${doc.metadata.conflictsResolved}\n`);

    // Verification summary
    parts.push('## Verification Summary\n');
    parts.push(`- **Total Claims**: ${doc.verificationSummary.totalClaims}`);
    parts.push(`- **Verified Claims**: ${doc.verificationSummary.verifiedClaims}`);
    parts.push(`- **Average Confidence**: ${(doc.verificationSummary.averageConfidence * 100).toFixed(1)}%`);
    parts.push('\n**Source Breakdown**:');
    for (const [source, count] of Object.entries(doc.verificationSummary.sourceBreakdown)) {
      parts.push(`- ${source}: ${count}`);
    }
    parts.push('');

    // Table of contents (if enabled)
    if (this.config.includeTableOfContents) {
      parts.push('## Table of Contents\n');
      for (const section of doc.sections) {
        parts.push(`- [${section.title}](#${this.slugify(section.title)})`);
      }
      parts.push('');
    }

    // Sections
    for (const section of doc.sections) {
      parts.push(`## ${section.title}\n`);
      parts.push(section.content);
      parts.push('');

      // Subsections
      if (section.subsections) {
        for (const subsection of section.subsections) {
          parts.push(`### ${subsection.title}\n`);
          parts.push(subsection.content);
          parts.push('');
        }
      }
    }

    // References
    if (doc.references.length > 0) {
      parts.push('## References\n');
      for (const ref of doc.references) {
        parts.push(`${ref.shortForm} ${ref.formatted}`);
      }
      parts.push('');
    }

    // Footer
    parts.push('---');
    parts.push(`*Generated by Research Automation MCP Server v${this.version}*`);
    parts.push(`*Credibility Score: ${(doc.metadata.credibilityScore * 100).toFixed(1)}%*`);

    return parts.join('\n');
  }

  /**
   * Generate YAML frontmatter
   */
  private generateFrontmatter(doc: ResearchDocument): string {
    const lines = [
      '---',
      `title: "${doc.title}"`,
      `topic: "${doc.topic}"`,
      `created: ${doc.metadata.createdAt.toISOString()}`,
      `updated: ${doc.metadata.updatedAt.toISOString()}`,
      `author: ${doc.metadata.author}`,
      `version: ${doc.metadata.version}`,
      `credibility: ${doc.metadata.credibilityScore.toFixed(3)}`,
      `tags:`,
      ...doc.metadata.tags.map(tag => `  - ${tag}`),
    ];

    if (doc.metadata.category) {
      lines.push(`category: ${doc.metadata.category}`);
    }

    lines.push('---\n');

    return lines.join('\n');
  }

  /**
   * Generate filename from document
   */
  private generateFilename(doc: ResearchDocument): string {
    const slug = this.slugify(doc.title);
    const timestamp = Date.now();
    return `${slug}-${timestamp}.md`;
  }

  /**
   * Convert string to URL-friendly slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
  }
}

export function createMarkdownProvider(config: MarkdownConfig): MarkdownProvider {
  return new MarkdownProvider(config);
}
