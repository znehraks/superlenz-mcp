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
  Section,
  SectionType,
  SourceType,
} from '../../core/types.js';
import { logInfo, logError } from '../../utils/logger.js';
import { nanoid } from 'nanoid';

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

      await fs.mkdir(path.dirname(filepath), { recursive: true });

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
      let filepath = path.join(this.config.basePath, id);
      if (!filepath.endsWith('.md')) {
        filepath += '.md';
      }

      const content = await fs.readFile(filepath, 'utf-8');
      const doc = this.parseMarkdown(content, id);

      logInfo(`Document retrieved: ${filepath}`);
      return doc;
    } catch (error) {
      logError('Failed to get document', error);
      return null;
    }
  }

  async searchDocuments(query: SearchQuery): Promise<ResearchDocument[]> {
    try {
      const files = await this.listMarkdownFiles();
      const results: ResearchDocument[] = [];
      const searchTerm = query.query.toLowerCase();

      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const frontmatter = this.extractFrontmatter(content);

          const matchesTitle = frontmatter.title?.toLowerCase().includes(searchTerm);
          const matchesTopic = frontmatter.topic?.toLowerCase().includes(searchTerm);
          const matchesTags = frontmatter.tags?.some(
            (t: string) => t.toLowerCase().includes(searchTerm)
          );

          if (matchesTitle || matchesTopic || matchesTags) {
            const basename = path.basename(file);
            const doc = this.parseMarkdown(content, basename);
            if (doc) {
              results.push(doc);
            }
          }
        } catch {
          // Skip malformed files
        }

        if (query.limit && results.length >= query.limit) break;
      }

      logInfo(`Search found ${results.length} markdown documents`, { query: query.query });
      return results;
    } catch (error) {
      logError('Failed to search documents', error);
      return [];
    }
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

  // ---------------------------------------------------------------------------
  // Markdown parsing helpers
  // ---------------------------------------------------------------------------

  /**
   * Parse a markdown file back into a ResearchDocument.
   * Best-effort: may not perfectly round-trip all metadata.
   */
  private parseMarkdown(content: string, fileId: string): ResearchDocument | null {
    const frontmatter = this.extractFrontmatter(content);

    // Remove frontmatter block from content
    const bodyContent = content.replace(/^---[\s\S]*?---\n*/, '');

    // Extract sections split by ## headings
    const sections = this.extractSections(bodyContent);

    // Extract title from first # heading or frontmatter
    const titleMatch = bodyContent.match(/^# (.+)$/m);
    const title = frontmatter.title || (titleMatch ? titleMatch[1] : 'Untitled');
    const topic = frontmatter.topic || title;

    // Extract summary (blockquote after title)
    const summaryMatch = bodyContent.match(/^> (.+)$/m);
    const summary = summaryMatch ? summaryMatch[1] : '';

    return {
      id: fileId,
      title,
      topic,
      summary,
      sections,
      references: [], // References are hard to parse back reliably
      metadata: {
        createdAt: frontmatter.created ? new Date(frontmatter.created) : new Date(),
        updatedAt: frontmatter.updated ? new Date(frontmatter.updated) : new Date(),
        author: frontmatter.author || 'unknown',
        version: frontmatter.version || '1.0.0',
        tags: frontmatter.tags || [],
        category: frontmatter.category,
        credibilityScore: parseFloat(frontmatter.credibility) || 0,
        verificationRounds: 0,
        sourcesCount: 0,
        conflictsResolved: 0,
      },
      verificationSummary: {
        totalClaims: 0,
        verifiedClaims: 0,
        averageConfidence: parseFloat(frontmatter.credibility) || 0,
        sourceBreakdown: {} as Record<SourceType, number>,
      },
    };
  }

  /**
   * Extract YAML frontmatter as a simple key-value object.
   */
  private extractFrontmatter(content: string): Record<string, any> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const fm: Record<string, any> = {};
    const lines = match[1].split('\n');
    let currentKey: string | null = null;
    let listItems: string[] = [];

    for (const line of lines) {
      // List item under a key
      if (line.match(/^\s+-\s+(.+)/) && currentKey) {
        const itemMatch = line.match(/^\s+-\s+(.+)/);
        if (itemMatch) listItems.push(itemMatch[1].trim());
        continue;
      }

      // Flush any accumulated list
      if (currentKey && listItems.length > 0) {
        fm[currentKey] = listItems;
        listItems = [];
        currentKey = null;
      }

      // Key-value pair
      const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
      if (kvMatch) {
        const key = kvMatch[1];
        const value = kvMatch[2].trim();
        if (value === '' || value === undefined) {
          // Could be start of a list
          currentKey = key;
        } else {
          // Strip quotes
          fm[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    // Flush trailing list
    if (currentKey && listItems.length > 0) {
      fm[currentKey] = listItems;
    }

    return fm;
  }

  /**
   * Split markdown body into Section objects based on ## headings.
   */
  private extractSections(body: string): Section[] {
    const sections: Section[] = [];
    const sectionRegex = /^## (.+)$/gm;
    const headings: { title: string; start: number }[] = [];

    let match;
    while ((match = sectionRegex.exec(body)) !== null) {
      headings.push({ title: match[1], start: match.index + match[0].length });
    }

    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].start;
      const end = i + 1 < headings.length ? headings[i + 1].start - headings[i + 1].title.length - 4 : body.length;
      const content = body.slice(start, end).trim();

      sections.push({
        id: nanoid(),
        type: this.inferSectionType(headings[i].title),
        title: headings[i].title,
        content,
      });
    }

    return sections;
  }

  private inferSectionType(title: string): SectionType {
    const lower = title.toLowerCase();
    if (lower.includes('executive') || lower.includes('summary')) return 'executive-summary';
    if (lower.includes('introduction')) return 'introduction';
    if (lower.includes('method')) return 'methodology';
    if (lower.includes('finding')) return 'findings';
    if (lower.includes('compar')) return 'comparison';
    if (lower.includes('analy')) return 'analysis';
    if (lower.includes('conclusion')) return 'conclusion';
    if (lower.includes('reference')) return 'references';
    if (lower.includes('appendix')) return 'appendix';
    return 'findings'; // default
  }

  private async listMarkdownFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.config.basePath, { withFileTypes: true });
      return entries
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => path.join(this.config.basePath, e.name));
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Markdown generation
  // ---------------------------------------------------------------------------

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
