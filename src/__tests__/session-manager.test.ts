import pino from 'pino';
import { SessionManager } from '../session/session-manager.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let logger: pino.Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' });
    sessionManager = new SessionManager(logger);
  });

  describe('setSession', () => {
    it('should store a session with token and login', () => {
      const token = 'test-token-123';
      const login = 'test@example.com';

      sessionManager.setSession(token, login);

      expect(sessionManager.getToken()).toBe(token);
      expect(sessionManager.hasValidSession()).toBe(true);
    });

    it('should store a session without login', () => {
      const token = 'test-token-456';

      sessionManager.setSession(token);

      expect(sessionManager.getToken()).toBe(token);
      expect(sessionManager.hasValidSession()).toBe(true);
    });
  });

  describe('getToken', () => {
    it('should return null when no session exists', () => {
      expect(sessionManager.getToken()).toBeNull();
    });

    it('should return token when valid session exists', () => {
      const token = 'valid-token';
      sessionManager.setSession(token);

      expect(sessionManager.getToken()).toBe(token);
    });

    it('should return null and clear session when expired', () => {
      const token = 'expired-token';
      sessionManager.setSession(token);

      const session = sessionManager.getSession();
      if (session) {
        session.expiresAt = Date.now() - 1000;
      }

      expect(sessionManager.getToken()).toBeNull();
      expect(sessionManager.hasValidSession()).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('should clear existing session', () => {
      sessionManager.setSession('token-to-clear');
      expect(sessionManager.hasValidSession()).toBe(true);

      sessionManager.clearSession();
      expect(sessionManager.hasValidSession()).toBe(false);
      expect(sessionManager.getToken()).toBeNull();
    });

    it('should handle clearing when no session exists', () => {
      sessionManager.clearSession();
      expect(sessionManager.hasValidSession()).toBe(false);
    });
  });

  describe('maskToken', () => {
    it('should mask short tokens completely', () => {
      expect(sessionManager.maskToken('short')).toBe('***');
    });

    it('should show last 4 characters for long tokens', () => {
      expect(sessionManager.maskToken('very-long-token-12345678')).toBe('***5678');
    });

    it('should handle exactly 8 character tokens', () => {
      expect(sessionManager.maskToken('12345678')).toBe('***');
    });

    it('should handle 9+ character tokens', () => {
      expect(sessionManager.maskToken('123456789')).toBe('***6789');
    });
  });
});
