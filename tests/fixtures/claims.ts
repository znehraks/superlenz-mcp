import type { Claim, VerifiedClaim } from '../../src/core/types';

export const createMockClaim = (overrides?: Partial<Claim>): Claim => ({
  id: 'claim-1',
  text: 'Test claim text',
  extractedFrom: ['source-1'],
  confidence: 0.8,
  ...overrides
});

export const createVerifiedClaim = (overrides?: Partial<VerifiedClaim>): VerifiedClaim => ({
  ...createMockClaim(),
  supportingSources: ['source-1'],
  contradictingSources: [],
  verificationRounds: 10,
  ...overrides
});
