import { describe, it, expect, beforeEach } from 'vitest';
import { VerificationEngine } from '../../src/verification/VerificationEngine';
import { CredibilityCalculator } from '../../src/verification/CredibilityCalculator';
import { ConflictResolver } from '../../src/verification/ConflictResolver';
import { createMockClaim, createVerifiedClaim } from '../fixtures/claims';
import { createMockSource, createMultipleSources } from '../fixtures/sources';

describe('Integration - Basic verification workflow', () => {
  it('should complete a basic verification workflow', async () => {
    // Setup
    const engine = new VerificationEngine();
    const calculator = new CredibilityCalculator();
    const resolver = new ConflictResolver();

    const sources = createMultipleSources(5);
    const claims = [
      createMockClaim({ id: 'claim-1', text: 'Test claim 1' }),
      createMockClaim({ id: 'claim-2', text: 'Test claim 2' }),
    ];

    // Execute verification
    const verificationResult = await engine.verify({
      sessionId: 'integration-test-1',
      topic: 'Integration Test',
      sources,
      claims,
      round: 0,
    });

    // Verify results
    expect(verificationResult.verifiedClaims).toHaveLength(2);
    expect(verificationResult.finalConfidence).toBeGreaterThan(0);
    expect(verificationResult.totalRounds).toBeGreaterThan(0);

    // Calculate credibility
    const credibility = calculator.calculate({
      sources,
      verifiedClaims: verificationResult.verifiedClaims,
    });

    expect(credibility.overall).toBeGreaterThan(0);
    expect(credibility.overall).toBeLessThanOrEqual(1);

    // Resolve any conflicts
    if (verificationResult.conflicts.length > 0) {
      const resolutions = resolver.resolveMultiple(verificationResult.conflicts);
      expect(resolutions.length).toBe(verificationResult.conflicts.length);
    }
  });

  it('should handle temporal conflicts correctly', async () => {
    const engine = new VerificationEngine();
    const resolver = new ConflictResolver();

    const sources = createMultipleSources(3);
    const claims = [
      createMockClaim({ id: 'c1', text: 'In 2024 the value was 100' }),
      createMockClaim({ id: 'c2', text: 'In 2023 the value was 90' }),
    ];

    const result = await engine.verify({
      sessionId: 'temporal-test',
      topic: 'Temporal Test',
      sources,
      claims,
      round: 0,
    });

    const temporalConflicts = result.conflicts.filter(c => c.type === 'TEMPORAL_DIFFERENCE');
    if (temporalConflicts.length > 0) {
      const resolution = resolver.resolve(temporalConflicts[0]);
      expect(resolution.resolved).toBe(true);
      expect(resolution.confidence).toBeGreaterThan(0.8);
    }
  });

  it('should integrate all components for high-quality research', async () => {
    const engine = new VerificationEngine({
      minRounds: 10,
      minConfidence: 0.85,
      minSources: 5,
    });

    const calculator = new CredibilityCalculator();

    // High-quality sources
    const sources = [
      createMockSource({ id: 's1', type: 'academic', citationCount: 500, credibilityScore: 0.95 }),
      createMockSource({ id: 's2', type: 'academic', citationCount: 300, credibilityScore: 0.92 }),
      createMockSource({ id: 's3', type: 'web', url: 'https://www.nih.gov', credibilityScore: undefined }),
      createMockSource({ id: 's4', type: 'web', url: 'https://www.stanford.edu', credibilityScore: undefined }),
      createMockSource({ id: 's5', type: 'web', url: 'https://www.nytimes.com', credibilityScore: undefined }),
    ];

    const claims = [
      createMockClaim({ id: 'c1', text: 'Research shows positive results', confidence: 0.9 }),
      createMockClaim({ id: 'c2', text: 'Multiple studies confirm findings', confidence: 0.88 }),
    ];

    const result = await engine.verify({
      sessionId: 'quality-test',
      topic: 'Quality Test',
      sources,
      claims,
      round: 0,
    });

    expect(result.verifiedClaims.length).toBeGreaterThan(0);

    // Calculate final credibility
    const credibility = calculator.calculate({
      sources,
      verifiedClaims: result.verifiedClaims,
    });

    // Credibility should be calculated
    expect(credibility.overall).toBeGreaterThan(0);
    expect(credibility.overall).toBeLessThanOrEqual(1);
    expect(credibility.factors.sourceCredibility).toBeGreaterThan(0);
  });
});
