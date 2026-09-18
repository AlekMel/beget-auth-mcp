import type { Logger } from 'pino';
import type {
  BegetAuthRequest,
  BegetAuthResponse,
  BegetSwitchRequest,
  BegetKeyResponse,
} from '../types.js';

export class BegetClient {
  private baseUrl: string;
  private logger: Logger;
  private cachedKey: { key: string; cachedAt: number } | null = null;
  private readonly keyTtlMs = 3600000;

  constructor(baseUrl: string, logger: Logger) {
    this.baseUrl = baseUrl;
    this.logger = logger;
  }

  private async fetchBeget<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const maskedHeaders = options.headers ? { ...options.headers } : {};
    if ('Authorization' in maskedHeaders) {
      (maskedHeaders as Record<string, string>)['Authorization'] = 'Bearer ***';
    }

    this.logger.debug({
      method: options.method || 'GET',
      url,
      headers: maskedHeaders,
    }, 'Beget API request');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      const data = await response.json() as T;

      if (!response.ok) {
        this.logger.warn({
          status: response.status,
          statusText: response.statusText,
          data,
        }, 'Beget API error response');
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      this.logger.error({ error, url }, 'Beget API request failed');
      throw new Error(`Beget API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async login(request: BegetAuthRequest): Promise<BegetAuthResponse> {
    this.logger.info({ login: request.login }, 'Attempting login');
    
    return this.fetchBeget<BegetAuthResponse>('/v1/auth', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async refresh(token: string): Promise<BegetAuthResponse> {
    this.logger.info('Attempting token refresh');
    
    return this.fetchBeget<BegetAuthResponse>('/v1/auth/refresh', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async logout(token: string): Promise<void> {
    this.logger.info('Attempting logout');
    
    await this.fetchBeget<void>('/v1/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async switch(request: BegetSwitchRequest, parentToken: string): Promise<BegetAuthResponse> {
    this.logger.info({ login: request.login }, 'Attempting account switch');
    
    return this.fetchBeget<BegetAuthResponse>('/v1/auth/switch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
      body: JSON.stringify(request),
    });
  }

  async getPublicKey(forceRefresh = false): Promise<string> {
    const now = Date.now();
    
    if (!forceRefresh && this.cachedKey && (now - this.cachedKey.cachedAt) < this.keyTtlMs) {
      this.logger.debug('Using cached public key');
      return this.cachedKey.key;
    }

    this.logger.info('Fetching public key from Beget');
    const response = await this.fetchBeget<BegetKeyResponse>('/v1/auth/key', {
      method: 'GET',
    });

    this.cachedKey = {
      key: response.key,
      cachedAt: now,
    };

    return response.key;
  }
}
