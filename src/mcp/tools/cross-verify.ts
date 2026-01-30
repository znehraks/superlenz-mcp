/**
 * MCP Tool: cross_verify
 * Cross-verify a list of claims against sources
 */

import { z } from 'zod';
import { VerificationEngine } from '../../verification/VerificationEngine.js';
import { CredibilityCalculator } from '../../verification/CredibilityCalculator.js';
import { nanoid } from 'nanoid';
import type { Claim, Source } from '../../core/types.js';

export const crossVerifySchema = z.object({
  claims: z
    .array(z.string().min(1))
    .min(1)
    .describe('List of claims to verify'),
  topic: z.string().min(1).describe('Topic context for verification'),
  sources: z
    .array(z.string())
    .optional()
    .describe('Optional source URLs to check against'),
});

export type CrossVerifyInput = z.infer<typeof crossVerifySchema>;

export async function crossVerify(input: CrossVerifyInput) {
  try {
    const engine = new VerificationEngine();
    const calculator = new CredibilityCalculator();

    // Build Claim objects
    const claims: Claim[] = input.claims.map((text) => ({
      id: nanoid(),
      text,
      topic: input.topic,
      extractedFrom: [],
      confidence: 0.5,
      verificationStatus: 'pending' as const,
    }));

    // Build Source objects from URLs (if provided)
    const sources: Source[] = (input.sources || []).map((url) => ({
      id: nanoid(),
      url,
      type: 'user-provided' as const,
      title: url,
      accessedDate: new Date(),
      credibilityScore: 0.5,
      credibilityLevel: 'medium' as const,
      metadata: {},
    }));

    const sessionId = nanoid();

    const result = await engine.verify({
      sessionId,
      topic: input.topic,
      sources,
      claims,
      round: 1,
    });

    const credibility = calculator.calculate({
      sources,
      verifiedClaims: result.verifiedClaims,
      expertVerified: false,
    });

    return {
      success: true,
      sessionId,
      topic: input.topic,
      totalClaims: claims.length,
      verifiedClaims: result.verifiedClaims.map((vc) => ({
        text: vc.text,
        status: vc.verificationStatus,
        finalConfidence: vc.finalConfidence,
        supportingSources: vc.supportingSources.length,
        contradictingSources: (vc.contradictingSources || []).length,
      })),
      conflicts: result.conflicts.map((c) => ({
        type: c.type,
        resolved: c.resolved,
        resolution: c.resolution,
      })),
      summary: {
        totalRounds: result.totalRounds,
        finalConfidence: result.finalConfidence,
        credibilityScore: credibility.overall,
        credibilityBreakdown: credibility.breakdown,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: 'Cross-verification failed',
    };
  }
}
