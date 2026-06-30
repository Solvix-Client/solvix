<p align="center">
  <img src="assets/solvix-png.png" width="120" alt="Solvix Logo" />
</p>

<h1 align="center">Solvix</h1>

<p align="center">
  Enterprise-Grade HTTP Orchestration Engine for Modern JavaScript
</p>

<p align="center">
  Resilience • Security • Observability • Control
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@adityadev13/solvix?style=flat&color=2563EB" alt="npm version" />
  <img src="https://img.shields.io/npm/l/@adityadev13/solvix?style=flat&color=14B8A6" alt="license" />
  <img src="https://img.shields.io/npm/types/@adityadev13/solvix?style=flat&color=9333EA" alt="typescript support" />
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-0EA5E9?style=flat" alt="node version" />
  <img src="https://img.shields.io/badge/security-enterprise--grade-DC2626?style=flat" alt="security" />
  <img src="https://img.shields.io/badge/Bundle-33KB%20ESM-16A34A?style=flat" alt="bundle size" />
  <img src="https://img.shields.io/badge/Tests-171%20passing-9333EA?style=flat" alt="tests" />
</p>

---

**Solvix is an HTTP orchestration engine** — not just a client. It transforms simple API requests into secure, observable, resilient, and fully controlled execution pipelines.

Unlike traditional HTTP clients (Axios, Got, SuperAgent) that leave resilience, security, and observability to the developer, Solvix bakes ~50 features into a single 33 KB package.

---

## Why Solvix?

| Feature | Solvix | Axios | Got |
|---------|--------|-------|-----|
| Security (CRLF protection, size guards, method allowlisting, HTTPS enforcement, header sanitization) | ✅ **12 features** | ❌ Cookie/XSS only | ❌ Basic |
| Circuit Breaker | ✅ Built-in | ❌ | ❌ |
| Rate Limiter (token bucket + adaptive from headers) | ✅ Built-in | ❌ | ❌ |
| Request Deduplication | ✅ Built-in | ❌ | ❌ |
| Priority Queue with concurrency control | ✅ Built-in | ❌ | ❌ |
| SSE / JSON Lines streaming | ✅ Built-in | ❌ | ❌ |
| W3C Distributed Tracing | ✅ Built-in | ❌ | ❌ |
| Health Checks | ✅ Built-in | ❌ | ❌ |
| Correlation IDs | ✅ Built-in | ❌ | ❌ |
| Structured Logging | ✅ Built-in | ❌ | ❌ |
| Metrics (counters + histograms) | ✅ Built-in | ❌ | ❌ |
| Request Timeline & Profiling | ✅ Built-in | ❌ | ❌ |
| Snapshot Debugging | ✅ Built-in | ❌ | ❌ |
| Shadow Mode (dual API testing) | ✅ Built-in | ❌ | ❌ |
| Offline Queue | ✅ Built-in | ❌ | ❌ |
| Token Refresh (stampede-safe) | ✅ Built-in | ❌ | ❌ |
| CSRF Protection | ✅ Built-in | ❌ | ❌ |
| Cookie Jar | ✅ Built-in | ❌ | ❌ |
| ETag / Conditional Requests | ✅ Built-in | ❌ | ❌ |
| Fallback URLs | ✅ Built-in | ❌ | ❌ |
| Upload/Download Progress | ✅ Built-in | ✅ | ✅ |
| Custom Middleware | ✅ `client.use()` | ✅ Interceptors | ❌ |
| SSL/TLS Customization | ✅ (via undici) | ✅ | ✅ |
| HTTP Proxy | ✅ (via undici) | ✅ | ✅ |
| **Bundle Size** | **33 KB** | ~52 KB | ~42 KB |

---

## Quick Start

```bash
npm install @adityadev13/solvix
```

```ts
import { createClient } from "@adityadev13/solvix";

const api = createClient({ baseURL: "https://api.example.com" });

const res = await api.get("/users");
console.log(res.data);        // parsed JSON
console.log(res.status);      // 200
console.log(res.meta);        // timing, timeline, profiling
```

---

## Core Features

### 🛡️ Security

```ts
const api = createClient({
  security: {
    enforceHTTPS: true,
    allowedDomains: ["api.example.com"],
    allowedMethods: ["GET", "POST"],
    maxBodySize: 1_000_000,
    maxResponseSize: 10_000_000,
  },
  csrf: { enabled: true },               // Auto-inject CSRF token from cookie
  tls: { rejectUnauthorized: false },     // Self-signed certs (Node.js)
  proxy: { host: "gateway.corp.com", port: 8080 }, // Corporate proxy
});
```

- CRLF injection protection (always on)
- Forbidden header stripping (`Host`, `Connection`, `Content-Length`)
- Insecure header stripping (`Authorization`, `Cookie`, `X-Api-Key`)
- Snapshot redaction (passwords masked in debug output)
- Domain whitelisting, method allowlisting, size guards

### ⚡ Resilience

```ts
const api = createClient({
  retry: { retries: 3, factor: 2, jitter: true },
  circuitBreaker: { failureThreshold: 5, rollingWindow: 10000 },
  rateLimit: { capacity: 10, refillRate: 5, interval: 1000 },
  dedupe: true,                           // 1000 identical calls → 1 network request
  fallbackURLs: ["https://backup.example.com"],
  maxConcurrency: 50,
});
```

- Retry with exponential backoff, jitter, and adaptive timing
- Circuit breaker per-host with half-open probes
- Token bucket rate limiter with server-side header sync
- Priority queue with concurrency control and drop strategies
- Automatic deduplication via SHA-256 fingerprinting

### 🔍 Observability

```ts
const api = createClient({
  timeline: { enabled: true },
  profiling: { enabled: true },
  correlation: { enabled: true },
  tracing: { enabled: true },
  logger: console,
  metrics: { enabled: true },
  healthCheck: { enabled: true, endpoint: "/health" },
});

// Events — subscribe globally
import { SolvixBus } from "@adityadev13/solvix";
SolvixBus.on("request:complete", (e) => {
  console.log(`${e.context.url} → ${e.context.response?.status}`);
});

// Metrics — aggregate counters
const m = api.metrics();
console.log(m.totalRequests, m.successCount, m.failureCount, m.durationHistogram);

// Health — check backend status
console.log(api.healthCheck?.isHealthy());
```

- 15-stage request timeline with microsecond precision
- Profile metrics: queue wait, rate limit wait, network, parse, total time
- W3C `traceparent` header for distributed tracing
- Correlation IDs (`X-Request-ID`) in every log line
- Duration histogram with configurable buckets
- Periodic health endpoint pinging with status change callbacks

### 📦 Data Handling

```ts
// Streaming (SSE / JSON Lines)
for await (const event of api.get("/events", { sse: true })) {
  console.log(event.data);
}

// Upload progress
const api = createClient({
  hooks: {
    onUploadProgress: ({ loaded, total }) => console.log(`${loaded}/${total}`),
    onDownloadProgress: ({ percent }) => updateProgressBar(percent ?? 0),
  },
});

// Custom response validation
const api = createClient({
  validateResponse: (data) => {
    if (!data.id) throw new Error("Missing id");
    return data as MyType;
  },
});

// Custom params format
const api = createClient({
  paramsSerializer: (params) =>
    `https://api.example.com/search?${Object.entries(params).map(([k, v]) => `${k}[]=${v}`).join("&")}`,
});
```

- Body types: json, form, multipart, text, blob, arrayBuffer, raw
- Response types: json, text, blob, arrayBuffer, formData, stream, raw
- Transform pipeline: `transformRequest` → `buildRequestBody` → transport → `parseResponse` → `transformResponse` → `validateResponse`
- SSE parsing, JSON Lines (NDJSON), raw stream iteration
- Upload/download progress via ReadableStream counting

### 🔄 Middleware

```ts
const api = createClient({ baseURL: "https://api.example.com" });

api.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`${ctx.url} took ${Date.now() - start}ms`);
});
```

Custom middleware runs in the request pipeline before the transport layer. Compose multiple middleware in order (onion model).

---

## Architecture

Every request flows through a controlled pipeline:

```
Security Checks → Query Params → Fingerprinting → Dedup/Cache Check
→ Dependency Wait → Priority Queue → Rate Limiter → Circuit Breaker
→ Retry Loop (sanitize → build body → middleware stack → parse)
→ Validation → Caching → Events → Logging → Response
```

All stages are opt-in. Nothing runs unless configured.

---

## Documentation

For full documentation, API reference, and advanced guides:

- **Detailed Docs** — [solvix-client.github.io/solvix-docs](https://solvix-client.github.io/solvix-docs/)
- **API Reference** — Full JSDoc available in-editor via TypeScript declarations
- **Benchmarks** — Run `npm run bench:all` locally to see performance on your hardware

---

## Supported Runtimes

- Node.js 18+
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Deno, Bun
- Edge runtimes (Cloudflare Workers, Vercel Edge)

---

## Installation

```bash
npm install @adityadev13/solvix
pnpm add @adityadev13/solvix
yarn add @adityadev13/solvix
bun add @adityadev13/solvix
```

---

## License

MIT

---

## Contributing

We welcome feature proposals, bug reports, security reviews, and performance improvements.

Solvix transforms API communication into a reliable, observable, secure, and orchestrated execution system. It is not just a client — it is infrastructure.

## ❤️ Sponsor

If Solvix has helped you build better applications, please consider supporting its development.

Your sponsorship helps fund:

- 🚀 New features
- 🐛 Bug fixes
- 📚 Documentation
- ⚡ Performance improvements
- 🧪 Testing & CI
- 🔒 Long-term maintenance

👉 **Sponsor Solvix:** [Buy Me a Coffee](https://buymeacoffee.com/solvix)

Every contribution helps keep Solvix free and open source.
