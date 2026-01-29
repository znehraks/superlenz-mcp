/**
 * Citation manager supporting multiple citation styles
 */

import type { Reference, Source, CitationStyle } from '../core/types.js';
import { nanoid } from 'nanoid';
import { logInfo } from '../utils/logger.js';

export interface CitationOptions {
  style: CitationStyle;
  sortBy?: 'alphabetical' | 'appearance' | 'date';
  includeUrls?: boolean;
  shortFormStyle?: 'numeric' | 'author-year' | 'footnote';
}

export class CitationManager {
  private references: Map<string, Reference> = new Map();
  private citationCounter = 1;

  /**
   * Add source as reference
   */
  addSource(source: Source, style: CitationStyle = 'APA'): Reference {
    // Check if already exists
    const existing = Array.from(this.references.values()).find(
      (ref) => ref.sourceId === source.id
    );

    if (existing) {
      return existing;
    }

    // Create new reference
    const reference: Reference = {
      id: nanoid(),
      sourceId: source.id,
      citationStyle: style,
      formatted: this.formatCitation(source, style),
      shortForm: this.generateShortForm(source, style),
    };

    this.references.set(reference.id, reference);
    this.citationCounter++;

    return reference;
  }

  /**
   * Add multiple sources
   */
  addSources(sources: Source[], style: CitationStyle = 'APA'): Reference[] {
    return sources.map((source) => this.addSource(source, style));
  }

  /**
   * Get all references
   */
  getReferences(options?: CitationOptions): Reference[] {
    let refs = Array.from(this.references.values());

    // Apply sorting
    if (options?.sortBy) {
      refs = this.sortReferences(refs, options.sortBy);
    }

    // Re-number short forms if numeric
    if (options?.shortFormStyle === 'numeric') {
      refs = refs.map((ref, index) => ({
        ...ref,
        shortForm: `[${index + 1}]`,
      }));
    }

    return refs;
  }

  /**
   * Format citation based on style
   */
  private formatCitation(source: Source, style: CitationStyle): string {
    switch (style) {
      case 'APA':
        return this.formatAPA(source);
      case 'MLA':
        return this.formatMLA(source);
      case 'Chicago':
        return this.formatChicago(source);
      case 'IEEE':
        return this.formatIEEE(source);
      case 'Harvard':
        return this.formatHarvard(source);
      default:
        return this.formatAPA(source);
    }
  }

  /**
   * Format APA style
   * Format: Author(s). (Year). Title. Source. URL
   */
  private formatAPA(source: Source): string {
    const parts: string[] = [];

    // Author (if available in metadata or source.author)
    const author = source.author || (source.metadata?.author as string | undefined);
    if (author) {
      parts.push(`${author}.`);
    }

    // Year
    if (source.publishedDate) {
      const year = source.publishedDate.getFullYear();
      parts.push(`(${year}).`);
    }

    // Title
    parts.push(`*${source.title}*.`);

    // Source type
    if (source.type === 'academic' && source.metadata?.journal) {
      parts.push(`*${source.metadata.journal as string}*.`);
    }

    // URL
    parts.push(`Retrieved from ${source.url}`);

    return parts.join(' ');
  }

  /**
   * Format MLA style
   * Format: Author(s). "Title." Source, Date, URL.
   */
  private formatMLA(source: Source): string {
    const parts: string[] = [];

    // Author
    const author = source.author || (source.metadata?.author as string | undefined);
    if (author) {
      parts.push(`${author}.`);
    }

    // Title
    parts.push(`"${source.title}."`);

    // Source
    const publisher = source.metadata?.publisher as string | undefined;
    if (publisher) {
      parts.push(`*${publisher}*,`);
    }

    // Date
    if (source.publishedDate) {
      const date = source.publishedDate.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      parts.push(`${date},`);
    }

    // URL
    parts.push(source.url);

    return parts.join(' ');
  }

  /**
   * Format Chicago style
   * Format: Author. "Title." Source (Year): Pages. URL.
   */
  private formatChicago(source: Source): string {
    const parts: string[] = [];

    // Author
    const author = source.author || (source.metadata?.author as string | undefined);
    if (author) {
      parts.push(`${author}.`);
    }

    // Title
    parts.push(`"${source.title}."`);

    // Source and year
    const journal = source.metadata?.journal as string | undefined;
    if (journal && source.publishedDate) {
      const year = source.publishedDate.getFullYear();
      parts.push(`*${journal}* (${year}).`);
    }

    // URL
    parts.push(source.url);

    return parts.join(' ');
  }

  /**
   * Format IEEE style
   * Format: [Number] Author, "Title," Source, Year. [Online]. Available: URL
   */
  private formatIEEE(source: Source): string {
    const parts: string[] = [];

    // Author
    const author = source.author || (source.metadata?.author as string | undefined);
    if (author) {
      parts.push(`${author},`);
    }

    // Title
    parts.push(`"${source.title},"`);

    // Source
    const journal = source.metadata?.journal as string | undefined;
    if (journal) {
      parts.push(`*${journal}*,`);
    }

    // Year
    if (source.publishedDate) {
      parts.push(`${source.publishedDate.getFullYear()}.`);
    }

    // URL
    parts.push(`[Online]. Available: ${source.url}`);

    return parts.join(' ');
  }

  /**
   * Format Harvard style
   * Format: Author (Year) Title. Available at: URL (Accessed: Date).
   */
  private formatHarvard(source: Source): string {
    const parts: string[] = [];

    // Author and year
    const author = source.author || (source.metadata?.author as string | undefined);
    if (author && source.publishedDate) {
      const year = source.publishedDate.getFullYear();
      parts.push(`${author} (${year})`);
    } else if (author) {
      parts.push(author);
    }

    // Title
    parts.push(`*${source.title}*.`);

    // URL
    parts.push(`Available at: ${source.url}`);

    // Access date
    if (source.accessedDate) {
      const accessed = source.accessedDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      parts.push(`(Accessed: ${accessed}).`);
    }

    return parts.join(' ');
  }

  /**
   * Generate short form for in-text citation
   */
  private generateShortForm(source: Source, _style: CitationStyle): string {
    const author = source.author || (source.metadata?.author as string | undefined);

    switch (_style) {
      case 'APA':
      case 'Harvard':
        // Author-year format
        if (author && source.publishedDate) {
          const lastName = author.split(' ')[0]; // Last name
          const year = source.publishedDate.getFullYear();
          return `(${lastName}, ${year})`;
        }
        return `[${this.citationCounter}]`;

      case 'IEEE':
        // Numeric format
        return `[${this.citationCounter}]`;

      case 'MLA':
        // Author format
        if (author) {
          const lastName = author.split(' ')[0];
          return `(${lastName})`;
        }
        return `[${this.citationCounter}]`;

      case 'Chicago':
        // Footnote format
        return `^${this.citationCounter}`;

      default:
        return `[${this.citationCounter}]`;
    }
  }

  /**
   * Sort references
   */
  private sortReferences(refs: Reference[], _sortBy: 'alphabetical' | 'appearance' | 'date'): Reference[] {
    switch (_sortBy) {
      case 'alphabetical':
        return refs.sort((a, b) => a.formatted.localeCompare(b.formatted));

      case 'appearance':
        // Already in order of addition
        return refs;

      case 'date':
        // Would need access to source metadata
        return refs;

      default:
        return refs;
    }
  }

  /**
   * Generate bibliography section
   */
  generateBibliography(options?: CitationOptions): string {
    const refs = this.getReferences(options);

    const lines: string[] = [];
    lines.push('## References\n');

    refs.forEach((ref) => {
      if (options?.shortFormStyle === 'numeric') {
        lines.push(`${ref.shortForm} ${ref.formatted}`);
      } else {
        lines.push(ref.formatted);
      }
    });

    logInfo(`Bibliography generated: ${refs.length} references`);

    return lines.join('\n');
  }

  /**
   * Clear all references
   */
  clear(): void {
    this.references.clear();
    this.citationCounter = 1;
  }

  /**
   * Get reference by source ID
   */
  getReferenceBySourceId(sourceId: string): Reference | undefined {
    return Array.from(this.references.values()).find(
      (ref) => ref.sourceId === sourceId
    );
  }

  /**
   * Get citation count
   */
  getCount(): number {
    return this.references.size;
  }
}

export function createCitationManager(): CitationManager {
  return new CitationManager();
}
