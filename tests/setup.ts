import { vi } from 'vitest';
import { mockLogger } from './mocks/logger.mock';

// Mock logger globally
vi.mock('../src/utils/logger', () => mockLogger);

// Set consistent date for tests
const MOCK_DATE = new Date('2026-01-29T00:00:00.000Z');
vi.setSystemTime(MOCK_DATE);

// Global test timeout
vi.setConfig({ testTimeout: 10000 });
