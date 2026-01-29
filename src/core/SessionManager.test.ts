/**
 * Unit tests for SessionManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './SessionManager.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      maxSessions: 10,
      sessionTTL: 60000, // 1 minute for testing
    });
  });

  describe('Session Creation', () => {
    it('should create a new session', () => {
      const session = sessionManager.createSession({
        topic: 'Test research topic',
        depth: 'standard',
        storageProvider: 'markdown',
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.topic).toBe('Test research topic');
      expect(session.depth).toBe('standard');
      expect(session.status).toBe('initializing');
      expect(session.progress).toBe(0);
    });

    it('should generate unique session IDs', () => {
      const session1 = sessionManager.createSession({
        topic: 'Topic 1',
        depth: 'quick',
        storageProvider: 'markdown',
      });

      const session2 = sessionManager.createSession({
        topic: 'Topic 2',
        depth: 'quick',
        storageProvider: 'markdown',
      });

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('Session Retrieval', () => {
    it('should get existing session', () => {
      const created = sessionManager.createSession({
        topic: 'Test',
        depth: 'standard',
        storageProvider: 'markdown',
      });

      const retrieved = sessionManager.getSession(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return null for non-existent session', () => {
      const session = sessionManager.getSession('non-existent-id');
      expect(session).toBeNull();
    });
  });

  describe('Session Updates', () => {
    it('should update session status', () => {
      const session = sessionManager.createSession({
        topic: 'Test',
        depth: 'standard',
        storageProvider: 'markdown',
      });

      const updated = sessionManager.updateSession(session.id, {
        status: 'searching',
        progress: 25,
      });

      expect(updated?.status).toBe('searching');
      expect(updated?.progress).toBe(25);
    });
  });
});
