import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictResolver } from './ConflictResolver';
import { createMockClaim } from '../../tests/fixtures/claims';
import { createMockSource, createMultipleSources } from '../../tests/fixtures/sources';
import type { Conflict, ConflictType } from '../core/types';

describe('ConflictResolver - detectConflictType()', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  it('should detect SCOPE_DIFFERENCE', () => {
    const claims = [
      createMockClaim({ text: 'The cost is only for ceremony' }),
      createMockClaim({ text: 'Including all expenses' }),
    ];

    const type = resolver.detectConflictType(claims);

    expect(type).toBe('SCOPE_DIFFERENCE');
  });

  it('should detect TEMPORAL_DIFFERENCE', () => {
    const claims = [
      createMockClaim({ text: 'In 2024 it was 100' }),
      createMockClaim({ text: 'In 2023 it was 90' }),
    ];

    const type = resolver.detectConflictType(claims);

    expect(type).toBe('TEMPORAL_DIFFERENCE');
  });

  it('should detect STATISTICAL_METHOD', () => {
    const claims = [
      createMockClaim({ text: 'The mean is 100' }),
      createMockClaim({ text: 'The median is 90' }),
    ];

    const type = resolver.detectConflictType(claims);

    expect(type).toBe('STATISTICAL_METHOD');
  });

  it('should detect MEASUREMENT_UNIT', () => {
    const claims = [
      createMockClaim({ text: 'Ranked #1 in quality rating' }),
      createMockClaim({ text: 'Scored #2 in speed performance' }),
    ];

    const type = resolver.detectConflictType(claims);

    expect(type).toBe('MEASUREMENT_UNIT');
  });

  it('should default to TRUE_CONTRADICTION', () => {
    const claims = [
      createMockClaim({ text: 'This is correct' }),
      createMockClaim({ text: 'This is wrong' }),
    ];

    const type = resolver.detectConflictType(claims);

    expect(type).toBe('TRUE_CONTRADICTION');
  });

  it('should prioritize scope over temporal', () => {
    const claims = [
      createMockClaim({ text: 'In 2024 only ceremony costs 100' }),
      createMockClaim({ text: 'In 2023 including all costs 200' }),
    ];

    const type = resolver.detectConflictType(claims);

    // First match wins (SCOPE_DIFFERENCE)
    expect(type).toBe('SCOPE_DIFFERENCE');
  });

  it('should return TRUE_CONTRADICTION for single claim', () => {
    const claims = [createMockClaim()];

    const type = resolver.detectConflictType(claims);

    expect(type).toBe('TRUE_CONTRADICTION');
  });
});

describe('ConflictResolver - resolveScopeDifference()', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  it('should classify "only" as limited scope', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'SCOPE_DIFFERENCE',
      claims: [createMockClaim({ text: 'Cost is only for ceremony: 100' })],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('Limited scope');
    expect(result.resolved).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('should classify "including" as comprehensive', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'SCOPE_DIFFERENCE',
      claims: [createMockClaim({ text: 'Including all expenses: 200' })],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('Comprehensive scope');
  });

  it('should default to general scope', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'SCOPE_DIFFERENCE',
      claims: [createMockClaim({ text: 'Wedding costs 150' })],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('General');
  });

  it('should set resolved=true and confidence=0.9', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'SCOPE_DIFFERENCE',
      claims: [
        createMockClaim({ text: 'Only ceremony: 100' }),
        createMockClaim({ text: 'Including reception: 200' }),
      ],
      sources: createMultipleSources(2),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolved).toBe(true);
    expect(result.confidence).toBe(0.9);
    expect(result.userNotification).toContain('Scope Difference');
  });
});

describe('ConflictResolver - resolveTemporalDifference()', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  it('should sort claims by year (most recent first)', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'TEMPORAL_DIFFERENCE',
      claims: [
        createMockClaim({ text: 'In 2023 the value was 90' }),
        createMockClaim({ text: 'In 2025 the value was 110' }),
        createMockClaim({ text: 'In 2024 the value was 100' }),
      ],
      sources: createMultipleSources(3),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    // Should use most recent (2025)
    expect(result.resolution).toContain('2025');
    expect(result.resolved).toBe(true);
  });

  it('should handle claims with no year (nulls last)', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'TEMPORAL_DIFFERENCE',
      claims: [
        createMockClaim({ text: 'In 2024 the value was 100' }),
        createMockClaim({ text: 'The value was 50' }),
      ],
      sources: createMultipleSources(2),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('2024');
  });

  it('should extract first year from multi-year claims', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'TEMPORAL_DIFFERENCE',
      claims: [
        createMockClaim({ text: 'Data from 2024 and 2023 shows growth' }),
      ],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    // Should extract first year (2024)
    expect(result.resolution).toContain('2024');
  });

  it('should set confidence=0.85', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'TEMPORAL_DIFFERENCE',
      claims: [
        createMockClaim({ text: 'In 2024 cost was 100' }),
        createMockClaim({ text: 'In 2023 cost was 90' }),
      ],
      sources: createMultipleSources(2),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.confidence).toBe(0.85);
    expect(result.userNotification).toContain('Temporal Difference');
  });
});

describe('ConflictResolver - resolveStatisticalMethod()', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  it('should identify "average" method', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'STATISTICAL_METHOD',
      claims: [createMockClaim({ text: 'The average cost is 100' })],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('Average/Mean');
  });

  it('should identify "median" method', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'STATISTICAL_METHOD',
      claims: [createMockClaim({ text: 'The median price is 90' })],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('Median');
  });

  it('should default to "Unknown method"', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'STATISTICAL_METHOD',
      claims: [createMockClaim({ text: 'The cost is 100' })],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('Unknown method');
  });

  it('should set confidence=0.88', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'STATISTICAL_METHOD',
      claims: [
        createMockClaim({ text: 'Average: 100' }),
        createMockClaim({ text: 'Median: 90' }),
      ],
      sources: createMultipleSources(2),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.confidence).toBe(0.88);
    expect(result.resolved).toBe(true);
    expect(result.userNotification).toContain('Statistical Method');
  });
});

describe('ConflictResolver - resolveTrueContradiction()', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  it('should trust higher credibility when diff > 0.2', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'TRUE_CONTRADICTION',
      claims: [
        createMockClaim({ id: 'claim-1', text: 'This is correct', extractedFrom: ['source-1'] }),
        createMockClaim({ id: 'claim-2', text: 'This is wrong', extractedFrom: ['source-2'] }),
      ],
      sources: [
        createMockSource({ id: 'source-1', credibilityScore: 0.9 }),
        createMockSource({ id: 'source-2', credibilityScore: 0.6 }),
      ],
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    // Credibility diff = 0.3 > 0.2, should trust higher source
    expect(result.resolution).toContain('Primary');
    expect(result.resolution).toContain('This is correct');
    expect(result.confidence).toBe(0.70);
    expect(result.resolved).toBe(true);
  });

  it('should present both when diff <= 0.2', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'TRUE_CONTRADICTION',
      claims: [
        createMockClaim({ id: 'claim-1', text: 'Perspective A', extractedFrom: ['source-1'] }),
        createMockClaim({ id: 'claim-2', text: 'Perspective B', extractedFrom: ['source-2'] }),
      ],
      sources: [
        createMockSource({ id: 'source-1', credibilityScore: 0.75 }),
        createMockSource({ id: 'source-2', credibilityScore: 0.70 }),
      ],
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    // Credibility diff = 0.05 <= 0.2, should present both
    expect(result.resolution).toContain('Multiple valid perspectives');
    expect(result.resolution).toContain('Perspective A');
    expect(result.resolution).toContain('Perspective B');
    expect(result.confidence).toBe(0.65);
  });

  it('should handle exactly 0.2 difference', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'TRUE_CONTRADICTION',
      claims: [
        createMockClaim({ id: 'claim-1', extractedFrom: ['source-1'] }),
        createMockClaim({ id: 'claim-2', extractedFrom: ['source-2'] }),
      ],
      sources: [
        createMockSource({ id: 'source-1', credibilityScore: 0.8 }),
        createMockSource({ id: 'source-2', credibilityScore: 0.6 }),
      ],
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    // Exactly 0.2 difference
    expect(result.resolved).toBe(true);
  });

  it('should handle empty sources array', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'TRUE_CONTRADICTION',
      claims: [createMockClaim()],
      sources: [],
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    // Should not throw error with empty sources
    expect(result).toBeDefined();
    expect(result.resolved).toBe(true);
  });

  it('should match claims to sources correctly', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'TRUE_CONTRADICTION',
      claims: [
        createMockClaim({
          id: 'claim-1',
          text: 'High credibility claim',
          extractedFrom: ['source-high'],
        }),
        createMockClaim({
          id: 'claim-2',
          text: 'Low credibility claim',
          extractedFrom: ['source-low'],
        }),
      ],
      sources: [
        createMockSource({ id: 'source-high', credibilityScore: 0.95, title: 'High Source' }),
        createMockSource({ id: 'source-low', credibilityScore: 0.5, title: 'Low Source' }),
      ],
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('High credibility claim');
    expect(result.resolution).toContain('High Source');
  });
});

describe('ConflictResolver - resolveMultiple() & getStatistics()', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  it('should resolve all conflicts in batch', () => {
    const conflicts: Conflict[] = [
      {
        id: 'c1',
        type: 'SCOPE_DIFFERENCE',
        claims: [createMockClaim()],
        sources: createMultipleSources(1),
        resolutionStrategy: '',
        resolved: false,
        confidence: 0,
      },
      {
        id: 'c2',
        type: 'TEMPORAL_DIFFERENCE',
        claims: [createMockClaim({ text: 'In 2024' })],
        sources: createMultipleSources(1),
        resolutionStrategy: '',
        resolved: false,
        confidence: 0,
      },
      {
        id: 'c3',
        type: 'STATISTICAL_METHOD',
        claims: [createMockClaim({ text: 'Average is 100' })],
        sources: createMultipleSources(1),
        resolutionStrategy: '',
        resolved: false,
        confidence: 0,
      },
    ];

    const results = resolver.resolveMultiple(conflicts);

    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(result).toHaveProperty('conflict');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('resolved');
      expect(result).toHaveProperty('confidence');
    });
  });

  it('should calculate statistics correctly', () => {
    const conflicts: Conflict[] = [
      {
        id: 'c1',
        type: 'SCOPE_DIFFERENCE',
        claims: [createMockClaim()],
        sources: createMultipleSources(1),
        resolutionStrategy: '',
        resolved: false,
        confidence: 0,
      },
      {
        id: 'c2',
        type: 'TEMPORAL_DIFFERENCE',
        claims: [createMockClaim({ text: 'In 2024' })],
        sources: createMultipleSources(1),
        resolutionStrategy: '',
        resolved: false,
        confidence: 0,
      },
    ];

    const results = resolver.resolveMultiple(conflicts);
    const stats = resolver.getStatistics(results);

    expect(stats.total).toBe(2);
    expect(stats.resolved).toBe(2); // Both should be resolved
    expect(stats.averageConfidence).toBeGreaterThan(0);
    expect(stats.byType).toHaveProperty('SCOPE_DIFFERENCE');
    expect(stats.byType).toHaveProperty('TEMPORAL_DIFFERENCE');
  });

  it('should group by conflict type', () => {
    const conflicts: Conflict[] = [
      {
        id: 'c1',
        type: 'SCOPE_DIFFERENCE',
        claims: [createMockClaim()],
        sources: createMultipleSources(1),
        resolutionStrategy: '',
        resolved: false,
        confidence: 0,
      },
      {
        id: 'c2',
        type: 'SCOPE_DIFFERENCE',
        claims: [createMockClaim()],
        sources: createMultipleSources(1),
        resolutionStrategy: '',
        resolved: false,
        confidence: 0,
      },
      {
        id: 'c3',
        type: 'TEMPORAL_DIFFERENCE',
        claims: [createMockClaim({ text: 'In 2024' })],
        sources: createMultipleSources(1),
        resolutionStrategy: '',
        resolved: false,
        confidence: 0,
      },
    ];

    const results = resolver.resolveMultiple(conflicts);
    const stats = resolver.getStatistics(results);

    expect(stats.byType['SCOPE_DIFFERENCE'].count).toBe(2);
    expect(stats.byType['SCOPE_DIFFERENCE'].resolved).toBe(2);
    expect(stats.byType['TEMPORAL_DIFFERENCE'].count).toBe(1);
  });

  it('should handle empty results', () => {
    const stats = resolver.getStatistics([]);

    expect(stats.total).toBe(0);
    expect(stats.resolved).toBe(0);
    expect(stats.averageConfidence).toBe(0);
  });
});

describe('ConflictResolver - resolveMeasurementUnit()', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  it('should identify quality-based measurement', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'MEASUREMENT_UNIT',
      claims: [createMockClaim({ text: 'Ranked #1 in quality' })],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('Quality-based');
    expect(result.confidence).toBe(0.87);
  });

  it('should identify speed-based measurement', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'MEASUREMENT_UNIT',
      claims: [createMockClaim({ text: 'Fastest in speed tests' })],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolution).toContain('Speed-based');
  });

  it('should set resolved=true', () => {
    const conflict: Conflict = {
      id: 'conflict-1',
      type: 'MEASUREMENT_UNIT',
      claims: [createMockClaim({ text: 'Performance leader' })],
      sources: createMultipleSources(1),
      resolutionStrategy: '',
      resolved: false,
      confidence: 0,
    };

    const result = resolver.resolve(conflict);

    expect(result.resolved).toBe(true);
    expect(result.userNotification).toContain('Measurement Unit');
  });
});
