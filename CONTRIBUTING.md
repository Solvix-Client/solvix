# Contributing to Solvix

Thanks for considering contributing to Solvix. This guide covers the basics.

## Quick Start

```bash
git clone https://github.com/Solvix-Client/solvix.git
cd solvix
npm install
npm run build
npx vitest run
```

## Development Flow

1. **Branch** — work on the `dev` branch or a feature branch off it
2. **Code** — follow the existing conventions (relative imports, no external deps)
3. **Test** — `npx vitest` for watch mode, `npx vitest run` for one-shot
4. **Typecheck** — `npm run typecheck` before committing
5. **Build** — `npm run build` to verify the output
6. **Benchmark** — `npm run bench:all` if your change affects performance

## Pull Request Guidelines

- Keep PRs focused on one concern. Split large changes into multiple PRs.
- Add tests for new features or bug fixes.
- Add JSDoc for any new public API surface.
- Run the full test suite before submitting.
- If your change adds or modifies behavior, include a changeset:
  ```bash
  npx changeset
  ```
  Follow the prompts to describe your change. Commit the generated markdown file.

## Code Style

- TypeScript strict mode. All code must compile with `tsc --noEmit`.
- Prefer `const` over `let`. Prefer `let` over mutable object patterns.
- Feature options should be opt-in (disabled by default).
- No external runtime dependencies. devDependencies only.
- Relative imports only (no path aliases in source).

## Project Structure

```
src/
├── core/          # Main client, middleware, context, transport
├── resilience/    # Circuit breaker, rate limiter, priority queue
├── security/      # Header sanitization, size guards, redaction
├── store/         # Cache, ETag, inflight, offline queue, cookie jar
├── streaming/     # SSE, JSON Lines, raw stream handling
├── parsing/       # Safe JSON response parsing
├── node/          # Node.js-specific features (proxy, TLS)
└── utils/         # URL resolution, hashing, fingerprinting, profiling
```

## Testing

- Tests live in `tests/` using Vitest.
- Mock `global.fetch` for HTTP-level tests.
- Test both the feature module directly and through `createClient()`.
- Edge cases matter: disabled features, partial configs, error paths.

## Questions?

Open a discussion or issue. Infrastructure grows stronger through collaboration.
