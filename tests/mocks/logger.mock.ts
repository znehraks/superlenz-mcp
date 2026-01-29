import { vi } from 'vitest';

export const mockLogger = {
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  logDebug: vi.fn()
};

export function resetLoggerMocks() {
  Object.values(mockLogger).forEach(mock => mock.mockClear());
}
