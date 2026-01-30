#!/usr/bin/env node

/**
 * Research Automation MCP Server
 * Entry point for the Model Context Protocol server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { logInfo, logError } from './utils/logger.js';
import { getConfigManager } from './core/ConfigManager.js';
import { getSessionManager } from './core/SessionManager.js';
import { getPluginRegistry } from './core/PluginRegistry.js';

// Import tool handlers
import { startResearch, startResearchSchema } from './mcp/tools/start-research.js';
import { searchSources, searchSourcesSchema } from './mcp/tools/search-sources.js';
import { getResearchStatus, getResearchStatusSchema } from './mcp/tools/get-research-status.js';
import { listSessions, listSessionsSchema } from './mcp/tools/list-sessions.js';

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'start_research',
    description: 'Start a new research session with automatic multi-source search, collection, and cross-verification',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The research topic or question',
        },
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional initial URLs to analyze (user-provided sources)',
        },
        depth: {
          type: 'string',
          enum: ['quick', 'standard', 'deep'],
          description: 'Verification depth: quick (5 rounds), standard (10 rounds), deep (15+ rounds)',
          default: 'standard',
        },
        storage: {
          type: 'string',
          enum: ['markdown', 'notion', 'json', 'html', 'confluence'],
          description: 'Storage provider for the final document',
          default: 'markdown',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'search_sources',
    description: 'Search for sources across multiple providers (web, academic, GitHub, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['web', 'academic', 'github', 'youtube', 'reddit'],
          },
          description: 'Search providers to use',
          default: ['web', 'academic'],
        },
        limit: {
          type: 'number',
          description: 'Maximum results per source',
          default: 10,
        },
        minRelevance: {
          type: 'number',
          description: 'Minimum relevance score (0-1)',
          default: 0.5,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_research_status',
    description: 'Get the current status of a research session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID to check',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'list_sessions',
    description: 'List all research sessions with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['initializing', 'searching', 'collecting', 'verifying', 'generating', 'saving', 'completed', 'failed'],
          description: 'Filter by status',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of sessions to return',
          default: 20,
        },
      },
    },
  },
];

/**
 * Initialize the MCP server
 */
async function initializeServer(): Promise<void> {
  logInfo('Initializing Research Automation MCP Server...');

  const configManager = getConfigManager();
  const sessionManager = getSessionManager();
  const pluginRegistry = getPluginRegistry();

  if (!process.env.ANTHROPIC_API_KEY) {
    logInfo('ANTHROPIC_API_KEY not set — verification features will be limited');
  }

  try {
    await configManager.loadConfig('storage-config');
    await configManager.loadConfig('search-providers');
    logInfo('Configuration loaded successfully');
  } catch (error) {
    logError('Failed to load configuration', error);
    throw error;
  }

  logInfo('Research Automation MCP Server initialized successfully', {
    configsLoaded: configManager.getLoadedConfigs(),
    activeSessions: sessionManager.getSessionCount(),
    registeredPlugins: pluginRegistry.count(),
  });
}

/**
 * Create and configure the MCP server
 */
async function main(): Promise<void> {
  try {
    await initializeServer();

    const server = new Server(
      {
        name: 'research-automation-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOLS,
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logInfo(`Tool called: ${name}`, { args });

      try {
        let result;

        switch (name) {
          case 'start_research':
            const startInput = startResearchSchema.parse(args);
            result = await startResearch(startInput);
            break;

          case 'search_sources':
            const searchInput = searchSourcesSchema.parse(args);
            result = await searchSources(searchInput);
            break;

          case 'get_research_status':
            const statusInput = getResearchStatusSchema.parse(args);
            result = await getResearchStatus(statusInput);
            break;

          case 'list_sessions':
            const listInput = listSessionsSchema.parse(args || {});
            result = await listSessions(listInput);
            break;

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: `Unknown tool: ${name}`,
                    availableTools: TOOLS.map(t => t.name),
                  }, null, 2),
                },
              ],
              isError: true,
            };
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
        logError(`Error executing tool '${name}'`, error);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: (error as Error).message,
                tool: name,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    logInfo('Research Automation MCP Server running on stdio');
  } catch (error) {
    logError('Fatal error starting server', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logInfo('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logInfo('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

main().catch((error) => {
  logError('Unhandled error in main', error);
  process.exit(1);
});
