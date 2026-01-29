import type { Source } from '../../src/core/types';

export const createMockSource = (overrides?: Partial<Source>): Source => ({
  id: 'source-1',
  type: 'web',
  url: 'https://example.com',
  title: 'Test Source',
  credibilityScore: 0.7,
  credibilityLevel: 'medium',
  publishedDate: new Date('2025-01-01'),
  accessedDate: new Date('2026-01-29'),
  metadata: {},
  ...overrides
});

export const createAcademicSource = (overrides?: Partial<Source>): Source => ({
  ...createMockSource(),
  type: 'academic',
  credibilityScore: 0.9,
  credibilityLevel: 'high',
  citationCount: 100,
  ...overrides
});

export const createMultipleSources = (count: number): Source[] => {
  return Array.from({ length: count }, (_, i) =>
    createMockSource({ id: `source-${i + 1}`, relevanceScore: 0.9 - (i * 0.05) })
  );
};
