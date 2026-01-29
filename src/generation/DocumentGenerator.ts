/**
 * Document generator with template support
 */

import Handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import type { ResearchDocument, Section } from '../core/types.js';
import { logInfo, logError } from '../utils/logger.js';

export type DocumentTemplate =
  | 'comprehensive'
  | 'executive-summary'
  | 'comparison'
  | 'guide';

export interface GenerationOptions {
  template: DocumentTemplate;
  includeReferences?: boolean;
  includeMetadata?: boolean;
  maxSections?: number;
}

export class DocumentGenerator {
  private templates: Map<DocumentTemplate, HandlebarsTemplateDelegate> = new Map();
  private templatePath: string;

  constructor(templatePath?: string) {
    this.templatePath = templatePath || path.join(process.cwd(), 'templates');
    this.registerHelpers();
  }

  /**
   * Initialize templates
   */
  async initialize(): Promise<void> {
    const templateNames: DocumentTemplate[] = [
      'comprehensive',
      'executive-summary',
      'comparison',
      'guide',
    ];

    for (const name of templateNames) {
      try {
        const templateFile = path.join(this.templatePath, `${name}.hbs`);
        const templateContent = await fs.readFile(templateFile, 'utf-8');
        const compiled = Handlebars.compile(templateContent);
        this.templates.set(name, compiled);
        logInfo(`Template loaded: ${name}`);
      } catch (error) {
        logError(`Failed to load template: ${name}`, error);
      }
    }
  }

  /**
   * Generate document from template
   */
  async generate(
    doc: ResearchDocument,
    options: GenerationOptions
  ): Promise<string> {
    const template = this.templates.get(options.template);

    if (!template) {
      throw new Error(`Template not found: ${options.template}`);
    }

    // Prepare template data
    const data = this.prepareTemplateData(doc, options);

    // Render template
    try {
      const rendered = template(data);
      logInfo('Document generated', {
        template: options.template,
        sections: doc.sections.length,
      });
      return rendered;
    } catch (error) {
      logError('Failed to generate document', error);
      throw error;
    }
  }

  /**
   * Prepare data for template rendering
   */
  private prepareTemplateData(
    doc: ResearchDocument,
    options: GenerationOptions
  ): Record<string, any> {
    const sections = options.maxSections
      ? doc.sections.slice(0, options.maxSections)
      : doc.sections;

    return {
      title: doc.title,
      topic: doc.topic,
      summary: doc.summary,
      sections,
      references: options.includeReferences !== false ? doc.references : [],
      metadata: options.includeMetadata !== false ? doc.metadata : null,
      verificationSummary: doc.verificationSummary,
      credibilityLevel: this.getCredibilityLevel(doc.metadata.credibilityScore),
      credibilityPercentage: (doc.metadata.credibilityScore * 100).toFixed(1),
      generatedDate: new Date().toISOString(),
    };
  }

  /**
   * Get credibility level label
   */
  private getCredibilityLevel(score: number): string {
    if (score >= 0.9) return 'Very High';
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    if (score >= 0.4) return 'Low';
    return 'Very Low';
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Date formatting
    Handlebars.registerHelper('formatDate', (date: Date) => {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    // Percentage formatting
    Handlebars.registerHelper('percent', (value: number) => {
      return `${(value * 100).toFixed(1)}%`;
    });

    // Section type label
    Handlebars.registerHelper('sectionTypeLabel', (type: Section['type']) => {
      const labels: Record<Section['type'], string> = {
        'executive-summary': 'Executive Summary',
        introduction: 'Introduction',
        methodology: 'Methodology',
        findings: 'Key Findings',
        analysis: 'Analysis',
        comparison: 'Comparison',
        conclusion: 'Conclusion',
        references: 'References',
        appendix: 'Appendix',
      };
      return labels[type] || type;
    });

    // Conditional rendering
    Handlebars.registerHelper('ifEquals', function (this: any, arg1: any, arg2: any, options: any) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    // List with numbers
    Handlebars.registerHelper('listWithNumbers', (items: string[]) => {
      return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
    });

    // Source breakdown formatting
    Handlebars.registerHelper('sourceBreakdown', (breakdown: Record<string, number>) => {
      return Object.entries(breakdown)
        .map(([source, count]) => `- **${source}**: ${count}`)
        .join('\n');
    });
  }

  /**
   * Generate all template variations
   */
  async generateAll(doc: ResearchDocument): Promise<Map<DocumentTemplate, string>> {
    const results = new Map<DocumentTemplate, string>();

    for (const template of this.templates.keys()) {
      try {
        const content = await this.generate(doc, { template });
        results.set(template, content);
      } catch (error) {
        logError(`Failed to generate ${template}`, error);
      }
    }

    return results;
  }

  /**
   * Check if template exists
   */
  hasTemplate(template: DocumentTemplate): boolean {
    return this.templates.has(template);
  }
}

export function createDocumentGenerator(templatePath?: string): DocumentGenerator {
  return new DocumentGenerator(templatePath);
}
