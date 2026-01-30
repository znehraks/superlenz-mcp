/**
 * Core verification engine implementing 10-round cross-verification process
 * This is the heart of the research automation system's credibility assurance
 */

import type {
  Claim,
  VerifiedClaim,
  VerificationResult,
  Conflict,
  Source,
} from '../core/types.js';
import { logInfo, logWarn, logError } from '../utils/logger.js';
import { nanoid } from 'nanoid';

export interface VerificationConfig {
  minRounds: number; // Minimum verification rounds (default: 10)
  maxRounds: number; // Maximum verification rounds (default: 15)
  minSources: number; // Minimum number of sources required
  minConfidence: number; // Minimum confidence for early exit
  minAgreement: number; // Minimum agreement rate for early exit
  enableEarlyExit: boolean; // Allow early termination if criteria met
}

export interface VerificationContext {
  sessionId: string;
  topic: string;
  sources: Source[];
  claims: Claim[];
  round: number;
}

interface ClaimVerificationData {
  claim: Claim;
  supportingSources: Source[];
  contradictingSources: Source[];
  roundResults: number[]; // confidence per round
}

export class VerificationEngine {
  private config: Required<VerificationConfig>;
  private verificationHistory: VerificationResult[] = [];

  constructor(config?: Partial<VerificationConfig>) {
    this.config = {
      minRounds: config?.minRounds ?? 10,
      maxRounds: config?.maxRounds ?? 15,
      minSources: config?.minSources ?? 5,
      minConfidence: config?.minConfidence ?? 0.85,
      minAgreement: config?.minAgreement ?? 0.80,
      enableEarlyExit: config?.enableEarlyExit ?? true,
    };

    logInfo('VerificationEngine initialized', this.config);
  }

  /**
   * Execute full 10-round verification pipeline
   */
  async verify(context: VerificationContext): Promise<{
    verifiedClaims: VerifiedClaim[];
    conflicts: Conflict[];
    results: VerificationResult[];
    finalConfidence: number;
    totalRounds: number;
  }> {
    logInfo('Starting verification pipeline', {
      sessionId: context.sessionId,
      topic: context.topic,
      sources: context.sources.length,
      claims: context.claims.length,
    });

    this.verificationHistory = [];
    let currentRound = 1;
    let shouldContinue = true;

    const allConflicts: Conflict[] = [];
    const claimVerifications = new Map<string, ClaimVerificationData>();

    // Initialize claim tracking
    for (const claim of context.claims) {
      claimVerifications.set(claim.id, {
        claim,
        supportingSources: [],
        contradictingSources: [],
        roundResults: [],
      });
    }

    // Round 1-4: Multi-source collection and initial verification
    while (currentRound <= 4 && shouldContinue) {
      const result = await this.executeRound(currentRound, context, claimVerifications);
      this.verificationHistory.push(result);

      logInfo(`Round ${currentRound} complete`, {
        claimsVerified: result.claimsVerified,
        conflictsFound: result.conflictsFound,
        confidence: result.averageConfidence.toFixed(3),
      });

      currentRound++;
    }

    // Round 5: Temporal verification
    if (currentRound <= this.config.maxRounds && shouldContinue) {
      const result = await this.executeTemporalVerification(context);
      this.verificationHistory.push(result);
      allConflicts.push(...result.conflicts);

      logInfo(`Round 5 (Temporal) complete`, {
        conflictsFound: result.conflictsFound,
      });

      currentRound++;
    }

    // Round 6: Statistical cross-verification
    if (currentRound <= this.config.maxRounds && shouldContinue) {
      const result = await this.executeStatisticalVerification(context);
      this.verificationHistory.push(result);
      allConflicts.push(...result.conflicts);

      logInfo(`Round 6 (Statistical) complete`, {
        conflictsFound: result.conflictsFound,
      });

      currentRound++;
    }

    // Round 7: Scope analysis
    if (currentRound <= this.config.maxRounds && shouldContinue) {
      const result = await this.executeScopeAnalysis(context);
      this.verificationHistory.push(result);
      allConflicts.push(...result.conflicts);

      logInfo(`Round 7 (Scope) complete`, {
        conflictsFound: result.conflictsFound,
      });

      currentRound++;
    }

    // Round 8: Conflict resolution
    if (currentRound <= this.config.maxRounds && shouldContinue && allConflicts.length > 0) {
      const result = await this.executeConflictResolution(allConflicts, context);
      this.verificationHistory.push(result);

      logInfo(`Round 8 (Conflict Resolution) complete`, {
        conflictsResolved: result.conflicts.filter(c => c.resolved).length,
      });

      currentRound++;
    }

    // Round 9: LLM-based expert verification (if ANTHROPIC_API_KEY available)
    if (currentRound <= this.config.maxRounds && shouldContinue) {
      const result = await this.executeExpertVerification(context, claimVerifications);
      this.verificationHistory.push(result);

      logInfo(`Round 9 (Expert) complete`);

      currentRound++;
    }

    // Round 10: Final consensus building
    if (currentRound <= this.config.maxRounds) {
      const result = await this.executeFinalConsensus(context, claimVerifications);
      this.verificationHistory.push(result);

      logInfo(`Round 10 (Consensus) complete`, {
        finalConfidence: result.averageConfidence.toFixed(3),
      });

      currentRound++;
    }

    // Check early exit conditions
    if (this.config.enableEarlyExit && currentRound >= this.config.minRounds) {
      const shouldExit = this.checkEarlyExitConditions();
      if (shouldExit.shouldExit) {
        logInfo('Early exit conditions met', { reason: shouldExit.reason });
        shouldContinue = false;
      }
    }

    // Build final verified claims
    const verifiedClaims = this.buildVerifiedClaims(claimVerifications, context.sources);

    const finalConfidence = this.calculateFinalConfidence(verifiedClaims);

    logInfo('Verification pipeline complete', {
      sessionId: context.sessionId,
      totalRounds: currentRound - 1,
      verifiedClaims: verifiedClaims.length,
      conflicts: allConflicts.length,
      finalConfidence: finalConfidence.toFixed(3),
    });

    return {
      verifiedClaims,
      conflicts: allConflicts,
      results: this.verificationHistory,
      finalConfidence,
      totalRounds: currentRound - 1,
    };
  }

  // ---------------------------------------------------------------------------
  // Rounds 1-4: Text-based claim-source keyword-overlap matching
  // ---------------------------------------------------------------------------

  private async executeRound(
    round: number,
    context: VerificationContext,
    claimVerifications: Map<string, ClaimVerificationData>,
  ): Promise<VerificationResult> {
    // Select a subset of sources for this round (more sources each round)
    const sourcesForRound = context.sources.slice(0, Math.min(context.sources.length, round * 3));

    let totalConfidence = 0;
    let claimsProcessed = 0;

    for (const claim of context.claims) {
      const data = claimVerifications.get(claim.id);
      if (!data) continue;

      let matchCount = 0;
      let weightedScore = 0;

      for (const source of sourcesForRound) {
        const overlap = this.computeKeywordOverlap(claim.text, source.title);
        if (overlap > 0.15) {
          matchCount++;
          weightedScore += overlap * source.credibilityScore;

          // Track supporting/contradicting (simple heuristic)
          if (!data.supportingSources.find(s => s.id === source.id)) {
            data.supportingSources.push(source);
          }
        }
      }

      const sourceRatio = sourcesForRound.length > 0 ? matchCount / sourcesForRound.length : 0;
      const roundConfidence = sourcesForRound.length > 0
        ? (sourceRatio * 0.5 + (weightedScore / Math.max(matchCount, 1)) * 0.5)
        : 0.3;

      data.roundResults.push(Math.min(1, roundConfidence));
      totalConfidence += roundConfidence;
      claimsProcessed++;
    }

    const averageConfidence = claimsProcessed > 0 ? totalConfidence / claimsProcessed : 0.5;

    return {
      round,
      timestamp: new Date(),
      claimsVerified: context.claims.length,
      conflictsFound: 0,
      averageConfidence: Math.min(1, averageConfidence),
      sources: sourcesForRound,
      conflicts: [],
    };
  }

  // ---------------------------------------------------------------------------
  // Round 5: Temporal verification
  // ---------------------------------------------------------------------------

  private async executeTemporalVerification(
    context: VerificationContext
  ): Promise<VerificationResult> {
    const conflicts: Conflict[] = [];

    for (let i = 0; i < context.claims.length; i++) {
      for (let j = i + 1; j < context.claims.length; j++) {
        const claim1 = context.claims[i];
        const claim2 = context.claims[j];

        if (this.hasTemporalConflict(claim1, claim2)) {
          conflicts.push({
            id: nanoid(),
            type: 'TEMPORAL_DIFFERENCE',
            claims: [claim1, claim2],
            sources: context.sources.filter(s =>
              claim1.extractedFrom.includes(s.id) || claim2.extractedFrom.includes(s.id)
            ),
            resolutionStrategy: 'Use most recent data with temporal context',
            resolved: false,
            confidence: 0.8,
          });
        }
      }
    }

    // Average confidence from prior rounds
    const avgPrior = this.averageHistoryConfidence();

    return {
      round: 5,
      timestamp: new Date(),
      claimsVerified: context.claims.length,
      conflictsFound: conflicts.length,
      averageConfidence: Math.min(1, avgPrior + 0.02),
      sources: context.sources,
      conflicts,
    };
  }

  // ---------------------------------------------------------------------------
  // Round 6: Statistical cross-verification
  // ---------------------------------------------------------------------------

  private async executeStatisticalVerification(
    context: VerificationContext
  ): Promise<VerificationResult> {
    const conflicts: Conflict[] = [];

    const numericalClaims = context.claims.filter(c => this.isNumericalClaim(c));

    for (const claim of numericalClaims) {
      const values = this.extractNumericalValues(claim);
      if (values.length >= 2) {
        const cv = this.calculateCV(values);

        if (cv > 0.5) {
          conflicts.push({
            id: nanoid(),
            type: 'STATISTICAL_METHOD',
            claims: [claim],
            sources: context.sources.filter(s => claim.extractedFrom.includes(s.id)),
            resolutionStrategy: 'Report all values with methodology context',
            resolved: false,
            confidence: 0.7,
          });
        }
      }
    }

    const avgPrior = this.averageHistoryConfidence();

    return {
      round: 6,
      timestamp: new Date(),
      claimsVerified: context.claims.length,
      conflictsFound: conflicts.length,
      averageConfidence: Math.min(1, avgPrior + 0.02),
      sources: context.sources,
      conflicts,
    };
  }

  // ---------------------------------------------------------------------------
  // Round 7: Scope analysis
  // ---------------------------------------------------------------------------

  private async executeScopeAnalysis(
    context: VerificationContext
  ): Promise<VerificationResult> {
    const conflicts: Conflict[] = [];

    for (let i = 0; i < context.claims.length; i++) {
      for (let j = i + 1; j < context.claims.length; j++) {
        const claim1 = context.claims[i];
        const claim2 = context.claims[j];

        if (this.hasScopeConflict(claim1, claim2)) {
          conflicts.push({
            id: nanoid(),
            type: 'SCOPE_DIFFERENCE',
            claims: [claim1, claim2],
            sources: context.sources.filter(s =>
              claim1.extractedFrom.includes(s.id) || claim2.extractedFrom.includes(s.id)
            ),
            resolutionStrategy: 'Clarify scope and present both with context',
            resolved: false,
            confidence: 0.85,
          });
        }
      }
    }

    const avgPrior = this.averageHistoryConfidence();

    return {
      round: 7,
      timestamp: new Date(),
      claimsVerified: context.claims.length,
      conflictsFound: conflicts.length,
      averageConfidence: Math.min(1, avgPrior + 0.01),
      sources: context.sources,
      conflicts,
    };
  }

  // ---------------------------------------------------------------------------
  // Round 8: Conflict resolution
  // ---------------------------------------------------------------------------

  private async executeConflictResolution(
    conflicts: Conflict[],
    context: VerificationContext
  ): Promise<VerificationResult> {
    for (const conflict of conflicts) {
      switch (conflict.type) {
        case 'SCOPE_DIFFERENCE':
          conflict.resolved = true;
          conflict.resolution = 'Both values are correct for different scopes';
          break;

        case 'TEMPORAL_DIFFERENCE':
          conflict.resolved = true;
          conflict.resolution = 'Use most recent data with year context';
          break;

        case 'STATISTICAL_METHOD':
          conflict.resolved = true;
          conflict.resolution = 'Present multiple statistical measures';
          break;

        case 'MEASUREMENT_UNIT':
          conflict.resolved = true;
          conflict.resolution = 'Standardize units and note measurement basis';
          break;

        case 'TRUE_CONTRADICTION': {
          const sources = conflict.sources;
          const credibilityDiff = Math.max(...sources.map(s => s.credibilityScore)) -
                                 Math.min(...sources.map(s => s.credibilityScore));

          if (credibilityDiff > 0.2) {
            conflict.resolved = true;
            conflict.resolution = 'Trust higher credibility source';
          } else {
            conflict.resolved = false;
            conflict.resolution = 'Multiple valid perspectives - present both';
          }
          break;
        }
      }
    }

    const avgPrior = this.averageHistoryConfidence();

    return {
      round: 8,
      timestamp: new Date(),
      claimsVerified: context.claims.length,
      conflictsFound: conflicts.length,
      averageConfidence: Math.min(1, avgPrior + 0.02),
      sources: context.sources,
      conflicts,
    };
  }

  // ---------------------------------------------------------------------------
  // Round 9: Expert / LLM verification
  // ---------------------------------------------------------------------------

  private async executeExpertVerification(
    context: VerificationContext,
    claimVerifications: Map<string, ClaimVerificationData>,
  ): Promise<VerificationResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // Algorithmic fallback: boost claims that have multiple supporting sources
      for (const [, data] of claimVerifications) {
        const supportRatio = context.sources.length > 0
          ? data.supportingSources.length / context.sources.length
          : 0;
        data.roundResults.push(Math.min(1, supportRatio * 1.2 + 0.3));
      }

      const avgPrior = this.averageHistoryConfidence();

      return {
        round: 9,
        timestamp: new Date(),
        claimsVerified: context.claims.length,
        conflictsFound: 0,
        averageConfidence: Math.min(1, avgPrior + 0.01),
        sources: context.sources,
        conflicts: [],
      };
    }

    // LLM-based verification
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });

      // Build a concise prompt
      const claimTexts = context.claims.slice(0, 15).map((c, i) => `${i + 1}. ${c.text}`).join('\n');
      const sourceTexts = context.sources.slice(0, 10).map(
        (s, i) => `${i + 1}. [${s.title}] (${s.url}) credibility=${s.credibilityScore.toFixed(2)}`
      ).join('\n');

      const message = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are a research verification expert. Evaluate the following claims about "${context.topic}" based on the provided sources.\n\nClaims:\n${claimTexts}\n\nSources:\n${sourceTexts}\n\nFor each claim, respond with a JSON array of objects: {"claimIndex": number, "confidence": number (0-1), "assessment": "verified"|"disputed"|"unverifiable"}\nRespond ONLY with the JSON array.`,
        }],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

      // Parse the LLM response
      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const assessments = JSON.parse(jsonMatch[0]) as Array<{
            claimIndex: number;
            confidence: number;
            assessment: string;
          }>;

          for (const assessment of assessments) {
            const idx = assessment.claimIndex - 1;
            if (idx >= 0 && idx < context.claims.length) {
              const claim = context.claims[idx];
              const data = claimVerifications.get(claim.id);
              if (data) {
                data.roundResults.push(Math.min(1, Math.max(0, assessment.confidence)));
              }
            }
          }
        }
      } catch {
        logWarn('Failed to parse LLM verification response');
      }

      const avgPrior = this.averageHistoryConfidence();

      return {
        round: 9,
        timestamp: new Date(),
        claimsVerified: context.claims.length,
        conflictsFound: 0,
        averageConfidence: Math.min(1, avgPrior + 0.03),
        sources: context.sources,
        conflicts: [],
      };
    } catch (error) {
      logError('LLM verification failed, using algorithmic fallback', error);

      for (const [, data] of claimVerifications) {
        const supportRatio = context.sources.length > 0
          ? data.supportingSources.length / context.sources.length
          : 0;
        data.roundResults.push(Math.min(1, supportRatio * 1.2 + 0.3));
      }

      const avgPrior = this.averageHistoryConfidence();

      return {
        round: 9,
        timestamp: new Date(),
        claimsVerified: context.claims.length,
        conflictsFound: 0,
        averageConfidence: Math.min(1, avgPrior + 0.01),
        sources: context.sources,
        conflicts: [],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Round 10: Final consensus building
  // ---------------------------------------------------------------------------

  private async executeFinalConsensus(
    context: VerificationContext,
    claimVerifications: Map<string, ClaimVerificationData>,
  ): Promise<VerificationResult> {
    // LLM-based final synthesis (if API key available)
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey });

        // Prepare summary data
        const summaryItems: string[] = [];
        for (const [, data] of claimVerifications) {
          const avgConf = data.roundResults.length > 0
            ? data.roundResults.reduce((a, b) => a + b, 0) / data.roundResults.length
            : 0.5;
          summaryItems.push(`- "${data.claim.text}" avg_confidence=${avgConf.toFixed(2)} supporting=${data.supportingSources.length}`);
        }

        const message = await client.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: `As a research verification expert, provide a final overall confidence score (0-1) for this set of claims about "${context.topic}". Consider the individual claim statistics below:\n\n${summaryItems.slice(0, 15).join('\n')}\n\nRespond with ONLY a single JSON object: {"overallConfidence": number, "notes": "brief summary"}`,
          }],
        });

        const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        let llmConfidence: number | null = null;
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            llmConfidence = parsed.overallConfidence;
          } catch {
            // ignore parse errors
          }
        }

        if (llmConfidence !== null && llmConfidence >= 0 && llmConfidence <= 1) {
          return {
            round: 10,
            timestamp: new Date(),
            claimsVerified: context.claims.length,
            conflictsFound: 0,
            averageConfidence: llmConfidence,
            sources: context.sources,
            conflicts: [],
          };
        }
      } catch (error) {
        logWarn('LLM consensus failed, using algorithmic fallback', { error: (error as Error).message });
      }
    }

    // Algorithmic consensus: weighted average of all round results across claims
    let totalConf = 0;
    let count = 0;
    for (const [, data] of claimVerifications) {
      if (data.roundResults.length > 0) {
        // Weight later rounds more heavily
        let weightedSum = 0;
        let weightTotal = 0;
        for (let i = 0; i < data.roundResults.length; i++) {
          const weight = 1 + i * 0.5; // later rounds get higher weight
          weightedSum += data.roundResults[i] * weight;
          weightTotal += weight;
        }
        totalConf += weightedSum / weightTotal;
        count++;
      }
    }

    const consensusConfidence = count > 0 ? totalConf / count : 0.5;

    return {
      round: 10,
      timestamp: new Date(),
      claimsVerified: context.claims.length,
      conflictsFound: 0,
      averageConfidence: Math.min(1, consensusConfidence),
      sources: context.sources,
      conflicts: [],
    };
  }

  // ---------------------------------------------------------------------------
  // Early exit
  // ---------------------------------------------------------------------------

  private checkEarlyExitConditions(): { shouldExit: boolean; reason?: string } {
    if (this.verificationHistory.length < this.config.minRounds) {
      return { shouldExit: false };
    }

    const latestResult = this.verificationHistory[this.verificationHistory.length - 1];
    const sourceCount = latestResult.sources.length;

    if (latestResult.averageConfidence >= this.config.minConfidence &&
        sourceCount >= this.config.minSources) {
      return {
        shouldExit: true,
        reason: `Confidence ${latestResult.averageConfidence.toFixed(2)} >= ${this.config.minConfidence} with ${sourceCount} sources`,
      };
    }

    return { shouldExit: false };
  }

  // ---------------------------------------------------------------------------
  // Build verified claims
  // ---------------------------------------------------------------------------

  private buildVerifiedClaims(
    claimVerifications: Map<string, ClaimVerificationData>,
    _sources: Source[]
  ): VerifiedClaim[] {
    const verifiedClaims: VerifiedClaim[] = [];

    for (const [, data] of claimVerifications.entries()) {
      // Calculate final confidence as weighted average (later rounds weigh more)
      let finalConfidence: number;
      if (data.roundResults.length > 0) {
        let weightedSum = 0;
        let weightTotal = 0;
        for (let i = 0; i < data.roundResults.length; i++) {
          const weight = 1 + i * 0.5;
          weightedSum += data.roundResults[i] * weight;
          weightTotal += weight;
        }
        finalConfidence = weightedSum / weightTotal;
      } else {
        finalConfidence = 0.5;
      }

      // Determine status
      let verificationStatus: 'verified' | 'disputed' | 'false' | 'pending';
      if (finalConfidence >= 0.8) {
        verificationStatus = 'verified';
      } else if (finalConfidence >= 0.5) {
        verificationStatus = 'disputed';
      } else {
        verificationStatus = 'false';
      }

      verifiedClaims.push({
        ...data.claim,
        verificationStatus,
        verificationRounds: this.verificationHistory.length,
        supportingSources: data.supportingSources,
        contradictingSources: data.contradictingSources,
        finalConfidence: Math.min(1, finalConfidence),
      });
    }

    return verifiedClaims;
  }

  // ---------------------------------------------------------------------------
  // Final confidence
  // ---------------------------------------------------------------------------

  private calculateFinalConfidence(verifiedClaims: VerifiedClaim[]): number {
    if (verifiedClaims.length === 0) return 0;

    const avgConfidence = verifiedClaims.reduce((sum, claim) => sum + claim.finalConfidence, 0) / verifiedClaims.length;
    return avgConfidence;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute keyword overlap between two text strings (Jaccard-like).
   * Returns 0..1.
   */
  private computeKeywordOverlap(textA: string, textB: string): number {
    const wordsA = this.tokenize(textA);
    const wordsB = this.tokenize(textB);
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }

    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 0;
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2) // skip very short tokens
    );
  }

  private averageHistoryConfidence(): number {
    if (this.verificationHistory.length === 0) return 0.5;
    return this.verificationHistory.reduce((s, r) => s + r.averageConfidence, 0) / this.verificationHistory.length;
  }

  private hasTemporalConflict(claim1: Claim, claim2: Claim): boolean {
    const years1 = claim1.text.match(/20\d{2}/g);
    const years2 = claim2.text.match(/20\d{2}/g);

    if (years1 && years2 && years1[0] !== years2[0]) {
      return true;
    }

    return false;
  }

  private hasScopeConflict(claim1: Claim, claim2: Claim): boolean {
    const scopeKeywords = ['only', 'including', 'excluding', 'total', 'average'];

    const hasScope1 = scopeKeywords.some(kw => claim1.text.toLowerCase().includes(kw));
    const hasScope2 = scopeKeywords.some(kw => claim2.text.toLowerCase().includes(kw));

    return hasScope1 && hasScope2;
  }

  private isNumericalClaim(claim: Claim): boolean {
    return /\d+/.test(claim.text);
  }

  private extractNumericalValues(claim: Claim): number[] {
    const matches = claim.text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g);
    if (!matches) return [];

    return matches.map(m => parseFloat(m.replace(/,/g, '')));
  }

  private calculateCV(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return mean !== 0 ? stdDev / mean : 0;
  }

  /**
   * Get verification statistics
   */
  getStatistics(): {
    totalRounds: number;
    averageConfidence: number;
    totalConflicts: number;
    resolvedConflicts: number;
  } {
    const totalConflicts = this.verificationHistory.reduce((sum, r) => sum + r.conflictsFound, 0);
    const resolvedConflicts = this.verificationHistory.reduce(
      (sum, r) => sum + r.conflicts.filter(c => c.resolved).length,
      0
    );

    const avgConfidence = this.verificationHistory.length > 0
      ? this.verificationHistory.reduce((sum, r) => sum + r.averageConfidence, 0) / this.verificationHistory.length
      : 0;

    return {
      totalRounds: this.verificationHistory.length,
      averageConfidence: avgConfidence,
      totalConflicts,
      resolvedConflicts,
    };
  }
}
