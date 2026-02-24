# Solvix Release Notes

---

## v1.0.0-beta.1

### Core Features

- Advanced retry engine with backoff
- Circuit breaker implementation
- Rate limiter support
- Request deduplication
- Token refresh orchestrator (stampede-safe)
- Request dependency chains
- Snapshot debugging mode
- Profiling support
- ETag conditional requests
- Offline queue support
- Shadow mode execution
- Transport-agnostic architecture

---

### Performance

- Competitive with native fetch
- Competitive with Axios
- ~7.8KB gzip bundle size
- Memory stable under 10k requests
- Stampede protection verified (1000 concurrent)

---

### Security

- Header sanitization
- Body size guard
- Response size guard
- HTTPS enforcement
- Domain allowlist support

---

### Stability Tests

- Retry storm validated
- Token refresh stampede protection validated
- Dedupe under concurrency validated
- Memory stability verified

---

### Bundle

- index.js: 23KB
- gzip: 7.8KB

---

This is the first beta release of Solvix — production-ready architecture with room for ecosystem feedback.
