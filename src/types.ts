export interface BegetAuthRequest {
  login: string;
  password: string;
  code?: string;
  saveMe?: boolean;
}

export interface BegetAuthResponse {
  token?: string;
  error?: string;
}

export interface BegetSwitchRequest {
  login: string;
  password: string;
  code?: string;
}

export interface BegetKeyResponse {
  key: string;
}

export type TwoFactorChannel = 'EMAIL' | 'SMS' | 'TOTP';

export interface NormalizedToolResponse {
  success: boolean;
  operation: string;
  token: string | null;
  error_code: string | null;
  requires_2fa: boolean;
  channel: TwoFactorChannel | null;
  raw: Record<string, unknown>;
}

export interface ServerConfig {
  port: number;
  mcpApiKey: string;
  begetApiBase: string;
  begetLogin?: string;
  begetPassword?: string;
  allowedCidrs?: string[];
  logLevel: string;
  nodeEnv: string;
  maxRequestSize: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface SessionData {
  token: string;
  expiresAt: number;
  login?: string;
}
