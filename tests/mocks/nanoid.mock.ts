import { vi } from 'vitest';

let idCounter = 0;

export const mockNanoid = vi.fn(() => `test-id-${++idCounter}`);

export function resetNanoidCounter() {
  idCounter = 0;
  mockNanoid.mockClear();
}
