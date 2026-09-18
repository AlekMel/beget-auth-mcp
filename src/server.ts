import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import { BegetClient } from './client/beget-client.js';
import { SessionManager } from './session/session-manager.js';
import { BegetTools } from './tools/beget-tools.js';
import {
  createApiKeyMiddleware,
  createIpAllowlistMiddleware,
  createRateLimiter,
  createErrorHandler,
} from './security/middleware.js';
import type { ServerConfig } from './types.js';

export class BegetAuthMcpServer {
  private app: express.Application;
  private config: ServerConfig;
  private logger: Logger;
  private begetClient: BegetClient;
  private sessionManager: SessionManager;
  private begetTools: BegetTools;

  constructor(config: ServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.app = express();

    this.begetClient = new BegetClient(config.begetApiBase, logger.child({ component: 'beget-client' }));
    this.sessionManager = new SessionManager(logger.child({ component: 'session' }));
    this.begetTools = new BegetTools(
      this.begetClient,
      this.sessionManager,
      logger.child({ component: 'tools' })
    );

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          imgSrc: ["'none'"],
          fontSrc: ["'none'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'no-referrer' },
    }));

    this.app.use(express.json({ limit: this.config.maxRequestSize }));
    this.app.use(express.urlencoded({ extended: false, limit: this.config.maxRequestSize }));

    this.app.disable('x-powered-by');

    this.app.set('trust proxy', true);

    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
          ip: req.ip,
        }, 'HTTP request');
      });
      next();
    });
  }

  private setupRoutes(): void {
    this.app.get('/healthz', (_req: Request, res: Response) => {
      res.json({ ok: true, timestamp: new Date().toISOString() });
    });

    const apiKeyMiddleware = createApiKeyMiddleware(this.config, this.logger);
    const ipAllowlistMiddleware = createIpAllowlistMiddleware(this.config, this.logger);
    const rateLimiter = createRateLimiter(this.config, this.logger);

    this.app.post(
      '/mcp/sse',
      ipAllowlistMiddleware,
      apiKeyMiddleware,
      rateLimiter,
      (req: Request, res: Response) => {
        this.logger.info('New MCP SSE connection');
        this.handleMcpConnection(req, res);
      }
    );

    this.app.get(
      '/mcp/sse',
      ipAllowlistMiddleware,
      apiKeyMiddleware,
      rateLimiter,
      (req: Request, res: Response) => {
        this.logger.info('New MCP SSE connection (GET)');
        this.handleMcpConnection(req, res);
      }
    );

    this.app.use(createErrorHandler(this.logger));

    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  private async handleMcpConnection(req: Request, res: Response): Promise<void> {
    const transport = new SSEServerTransport('/mcp/message', res);
    const server = new Server(
      {
        name: 'beget-auth-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.begetTools.getToolDefinitions();
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema.shape as Record<string, unknown>,
        })),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.info({ tool: name }, 'Tool called');

      try {
        let result;

        switch (name) {
          case 'beget_auth_login':
            result = await this.begetTools.handleLogin(args as Parameters<typeof this.begetTools.handleLogin>[0]);
            break;
          case 'beget_auth_refresh':
            result = await this.begetTools.handleRefresh();
            break;
          case 'beget_auth_logout':
            result = await this.begetTools.handleLogout();
            break;
          case 'beget_auth_switch':
            result = await this.begetTools.handleSwitch(args as Parameters<typeof this.begetTools.handleSwitch>[0]);
            break;
          case 'beget_auth_key':
            result = await this.begetTools.handleGetKey();
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        this.logger.error({ error, tool: name }, 'Tool execution error');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                operation: name,
                token: null,
                error_code: 'EXCEPTION',
                requires_2fa: false,
                channel: null,
                raw: {
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    await server.connect(transport);

    req.on('close', () => {
      this.logger.info('MCP connection closed');
    });
  }

  async start(): Promise<void> {
    if (this.config.begetLogin && this.config.begetPassword) {
      this.logger.info('Auto-login enabled, attempting login...');
      try {
        const result = await this.begetTools.handleLogin({
          login: this.config.begetLogin,
          password: this.config.begetPassword,
          saveMe: true,
        });

        if (result.success) {
          this.logger.info('Auto-login successful');
        } else if (result.requires_2fa) {
          this.logger.warn({ channel: result.channel }, 'Auto-login requires 2FA - manual intervention needed');
        } else {
          this.logger.error({ error: result.error_code }, 'Auto-login failed');
        }
      } catch (error) {
        this.logger.error({ error }, 'Auto-login error');
      }
    }

    return new Promise((resolve) => {
      this.app.listen(this.config.port, '0.0.0.0', () => {
        this.logger.info({ port: this.config.port }, 'Server started');
        resolve();
      });
    });
  }
}
