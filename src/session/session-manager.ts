import type { Logger } from 'pino';
import type { SessionData } from '../types.js';

export class SessionManager {
  private session: SessionData | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  setSession(token: string, login?: string): void {
    const expiresAt = Date.now() + 86400000;
    
    this.session = {
      token,
      expiresAt,
      login,
    };

    this.logger.info({ login, expiresAt: new Date(expiresAt).toISOString() }, 'Session stored');
  }

  getToken(): string | null {
    if (!this.session) {
      this.logger.debug('No session found');
      return null;
    }

    if (Date.now() > this.session.expiresAt) {
      this.logger.warn('Session expired');
      this.clearSession();
      return null;
    }

    return this.session.token;
  }

  getSession(): SessionData | null {
    if (!this.session) {
      return null;
    }

    if (Date.now() > this.session.expiresAt) {
      this.clearSession();
      return null;
    }

    return this.session;
  }

  clearSession(): void {
    if (this.session) {
      this.logger.info({ login: this.session.login }, 'Session cleared');
    }
    this.session = null;
  }

  hasValidSession(): boolean {
    return this.getToken() !== null;
  }

  maskToken(token: string): string {
    if (token.length <= 8) return '***';
    return `***${token.slice(-4)}`;
  }
}
