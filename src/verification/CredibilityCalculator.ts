/**
 * Credibility calculator implementing the weighted scoring system
 *
 * Scoring Breakdown:
 * - Source Credibility: 40%
 * - Cross-Verification Agreement: 30%
 * - Recency: 15%
 * - Citation Count: 10%
 * - Expert Verification: 5%
 */

import type { Source, VerifiedClaim, CredibilityFactors, ConfidenceScore } from '../core/types.js';
import { logInfo } from '../utils/logger.js';

export interface CredibilityInput {
  sources: Source[];
  verifiedClaims: VerifiedClaim[];
  agreementRate?: number; // Cross-verification agreement (0-1)
  expertVerified?: boolean;
}

export class CredibilityCalculator {
  // Weights for each factor
  private static readonly WEIGHTS = {
    sourceCredibility: 0.40,
    crossVerification: 0.30,
    recency: 0.15,
    citationCount: 0.10,
    expertVerification: 0.05,
  };

  /**
   * Calculate overall credibility score
   */
  calculate(input: CredibilityInput): ConfidenceScore {
    const factors: CredibilityFactors = {
      sourceCredibility: this.calculateSourceCredibility(input.sources),
      crossVerificationAgreement: input.agreementRate ?? this.calculateAgreement(input.verifiedClaims),
      recency: this.calculateRecency(input.sources),
      citationCount: this.calculateCitationScore(input.sources),
      expertVerification: input.expertVerified ? 1.0 : 0.5,
    };

    const overall =
      factors.sourceCredibility * CredibilityCalculator.WEIGHTS.sourceCredibility +
      factors.crossVerificationAgreement * CredibilityCalculator.WEIGHTS.crossVerification +
      factors.recency * CredibilityCalculator.WEIGHTS.recency +
      factors.citationCount * CredibilityCalculator.WEIGHTS.citationCount +
      factors.expertVerification * CredibilityCalculator.WEIGHTS.expertVerification;

    const breakdown = this.generateBreakdown(factors);

    logInfo('Credibility calculated', {
      overall: overall.toFixed(3),
      sources: input.sources.length,
      claims: input.verifiedClaims.length,
    });

    return {
      overall,
      factors,
      breakdown,
    };
  }

  /**
   * Calculate source credibility (40% weight)
   *
   * Scoring:
   * - Academic (peer-reviewed): 0.9-1.0
   * - Official/Government: 0.85-0.95
   * - News (reputable): 0.7-0.85
   * - Web (general): 0.5-0.7
   * - User-provided: Varies
   */
  private calculateSourceCredibility(sources: Source[]): number {
    if (sources.length === 0) return 0.5;

    // Calculate weighted average based on source types
    const scores = sources.map(source => {
      switch (source.type) {
        case 'academic':
          return this.getAcademicCredibility(source);
        case 'web':
          return this.getWebCredibility(source);
        case 'user-provided':
          return source.credibilityScore || 0.7;
        default:
          return 0.6;
      }
    });

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Get academic source credibility
   */
  private getAcademicCredibility(source: Source): number {
    // Base score for academic sources
    let score = 0.9;

    // Boost for high citation count
    if (source.citationCount && source.citationCount > 100) {
      score = Math.min(1.0, score + 0.05);
    } else if (source.citationCount && source.citationCount > 1000) {
      score = 1.0;
    }

    // Adjust for recency
    if (source.publishedDate) {
      const age = Date.now() - source.publishedDate.getTime();
      const years = age / (365 * 24 * 60 * 60 * 1000);

      if (years < 2) {
        score = Math.min(1.0, score + 0.02); // Boost recent
      } else if (years > 10) {
        score = Math.max(0.8, score - 0.05); // Slight penalty for old
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Get web source credibility
   */
  private getWebCredibility(source: Source): number {
    // Use pre-calculated credibility score
    if (source.credibilityScore) {
      return source.credibilityScore;
    }

    // Domain-based heuristics
    const url = source.url.toLowerCase();

    if (url.includes('gov.') || url.includes('.gov/')) {
      return 0.9; // Government sites
    }

    if (url.includes('edu') || url.includes('university')) {
      return 0.85; // Educational institutions
    }

    if (url.includes('nytimes') || url.includes('reuters') || url.includes('bbc')) {
      return 0.8; // Reputable news
    }

    return 0.6; // Default web credibility
  }

  /**
   * Calculate cross-verification agreement (30% weight)
   *
   * Agreement rate: percentage of claims verified by multiple sources
   */
  private calculateAgreement(verifiedClaims: VerifiedClaim[]): number {
    if (verifiedClaims.length === 0) return 0.5;

    // Count claims with multiple supporting sources
    const wellSupported = verifiedClaims.filter(
      claim => claim.supportingSources.length >= 2
    ).length;

    const agreementRate = wellSupported / verifiedClaims.length;

    return agreementRate;
  }

  /**
   * Calculate recency score (15% weight)
   *
   * Uses half-life decay model: score = 0.5^(age/halfLife)
   * Half-life = 180 days (6 months)
   */
  private calculateRecency(sources: Source[]): number {
    const sourcesWithDates = sources.filter(s => s.publishedDate);

    if (sourcesWithDates.length === 0) {
      return 0.5; // Neutral score if no dates
    }

    const now = Date.now();
    const halfLife = 180; // days

    const scores = sourcesWithDates.map(source => {
      const age = now - source.publishedDate!.getTime();
      const ageDays = age / (24 * 60 * 60 * 1000);

      // Half-life decay
      return Math.pow(0.5, ageDays / halfLife);
    });

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Calculate citation score (10% weight)
   *
   * Logarithmic scaling for academic citations
   */
  private calculateCitationScore(sources: Source[]): number {
    const academicSources = sources.filter(s => s.type === 'academic' && s.citationCount);

    if (academicSources.length === 0) {
      return 0.5; // Neutral if no citations
    }

    const scores = academicSources.map(source => {
      const citations = source.citationCount || 0;

      // Logarithmic scaling: score = log10(citations + 1) / log10(1001)
      // 0 citations = 0, 100 citations ≈ 0.66, 1000 citations = 1.0
      return Math.log10(citations + 1) / Math.log10(1001);
    });

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Generate human-readable breakdown
   */
  private generateBreakdown(factors: CredibilityFactors): string {
    const lines = [
      `Source Credibility: ${(factors.sourceCredibility * 100).toFixed(1)}% (weight: 40%)`,
      `Cross-Verification: ${(factors.crossVerificationAgreement * 100).toFixed(1)}% (weight: 30%)`,
      `Recency: ${(factors.recency * 100).toFixed(1)}% (weight: 15%)`,
      `Citation Count: ${(factors.citationCount * 100).toFixed(1)}% (weight: 10%)`,
      `Expert Verification: ${(factors.expertVerification * 100).toFixed(1)}% (weight: 5%)`,
    ];

    return lines.join('\n');
  }

  /**
   * Calculate credibility for a single claim
   */
  calculateClaimCredibility(
    claim: VerifiedClaim,
    allSources: Source[]
  ): ConfidenceScore {
    const claimSources = allSources.filter(s =>
      claim.supportingSources.map(ss => ss.id).includes(s.id)
    );

    return this.calculate({
      sources: claimSources,
      verifiedClaims: [claim],
      agreementRate: claim.supportingSources.length >= 2 ? 0.8 : 0.5,
      expertVerified: false,
    });
  }

  /**
   * Get credibility level label
   */
  getCredibilityLevel(score: number): 'very-high' | 'high' | 'medium' | 'low' | 'very-low' {
    if (score >= 0.9) return 'very-high';
    if (score >= 0.8) return 'high';
    if (score >= 0.6) return 'medium';
    if (score >= 0.4) return 'low';
    return 'very-low';
  }

  /**
   * Get recommendations for improving credibility
   */
  getRecommendations(score: ConfidenceScore): string[] {
    const recommendations: string[] = [];

    if (score.factors.sourceCredibility < 0.7) {
      recommendations.push('Add more high-credibility sources (academic, official)');
    }

    if (score.factors.crossVerificationAgreement < 0.7) {
      recommendations.push('Verify claims with additional independent sources');
    }

    if (score.factors.recency < 0.5) {
      recommendations.push('Include more recent sources for up-to-date information');
    }

    if (score.factors.citationCount < 0.5) {
      recommendations.push('Include well-cited academic papers to boost credibility');
    }

    if (score.factors.expertVerification < 0.8) {
      recommendations.push('Seek expert verification or peer review');
    }

    return recommendations;
  }

  /**
   * Compare two credibility scores
   */
  compare(score1: ConfidenceScore, score2: ConfidenceScore): {
    difference: number;
    better: 'first' | 'second' | 'equal';
    improvements: string[];
  } {
    const diff = score1.overall - score2.overall;
    const threshold = 0.05;

    let better: 'first' | 'second' | 'equal';
    if (Math.abs(diff) < threshold) {
      better = 'equal';
    } else {
      better = diff > 0 ? 'first' : 'second';
    }

    const improvements: string[] = [];

    // Identify areas where the worse score could improve
    const worseScore = diff < 0 ? score1 : score2;
    const betterScore = diff < 0 ? score2 : score1;

    for (const [factor, value] of Object.entries(worseScore.factors)) {
      const betterValue = (betterScore.factors as any)[factor];
      if (betterValue - value > 0.1) {
        improvements.push(`Improve ${factor} (current: ${(value * 100).toFixed(1)}%, target: ${(betterValue * 100).toFixed(1)}%)`);
      }
    }

    return {
      difference: diff,
      better,
      improvements,
    };
  }
}

export function createCredibilityCalculator(): CredibilityCalculator {
  return new CredibilityCalculator();
}
