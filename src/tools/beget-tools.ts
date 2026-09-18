import { z } from 'zod';
import type { Logger } from 'pino';
import { BegetClient } from '../client/beget-client.js';
import { SessionManager } from '../session/session-manager.js';
import type { NormalizedToolResponse, TwoFactorChannel } from '../types.js';

function parseErrorFor2FA(error?: string): { requires2fa: boolean; channel: TwoFactorChannel | null } {
  if (!error) return { requires2fa: false, channel: null };

  if (error === 'CODE_REQUIRED_EMAIL') return { requires2fa: true, channel: 'EMAIL' };
  if (error === 'CODE_REQUIRED_SMS') return { requires2fa: true, channel: 'SMS' };
  if (error === 'CODE_REQUIRED_TOTP') return { requires2fa: true, channel: 'TOTP' };

  return { requires2fa: false, channel: null };
}

function createNormalizedResponse(
  operation: string,
  success: boolean,
  raw: Record<string, unknown>,
  errorCode: string | null = null,
  requires2fa = false,
  channel: TwoFactorChannel | null = null
): NormalizedToolResponse {
  return {
    success,
    operation,
    token: null,
    error_code: errorCode,
    requires_2fa: requires2fa,
    channel,
    raw,
  };
}

export class BegetTools {
  private client: BegetClient;
  private session: SessionManager;
  private logger: Logger;

  constructor(client: BegetClient, session: SessionManager, logger: Logger) {
    this.client = client;
    this.session = session;
    this.logger = logger;
  }

  getToolDefinitions() {
    return [
      {
        name: 'beget_auth_login',
        description: 'Authenticate with Beget API using login and password. Supports 2FA.',
        inputSchema: z.object({
          login: z.string().describe('Beget account login'),
          password: z.string().describe('Beget account password'),
          code: z.string().optional().describe('2FA code (email/SMS/TOTP) if required'),
          saveMe: z.boolean().optional().describe('Remember session (default: true)'),
        }),
      },
      {
        name: 'beget_auth_refresh',
        description: 'Refresh the current JWT token using stored session',
        inputSchema: z.object({}),
      },
      {
        name: 'beget_auth_logout',
        description: 'Logout and invalidate the current session token',
        inputSchema: z.object({}),
      },
      {
        name: 'beget_auth_switch',
        description: 'Switch to a different Beget account (multi-account support)',
        inputSchema: z.object({
          login: z.string().describe('Target account login'),
          password: z.string().describe('Target account password'),
          code: z.string().optional().describe('2FA code if required'),
        }),
      },
      {
        name: 'beget_auth_key',
        description: 'Fetch the public key for JWT validation from Beget',
        inputSchema: z.object({}),
      },
    ];
  }

  async handleLogin(args: { login: string; password: string; code?: string; saveMe?: boolean }): Promise<NormalizedToolResponse> {
    try {
      const request = {
        login: args.login,
        password: args.password,
        ...(args.code && { code: args.code }),
        saveMe: args.saveMe ?? true,
      };

      const response = await this.client.login(request);

      if (response.error) {
        const { requires2fa, channel } = parseErrorFor2FA(response.error);
        
        if (requires2fa) {
          this.logger.info({ login: args.login, channel }, '2FA required');
          return createNormalizedResponse(
            'beget_auth_login',
            false,
            response as Record<string, unknown>,
            response.error,
            true,
            channel
          );
        }

        this.logger.warn({ login: args.login, error: response.error }, 'Login failed');
        return createNormalizedResponse(
          'beget_auth_login',
          false,
          response as Record<string, unknown>,
          response.error
        );
      }

      if (response.token) {
        this.session.setSession(response.token, args.login);
        this.logger.info({ login: args.login }, 'Login successful');
        
        const maskedResponse = {
          ...response,
          token: this.session.maskToken(response.token),
        };

        return createNormalizedResponse(
          'beget_auth_login',
          true,
          maskedResponse as Record<string, unknown>
        );
      }

      return createNormalizedResponse(
        'beget_auth_login',
        false,
        response as Record<string, unknown>,
        'UNKNOWN_ERROR'
      );
    } catch (error) {
      this.logger.error({ error }, 'Login error');
      return createNormalizedResponse(
        'beget_auth_login',
        false,
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'EXCEPTION'
      );
    }
  }

  async handleRefresh(): Promise<NormalizedToolResponse> {
    try {
      const currentToken = this.session.getToken();
      
      if (!currentToken) {
        this.logger.warn('Refresh attempted without active session');
        return createNormalizedResponse(
          'beget_auth_refresh',
          false,
          { error: 'No active session' },
          'NO_SESSION'
        );
      }

      const response = await this.client.refresh(currentToken);

      if (response.error) {
        this.logger.warn({ error: response.error }, 'Refresh failed');
        this.session.clearSession();
        return createNormalizedResponse(
          'beget_auth_refresh',
          false,
          response as Record<string, unknown>,
          response.error
        );
      }

      if (response.token) {
        const currentSession = this.session.getSession();
        this.session.setSession(response.token, currentSession?.login);
        this.logger.info('Token refreshed successfully');
        
        const maskedResponse = {
          ...response,
          token: this.session.maskToken(response.token),
        };

        return createNormalizedResponse(
          'beget_auth_refresh',
          true,
          maskedResponse as Record<string, unknown>
        );
      }

      return createNormalizedResponse(
        'beget_auth_refresh',
        false,
        response as Record<string, unknown>,
        'UNKNOWN_ERROR'
      );
    } catch (error) {
      this.logger.error({ error }, 'Refresh error');
      this.session.clearSession();
      return createNormalizedResponse(
        'beget_auth_refresh',
        false,
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'EXCEPTION'
      );
    }
  }

  async handleLogout(): Promise<NormalizedToolResponse> {
    try {
      const currentToken = this.session.getToken();
      
      if (!currentToken) {
        this.logger.warn('Logout attempted without active session');
        return createNormalizedResponse(
          'beget_auth_logout',
          false,
          { error: 'No active session' },
          'NO_SESSION'
        );
      }

      await this.client.logout(currentToken);
      this.session.clearSession();
      this.logger.info('Logout successful');

      return createNormalizedResponse(
        'beget_auth_logout',
        true,
        { message: 'Logged out successfully' }
      );
    } catch (error) {
      this.logger.error({ error }, 'Logout error');
      this.session.clearSession();
      return createNormalizedResponse(
        'beget_auth_logout',
        false,
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'EXCEPTION'
      );
    }
  }

  async handleSwitch(args: { login: string; password: string; code?: string }): Promise<NormalizedToolResponse> {
    try {
      const parentToken = this.session.getToken();
      
      if (!parentToken) {
        this.logger.warn('Switch attempted without active session');
        return createNormalizedResponse(
          'beget_auth_switch',
          false,
          { error: 'No active session' },
          'NO_SESSION'
        );
      }

      const request = {
        login: args.login,
        password: args.password,
        ...(args.code && { code: args.code }),
      };

      const response = await this.client.switch(request, parentToken);

      if (response.error) {
        const { requires2fa, channel } = parseErrorFor2FA(response.error);
        
        if (requires2fa) {
          this.logger.info({ login: args.login, channel }, '2FA required for switch');
          return createNormalizedResponse(
            'beget_auth_switch',
            false,
            response as Record<string, unknown>,
            response.error,
            true,
            channel
          );
        }

        this.logger.warn({ login: args.login, error: response.error }, 'Switch failed');
        return createNormalizedResponse(
          'beget_auth_switch',
          false,
          response as Record<string, unknown>,
          response.error
        );
      }

      if (response.token) {
        this.session.setSession(response.token, args.login);
        this.logger.info({ login: args.login }, 'Account switch successful');
        
        const maskedResponse = {
          ...response,
          token: this.session.maskToken(response.token),
        };

        return createNormalizedResponse(
          'beget_auth_switch',
          true,
          maskedResponse as Record<string, unknown>
        );
      }

      return createNormalizedResponse(
        'beget_auth_switch',
        false,
        response as Record<string, unknown>,
        'UNKNOWN_ERROR'
      );
    } catch (error) {
      this.logger.error({ error }, 'Switch error');
      return createNormalizedResponse(
        'beget_auth_switch',
        false,
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'EXCEPTION'
      );
    }
  }

  async handleGetKey(): Promise<NormalizedToolResponse> {
    try {
      const key = await this.client.getPublicKey();
      this.logger.info('Public key fetched successfully');

      return createNormalizedResponse(
        'beget_auth_key',
        true,
        { key }
      );
    } catch (error) {
      this.logger.error({ error }, 'Get key error');
      return createNormalizedResponse(
        'beget_auth_key',
        false,
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'EXCEPTION'
      );
    }
  }
}
