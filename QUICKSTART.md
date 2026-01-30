# Quick Start Guide

## Prerequisites

- Node.js >= 18.0.0
- npm
- Claude Code (or any MCP-compatible client)

## Installation

```bash
cd /Users/youjungmin/research/research-automation-mcp

# Dependencies are already installed
# If needed: npm install

# Build the project
npm run build
```

## Configuration

1. **Create environment file**:
```bash
cp .env.example .env
```

2. **Edit `.env` with your API keys** (all optional):
```bash
# Optional – enables LLM-based verification (rounds 9-10)
ANTHROPIC_API_KEY=your_anthropic_key_here

# Optional – enables additional search providers
BRAVE_SEARCH_API_KEY=your_brave_key_here
EXA_API_KEY=your_exa_key_here
GITHUB_TOKEN=your_github_token_here
```

3. **Register with Claude Code**:

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "research-automation": {
      "command": "node",
      "args": ["/Users/youjungmin/research/research-automation-mcp/dist/index.js"]
    }
  }
}
```

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Development

```bash
# Start development mode (auto-rebuild on changes)
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

## Current Status

**Phase 1: Infrastructure - In Progress**

### ✅ What Works Now

- Configuration management system
- Session lifecycle management
- Plugin registry system
- Logging, caching, rate limiting utilities
- Input validation
- MCP server structure
- `list_sessions` tool

### 🚧 Coming Soon

- Phase 2: Search & collection modules (Weeks 3-4)
- Phase 3: 10-round verification engine (Weeks 5-7)
- Phase 4: Storage plugins (Weeks 8-9)
- Phase 5-6: Document generation & full integration (Weeks 10-12)
- Phase 7: Production-ready (Week 13)

## Testing the MCP Server

Once registered with Claude Code, you can test:

```
User: List all research sessions

Claude: (will call list_sessions tool and show results)
```

Currently implemented tools:
- `list_sessions`: List all research sessions with filtering

Coming soon:
- `start_research`: Start new research session
- `get_research_status`: Get session status
- `search_sources`: Search multiple sources
- `cross_verify`: Perform 10-round verification
- `generate_document`: Generate research document
- `save_to_storage`: Save to Markdown/Notion/etc.
- `export_research`: Export session data

## Project Structure

```
research-automation-mcp/
├── src/
│   ├── core/              # Core modules (types, config, sessions, plugins)
│   ├── utils/             # Utilities (logger, cache, rate limiter, validator)
│   ├── search/            # Search providers (coming in Phase 2)
│   ├── verification/      # Verification engine (coming in Phase 3)
│   ├── storage/           # Storage plugins (coming in Phase 4)
│   ├── generation/        # Document generation (coming in Phase 5)
│   └── index.ts           # MCP server entry point
├── config/
│   ├── storage-config.json
│   └── search-providers.json
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── dist/                  # Compiled JavaScript (generated)
```

## Troubleshooting

### Build Errors

```bash
# Clean build
rm -rf dist/
npm run build
```

### Test Failures

```bash
# Run with verbose output
npm test -- --reporter=verbose
```

### MCP Server Not Connecting

1. Check `~/.claude/settings.json` paths
2. Verify build is successful: `npm run build`
3. Check environment variables in .env
4. Restart Claude Code

## Next Steps

1. **For Users**: Wait for Phase 2-7 implementations
2. **For Developers**:
   - Review `STATUS.md` for current progress
   - Check `README.md` for architecture details
   - See plan in conversation history for implementation roadmap

## Support

- Issues: Open an issue in the GitHub repository
- Documentation: See `README.md` and `STATUS.md`
- Architecture: See `ARCHITECTURE.md` (coming soon)

---

**Last Updated**: 2026-01-29
**Version**: 0.1.0
**Phase**: 1 (Infrastructure) - 40% Complete
