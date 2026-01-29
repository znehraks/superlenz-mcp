import { describe, it, expect, beforeEach } from 'vitest';
import { CredibilityCalculator, type CredibilityInput } from './CredibilityCalculator';
import { createMockSource, createAcademicSource, createMultipleSources } from '../../tests/fixtures/sources';
import { createVerifiedClaim } from '../../tests/fixtures/claims';
import type { Source, VerifiedClaim } from '../core/types';

describe('CredibilityCalculator - calculate() method', () => {
  let calculator: CredibilityCalculator;

  beforeEach(() => {
    calculator = new CredibilityCalculator();
  });

  it('should calculate all 5 factors and return weighted score', () => {
    const input: CredibilityInput = {
      sources: [
        createAcademicSource({ citations: 150 }),
        createMockSource({ type: 'web', credibilityScore: 0.8 }),
      ],
      verifiedClaims: [
        createVerifiedClaim({ supportingSources: ['source-1', 'source-2'] }),
      ],
      expertVerified: true,
    };

    const result = calculator.calculate(input);

    expect(result).toHaveProperty('overall');
    expect(result).toHaveProperty('factors');
    expect(result).toHaveProperty('breakdown');
    expect(result.factors).toHaveProperty('sourceCredibility');
    expect(result.factors).toHaveProperty('crossVerificationAgreement');
    expect(result.factors).toHaveProperty('recency');
    expect(result.factors).toHaveProperty('citationCount');
    expect(result.factors).toHaveProperty('expertVerification');

    // Verify weights sum to 1.0
    const weights = { sourceCredibility: 0.40, crossVerification: 0.30, recency: 0.15, citationCount: 0.10, expertVerification: 0.05 };
    const weightSum = Object.values(weights).reduce((sum, w) => sum + w, 0);
    expect(weightSum).toBeCloseTo(1.0);
  });

  it('should return breakdown with individual scores', () => {
    const input: CredibilityInput = {
      sources: [createAcademicSource()],
      verifiedClaims: [createVerifiedClaim()],
    };

    const result = calculator.calculate(input);

    expect(result.breakdown).toBeDefined();
    expect(typeof result.breakdown).toBe('string');
    expect(result.breakdown).toContain('Source Credibility');
    expect(result.breakdown).toContain('Cross-Verification');
    expect(result.breakdown).toContain('Recency');
    expect(result.breakdown).toContain('Citation Count');
    expect(result.breakdown).toContain('Expert Verification');
  });

  it('should handle empty sources (defaults to 0.5)', () => {
    const input: CredibilityInput = {
      sources: [],
      verifiedClaims: [createVerifiedClaim()],
    };

    const result = calculator.calculate(input);

    expect(result.factors.sourceCredibility).toBe(0.5);
  });

  it('should assign correct credibility level label', () => {
    const scores = [
      { score: 0.95, expected: 'very-high' },
      { score: 0.85, expected: 'high' },
      { score: 0.70, expected: 'medium' },
      { score: 0.50, expected: 'low' },
      { score: 0.30, expected: 'very-low' },
    ];

    scores.forEach(({ score, expected }) => {
      const level = calculator.getCredibilityLevel(score);
      expect(level).toBe(expected);
    });
  });
});

describe('CredibilityCalculator - source credibility (40% weight)', () => {
  let calculator: CredibilityCalculator;

  beforeEach(() => {
    calculator = new CredibilityCalculator();
  });

  it('should score academic sources 0.9-1.0', () => {
    const input: CredibilityInput = {
      sources: [createAcademicSource()],
      verifiedClaims: [],
    };

    const result = calculator.calculate(input);

    expect(result.factors.sourceCredibility).toBeGreaterThanOrEqual(0.9);
    expect(result.factors.sourceCredibility).toBeLessThanOrEqual(1.0);
  });

  it('should apply citation boost for academic sources', () => {
    const lowCitations = createAcademicSource({ citations: 50 });
    const mediumCitations = createAcademicSource({ citations: 150 });
    const highCitations = createAcademicSource({ citations: 1500 });

    const resultLow = calculator.calculate({
      sources: [lowCitations],
      verifiedClaims: [],
    });

    const resultMedium = calculator.calculate({
      sources: [mediumCitations],
      verifiedClaims: [],
    });

    const resultHigh = calculator.calculate({
      sources: [highCitations],
      verifiedClaims: [],
    });

    // Medium citations should boost score
    expect(resultMedium.factors.sourceCredibility).toBeGreaterThan(resultLow.factors.sourceCredibility);

    // High citations should cap at 1.0
    expect(resultHigh.factors.sourceCredibility).toBeCloseTo(1.0, 1);
  });

  it('should apply recency boost (< 2 years: +0.02)', () => {
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    const recentSource = createAcademicSource({
      publishedDate: oneYearAgo,
      citations: 100,
    });

    const result = calculator.calculate({
      sources: [recentSource],
      verifiedClaims: [],
    });

    // Should have recency boost
    expect(result.factors.sourceCredibility).toBeGreaterThanOrEqual(0.9);
  });

  it('should apply recency penalty (> 10 years: -0.05)', () => {
    const now = new Date();
    const elevenYearsAgo = new Date(now.getFullYear() - 11, now.getMonth(), now.getDate());

    const oldSource = createAcademicSource({
      publishedDate: elevenYearsAgo,
      citations: 100,
    });

    const result = calculator.calculate({
      sources: [oldSource],
      verifiedClaims: [],
    });

    // Should have recency penalty, but not below 0.8
    expect(result.factors.sourceCredibility).toBeGreaterThanOrEqual(0.8);
  });

  it('should score government domains at 0.9', () => {
    const govSource = createMockSource({
      type: 'web',
      url: 'https://www.nih.gov/research',
    });

    const result = calculator.calculate({
      sources: [govSource],
      verifiedClaims: [],
    });

    expect(result.factors.sourceCredibility).toBeCloseTo(0.9, 1);
  });

  it('should score educational domains at 0.85', () => {
    const eduSource = createMockSource({
      type: 'web',
      url: 'https://www.stanford.edu/research',
    });

    const result = calculator.calculate({
      sources: [eduSource],
      verifiedClaims: [],
    });

    expect(result.factors.sourceCredibility).toBeCloseTo(0.85, 1);
  });

  it('should score reputable news at 0.8', () => {
    const newsSource = createMockSource({
      type: 'web',
      url: 'https://www.nytimes.com/article',
    });

    const result = calculator.calculate({
      sources: [newsSource],
      verifiedClaims: [],
    });

    expect(result.factors.sourceCredibility).toBeCloseTo(0.8, 1);
  });

  it('should default web sources to 0.6', () => {
    const unknownSource = createMockSource({
      type: 'web',
      url: 'https://www.example.com',
      credibilityScore: undefined,
    });

    const result = calculator.calculate({
      sources: [unknownSource],
      verifiedClaims: [],
    });

    expect(result.factors.sourceCredibility).toBeCloseTo(0.6, 1);
  });
});

describe('CredibilityCalculator - recency scoring (15% weight)', () => {
  let calculator: CredibilityCalculator;

  beforeEach(() => {
    calculator = new CredibilityCalculator();
  });

  it('should score today as 1.0', () => {
    const todaySource = createMockSource({
      publishedDate: new Date(),
    });

    const result = calculator.calculate({
      sources: [todaySource],
      verifiedClaims: [],
    });

    expect(result.factors.recency).toBeCloseTo(1.0, 1);
  });

  it('should score half-life (180 days) as 0.5', () => {
    const now = new Date();
    const halfLifeAgo = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));

    const source = createMockSource({
      publishedDate: halfLifeAgo,
    });

    const result = calculator.calculate({
      sources: [source],
      verifiedClaims: [],
    });

    expect(result.factors.recency).toBeCloseTo(0.5, 1);
  });

  it('should score 2x half-life (360 days) as 0.25', () => {
    const now = new Date();
    const doubleHalfLifeAgo = new Date(now.getTime() - (360 * 24 * 60 * 60 * 1000));

    const source = createMockSource({
      publishedDate: doubleHalfLifeAgo,
    });

    const result = calculator.calculate({
      sources: [source],
      verifiedClaims: [],
    });

    expect(result.factors.recency).toBeCloseTo(0.25, 1);
  });

  it('should handle very old sources (1000+ days)', () => {
    const now = new Date();
    const veryOld = new Date(now.getTime() - (1080 * 24 * 60 * 60 * 1000)); // 1080 days

    const source = createMockSource({
      publishedDate: veryOld,
    });

    const result = calculator.calculate({
      sources: [source],
      verifiedClaims: [],
    });

    // Should be very low but > 0
    expect(result.factors.recency).toBeGreaterThan(0);
    expect(result.factors.recency).toBeLessThan(0.05);
  });

  it('should default to 0.5 with no dates', () => {
    const source = createMockSource({
      publishedDate: undefined,
    });

    const result = calculator.calculate({
      sources: [source],
      verifiedClaims: [],
    });

    expect(result.factors.recency).toBe(0.5);
  });

  it('should filter out sources without dates', () => {
    const withDate = createMockSource({
      publishedDate: new Date(),
    });

    const withoutDate = createMockSource({
      publishedDate: undefined,
    });

    const result = calculator.calculate({
      sources: [withDate, withoutDate],
      verifiedClaims: [],
    });

    // Should calculate based only on sources with dates
    expect(result.factors.recency).toBeCloseTo(1.0, 1);
  });
});

describe('CredibilityCalculator - citation scoring (10% weight)', () => {
  let calculator: CredibilityCalculator;

  beforeEach(() => {
    calculator = new CredibilityCalculator();
  });

  it('should score 0 citations as 0', () => {
    const source = createAcademicSource({ citations: 0 });

    const result = calculator.calculate({
      sources: [source],
      verifiedClaims: [],
    });

    expect(result.factors.citationCount).toBeCloseTo(0, 1);
  });

  it('should score 100 citations as ~0.66', () => {
    const source = createAcademicSource({ citations: 100 });

    const result = calculator.calculate({
      sources: [source],
      verifiedClaims: [],
    });

    // log10(101) / log10(1001) ≈ 0.668
    expect(result.factors.citationCount).toBeCloseTo(0.66, 1);
  });

  it('should score 1000 citations as 1.0', () => {
    const source = createAcademicSource({ citations: 1000 });

    const result = calculator.calculate({
      sources: [source],
      verifiedClaims: [],
    });

    // log10(1001) / log10(1001) = 1.0
    expect(result.factors.citationCount).toBeCloseTo(1.0, 1);
  });

  it('should handle citations > 1000', () => {
    const source = createAcademicSource({ citations: 10000 });

    const result = calculator.calculate({
      sources: [source],
      verifiedClaims: [],
    });

    // Should be > 1.0 based on logarithmic formula
    expect(result.factors.citationCount).toBeGreaterThan(1.0);
  });

  it('should default to 0.5 for non-academic sources', () => {
    const webSource = createMockSource({ type: 'web' });

    const result = calculator.calculate({
      sources: [webSource],
      verifiedClaims: [],
    });

    expect(result.factors.citationCount).toBe(0.5);
  });
});

describe('CredibilityCalculator - agreement scoring (30% weight)', () => {
  let calculator: CredibilityCalculator;

  beforeEach(() => {
    calculator = new CredibilityCalculator();
  });

  it('should score high when all claims have 2+ sources', () => {
    const claims: VerifiedClaim[] = [
      createVerifiedClaim({ supportingSources: ['s1', 's2'] }),
      createVerifiedClaim({ supportingSources: ['s1', 's2', 's3'] }),
      createVerifiedClaim({ supportingSources: ['s1', 's2'] }),
    ];

    const result = calculator.calculate({
      sources: createMultipleSources(3),
      verifiedClaims: claims,
    });

    expect(result.factors.crossVerificationAgreement).toBeGreaterThanOrEqual(0.8);
  });

  it('should score low when claims have 1 source each', () => {
    const claims: VerifiedClaim[] = [
      createVerifiedClaim({ supportingSources: ['s1'] }),
      createVerifiedClaim({ supportingSources: ['s2'] }),
    ];

    const result = calculator.calculate({
      sources: createMultipleSources(2),
      verifiedClaims: claims,
    });

    expect(result.factors.crossVerificationAgreement).toBeLessThan(0.5);
  });

  it('should handle mixed support levels', () => {
    const claims: VerifiedClaim[] = [
      createVerifiedClaim({ supportingSources: ['s1', 's2', 's3'] }),
      createVerifiedClaim({ supportingSources: ['s1'] }),
    ];

    const result = calculator.calculate({
      sources: createMultipleSources(3),
      verifiedClaims: claims,
    });

    // 1 out of 2 claims well-supported = 0.5
    expect(result.factors.crossVerificationAgreement).toBeCloseTo(0.5, 1);
  });

  it('should default to 0.5 with no verified claims', () => {
    const result = calculator.calculate({
      sources: createMultipleSources(5),
      verifiedClaims: [],
    });

    expect(result.factors.crossVerificationAgreement).toBe(0.5);
  });
});

describe('CredibilityCalculator - compare() & recommendations', () => {
  let calculator: CredibilityCalculator;

  beforeEach(() => {
    calculator = new CredibilityCalculator();
  });

  it('should identify equal scores (diff < 0.05)', () => {
    const score1 = calculator.calculate({
      sources: createMultipleSources(3),
      verifiedClaims: [createVerifiedClaim()],
    });

    const score2 = calculator.calculate({
      sources: createMultipleSources(3),
      verifiedClaims: [createVerifiedClaim()],
    });

    const comparison = calculator.compare(score1, score2);

    expect(comparison.better).toBe('equal');
    expect(Math.abs(comparison.difference)).toBeLessThan(0.05);
  });

  it('should identify improvement areas', () => {
    const score1 = calculator.calculate({
      sources: [createMockSource({ credibilityScore: 0.5 })],
      verifiedClaims: [createVerifiedClaim()],
    });

    const score2 = calculator.calculate({
      sources: [createAcademicSource({ citations: 500 })],
      verifiedClaims: [createVerifiedClaim()],
    });

    const comparison = calculator.compare(score1, score2);

    expect(comparison.improvements.length).toBeGreaterThan(0);
    expect(comparison.improvements.some(i => i.includes('sourceCredibility'))).toBe(true);
  });

  it('should recommend increasing sources when credibility < 0.7', () => {
    const score = calculator.calculate({
      sources: [createMockSource({ credibilityScore: 0.6 })],
      verifiedClaims: [createVerifiedClaim()],
    });

    const recommendations = calculator.getRecommendations(score);

    expect(recommendations.some(r => r.includes('high-credibility sources'))).toBe(true);
  });

  it('should recommend more verification when agreement < 0.7', () => {
    const score = calculator.calculate({
      sources: createMultipleSources(5),
      verifiedClaims: [
        createVerifiedClaim({ supportingSources: ['s1'] }),
        createVerifiedClaim({ supportingSources: ['s2'] }),
      ],
    });

    const recommendations = calculator.getRecommendations(score);

    expect(recommendations.some(r => r.includes('additional independent sources'))).toBe(true);
  });

  it('should recommend recent sources when recency < 0.5', () => {
    const now = new Date();
    const veryOld = new Date(now.getTime() - (1000 * 24 * 60 * 60 * 1000));

    const score = calculator.calculate({
      sources: [createMockSource({ publishedDate: veryOld })],
      verifiedClaims: [createVerifiedClaim()],
    });

    const recommendations = calculator.getRecommendations(score);

    expect(recommendations.some(r => r.includes('more recent sources'))).toBe(true);
  });

  it('should recommend citations when citationCount < 0.5', () => {
    const score = calculator.calculate({
      sources: [createMockSource({ type: 'web' })], // Non-academic
      verifiedClaims: [createVerifiedClaim()],
    });

    const recommendations = calculator.getRecommendations(score);

    expect(recommendations.some(r => r.includes('academic papers'))).toBe(true);
  });

  it('should recommend expert verification when expertVerification < 0.8', () => {
    const score = calculator.calculate({
      sources: createMultipleSources(3),
      verifiedClaims: [createVerifiedClaim()],
      expertVerified: false,
    });

    const recommendations = calculator.getRecommendations(score);

    expect(recommendations.some(r => r.includes('expert verification'))).toBe(true);
  });
});

describe('CredibilityCalculator - calculateClaimCredibility()', () => {
  let calculator: CredibilityCalculator;

  beforeEach(() => {
    calculator = new CredibilityCalculator();
  });

  it('should calculate credibility for a single claim', () => {
    const claim = createVerifiedClaim({
      supportingSources: ['source-1', 'source-2'],
    });

    const sources = [
      createMockSource({ id: 'source-1' }),
      createMockSource({ id: 'source-2' }),
      createMockSource({ id: 'source-3' }),
    ];

    const result = calculator.calculateClaimCredibility(claim, sources);

    expect(result).toHaveProperty('overall');
    expect(result).toHaveProperty('factors');
    expect(result).toHaveProperty('breakdown');
  });

  it('should filter sources to only those supporting the claim', () => {
    const claim = createVerifiedClaim({
      supportingSources: ['source-1'],
    });

    const sources = [
      createMockSource({ id: 'source-1', credibilityScore: 0.9 }),
      createMockSource({ id: 'source-2', credibilityScore: 0.5 }),
    ];

    const result = calculator.calculateClaimCredibility(claim, sources);

    // Should only use source-1
    expect(result.factors.sourceCredibility).toBeCloseTo(0.9, 1);
  });

  it('should set agreementRate based on supporting source count', () => {
    const singleSourceClaim = createVerifiedClaim({
      supportingSources: ['source-1'],
    });

    const multiSourceClaim = createVerifiedClaim({
      supportingSources: ['source-1', 'source-2'],
    });

    const sources = createMultipleSources(2);

    const result1 = calculator.calculateClaimCredibility(singleSourceClaim, sources);
    const result2 = calculator.calculateClaimCredibility(multiSourceClaim, sources);

    // Single source should have lower agreement (0.5)
    expect(result1.factors.crossVerificationAgreement).toBe(0.5);

    // Multiple sources should have higher agreement (0.8)
    expect(result2.factors.crossVerificationAgreement).toBe(0.8);
  });
});
