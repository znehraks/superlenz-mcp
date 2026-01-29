/**
 * Core type definitions for the research automation MCP server
 */

import { z } from 'zod';

// ============================================================================
// Research Session Types
// ============================================================================

export type ResearchDepth = 'quick' | 'standard' | 'deep';
export type ResearchStatus = 'initializing' | 'searching' | 'collecting' | 'verifying' | 'generating' | 'saving' | 'completed' | 'failed';

export interface ResearchSession {
  id: string;
  topic: string;
  initialUrls?: string[];
  depth: ResearchDepth;
  status: ResearchStatus;
  storageProvider: string;
  createdAt: Date;
  updatedAt: Date;
  currentRound?: number;
  progress: number; // 0-100
  error?: string;
}

// ============================================================================
// Source and Reference Types
// ============================================================================

export type SourceType = 'web' | 'academic' | 'github' | 'youtube' | 'reddit' | 'user-provided';
export type SourceCredibility = 'high' | 'medium' | 'low';

export interface Source {
  id: string;
  url: string;
  type: SourceType;
  title: string;
  author?: string;
  publishedDate?: Date;
  accessedDate: Date;
  credibilityScore: number; // 0.0-1.0
  credibilityLevel: SourceCredibility;
  citationCount?: number;
  metadata: Record<string, unknown>;
}

export type CitationStyle = 'APA' | 'MLA' | 'Chicago' | 'IEEE' | 'Harvard';

export interface Reference {
  id: string;
  sourceId: string;
  citationStyle: CitationStyle;
  formatted: string;
  shortForm: string; // e.g., "[1]" or "(Author, Year)"
}

// ============================================================================
// Claim and Verification Types
// ============================================================================

export interface Claim {
  id: string;
  text: string;
  topic: string;
  extractedFrom: string[]; // source IDs
  confidence: number; // 0.0-1.0
  verificationStatus: 'pending' | 'verified' | 'disputed' | 'false';
  metadata?: Record<string, unknown>;
}

export type ConflictType =
  | 'SCOPE_DIFFERENCE'
  | 'TEMPORAL_DIFFERENCE'
  | 'STATISTICAL_METHOD'
  | 'MEASUREMENT_UNIT'
  | 'TRUE_CONTRADICTION';

export interface Conflict {
  id: string;
  type: ConflictType;
  claims: Claim[];
  sources: Source[];
  resolutionStrategy: string;
  resolved: boolean;
  resolution?: string;
  confidence: number;
}

export interface VerificationResult {
  round: number;
  timestamp: Date;
  claimsVerified: number;
  conflictsFound: number;
  averageConfidence: number;
  sources: Source[];
  conflicts: Conflict[];
  earlyExit?: boolean;
  earlyExitReason?: string;
}

export interface VerifiedClaim extends Claim {
  verificationRounds: number;
  supportingSources: Source[];
  contradictingSources?: Source[];
  finalConfidence: number;
  notes?: string;
}

// ============================================================================
// Document Types
// ============================================================================

export type SectionType =
  | 'executive-summary'
  | 'introduction'
  | 'methodology'
  | 'findings'
  | 'comparison'
  | 'analysis'
  | 'conclusion'
  | 'references'
  | 'appendix';

export interface Section {
  id: string;
  type: SectionType;
  title: string;
  content: string;
  subsections?: Section[];
  metadata?: Record<string, unknown>;
}

export interface ResearchDocument {
  id: string;
  title: string;
  topic: string;
  summary: string;
  sections: Section[];
  references: Reference[];
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    author: string;
    version: string;
    tags: string[];
    category?: string;
    credibilityScore: number;
    verificationRounds: number;
    sourcesCount: number;
    conflictsResolved: number;
  };
  verificationSummary: {
    totalClaims: number;
    verifiedClaims: number;
    averageConfidence: number;
    sourceBreakdown: Record<SourceType, number>;
  };
}

// ============================================================================
// Storage Provider Types
// ============================================================================

export interface StorageConfig {
  enabled: boolean;
  priority: number;
  [key: string]: unknown;
}

export interface SaveResult {
  success: boolean;
  destination: string;
  provider: string;
  url?: string;
  error?: string;
}

export interface SearchQuery {
  query: string;
  tags?: string[];
  category?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastCheck: Date;
}

export interface StorageProvider {
  name: string;
  version: string;
  priority: number;
  supportsImages: boolean;
  supportsRichText: boolean;

  initialize(config: StorageConfig): Promise<void>;
  saveDocument(doc: ResearchDocument, destination?: string): Promise<SaveResult>;
  getDocument(id: string): Promise<ResearchDocument | null>;
  searchDocuments(query: SearchQuery): Promise<ResearchDocument[]>;
  healthCheck(): Promise<HealthStatus>;
}

// ============================================================================
// Plugin Registry Types
// ============================================================================

export interface Plugin {
  name: string;
  version: string;
  type: 'storage' | 'search' | 'verification';
  priority: number;
  enabled: boolean;
  initialize(config: Record<string, unknown>): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
}

// ============================================================================
// Search Provider Types
// ============================================================================

export interface SearchResult {
  id: string;
  url: string;
  title: string;
  snippet: string;
  source: SourceType;
  relevanceScore: number;
  publishedDate?: Date;
  metadata: Record<string, unknown>;
}

export interface SearchProvider {
  name: string;
  type: SourceType;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  healthCheck(): Promise<HealthStatus>;
}

// ============================================================================
// Confidence Scoring Types
// ============================================================================

export interface CredibilityFactors {
  sourceCredibility: number; // 40%
  crossVerificationAgreement: number; // 30%
  recency: number; // 15%
  citationCount: number; // 10%
  expertVerification: number; // 5%
}

export interface ConfidenceScore {
  overall: number; // 0.0-1.0
  factors: CredibilityFactors;
  breakdown: string;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const ResearchSessionSchema = z.object({
  id: z.string(),
  topic: z.string().min(1),
  initialUrls: z.array(z.string().url()).optional(),
  depth: z.enum(['quick', 'standard', 'deep']),
  status: z.enum(['initializing', 'searching', 'collecting', 'verifying', 'generating', 'saving', 'completed', 'failed']),
  storageProvider: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  currentRound: z.number().optional(),
  progress: z.number().min(0).max(100),
  error: z.string().optional(),
});

export const SourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  type: z.enum(['web', 'academic', 'github', 'youtube', 'reddit', 'user-provided']),
  title: z.string(),
  author: z.string().optional(),
  publishedDate: z.date().optional(),
  accessedDate: z.date(),
  credibilityScore: z.number().min(0).max(1),
  credibilityLevel: z.enum(['high', 'medium', 'low']),
  citationCount: z.number().optional(),
  metadata: z.record(z.unknown()),
});

export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  topic: z.string(),
  extractedFrom: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  verificationStatus: z.enum(['pending', 'verified', 'disputed', 'false']),
  metadata: z.record(z.unknown()).optional(),
});

export const ConflictSchema = z.object({
  id: z.string(),
  type: z.enum(['SCOPE_DIFFERENCE', 'TEMPORAL_DIFFERENCE', 'STATISTICAL_METHOD', 'MEASUREMENT_UNIT', 'TRUE_CONTRADICTION']),
  claims: z.array(ClaimSchema),
  sources: z.array(SourceSchema),
  resolutionStrategy: z.string(),
  resolved: z.boolean(),
  resolution: z.string().optional(),
  confidence: z.number().min(0).max(1),
});
