import type { Source } from '../../src/core/types';

export const createMockSource = (overrides?: Partial<Source>): Source => ({
  id: 'source-1',
  type: 'web',
  url: 'https://example.com',
  title: 'Test Source',
  snippet: 'Test snippet content',
  relevanceScore: 0.8,
  credibilityScore: 0.7,
  publishedDate: new Date('2025-01-01'),
  ...overrides
});

export const createAcademicSource = (overrides?: Partial<Source>): Source => ({
  ...createMockSource(),
  type: 'academic',
  credibilityScore: 0.9,
  citations: 100,
  ...overrides
});

export const createMultipleSources = (count: number): Source[] => {
  return Array.from({ length: count }, (_, i) =>
    createMockSource({ id: `source-${i + 1}`, relevanceScore: 0.9 - (i * 0.05) })
  );
};
