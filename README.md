# SuperLenz

> *Lenz — from Latin "lenticula" (lens). A super-powered lens that magnifies the truth.*
> SuperLenz searches multiple sources, cross-verifies every claim through 10+ rounds, and delivers only credible, validated research.

**High-credibility research automation with multi-source cross-verification (10+ rounds)**

A Model Context Protocol (MCP) server that automates research tasks with a focus on credibility and accuracy. It performs automatic searching, collection, cross-verification (10+ rounds), and saves results to your preferred storage (Notion, Confluence, Markdown, etc.).

## Features

- **Multi-Source Search**: Web search (Brave, Exa), academic papers (arXiv, Semantic Scholar), GitHub, and more
- **10-Round Cross-Verification**: Rigorous fact-checking with conflict detection and resolution
- **Credibility Scoring**: Authority assessment, temporal validation, statistical analysis
- **Flexible Storage**: Markdown (default), Notion, Confluence, Obsidian, JSON
- **Plugin Architecture**: Extensible storage and search providers
- **Conflict Resolution**: Automatic detection and resolution of conflicting information

## Core Value Proposition

**Trustworthy Documentation** through:
- Multi-source cross-verification (10+ rounds)
- Source authority evaluation
- Conflict detection and resolution
- Comprehensive citation management

## Requirements

- Node.js >= 18.0.0
- Any MCP-compatible client (Claude Code, Cursor, Windsurf, etc.)

## Installation

```bash
# Install from npm
npm install superlenz

# Or install globally
npm install -g superlenz

# Or clone from source
git clone https://github.com/znehraks/superlenz.git
cd superlenz

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env

# Build the project
npm run build
```

## Configuration

### Environment Variables

Edit `.env` file:

```bash
# Search APIs (at least one required)
BRAVE_SEARCH_API_KEY=your_key_here
EXA_API_KEY=your_key_here
GITHUB_TOKEN=your_token_here

# AI API (required for verification)
ANTHROPIC_API_KEY=your_key_here

# Storage (optional, based on your needs)
NOTION_ACCESS_TOKEN=your_token_here
NOTION_DATABASE_ID=your_database_id_here

# Confluence (optional)
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_EMAIL=your.email@example.com
CONFLUENCE_API_TOKEN=your_token_here
CONFLUENCE_SPACE_KEY=YOUR_SPACE
```

### Storage Configuration

Edit `config/storage-config.json` to configure storage providers. Markdown is enabled by default.

### MCP Server Registration

Add to your MCP client settings (e.g. `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "superlenz": {
      "command": "node",
      "args": ["/absolute/path/to/superlenz/dist/index.js"],
      "env": {
        "BRAVE_SEARCH_API_KEY": "${BRAVE_SEARCH_API_KEY}",
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
        "NOTION_ACCESS_TOKEN": "${NOTION_ACCESS_TOKEN}"
      }
    }
  }
}
```

## Usage

### Basic Research

```
User: Research "Google Stitch vs Figma Code Connect"

SuperLenz will:
1. Start research session
2. Search multiple sources
3. Cross-verify information (10 rounds)
4. Generate comprehensive document
5. Save to Markdown (default) or your chosen storage
```

### URL-Based Research

```
User: Research these URLs:
- https://github.com/figma/code-connect
- https://developers.figma.com/docs/code-connect/

SuperLenz will prioritize user-provided URLs and supplement with additional sources.
```

### Specify Storage

```
User: Research "wedding costs in Korea 2025" and save to Notion

SuperLenz will use Notion as the storage provider instead of the default Markdown.
```

## MCP Tools

### `start_research`

Start a new research session.

**Input:**
- `topic` (string): Research topic
- `urls` (string[], optional): Initial URLs to analyze
- `depth` ("quick" | "standard" | "deep"): Verification depth
- `storage` ("markdown" | "notion" | "json" | "html"): Storage provider

**Output:**
- `sessionId`: Unique session identifier
- `status`: Current status

### `get_research_status`

Get the status of a research session.

**Input:**
- `sessionId` (string): Session ID

**Output:**
- Current progress, verification rounds, conflicts found, etc.

### `cross_verify`

Perform cross-verification on claims.

**Input:**
- `sessionId` (string): Session ID
- `claims` (Claim[]): Claims to verify
- `minVerifications` (number): Minimum verification rounds (default: 10)

**Output:**
- Verified claims with confidence scores
- Detected conflicts
- Resolution strategies

### `save_to_storage`

Save research results to storage.

**Input:**
- `sessionId` (string): Session ID
- `storage` (string): Storage provider name
- `destination` (string): File path or page ID
- `metadata`: Document metadata (title, tags, category)

**Output:**
- Save result with destination URL

## Architecture

```
┌─────────────────────────────────────┐
│    MCP Tools (8 tools)              │
├─────────────────────────────────────┤
│    Core Modules                     │
│    • ResearchOrchestrator           │
│    • VerificationEngine             │
│    • StorageManager                 │
│    • PluginRegistry                 │
├─────────────────────────────────────┤
│    Plugin Layer                     │
│    • Storage Providers              │
│    • Search Providers               │
│    • Verification Providers         │
└─────────────────────────────────────┘
```

## 10-Round Verification Process

1. **Round 1-4**: Multi-source collection (web, academic, user URLs)
2. **Round 5**: Temporal verification (recency, time-series)
3. **Round 6**: Statistical cross-verification (CV < 0.5)
4. **Round 7**: Scope analysis (data range differences)
5. **Round 8**: Conflict resolution (5 types)
6. **Round 9**: Expert verification
7. **Round 10**: Final consensus building

**Early Exit Conditions:**
- Credibility score >= 0.85
- Minimum 6 rounds completed
- Minimum 5 sources verified
- Agreement rate >= 0.80

## Credibility Scoring

- **Source Credibility (40%)**: Academic papers (0.9-1.0), Official docs (0.85-0.95), News (0.7-0.85)
- **Cross-Verification Agreement (30%)**: Consistency across sources
- **Recency (15%)**: Half-life decay model
- **Citation Count (10%)**: Academic citation metrics
- **Expert Verification (5%)**: Industry expert opinions

## Storage Providers

### Markdown (Priority 1, Default)
- Local filesystem
- YAML frontmatter
- Image support

### Notion (Priority 2)
- Uses existing Notion MCP
- Database integration
- Rich text support

### Confluence (Priority 3)
- REST API integration
- CQL search
- Space management

### Obsidian (Priority 2.5)
- Vault structure
- Wiki-links and tags
- Daily note format

### Fallback Strategy
```
1st attempt: Specified storage (3 retries)
2nd attempt: Priority-based fallback
    • Markdown (most stable)
    • Notion (MCP available)
    • JSON (backup)
```

## Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Watch mode
npm run test:watch
```

## Development

```bash
# Development mode with auto-rebuild
npm run dev

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

## Roadmap

### Phase 1: Infrastructure (Complete)
- Core modules (types, config, sessions, plugins)
- Configuration management
- Plugin registry
- Utilities (logger, cache, rate limiter)

### Phase 2: Search & Collection (Complete)
- Multi-source search providers
- Web scraping with Crawlee
- Content extraction

### Phase 3: Verification Engine (Complete)
- 10-round verification pipeline
- Conflict detection and resolution
- Credibility scoring

### Phase 4: Storage Plugins (In Progress)
- 4 storage providers
- Fallback strategy
- Image handling

### Phase 5: Document Generation (Complete)
- Template system
- Citation management
- MCP tool implementation

### Phase 6: Orchestration (Complete)
- Full workflow integration
- Error recovery
- Progress tracking

### Phase 7: Testing & Documentation (Upcoming)
- Comprehensive test suite
- User documentation
- Production ready

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and workflow.

## License

MIT

## Acknowledgments

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Anthropic Claude API](https://www.anthropic.com/)
- [Crawlee](https://github.com/apify/crawlee)
- Many other excellent open-source libraries

---

**Status**: Phase 7 upcoming — Testing & Documentation
