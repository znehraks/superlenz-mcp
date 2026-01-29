/**
 * Conflict resolver implementing 5-type conflict resolution strategies
 *
 * Conflict Types:
 * 1. SCOPE_DIFFERENCE: Different measurement scopes (e.g., "ceremony only" vs "ceremony + honeymoon")
 * 2. TEMPORAL_DIFFERENCE: Different time periods (e.g., "2024 data" vs "2023 data")
 * 3. STATISTICAL_METHOD: Different statistical measures (e.g., "average" vs "median")
 * 4. MEASUREMENT_UNIT: Different measurement bases (e.g., "quality" vs "speed")
 * 5. TRUE_CONTRADICTION: Actual contradictory information
 */

import type { Conflict, Claim, ConflictType } from '../core/types.js';
import { logInfo, logWarn } from '../utils/logger.js';

export interface ResolutionResult {
  conflict: Conflict;
  strategy: string;
  resolved: boolean;
  resolution: string;
  confidence: number;
  userNotification?: string;
}

export class ConflictResolver {
  /**
   * Resolve a single conflict
   */
  resolve(conflict: Conflict): ResolutionResult {
    logInfo(`Resolving conflict type: ${conflict.type}`, {
      claimsCount: conflict.claims.length,
      sourcesCount: conflict.sources.length,
    });

    switch (conflict.type) {
      case 'SCOPE_DIFFERENCE':
        return this.resolveScopeDifference(conflict);

      case 'TEMPORAL_DIFFERENCE':
        return this.resolveTemporalDifference(conflict);

      case 'STATISTICAL_METHOD':
        return this.resolveStatisticalMethod(conflict);

      case 'MEASUREMENT_UNIT':
        return this.resolveMeasurementUnit(conflict);

      case 'TRUE_CONTRADICTION':
        return this.resolveTrueContradiction(conflict);

      default:
        return this.resolveDefault(conflict);
    }
  }

  /**
   * Resolve multiple conflicts
   */
  resolveMultiple(conflicts: Conflict[]): ResolutionResult[] {
    logInfo(`Resolving ${conflicts.length} conflicts`);

    return conflicts.map(conflict => this.resolve(conflict));
  }

  /**
   * Strategy 1: Scope Difference Resolution
   *
   * Example: "Wedding ceremony only: 21M KRW" vs "Ceremony + honeymoon: 62.98M KRW"
   * Solution: Clarify scope and present both with context
   */
  private resolveScopeDifference(conflict: Conflict): ResolutionResult {
    const scopeDescriptions = this.extractScopeDescriptions(conflict.claims);

    const resolution = `Both values are accurate for different scopes:\n` +
      scopeDescriptions.map((desc) => `  • ${desc.scope}: ${desc.value}`).join('\n');

    const userNotification = `ℹ️ Scope Difference Detected: Multiple valid measurements found with different scopes. ` +
      `All values are preserved with their respective contexts.`;

    return {
      conflict: {
        ...conflict,
        resolved: true,
        resolution,
      },
      strategy: 'Clarify scope and present all values with context',
      resolved: true,
      resolution,
      confidence: 0.9,
      userNotification,
    };
  }

  /**
   * Strategy 2: Temporal Difference Resolution
   *
   * Example: "2024: 220K marriages" vs "2023: 192K marriages"
   * Solution: Use most recent data with temporal context
   */
  private resolveTemporalDifference(conflict: Conflict): ResolutionResult {
    const temporalClaims = conflict.claims.map(claim => ({
      claim,
      year: this.extractYear(claim),
    })).sort((a, b) => (b.year || 0) - (a.year || 0));

    const mostRecent = temporalClaims[0];
    const resolution = `Using most recent data (${mostRecent.year}): ${mostRecent.claim.text}\n` +
      `Historical context:\n` +
      temporalClaims.slice(1).map(tc => `  • ${tc.year}: ${tc.claim.text}`).join('\n');

    const userNotification = `📅 Temporal Difference: Data from different time periods found. ` +
      `Using most recent (${mostRecent.year}) with historical context provided.`;

    return {
      conflict: {
        ...conflict,
        resolved: true,
        resolution,
      },
      strategy: 'Use most recent data with time-series context',
      resolved: true,
      resolution,
      confidence: 0.85,
      userNotification,
    };
  }

  /**
   * Strategy 3: Statistical Method Resolution
   *
   * Example: "Average: 21M KRW" vs "Median: 18M KRW"
   * Solution: Present all statistical measures with methodology
   */
  private resolveStatisticalMethod(conflict: Conflict): ResolutionResult {
    const statisticalClaims = conflict.claims.map(claim => ({
      claim,
      method: this.extractStatisticalMethod(claim),
      value: this.extractNumericalValue(claim),
    }));

    const resolution = `Multiple statistical measures available:\n` +
      statisticalClaims.map(sc => `  • ${sc.method}: ${sc.value}`).join('\n') +
      `\n\nNote: Different statistical measures provide complementary insights.`;

    const userNotification = `📊 Statistical Method Difference: Multiple statistical measures found ` +
      `(e.g., mean, median, mode). All measures are valid and preserved.`;

    return {
      conflict: {
        ...conflict,
        resolved: true,
        resolution,
      },
      strategy: 'Present all statistical measures with methodology notes',
      resolved: true,
      resolution,
      confidence: 0.88,
      userNotification,
    };
  }

  /**
   * Strategy 4: Measurement Unit Resolution
   *
   * Example: "Gemini ranks #1 (quality)" vs "OpenAI ranks #1 (speed)"
   * Solution: Clarify measurement basis for each claim
   */
  private resolveMeasurementUnit(conflict: Conflict): ResolutionResult {
    const measurements = conflict.claims.map(claim => ({
      claim,
      metric: this.extractMetric(claim),
    }));

    const resolution = `Rankings vary by measurement criteria:\n` +
      measurements.map(m => `  • ${m.metric}: ${m.claim.text}`).join('\n') +
      `\n\nNote: Each ranking is valid for its specific measurement criterion.`;

    const userNotification = `📏 Measurement Unit Difference: Different measurement criteria detected. ` +
      `Each value is accurate for its specific measurement basis.`;

    return {
      conflict: {
        ...conflict,
        resolved: true,
        resolution,
      },
      strategy: 'Clarify measurement basis and present all with context',
      resolved: true,
      resolution,
      confidence: 0.87,
      userNotification,
    };
  }

  /**
   * Strategy 5: True Contradiction Resolution
   *
   * Example: Genuinely contradictory claims from different sources
   * Solution: Use credibility-based weighting or present multiple perspectives
   */
  private resolveTrueContradiction(conflict: Conflict): ResolutionResult {
    // Calculate credibility difference
    const credibilities = conflict.sources.map(s => s.credibilityScore);
    const maxCredibility = Math.max(...credibilities);
    const minCredibility = Math.min(...credibilities);
    const credibilityDiff = maxCredibility - minCredibility;

    if (credibilityDiff > 0.2) {
      // Significant credibility difference - trust higher source
      const mostCredibleSource = conflict.sources.find(s => s.credibilityScore === maxCredibility)!;
      const correspondingClaim = conflict.claims.find(c =>
        c.extractedFrom.includes(mostCredibleSource.id)
      );

      const resolution = `Based on source credibility analysis:\n` +
        `Primary: ${correspondingClaim?.text || 'N/A'}\n` +
        `Source: ${mostCredibleSource.title} (credibility: ${(mostCredibleSource.credibilityScore * 100).toFixed(1)}%)\n\n` +
        `Alternative perspectives:\n` +
        conflict.claims
          .filter(c => c.id !== correspondingClaim?.id)
          .map(c => `  • ${c.text}`)
          .join('\n');

      const userNotification = `⚠️ True Contradiction Detected: Sources provide conflicting information. ` +
        `Recommendation based on source credibility (${(maxCredibility * 100).toFixed(1)}% vs ${(minCredibility * 100).toFixed(1)}%).`;

      return {
        conflict: {
          ...conflict,
          resolved: true,
          resolution,
        },
        strategy: 'Trust higher credibility source with alternatives noted',
        resolved: true,
        resolution,
        confidence: 0.70,
        userNotification,
      };
    } else {
      // Similar credibility - present multiple perspectives
      const resolution = `Multiple valid perspectives found:\n` +
        conflict.claims.map((claim, i) => {
          const source = conflict.sources.find(s => claim.extractedFrom.includes(s.id));
          return `  ${i + 1}. ${claim.text}\n     Source: ${source?.title || 'Unknown'} ` +
            `(credibility: ${((source?.credibilityScore || 0) * 100).toFixed(1)}%)`;
        }).join('\n\n') +
        `\n\nNote: Sources have similar credibility. Consider context and recency when interpreting.`;

      const userNotification = `🤔 Multiple Perspectives: Sources of similar credibility provide different views. ` +
        `Both perspectives are presented for your consideration.`;

      return {
        conflict: {
          ...conflict,
          resolved: true,
          resolution,
        },
        strategy: 'Present multiple perspectives with equal weight',
        resolved: true,
        resolution,
        confidence: 0.65,
        userNotification,
      };
    }
  }

  /**
   * Default resolution for unknown conflict types
   */
  private resolveDefault(conflict: Conflict): ResolutionResult {
    logWarn(`Unknown conflict type: ${conflict.type}`);

    const resolution = `Conflict detected but type unknown. Manual review recommended.\n` +
      `Claims:\n` +
      conflict.claims.map((c, i) => `  ${i + 1}. ${c.text}`).join('\n');

    return {
      conflict: {
        ...conflict,
        resolved: false,
        resolution,
      },
      strategy: 'Manual review required',
      resolved: false,
      resolution,
      confidence: 0.5,
      userNotification: `⚠️ Unknown Conflict Type: Manual review may be needed.`,
    };
  }

  /**
   * Detect conflict type from claims
   */
  detectConflictType(claims: Claim[]): ConflictType {
    if (claims.length < 2) {
      return 'TRUE_CONTRADICTION';
    }

    // Check for scope keywords
    const scopeKeywords = ['only', 'including', 'excluding', 'total', 'average', 'ceremony', 'honeymoon'];
    if (claims.some(c => scopeKeywords.some(kw => c.text.toLowerCase().includes(kw)))) {
      return 'SCOPE_DIFFERENCE';
    }

    // Check for temporal indicators
    const yearRegex = /20\d{2}/;
    const years = claims.map(c => c.text.match(yearRegex)).filter(Boolean);
    if (years.length >= 2 && new Set(years.map(y => y![0])).size > 1) {
      return 'TEMPORAL_DIFFERENCE';
    }

    // Check for statistical methods
    const statKeywords = ['average', 'mean', 'median', 'mode', 'percentile'];
    if (claims.some(c => statKeywords.some(kw => c.text.toLowerCase().includes(kw)))) {
      return 'STATISTICAL_METHOD';
    }

    // Check for measurement indicators
    const measureKeywords = ['ranked', 'rating', 'score', 'performance', 'quality', 'speed'];
    if (claims.some(c => measureKeywords.some(kw => c.text.toLowerCase().includes(kw)))) {
      return 'MEASUREMENT_UNIT';
    }

    return 'TRUE_CONTRADICTION';
  }

  // Helper methods

  private extractScopeDescriptions(claims: Claim[]): Array<{ scope: string; value: string }> {
    return claims.map(claim => {
      const text = claim.text.toLowerCase();

      let scope = 'General';
      if (text.includes('only') || text.includes('just')) {
        scope = 'Limited scope';
      } else if (text.includes('including') || text.includes('total')) {
        scope = 'Comprehensive scope';
      }

      return { scope, value: claim.text };
    });
  }

  private extractYear(claim: Claim): number | null {
    const match = claim.text.match(/20\d{2}/);
    return match ? parseInt(match[0]) : null;
  }

  private extractStatisticalMethod(claim: Claim): string {
    const text = claim.text.toLowerCase();

    if (text.includes('average') || text.includes('mean')) return 'Average/Mean';
    if (text.includes('median')) return 'Median';
    if (text.includes('mode')) return 'Mode';
    if (text.includes('percentile')) return 'Percentile';

    return 'Unknown method';
  }

  private extractNumericalValue(claim: Claim): string {
    const match = claim.text.match(/[\d,]+(?:\.\d+)?/);
    return match ? match[0] : 'N/A';
  }

  private extractMetric(claim: Claim): string {
    const text = claim.text.toLowerCase();

    if (text.includes('quality')) return 'Quality-based';
    if (text.includes('speed')) return 'Speed-based';
    if (text.includes('performance')) return 'Performance-based';
    if (text.includes('accuracy')) return 'Accuracy-based';

    return 'Custom metric';
  }

  /**
   * Get resolution statistics
   */
  getStatistics(results: ResolutionResult[]): {
    total: number;
    resolved: number;
    byType: Record<ConflictType, { count: number; resolved: number }>;
    averageConfidence: number;
  } {
    const byType: Record<string, { count: number; resolved: number }> = {};

    for (const result of results) {
      const type = result.conflict.type;
      if (!byType[type]) {
        byType[type] = { count: 0, resolved: 0 };
      }
      byType[type].count++;
      if (result.resolved) {
        byType[type].resolved++;
      }
    }

    const avgConfidence = results.length > 0
      ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
      : 0;

    return {
      total: results.length,
      resolved: results.filter(r => r.resolved).length,
      byType: byType as Record<ConflictType, { count: number; resolved: number }>,
      averageConfidence: avgConfidence,
    };
  }
}

export function createConflictResolver(): ConflictResolver {
  return new ConflictResolver();
}
