# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-29

### Added
- Initial release
- 10-round cross-verification system
- 5-factor credibility scoring (authority, consensus, recency, citations, consistency)
- 5-type conflict resolution (scope, temporal, source quality, statistical, methodological)
- Multi-source search capabilities (web search, academic search)
- Document generation with 4 templates (academic, executive, technical, general)
- Citation management supporting 5 styles (APA, MLA, Chicago, Harvard, IEEE)
- Markdown storage provider for research results
- 4 MCP tools: start_research, search_sources, get_research_status, list_sessions
- Session management with comprehensive tracking
- Rate limiting and error handling

### Known Limitations
- Test coverage at 1.66% (SessionManager only tested)
- Only Markdown storage implemented (Notion and Confluence providers pending)
- GitHub, YouTube, and Reddit search providers not yet implemented
- Production hardening (Phase 7) incomplete
- No performance benchmarking yet

### Security
- Input validation using Zod schemas
- Rate limiting with Bottleneck
- Error sanitization in responses

## [Unreleased]

### Planned
- NotionProvider implementation
- ConfluenceProvider implementation
- Comprehensive test suite (target: 80%+ coverage)
- Additional search providers (GitHub, YouTube, Reddit)
- Performance optimization
- Production monitoring and alerting
