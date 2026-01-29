/**
 * Session manager for tracking research sessions
 */

import { nanoid } from 'nanoid';
import type { ResearchSession, ResearchDepth, ResearchStatus } from './types.js';

export interface CreateSessionOptions {
  topic: string;
  initialUrls?: string[];
  depth: ResearchDepth;
  storageProvider: string;
}

export interface UpdateSessionOptions {
  status?: ResearchStatus;
  currentRound?: number;
  progress?: number;
  error?: string;
}

export class SessionManager {
  private sessions: Map<string, ResearchSession> = new Map();
  private maxSessions: number;
  private sessionTTL: number; // in milliseconds

  constructor(options: { maxSessions?: number; sessionTTL?: number } = {}) {
    this.maxSessions = options.maxSessions || 100;
    this.sessionTTL = options.sessionTTL || 24 * 60 * 60 * 1000; // 24 hours default
  }

  /**
   * Create a new research session
   */
  createSession(options: CreateSessionOptions): ResearchSession {
    // Clean up old sessions if at capacity
    if (this.sessions.size >= this.maxSessions) {
      this.cleanupOldSessions();
    }

    const now = new Date();
    const session: ResearchSession = {
      id: nanoid(),
      topic: options.topic,
      initialUrls: options.initialUrls,
      depth: options.depth,
      status: 'initializing',
      storageProvider: options.storageProvider,
      createdAt: now,
      updatedAt: now,
      progress: 0,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ResearchSession | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check if session has expired
    if (this.isExpired(session)) {
      this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Update a session
   */
  updateSession(sessionId: string, updates: UpdateSessionOptions): ResearchSession | null {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const updatedSession: ResearchSession = {
      ...session,
      ...updates,
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, updatedSession);
    return updatedSession;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * List all active sessions
   */
  listSessions(options: {
    status?: ResearchStatus;
    limit?: number;
    offset?: number;
  } = {}): ResearchSession[] {
    let sessions = Array.from(this.sessions.values())
      .filter(session => !this.isExpired(session));

    // Filter by status if provided
    if (options.status) {
      sessions = sessions.filter(s => s.status === options.status);
    }

    // Sort by updatedAt descending (most recent first)
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || sessions.length;
    return sessions.slice(offset, offset + limit);
  }

  /**
   * Get session count
   */
  getSessionCount(status?: ResearchStatus): number {
    let sessions = Array.from(this.sessions.values())
      .filter(session => !this.isExpired(session));

    if (status) {
      sessions = sessions.filter(s => s.status === status);
    }

    return sessions.length;
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return !!session && !this.isExpired(session);
  }

  /**
   * Clean up expired sessions
   */
  cleanupOldSessions(): number {
    let cleaned = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (this.isExpired(session)) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clean up completed/failed sessions older than a certain age
   */
  cleanupCompletedSessions(maxAge: number = 60 * 60 * 1000): number {
    let cleaned = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (
        (session.status === 'completed' || session.status === 'failed') &&
        Date.now() - session.updatedAt.getTime() > maxAge
      ) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Check if a session is expired
   */
  private isExpired(session: ResearchSession): boolean {
    const age = Date.now() - session.updatedAt.getTime();
    return age > this.sessionTTL;
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
  }

  /**
   * Get statistics about sessions
   */
  getStatistics(): {
    total: number;
    byStatus: Record<ResearchStatus, number>;
    averageProgress: number;
    oldestSession: Date | null;
    newestSession: Date | null;
  } {
    const sessions = Array.from(this.sessions.values())
      .filter(session => !this.isExpired(session));

    const byStatus: Record<ResearchStatus, number> = {
      initializing: 0,
      searching: 0,
      collecting: 0,
      verifying: 0,
      generating: 0,
      saving: 0,
      completed: 0,
      failed: 0,
    };

    let totalProgress = 0;
    let oldestDate: Date | null = null;
    let newestDate: Date | null = null;

    for (const session of sessions) {
      byStatus[session.status]++;
      totalProgress += session.progress;

      if (!oldestDate || session.createdAt < oldestDate) {
        oldestDate = session.createdAt;
      }
      if (!newestDate || session.createdAt > newestDate) {
        newestDate = session.createdAt;
      }
    }

    return {
      total: sessions.length,
      byStatus,
      averageProgress: sessions.length > 0 ? totalProgress / sessions.length : 0,
      oldestSession: oldestDate,
      newestSession: newestDate,
    };
  }

  /**
   * Export session data (for debugging/logging)
   */
  exportSession(sessionId: string): ResearchSession | null {
    return this.getSession(sessionId);
  }

  /**
   * Import session data (for restoration)
   */
  importSession(session: ResearchSession): void {
    this.sessions.set(session.id, session);
  }
}

// Singleton instance
let instance: SessionManager | null = null;

export function getSessionManager(options?: { maxSessions?: number; sessionTTL?: number }): SessionManager {
  if (!instance) {
    instance = new SessionManager(options);
  }
  return instance;
}

export function resetSessionManager(): void {
  instance = null;
}
