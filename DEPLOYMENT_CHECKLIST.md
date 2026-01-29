# NPM Deployment Checklist

**Quick reference for deployment readiness**

## ✅ Completed (Phases 1-3)

- [x] LICENSE file created (MIT)
- [x] .npmignore file created
- [x] CHANGELOG.md created
- [x] CONTRIBUTING.md created
- [x] package.json metadata updated (author, repository, bugs, homepage, files)
- [x] ESLint v9 configuration created
- [x] README.md placeholders removed
- [x] Build passes: `npm run build`
- [x] Tests pass: `npm test` (5/5)
- [x] Lint passes: `npm run lint` (0 errors)
- [x] Package verified: `npm pack --dry-run`

## 🔴 Critical - Must Complete Before Publishing

- [ ] **Test Coverage**: Increase from 1.66% to 60%+
  - [ ] VerificationEngine tests (target: 80%+)
  - [ ] CredibilityCalculator tests (target: 80%+)
  - [ ] ConflictResolver tests (target: 80%+)
  - [ ] ResearchOrchestrator tests (target: 70%+)
  - [ ] DocumentGenerator tests (target: 60%+)
  - [ ] CitationManager tests (target: 60%+)

- [ ] **GitHub Repository**:
  - [ ] Create repository at GitHub
  - [ ] Update package.json repository URL
  - [ ] Update package.json bugs URL
  - [ ] Update package.json homepage URL
  - [ ] Update README.md clone URL
  - [ ] Push code to repository

- [ ] **Final Verification**:
  - [ ] Run `npm run build` - must pass
  - [ ] Run `npm test` - all tests pass
  - [ ] Run `npm run test:coverage` - verify 60%+ coverage
  - [ ] Run `npm run lint` - 0 errors (warnings OK)
  - [ ] Run `npm audit` - check for vulnerabilities
  - [ ] Run `npm pack` - test package creation
  - [ ] Test local installation

## 🟡 Recommended Before Publishing

- [ ] Add GitHub Actions CI/CD workflow
- [ ] Add integration tests
- [ ] Add E2E tests
- [ ] Add issue templates (.github/ISSUE_TEMPLATE/)
- [ ] Add PR template (.github/pull_request_template.md)
- [ ] Performance benchmarking
- [ ] Security review
- [ ] Reduce dependencies from 48 to <40 if possible

## 📦 Alpha Release Checklist

When critical items are complete, publish alpha:

- [ ] Update version: `npm version 0.1.0-alpha.1`
- [ ] Login to npm: `npm login`
- [ ] Publish: `npm publish --tag alpha`
- [ ] Test install: `npm install research-automation-mcp@alpha`
- [ ] Gather user feedback
- [ ] Fix reported issues

## 🚀 Stable Release Checklist

After alpha testing is successful:

- [ ] Address all alpha feedback
- [ ] Final test suite run
- [ ] Update CHANGELOG.md with any changes
- [ ] Update version: `npm version 0.1.0`
- [ ] Create git tag: `git tag v0.1.0`
- [ ] Push tag: `git push origin v0.1.0`
- [ ] Publish: `npm publish`
- [ ] Create GitHub release with CHANGELOG content
- [ ] Announce release

## 🔍 Quick Verification Commands

```bash
# Before each publish attempt, run all of these:
npm run build           # Must pass
npm test                # All tests must pass
npm run test:coverage   # Check coverage percentage
npm run lint            # Must have 0 errors
npm audit               # Check for vulnerabilities
npm pack --dry-run      # Verify package contents

# Test local installation
npm pack
npm install -g ./research-automation-mcp-0.1.0.tgz
# Test that it works
npm uninstall -g research-automation-mcp
```

## 📊 Current Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Test Coverage | 1.66% | 60%+ | 🔴 |
| Build | ✅ Pass | ✅ Pass | ✅ |
| Lint | ✅ Pass | ✅ Pass | ✅ |
| Tests | 5/5 | All pass | ✅ |
| Package Size | 87.4 kB | <100 kB | ✅ |
| Files | 106 | Minimal | ✅ |

## ⏱️ Estimated Timeline

- Week 1-2: Write core verification tests
- Week 3: Write orchestration tests
- Week 4: Integration tests + GitHub setup
- Week 5: Alpha release + testing
- Week 6+: Stable release

**Total**: 4-6 weeks to stable release

---

**Last Updated**: 2026-01-29
**Status**: Phase 1-3 Complete, Phase 4 (Testing) Required
