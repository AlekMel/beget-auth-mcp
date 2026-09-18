import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import * as ipaddr from 'ipaddr.js';
import type { Logger } from 'pino';
import type { ServerConfig } from '../types.js';

export function createApiKeyMiddleware(config: ServerConfig, logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.headers.authorization?.replace('Bearer ', '') || 
                   req.headers['x-api-key'] as string;

    if (!apiKey) {
      logger.warn({ ip: req.ip, path: req.path }, 'API key missing');
      res.status(401).json({ error: 'API key required' });
      return;
    }

    if (apiKey !== config.mcpApiKey) {
      logger.warn({ ip: req.ip, path: req.path }, 'Invalid API key');
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    next();
  };
}

export function createIpAllowlistMiddleware(config: ServerConfig, logger: Logger) {
  if (!config.allowedCidrs || config.allowedCidrs.length === 0) {
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                      req.socket.remoteAddress || 
                      req.ip;

    if (!clientIp) {
      logger.warn({ path: req.path }, 'Could not determine client IP');
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    try {
      const allowed = config.allowedCidrs!.some(cidr => {
        try {
          if (cidr.includes(':')) {
            const [range, bits] = cidr.split('/');
            const addr = ipaddr.IPv6.parse(clientIp);
            const rangeAddr = ipaddr.IPv6.parse(range);
            return addr.match(rangeAddr, parseInt(bits || '128', 10));
          } else {
            const [range, bits] = cidr.split('/');
            const addr = ipaddr.IPv4.parse(clientIp);
            const rangeAddr = ipaddr.IPv4.parse(range);
            return addr.match(rangeAddr, parseInt(bits || '32', 10));
          }
        } catch {
          return false;
        }
      });

      if (!allowed) {
        logger.warn({ ip: clientIp, path: req.path }, 'IP not in allowlist');
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      next();
    } catch (error) {
      logger.error({ error, ip: clientIp }, 'IP allowlist check failed');
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export function createRateLimiter(config: ServerConfig, logger: Logger) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
      res.status(429).json({ error: 'Too many requests' });
    },
    skip: (req: Request) => {
      return req.path === '/healthz';
    },
  });
}

export function createAuthRateLimiter(logger: Logger) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn({ ip: req.ip, path: req.path }, 'Auth rate limit exceeded');
      res.status(429).json({ error: 'Too many authentication attempts' });
    },
  });
}

export function createErrorHandler(logger: Logger) {
  return (err: Error, req: Request, res: Response): void => {
    logger.error({ error: err, path: req.path, method: req.method }, 'Unhandled error');

    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.status(500).json({ 
        error: 'Internal server error',
        message: err.message,
        stack: err.stack,
      });
    }
  };
}
