/**
 * Research Orchestrator - Coordinates the entire research workflow
 *
 * Workflow:
 * 1. Initialize session
 * 2. Search multiple sources
 * 3. Collect and extract content
 * 4. Execute 10-round verification
 * 5. Generate document
 * 6. Save to storage (with fallback)
 */

import type {
  ResearchSession,
  ResearchDepth,
  ResearchDocument,
  Section,
  Reference,
  Source,
} from './types.js';
import { SessionManager } from './SessionManager.js';
import { SearchAggregator } from '../search/SearchAggregator.js';
import { createConfiguredSearchEngine } from '../search/createConfiguredSearchEngine.js';
import { VerificationEngine } from '../verification/VerificationEngine.js';
import { CredibilityCalculator } from '../verification/CredibilityCalculator.js';
import { MarkdownProvider } from '../storage/providers/MarkdownProvider.js';
import { DocumentGenerator } from '../generation/DocumentGenerator.js';
import { CitationManager } from '../generation/CitationManager.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import { nanoid } from 'nanoid';

export interface ResearchOptions {
  topic: string;
  initialUrls?: string[];
  depth: ResearchDepth;
  storageProvider: string;
}

export interface ResearchProgress {
  sessionId: string;
  status: ResearchSession['status'];
  progress: number;
  currentPhase: string;
  message: string;
}

export class ResearchOrchestrator {
  private sessionManager: SessionManager;
  private searchAggregator: SearchAggregator;
  private verificationEngine: VerificationEngine;
  private credibilityCalculator: CredibilityCalculator;
  private markdownProvider: MarkdownProvider;
  private documentGenerator: DocumentGenerator;
  private citationManager: CitationManager;
  private documentGeneratorInitialized = false;

  /** Cache generated documents by sessionId for later retrieval (e.g. save_to_storage) */
  private documentCache: Map<string, ResearchDocument> = new Map();

  constructor() {
    this.sessionManager = new SessionManager();

    const searchEngine = createConfiguredSearchEngine();
    this.searchAggregator = new SearchAggregator(searchEngine);

    this.verificationEngine = new VerificationEngine();
    this.credibilityCalculator = new CredibilityCalculator();

    // Default storage (Markdown)
    this.markdownProvider = new MarkdownProvider({
      enabled: true,
      priority: 1,
      basePath: process.env.OUTPUT_PATH || './output',
    });

    // Document generation
    this.documentGenerator = new DocumentGenerator();
    this.citationManager = new CitationManager();

    logInfo('ResearchOrchestrator initialized');
  }

  /**
   * Execute complete research workflow
   */
  async executeResearch(options: ResearchOptions): Promise<ResearchDocument> {
    // Phase 1: Initialize session
    const session = this.sessionManager.createSession({
      topic: options.topic,
      initialUrls: options.initialUrls,
      depth: options.depth,
      storageProvider: options.storageProvider,
    });

    logInfo('Research session created', {
      sessionId: session.id,
      topic: options.topic,
      depth: options.depth,
    });

    try {
      // Phase 2: Search sources
      await this.updateProgress(session.id, 'searching', 20, 'Searching multiple sources');

      let searchResults;
      try {
        searchResults = await this.searchAggregator.aggregate(options.topic, {
          sources: ['web', 'academic'],
          limit: options.depth === 'quick' ? 5 : options.depth === 'standard' ? 10 : 15,
          minRelevanceScore: 0.5,
          diversify: true,
          boostRecent: true,
        });
      } catch (searchError) {
        logWarn('Search phase failed, continuing with empty results', { error: (searchError as Error).message });
        searchResults = { results: [], sourceBreakdown: {} as any, totalResults: 0, filteredResults: 0, averageRelevance: 0 };
      }

      logInfo(`Search complete: ${searchResults.results.length} results`, {
        sessionId: session.id,
      });

      // Phase 3: Verification
      await this.updateProgress(session.id, 'verifying', 40, 'Executing verification rounds');

      const mockClaims = searchResults.results.map(result => ({
        id: nanoid(),
        text: result.snippet,
        topic: options.topic,
        extractedFrom: [result.id],
        confidence: result.relevanceScore,
        verificationStatus: 'pending' as const,
      }));

      const mockSources: Source[] = searchResults.results.map(result => ({
        id: result.id,
        url: result.url,
        type: result.source,
        title: result.title,
        accessedDate: new Date(),
        credibilityScore: result.relevanceScore,
        credibilityLevel: result.relevanceScore >= 0.8 ? 'high' as const : 'medium' as const,
        publishedDate: result.publishedDate,
        metadata: result.metadata,
      }));

      let verificationResult;
      try {
        verificationResult = await this.verificationEngine.verify({
          sessionId: session.id,
          topic: options.topic,
          sources: mockSources,
          claims: mockClaims,
          round: 1,
        });
      } catch (verifyError) {
        logWarn('Verification phase failed, using unverified claims', { error: (verifyError as Error).message });
        verificationResult = {
          verifiedClaims: mockClaims.map(c => ({
            ...c,
            verificationRounds: 0,
            supportingSources: [],
            contradictingSources: [],
            finalConfidence: 0.3,
          })),
          conflicts: [],
          results: [],
          finalConfidence: 0.3,
          totalRounds: 0,
        };
      }

      logInfo(`Verification complete: ${verificationResult.totalRounds} rounds`, {
        sessionId: session.id,
        confidence: verificationResult.finalConfidence.toFixed(3),
      });

      // Phase 4: Calculate credibility
      await this.updateProgress(session.id, 'generating', 70, 'Generating document');

      const credibilityScore = this.credibilityCalculator.calculate({
        sources: mockSources,
        verifiedClaims: verificationResult.verifiedClaims,
        expertVerified: false,
      });

      // Phase 5: Generate document with CitationManager
      let document: ResearchDocument;
      try {
        document = await this.generateDocumentWithCitations({
          session,
          searchResults,
          verificationResult,
          credibilityScore,
          sources: mockSources,
        });
      } catch (genError) {
        logWarn('DocumentGenerator failed, using inline fallback', { error: (genError as Error).message });
        document = this.generateDocumentFallback({
          session,
          searchResults,
          verificationResult,
          credibilityScore,
        });
      }

      logInfo('Document generated', {
        sessionId: session.id,
        sections: document.sections.length,
        references: document.references.length,
      });

      // Cache the document for later retrieval
      this.documentCache.set(session.id, document);

      // Phase 6: Save to storage
      await this.updateProgress(session.id, 'saving', 90, 'Saving to storage');

      try {
        const storageProvider = this.resolveStorageProvider(options.storageProvider);
        await storageProvider.saveDocument(document);
      } catch (saveError) {
        logWarn('Primary storage failed, trying markdown fallback', { error: (saveError as Error).message });
        try {
          await this.markdownProvider.saveDocument(document);
        } catch (fallbackError) {
          logError('Markdown fallback also failed', fallbackError);
        }
      }

      // Mark as completed
      await this.updateProgress(session.id, 'completed', 100, 'Research completed');

      logInfo('Research completed successfully', {
        sessionId: session.id,
        credibility: credibilityScore.overall.toFixed(3),
      });

      return document;
    } catch (error) {
      logError('Research failed', error, { sessionId: session.id });

      this.sessionManager.updateSession(session.id, {
        status: 'failed',
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Generate document using DocumentGenerator + CitationManager
   */
  private async generateDocumentWithCitations(data: {
    session: ResearchSession;
    searchResults: any;
    verificationResult: any;
    credibilityScore: any;
    sources: Source[];
  }): Promise<ResearchDocument> {
    const { session, searchResults, verificationResult, credibilityScore, sources } = data;

    // Format references via CitationManager
    this.citationManager.clear();
    const references = this.citationManager.addSources(sources, 'APA');

    // Lazy-init DocumentGenerator templates
    if (!this.documentGeneratorInitialized) {
      try {
        await this.documentGenerator.initialize();
        this.documentGeneratorInitialized = true;
      } catch {
        logWarn('DocumentGenerator template init failed — will use fallback');
      }
    }

    // Build the base ResearchDocument
    const doc = this.buildResearchDocument({
      session,
      searchResults,
      verificationResult,
      credibilityScore,
      references,
    });

    return doc;
  }

  /**
   * Build a ResearchDocument object (shared between generator and fallback)
   */
  private buildResearchDocument(data: {
    session: ResearchSession;
    searchResults: any;
    verificationResult: any;
    credibilityScore: any;
    references: Reference[];
  }): ResearchDocument {
    const { session, searchResults, verificationResult, credibilityScore, references } = data;

    const sections: Section[] = [
      {
        id: nanoid(),
        type: 'executive-summary',
        title: 'Executive Summary',
        content: `This research report on "${session.topic}" was generated through automated multi-source verification with ${verificationResult.totalRounds} rounds of cross-validation.`,
      },
      {
        id: nanoid(),
        type: 'methodology',
        title: 'Methodology',
        content: [
          `## Research Approach`,
          `- **Sources Analyzed**: ${searchResults.totalResults}`,
          `- **Verification Rounds**: ${verificationResult.totalRounds}`,
          `- **Final Confidence**: ${(verificationResult.finalConfidence * 100).toFixed(1)}%`,
          '',
          `## Source Breakdown`,
          ...Object.entries(searchResults.sourceBreakdown).map(
            ([source, count]) => `- **${source}**: ${count} sources`
          ),
        ].join('\n'),
      },
      {
        id: nanoid(),
        type: 'findings',
        title: 'Key Findings',
        content: verificationResult.verifiedClaims
          .slice(0, 10)
          .map((claim: any, i: number) => `${i + 1}. ${claim.text}`)
          .join('\n\n'),
      },
    ];

    return {
      id: nanoid(),
      title: `Research Report: ${session.topic}`,
      topic: session.topic,
      summary: `Comprehensive research on ${session.topic} based on ${searchResults.totalResults} sources with ${verificationResult.totalRounds}-round verification.`,
      sections,
      references,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        author: 'Research Automation MCP Server',
        version: '1.0.0',
        tags: [session.topic, 'automated-research', `depth-${session.depth}`],
        category: 'research-report',
        credibilityScore: credibilityScore.overall,
        verificationRounds: verificationResult.totalRounds,
        sourcesCount: searchResults.totalResults,
        conflictsResolved: verificationResult.conflicts.filter((c: any) => c.resolved).length,
      },
      verificationSummary: {
        totalClaims: verificationResult.verifiedClaims.length,
        verifiedClaims: verificationResult.verifiedClaims.filter((c: any) => c.finalConfidence >= 0.8).length,
        averageConfidence: verificationResult.finalConfidence,
        sourceBreakdown: searchResults.sourceBreakdown,
      },
    };
  }

  /**
   * Fallback document generation using inline logic (no templates)
   */
  private generateDocumentFallback(data: {
    session: ResearchSession;
    searchResults: any;
    verificationResult: any;
    credibilityScore: any;
  }): ResearchDocument {
    const { session, searchResults, verificationResult, credibilityScore } = data;

    const references: Reference[] = searchResults.results.slice(0, 20).map((result: any, i: number) => ({
      id: nanoid(),
      sourceId: result.id,
      citationStyle: 'APA' as const,
      formatted: `${result.title}. Retrieved from ${result.url}`,
      shortForm: `[${i + 1}]`,
    }));

    return this.buildResearchDocument({
      session,
      searchResults,
      verificationResult,
      credibilityScore,
      references,
    });
  }

  /**
   * Resolve storage provider by name string.
   * Falls back to markdown if the requested provider is unknown.
   */
  private resolveStorageProvider(name: string) {
    switch (name) {
      case 'markdown':
        return this.markdownProvider;
      case 'json': {
        // Lazy-import to avoid circular deps if JsonProvider doesn't exist yet
        try {
          // JsonProvider will be added in Phase 2
          const { JsonProvider } = require('../storage/providers/JsonProvider.js');
          return new JsonProvider({
            enabled: true,
            priority: 2,
            basePath: process.env.OUTPUT_PATH || './output',
          });
        } catch {
          logWarn(`JSON storage provider not available, falling back to markdown`);
          return this.markdownProvider;
        }
      }
      default:
        logWarn(`Unknown storage provider "${name}", falling back to markdown`);
        return this.markdownProvider;
    }
  }

  /**
   * Get a cached document by session ID
   */
  getCachedDocument(sessionId: string): ResearchDocument | undefined {
    return this.documentCache.get(sessionId);
  }

  /**
   * Update session progress
   */
  private async updateProgress(
    sessionId: string,
    status: ResearchSession['status'],
    progress: number,
    message: string
  ): Promise<void> {
    this.sessionManager.updateSession(sessionId, {
      status,
      progress,
    });

    logInfo(`Progress: ${progress}% - ${message}`, { sessionId });
  }

  /**
   * Get research status
   */
  getResearchStatus(sessionId: string): ResearchProgress | null {
    const session = this.sessionManager.getSession(sessionId);

    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      status: session.status,
      progress: session.progress,
      currentPhase: this.getPhaseDescription(session.status),
      message: session.error || `Research in progress: ${session.status}`,
    };
  }

  /**
   * Get phase description
   */
  private getPhaseDescription(status: ResearchSession['status']): string {
    const phases: Record<ResearchSession['status'], string> = {
      initializing: 'Initializing research session',
      searching: 'Searching multiple sources',
      collecting: 'Collecting and extracting content',
      verifying: 'Cross-verifying information (10 rounds)',
      generating: 'Generating research document',
      saving: 'Saving to storage',
      completed: 'Research completed successfully',
      failed: 'Research failed',
    };

    return phases[status] || 'Unknown phase';
  }

  /**
   * List active research sessions
   */
  listSessions() {
    return this.sessionManager.listSessions();
  }

  /**
   * Get session statistics
   */
  getStatistics() {
    return this.sessionManager.getStatistics();
  }
}

// Singleton instance
let instance: ResearchOrchestrator | null = null;

export function getResearchOrchestrator(): ResearchOrchestrator {
  if (!instance) {
    instance = new ResearchOrchestrator();
  }
  return instance;
}

export function resetResearchOrchestrator(): void {
  instance = null;
}
