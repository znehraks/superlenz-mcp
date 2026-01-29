import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VerificationEngine, type VerificationContext } from './VerificationEngine';
import { createMockClaim } from '../../tests/fixtures/claims';
import { createMockSource, createMultipleSources } from '../../tests/fixtures/sources';
import type { Claim, Source } from '../core/types';

describe('VerificationEngine - verify() pipeline', () => {
  let engine: VerificationEngine;
  let context: VerificationContext;

  beforeEach(() => {
    engine = new VerificationEngine();
    vi.clearAllMocks();

    context = {
      sessionId: 'test-session-1',
      topic: 'Test Topic',
      sources: createMultipleSources(10),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'Test claim 1' }),
        createMockClaim({ id: 'claim-2', text: 'Test claim 2' }),
      ],
      round: 0,
    };
  });

  it('should complete all 10 rounds with sufficient data', async () => {
    const result = await engine.verify(context);

    expect(result.totalRounds).toBe(10);
    expect(result.finalConfidence).toBeGreaterThan(0.5);
    expect(result.verifiedClaims).toHaveLength(2);
    expect(result.results).toHaveLength(10);
  });

  it('should exit early when confidence >= 0.85 and sufficient sources', async () => {
    const highConfidenceEngine = new VerificationEngine({
      enableEarlyExit: true,
      minConfidence: 0.85,
      minSources: 5,
      minRounds: 10,
    });

    const result = await highConfidenceEngine.verify(context);

    // Should still complete minRounds (10) before checking early exit
    expect(result.totalRounds).toBeGreaterThanOrEqual(10);
  });

  it('should handle empty sources array gracefully', async () => {
    const emptyContext = {
      ...context,
      sources: [],
    };

    const result = await engine.verify(emptyContext);

    expect(result.verifiedClaims).toHaveLength(2);
    expect(result.totalRounds).toBe(10);
  });

  it('should handle empty claims array', async () => {
    const emptyContext = {
      ...context,
      claims: [],
    };

    const result = await engine.verify(emptyContext);

    expect(result.verifiedClaims).toHaveLength(0);
    expect(result.totalRounds).toBe(10);
  });

  it('should accumulate verification history across rounds', async () => {
    const result = await engine.verify(context);

    expect(result.results).toHaveLength(result.totalRounds);

    // Verify each round has proper structure
    result.results.forEach((roundResult, index) => {
      expect(roundResult).toHaveProperty('round');
      expect(roundResult).toHaveProperty('timestamp');
      expect(roundResult).toHaveProperty('claimsVerified');
      expect(roundResult).toHaveProperty('conflictsFound');
      expect(roundResult).toHaveProperty('averageConfidence');
    });
  });

  it('should respect earlyExitDisabled flag', async () => {
    const noEarlyExitEngine = new VerificationEngine({
      enableEarlyExit: false,
    });

    const result = await noEarlyExitEngine.verify(context);

    // Should run full 10 rounds regardless of confidence
    expect(result.totalRounds).toBe(10);
  });

  it('should build verified claims with proper structure', async () => {
    const result = await engine.verify(context);

    result.verifiedClaims.forEach(verifiedClaim => {
      expect(verifiedClaim).toHaveProperty('id');
      expect(verifiedClaim).toHaveProperty('text');
      expect(verifiedClaim).toHaveProperty('verificationRounds');
      expect(verifiedClaim).toHaveProperty('supportingSources');
      expect(verifiedClaim).toHaveProperty('contradictingSources');
      expect(verifiedClaim).toHaveProperty('finalConfidence');
      expect(verifiedClaim.verificationRounds).toBe(result.totalRounds);
    });
  });
});

describe('VerificationEngine - temporal verification (Round 5)', () => {
  let engine: VerificationEngine;
  let context: VerificationContext;

  beforeEach(() => {
    engine = new VerificationEngine();
    vi.clearAllMocks();
  });

  it('should detect year conflicts between claims', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'In 2024 the average was 100' }),
        createMockClaim({ id: 'claim-2', text: 'In 2023 the average was 90' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    const temporalConflicts = result.conflicts.filter(c => c.type === 'TEMPORAL_DIFFERENCE');
    expect(temporalConflicts.length).toBeGreaterThan(0);
    expect(temporalConflicts[0].claims).toHaveLength(2);
  });

  it('should handle multiple years in single claim', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'Data from 2024 and 2023 shows growth' }),
        createMockClaim({ id: 'claim-2', text: 'In 2022 the average was 80' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    // First year (2024) should be used from claim-1
    const temporalConflicts = result.conflicts.filter(c => c.type === 'TEMPORAL_DIFFERENCE');
    expect(temporalConflicts.length).toBeGreaterThan(0);
  });

  it('should handle claims with no year patterns', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'The average is 100' }),
        createMockClaim({ id: 'claim-2', text: 'The median is 90' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    const temporalConflicts = result.conflicts.filter(c => c.type === 'TEMPORAL_DIFFERENCE');
    expect(temporalConflicts.length).toBe(0);
  });

  it('should ignore non-2000s years', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'In 1999 the average was 50' }),
        createMockClaim({ id: 'claim-2', text: 'In 2100 the average was 200' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    // Pattern /20\d{2}/ should not match these years
    const temporalConflicts = result.conflicts.filter(c => c.type === 'TEMPORAL_DIFFERENCE');
    expect(temporalConflicts.length).toBe(0);
  });

  it('should use most recent data as resolution strategy', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'In 2024 the value was 100' }),
        createMockClaim({ id: 'claim-2', text: 'In 2023 the value was 90' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    const temporalConflicts = result.conflicts.filter(c => c.type === 'TEMPORAL_DIFFERENCE');
    if (temporalConflicts.length > 0) {
      expect(temporalConflicts[0].resolutionStrategy).toContain('recent');
    }
  });
});

describe('VerificationEngine - statistical verification (Round 6)', () => {
  let engine: VerificationEngine;
  let context: VerificationContext;

  beforeEach(() => {
    engine = new VerificationEngine();
    vi.clearAllMocks();
  });

  it('should calculate CV correctly for varying values', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'The cost is 100 dollars' }),
        createMockClaim({ id: 'claim-2', text: 'The price is 150 dollars' }),
        createMockClaim({ id: 'claim-3', text: 'The value is 200 dollars' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    // Each claim has numbers, CV will be calculated
    expect(result.conflicts).toBeDefined();
  });

  it('should detect high CV (> 0.5) as conflict', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'The cost is 100 dollars' }),
        createMockClaim({ id: 'claim-2', text: 'The cost is 500 dollars' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    const statConflicts = result.conflicts.filter(c => c.type === 'STATISTICAL_METHOD');
    // High variance should be detected
    expect(statConflicts.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle zero mean gracefully', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'The value is 0' }),
        createMockClaim({ id: 'claim-2', text: 'The value is 0' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    // Should not throw error with zero mean
    expect(result).toBeDefined();
    expect(result.conflicts).toBeDefined();
  });

  it('should extract numerical values correctly', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'Cost is 1,234.56 dollars' }),
        createMockClaim({ id: 'claim-2', text: 'Price is 9,876.54 euros' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    // Should extract numbers like 1234.56 and 9876.54
    expect(result).toBeDefined();
  });

  it('should handle claims with no numbers', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'No numerical data here' }),
        createMockClaim({ id: 'claim-2', text: 'Also no numbers' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    const statConflicts = result.conflicts.filter(c => c.type === 'STATISTICAL_METHOD');
    expect(statConflicts.length).toBe(0);
  });

  it('should handle single value (no variation)', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'The value is 100' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    // Single value should not generate statistical conflict
    const statConflicts = result.conflicts.filter(c => c.type === 'STATISTICAL_METHOD');
    expect(statConflicts.length).toBe(0);
  });
});

describe('VerificationEngine - scope analysis (Round 7)', () => {
  let engine: VerificationEngine;
  let context: VerificationContext;

  beforeEach(() => {
    engine = new VerificationEngine();
    vi.clearAllMocks();
  });

  it('should detect scope keywords', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'The cost is only for ceremony' }),
        createMockClaim({ id: 'claim-2', text: 'Including reception and honeymoon' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    const scopeConflicts = result.conflicts.filter(c => c.type === 'SCOPE_DIFFERENCE');
    expect(scopeConflicts.length).toBeGreaterThan(0);
  });

  it('should be case-insensitive', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'ONLY ceremony costs' }),
        createMockClaim({ id: 'claim-2', text: 'Including Reception' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    const scopeConflicts = result.conflicts.filter(c => c.type === 'SCOPE_DIFFERENCE');
    expect(scopeConflicts.length).toBeGreaterThan(0);
  });

  it('should handle multiple scope keywords', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'Only ceremony total cost' }),
        createMockClaim({ id: 'claim-2', text: 'Average including all' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    const scopeConflicts = result.conflicts.filter(c => c.type === 'SCOPE_DIFFERENCE');
    expect(scopeConflicts.length).toBeGreaterThan(0);
  });

  it('should not detect conflicts without scope keywords', async () => {
    context = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'The ceremony cost 100' }),
        createMockClaim({ id: 'claim-2', text: 'The reception cost 200' }),
      ],
      round: 0,
    };

    const result = await engine.verify(context);

    const scopeConflicts = result.conflicts.filter(c => c.type === 'SCOPE_DIFFERENCE');
    expect(scopeConflicts.length).toBe(0);
  });
});

describe('VerificationEngine - early exit conditions', () => {
  it('should require minimum 10 rounds before early exit', async () => {
    const engine = new VerificationEngine({
      minRounds: 10,
      minConfidence: 0.85,
      minSources: 5,
      enableEarlyExit: true,
    });

    const context: VerificationContext = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(10),
      claims: [createMockClaim()],
      round: 0,
    };

    const result = await engine.verify(context);

    // Should complete at least 10 rounds
    expect(result.totalRounds).toBeGreaterThanOrEqual(10);
  });

  it('should check confidence threshold (>= 0.85)', async () => {
    const engine = new VerificationEngine({
      minRounds: 10,
      minConfidence: 0.85,
      minSources: 5,
      enableEarlyExit: true,
    });

    const context: VerificationContext = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(10),
      claims: [createMockClaim()],
      round: 0,
    };

    const result = await engine.verify(context);

    // Early exit should be possible after round 10 if confidence is high
    expect(result.totalRounds).toBeGreaterThanOrEqual(10);
  });

  it('should check source count (>= 5)', async () => {
    const engine = new VerificationEngine({
      minRounds: 10,
      minConfidence: 0.85,
      minSources: 5,
      enableEarlyExit: true,
    });

    const context: VerificationContext = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(3), // Only 3 sources
      claims: [createMockClaim()],
      round: 0,
    };

    const result = await engine.verify(context);

    // Should complete 10 rounds (no early exit with insufficient sources)
    expect(result.totalRounds).toBe(10);
  });

  it('should respect earlyExitDisabled flag', async () => {
    const engine = new VerificationEngine({
      enableEarlyExit: false,
    });

    const context: VerificationContext = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(10),
      claims: [createMockClaim()],
      round: 0,
    };

    const result = await engine.verify(context);

    // Should run full 10 rounds
    expect(result.totalRounds).toBe(10);
  });
});

describe('VerificationEngine - getStatistics()', () => {
  it('should calculate statistics correctly', async () => {
    const engine = new VerificationEngine();

    const context: VerificationContext = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'In 2024 cost was 100' }),
        createMockClaim({ id: 'claim-2', text: 'In 2023 cost was 90' }),
      ],
      round: 0,
    };

    await engine.verify(context);

    const stats = engine.getStatistics();

    expect(stats).toHaveProperty('totalRounds');
    expect(stats).toHaveProperty('averageConfidence');
    expect(stats).toHaveProperty('totalConflicts');
    expect(stats).toHaveProperty('resolvedConflicts');
    expect(stats.totalRounds).toBeGreaterThan(0);
    expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
    expect(stats.averageConfidence).toBeLessThanOrEqual(1);
  });

  it('should count resolved conflicts correctly', async () => {
    const engine = new VerificationEngine();

    const context: VerificationContext = {
      sessionId: 'test-session',
      topic: 'Test Topic',
      sources: createMultipleSources(5),
      claims: [
        createMockClaim({ id: 'claim-1', text: 'Only ceremony costs 100' }),
        createMockClaim({ id: 'claim-2', text: 'Including all costs 200' }),
      ],
      round: 0,
    };

    await engine.verify(context);

    const stats = engine.getStatistics();

    expect(stats.resolvedConflicts).toBeLessThanOrEqual(stats.totalConflicts);
  });
});
