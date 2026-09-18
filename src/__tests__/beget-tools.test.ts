import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import pino from 'pino';
import { BegetClient } from '../client/beget-client.js';
import { SessionManager } from '../session/session-manager.js';
import { BegetTools } from '../tools/beget-tools.js';

const mockLogger = pino({ level: 'silent' });

describe('BegetTools', () => {
  let begetClient: BegetClient;
  let sessionManager: SessionManager;
  let begetTools: BegetTools;
  let loginSpy: jest.SpyInstance;
  let refreshSpy: jest.SpyInstance;
  let logoutSpy: jest.SpyInstance;
  let switchSpy: jest.SpyInstance;
  let getPublicKeySpy: jest.SpyInstance;

  beforeEach(() => {
    begetClient = new BegetClient('https://api.beget.test', mockLogger);
    sessionManager = new SessionManager(mockLogger);
    begetTools = new BegetTools(begetClient, sessionManager, mockLogger);
    
    loginSpy = jest.spyOn(begetClient, 'login');
    refreshSpy = jest.spyOn(begetClient, 'refresh');
    logoutSpy = jest.spyOn(begetClient, 'logout');
    switchSpy = jest.spyOn(begetClient, 'switch');
    getPublicKeySpy = jest.spyOn(begetClient, 'getPublicKey');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleLogin', () => {
    it('should handle successful login', async () => {
      const mockToken = 'test-jwt-token-123';
      loginSpy.mockResolvedValue({ token: mockToken });

      const result = await begetTools.handleLogin({
        login: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('beget_auth_login');
      expect(result.error_code).toBeNull();
      expect(result.requires_2fa).toBe(false);
      expect(sessionManager.hasValidSession()).toBe(true);
    });

    it('should handle 2FA required (EMAIL)', async () => {
      loginSpy.mockResolvedValue({ error: 'CODE_REQUIRED_EMAIL' });

      const result = await begetTools.handleLogin({
        login: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.requires_2fa).toBe(true);
      expect(result.channel).toBe('EMAIL');
      expect(result.error_code).toBe('CODE_REQUIRED_EMAIL');
    });

    it('should handle 2FA required (SMS)', async () => {
      loginSpy.mockResolvedValue({ error: 'CODE_REQUIRED_SMS' });

      const result = await begetTools.handleLogin({
        login: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.requires_2fa).toBe(true);
      expect(result.channel).toBe('SMS');
    });

    it('should handle 2FA required (TOTP)', async () => {
      loginSpy.mockResolvedValue({ error: 'CODE_REQUIRED_TOTP' });

      const result = await begetTools.handleLogin({
        login: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.requires_2fa).toBe(true);
      expect(result.channel).toBe('TOTP');
    });

    it('should handle login failure with other error', async () => {
      loginSpy.mockResolvedValue({ error: 'INVALID_CREDENTIALS' });

      const result = await begetTools.handleLogin({
        login: 'test@example.com',
        password: 'wrong-password',
      });

      expect(result.success).toBe(false);
      expect(result.requires_2fa).toBe(false);
      expect(result.error_code).toBe('INVALID_CREDENTIALS');
    });

    it('should handle login with 2FA code', async () => {
      const mockToken = 'test-jwt-with-2fa';
      loginSpy.mockResolvedValue({ token: mockToken });

      const result = await begetTools.handleLogin({
        login: 'test@example.com',
        password: 'password123',
        code: '123456',
      });

      expect(result.success).toBe(true);
      expect(sessionManager.hasValidSession()).toBe(true);
    });

    it('should mask token in response', async () => {
      const mockToken = 'very-long-secret-token-12345678';
      loginSpy.mockResolvedValue({ token: mockToken });

      const result = await begetTools.handleLogin({
        login: 'test@example.com',
        password: 'password123',
      });

      expect(result.raw.token).toBe('***5678');
      expect(result.raw.token).not.toBe(mockToken);
    });
  });

  describe('handleRefresh', () => {
    it('should refresh token successfully', async () => {
      sessionManager.setSession('old-token');
      const newToken = 'new-refreshed-token';
      refreshSpy.mockResolvedValue({ token: newToken });

      const result = await begetTools.handleRefresh();

      expect(result.success).toBe(true);
      expect(result.operation).toBe('beget_auth_refresh');
      expect(sessionManager.hasValidSession()).toBe(true);
    });

    it('should fail when no session exists', async () => {
      const result = await begetTools.handleRefresh();

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('NO_SESSION');
    });

    it('should clear session on refresh failure', async () => {
      sessionManager.setSession('invalid-token');
      refreshSpy.mockResolvedValue({ error: 'TOKEN_EXPIRED' });

      const result = await begetTools.handleRefresh();

      expect(result.success).toBe(false);
      expect(sessionManager.hasValidSession()).toBe(false);
    });
  });

  describe('handleLogout', () => {
    it('should logout successfully', async () => {
      sessionManager.setSession('token-to-logout');
      logoutSpy.mockResolvedValue(undefined);

      const result = await begetTools.handleLogout();

      expect(result.success).toBe(true);
      expect(result.operation).toBe('beget_auth_logout');
      expect(sessionManager.hasValidSession()).toBe(false);
    });

    it('should fail when no session exists', async () => {
      const result = await begetTools.handleLogout();

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('NO_SESSION');
    });

    it('should clear session even on API error', async () => {
      sessionManager.setSession('token-to-logout');
      logoutSpy.mockRejectedValue(new Error('Network error'));

      const result = await begetTools.handleLogout();

      expect(result.success).toBe(false);
      expect(sessionManager.hasValidSession()).toBe(false);
    });
  });

  describe('handleSwitch', () => {
    it('should switch account successfully', async () => {
      sessionManager.setSession('parent-token', 'parent@example.com');
      const newToken = 'child-account-token';
      switchSpy.mockResolvedValue({ token: newToken });

      const result = await begetTools.handleSwitch({
        login: 'child@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('beget_auth_switch');
      expect(sessionManager.hasValidSession()).toBe(true);
    });

    it('should fail when no parent session exists', async () => {
      const result = await begetTools.handleSwitch({
        login: 'child@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('NO_SESSION');
    });

    it('should handle 2FA required for switch', async () => {
      sessionManager.setSession('parent-token');
      switchSpy.mockResolvedValue({ error: 'CODE_REQUIRED_TOTP' });

      const result = await begetTools.handleSwitch({
        login: 'child@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.requires_2fa).toBe(true);
      expect(result.channel).toBe('TOTP');
    });
  });

  describe('handleGetKey', () => {
    it('should fetch public key successfully', async () => {
      const mockKey = 'mock-public-key-content';
      getPublicKeySpy.mockResolvedValue(mockKey);

      const result = await begetTools.handleGetKey();

      expect(result.success).toBe(true);
      expect(result.operation).toBe('beget_auth_key');
      expect(result.raw.key).toBe(mockKey);
    });

    it('should handle key fetch error', async () => {
      getPublicKeySpy.mockRejectedValue(new Error('API unavailable'));

      const result = await begetTools.handleGetKey();

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('EXCEPTION');
    });
  });

  describe('getToolDefinitions', () => {
    it('should return all 5 tool definitions', () => {
      const tools = begetTools.getToolDefinitions();

      expect(tools).toHaveLength(5);
      expect(tools.map(t => t.name)).toEqual([
        'beget_auth_login',
        'beget_auth_refresh',
        'beget_auth_logout',
        'beget_auth_switch',
        'beget_auth_key',
      ]);
    });

    it('should have proper input schemas', () => {
      const tools = begetTools.getToolDefinitions();
      const loginTool = tools.find(t => t.name === 'beget_auth_login');

      expect(loginTool).toBeDefined();
      expect(loginTool?.inputSchema).toBeDefined();
    });
  });
});
