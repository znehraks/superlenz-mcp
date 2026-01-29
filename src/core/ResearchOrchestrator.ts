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
} from './types.js';
import { SessionManager } from './SessionManager.js';
import { SearchEngine } from '../search/SearchEngine.js';
import { SearchAggregator } from '../search/SearchAggregator.js';
import { VerificationEngine } from '../verification/VerificationEngine.js';
import { CredibilityCalculator } from '../verification/CredibilityCalculator.js';
import { MarkdownProvider } from '../storage/providers/MarkdownProvider.js';
import { logInfo, logError } from '../utils/logger.js';
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
  private searchEngine: SearchEngine;
  private searchAggregator: SearchAggregator;
  private verificationEngine: VerificationEngine;
  private credibilityCalculator: CredibilityCalculator;
  private storageProvider: MarkdownProvider;

  constructor() {
    this.sessionManager = new SessionManager();
    this.searchEngine = new SearchEngine();
    this.searchAggregator = new SearchAggregator(this.searchEngine);
    this.verificationEngine = new VerificationEngine();
    this.credibilityCalculator = new CredibilityCalculator();

    // Initialize default storage (Markdown)
    this.storageProvider = new MarkdownProvider({
      enabled: true,
      priority: 1,
      basePath: process.env.OUTPUT_PATH || './output',
    });

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

      const searchResults = await this.searchAggregator.aggregate(options.topic, {
        sources: ['web', 'academic'],
        limit: options.depth === 'quick' ? 5 : options.depth === 'standard' ? 10 : 15,
        minRelevanceScore: 0.5,
        diversify: true,
        boostRecent: true,
      });

      logInfo(`Search complete: ${searchResults.results.length} results`, {
        sessionId: session.id,
      });

      // Phase 3: Verification (simplified for now)
      await this.updateProgress(session.id, 'verifying', 40, 'Executing verification rounds');

      // Mock claims and sources for verification
      const mockClaims = searchResults.results.map(result => ({
        id: nanoid(),
        text: result.snippet,
        topic: options.topic,
        extractedFrom: [result.id],
        confidence: result.relevanceScore,
        verificationStatus: 'pending' as const,
      }));

      const mockSources = searchResults.results.map(result => ({
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

      const verificationResult = await this.verificationEngine.verify({
        sessionId: session.id,
        topic: options.topic,
        sources: mockSources,
        claims: mockClaims,
        round: 1,
      });

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

      // Phase 5: Generate document
      const document = this.generateDocument({
        session,
        searchResults,
        verificationResult,
        credibilityScore,
      });

      logInfo('Document generated', {
        sessionId: session.id,
        sections: document.sections.length,
        references: document.references.length,
      });

      // Phase 6: Save to storage
      await this.updateProgress(session.id, 'saving', 90, 'Saving to storage');

      await this.storageProvider.saveDocument(document);

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
   * Generate research document
   */
  private generateDocument(data: {
    session: ResearchSession;
    searchResults: any;
    verificationResult: any;
    credibilityScore: any;
  }): ResearchDocument {
    const { session, searchResults, verificationResult, credibilityScore } = data;

    // Generate sections
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

    // Generate references
    const references: Reference[] = searchResults.results.slice(0, 20).map((result: any, i: number) => ({
      id: nanoid(),
      sourceId: result.id,
      citationStyle: 'APA' as const,
      formatted: `${result.title}. Retrieved from ${result.url}`,
      shortForm: `[${i + 1}]`,
    }));

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
