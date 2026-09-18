import { ServerConfig } from './types.js';

export function loadConfig(): ServerConfig {
  const mcpApiKey = process.env.MCP_API_KEY || process.env.BEGET_MCP_API_KEY;
  
  if (!mcpApiKey) {
    throw new Error('MCP_API_KEY or BEGET_MCP_API_KEY environment variable is required');
  }

  const allowedCidrs = process.env.ALLOWED_CIDRS 
    ? process.env.ALLOWED_CIDRS.split(',').map(c => c.trim())
    : undefined;

  return {
    port: parseInt(process.env.PORT || '8080', 10),
    mcpApiKey,
    begetApiBase: process.env.BEGET_API_BASE || 'https://api.beget.com',
    begetLogin: process.env.BEGET_LOGIN,
    begetPassword: process.env.BEGET_PASSWORD,
    allowedCidrs,
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'production',
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '1mb',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  };
}
