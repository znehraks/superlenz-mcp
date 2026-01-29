# Contributing to Research Automation MCP

Thank you for your interest in contributing to the Research Automation MCP project!

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/yourusername/research-automation-mcp.git
   cd research-automation-mcp
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Making Changes

1. Make your changes in the `src/` directory
2. Follow the existing code style and TypeScript conventions
3. Write or update tests as needed
4. Update documentation if you're changing functionality

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run integration tests
npm run test:integration
```

### Code Quality

Before submitting a PR:

```bash
# Run linter
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Build the project
npm run build

# Verify all tests pass
npm test
```

## Code Standards

- **TypeScript**: Use TypeScript strict mode, leverage type safety
- **Testing**: Write tests for new features (target: 80%+ coverage for new code)
- **Documentation**: Update README.md and code comments as needed
- **Commits**: Use descriptive commit messages following conventional commits format
  - `feat: add new search provider`
  - `fix: resolve credibility calculation bug`
  - `docs: update API documentation`
  - `test: add tests for verification engine`

## Testing Guidelines

- Write unit tests for individual functions and classes
- Write integration tests for multi-component workflows
- Aim for high coverage on critical paths (verification, credibility scoring)
- Use meaningful test descriptions
- Mock external dependencies (APIs, file system, etc.)

## Pull Request Process

1. Ensure all tests pass and linting is clean
2. Update the CHANGELOG.md with your changes
3. Update documentation if needed
4. Push your branch and create a Pull Request
5. Describe your changes clearly in the PR description
6. Link any related issues

## Project Structure

```
src/
├── core/          # Core orchestration logic
├── verification/  # Cross-verification and credibility scoring
├── search/        # Search provider implementations
├── storage/       # Storage provider implementations
├── document/      # Document generation and formatting
├── citation/      # Citation management
├── utils/         # Shared utilities
└── index.ts       # MCP server entry point
```

## Questions or Issues?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing issues before creating new ones

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

Thank you for contributing! 🚀
