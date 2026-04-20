<p align="center">
  <img src="assets/solvix-png.png" width="120" alt="Solvix Logo" />
</p>

<h1 align="center">Solvix</h1>

<p align="center">
  Resilient API Infrastructure for Modern Javascript Applications
</p>

<p align="center">
  Enterprise-Grade HTTP Orchestration Engine
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
  <img src="https://img.shields.io/badge/status-active%20development-16A34A?style=flat" alt="status" />
</p>

<p align="center">

<img src="https://img.shields.io/badge/Performance-~Equal%20to%20Fetch%20%26%20Axios-brightgreen" />
<img src="https://img.shields.io/badge/Bundle%20Size-7.8KB%20gzip-blue" />
<img src="https://img.shields.io/badge/Memory-Stable-success" />
<img src="https://img.shields.io/badge/Dedupe-Stampede%20Protected-purple" />
<img src="https://img.shields.io/badge/Token%20Refresh-Stampede%20Safe-orange" />
<img src="https://img.shields.io/badge/Retry%20Engine-Production%20Ready-9cf" />
<img src="https://img.shields.io/badge/Concurrency-Tested%201000%2B%20Requests-brightgreen" />
<img src="https://img.shields.io/badge/Runtime-Node%20%7C%20Browser%20%7C%20Edge-black" />

</p>

---

Solvix is a powerful HTTP orchestration layer designed for modern applications and enterprise systems.

It transforms simple API requests into secure, observable, resilient, and fully controlled execution pipelines.

Unlike traditional HTTP clients, Solvix not only send requests — it manages the entire lifecycle of network communication.

---

# The Problem Solvix Solves

In real-world applications, API communication is rarely simple.

Production systems require:

- Intelligent retry strategies
- Circuit breaking to prevent cascading failures
- Rate limiting to respect quotas
- Request prioritization
- Dependency coordination
- Production snapshot debugging
- Token refresh orchestration
- Offline handling (browser)
- Secure request enforcement
- Observability and profiling
- API migration shadow testing
- Transport flexibility

Most libraries leave these responsibilities to developers.

Solvix integrates them into a single cohesive orchestration engine.

---

# Solvix Performance & Benchmark Report

This section documents comprehensive benchmarking conducted against:

- **Native `fetch`**
- **Axios (latest)**
- **Solvix (current build)**

All results below are real measurements from controlled tests.

---

## Test Environment

| Property | Value |
|-----------|--------|
| Runtime | Node v24.12.0 |
| Benchmark Tool | tinybench |
| Duration per Test | 2 seconds |
| Timestamp Provider | `performance.now()` |
| Machine | macOS (local) |

---

# 1️⃣ Micro Overhead Benchmark  
### (Pure Internal Execution Cost — No Real Network)

## Goal
Measure internal client overhead without real network latency.

## Results

| Library | Mean Latency |
|----------|--------------|
| Native `fetch` | ~0.001 ms |
| Axios | ~0.007 ms |
| **Solvix** | ~0.021 ms |

## Analysis

Solvix adds approximately **0.02ms** of internal overhead due to:

- Context creation  
- Middleware pipeline  
- Timeline tracking  
- Retry engine wiring  
- Security checks  
- Snapshot support  

Relative overhead in a real-world request (~100ms network latency):

0.02 / 100 = 0.02%

## ✅ Conclusion

Solvix internal processing cost is **negligible** in real-world usage.

---

# 2️⃣ Real Network Benchmark (Small Payload)

## Endpoint Tested

https://jsonplaceholder.typicode.com/posts/1

## Mean Latency

| Library | Mean |
|----------|-------|
| Fetch | 117 ms |
| Axios | 99 ms |
| **Solvix** | 100 ms |

## Analysis

- Standard deviation ≈ 20–30 ms  
- Difference between Axios and Solvix ≈ 1 ms  
- Within statistical noise  

## ✅ Conclusion

Solvix performs **on par with Axios and fetch** under real-world network conditions.

---

# 3️⃣ Heavy Payload Benchmark (~50KB JSON)

## Endpoint Tested

https://jsonplaceholder.typicode.com/posts

## Mean Latency

| Library | Mean |
|----------|-------|
| Fetch | 92.6 ms |
| Axios | 92.1 ms |
| **Solvix** | 88.0 ms |

## Analysis

- Parsing overhead stable  
- Snapshot building did not slow execution  
- Profiling did not impact performance  
- No unnecessary JSON cloning  
- Memory remained stable  

## ✅ Conclusion

Solvix handles large JSON responses efficiently and safely.

---

# 4️⃣ Concurrency Stress Test  
### (100 Concurrent Requests)

## Goal
Evaluate:

- Queue scheduling  
- Promise handling  
- Memory pressure  
- Event loop impact  

## Result

- No crashes  
- No stalled promises  
- Stable latency  
- Memory stable across rounds  

## ✅ Conclusion

Solvix handles burst concurrency safely.

---

# 5️⃣ Retry Storm Benchmark

## Scenario

- 50 concurrent requests  
- Each fails twice  
- Succeeds on third attempt  
- Configuration: `retry: 2`

## Result

| Metric | Value |
|--------|--------|
| Mean Latency | ~607 ms |
| Relative Margin of Error | 0.29% |
| Standard Deviation | ~7 ms |

## Analysis

- No exponential explosion  
- No recursive loop  
- Backoff stable  
- No retry drift accumulation  
- Memory stable  

## ✅ Conclusion

Solvix retry engine is stable and production-safe under failure pressure.

---

# 6️⃣ Dedupe Stampede Protection  
### (1000 Concurrent Identical Calls)

## Scenario

- 1000 simultaneous identical requests  
- `dedupe: true` enabled  

## Result

Transport executed: 1

## Analysis

- Only one real transport execution  
- 999 requests reused the same Promise  
- Inflight registry cleared properly  
- No memory growth  

## ✅ Conclusion

Solvix prevents request stampedes — critical for high-scale applications.

---

# 7️⃣ Token Refresh Stampede Protection  
### (100 Concurrent 401 Responses)

## Scenario

- 100 concurrent requests  
- All return 401  
- All trigger refresh logic  
- Refresh delay simulated  

## Result

Refresh executed: 1

## Analysis

- Only one refresh call executed  
- All other requests waited  
- No recursive explosion  
- No race condition  
- Replay worked  
- Memory stable  

## ✅ Conclusion

Token refresh orchestration is enterprise-grade and safe under concurrency.

---

# 8️⃣ Memory Stability Test

## Test Method

- 10,000 requests per round  
- 3 consecutive rounds  

## Results

| Round | Start Heap | End Heap |
|--------|------------|-----------|
| Round 1 | 7.03 MB | 10.10 MB |
| Round 2 | 10.07 MB | 10.14 MB |
| Round 3 | 10.06 MB | 10.15 MB |

## Analysis

- Heap stabilizes after initial allocation  
- No incremental growth  
- No registry leaks  
- No inflight retention  

## ✅ Conclusion

Solvix demonstrates stable memory behavior.

---

# 9️⃣ Bundle Size Audit

## Build Output

index.js: 23 KB  
gzip size: 7.8 KB  

## Comparison

| Library | Gzip Size |
|----------|------------|
| Axios | ~18–20 KB |
| **Solvix** | ~7.8 KB |

## ✅ Conclusion

Solvix delivers advanced resilience features at less than half the bundle size of Axios.

---

# What These Benchmarks Demonstrate

Solvix provides:

- Competitive performance with fetch and Axios  
- Advanced resilience features  
- Zero stampede failures  
- Stable retry logic  
- Memory safety  
- Small bundle footprint  
- Production-ready architecture  

---

# Final Assessment

Based on the benchmarking results:

Solvix is:

- Performance competitive  
- Concurrency safe  
- Memory stable  
- Retry hardened  
- Stampede protected  
- Enterprise-ready  

Suitable for:

- Large-scale frontend applications  
- SaaS platforms  
- High-traffic dashboards  
- Enterprise systems  
- Multi-runtime environments (Node, Browser, Edge)


# Installation

```bash
npm install solvix
```

## pnpm

```bash
pnpm add solvix
```

## yarn

```bash
yarn add solvix
```

## bun

```bash
bun add solvix
```

---

# Quick Start

```ts
import { createClient } from "solvix";

const api = createClient({
  baseURL: "https://api.example.com",
});

const response = await api.get("/users");

console.log(response.data);
```

---

# Architecture Overview

Every request flows through a controlled pipeline:

1. Security Resolution
2. Request Group / Dependency Handling
3. Priority Queue Scheduling
4. Rate Limiting
5. Circuit Breaker Check
6. Retry Engine
7. Transport Execution
8. Response Parsing
9. Timeline Tracking
10. Snapshot & Profiling
11. Global Event Bus Emission

Solvix treats HTTP as infrastructure, not a utility.

---

# Intelligent Retry Engine

### What It Solves

Temporary failures, unstable networks, server errors.

### Features

- Exponential backoff
- Adaptive retry (based on network timing)
- Abort-aware delays
- Retry normalization

```ts
const api = createClient({
  retry: {
    retries: 3,
    factor: 2,
    minTimeout: 300,
    maxTimeout: 5000,
  },
});
```

---

# Circuit Breaker

Prevents overwhelming failing services.

```ts
const api = createClient({
  circuitBreaker: {
    failureThreshold: 5,
    failureRate: 0.5,
    rollingWindow: 10000,
    minimumRequests: 10,
    resetTimeout: 15000,
    halfOpenRequests: 2,
  },
});
```

---

# Rate Limiter (Token Bucket)

Prevents exceeding API quotas.

```ts
const api = createClient({
  rateLimit: {
    capacity: 10,
    refillRate: 5,
    interval: 1000,
  },
});
```

---

# Priority Queue

Control execution order and concurrency.

```ts
api.get("/background", { priority: 10 });
api.get("/critical", { priority: 1 });
```

Supports:

- Max concurrency
- Queue size control
- FIFO / priority strategy

---

# Timeline Tracking & Profiling

Understand exactly how requests behave in production.

```ts
const api = createClient({
  timeline: { enabled: true },
  profiling: { enabled: true },
});

const res = await api.get("/users");

console.log(res.meta.timeline);
console.log(res.meta.profile);
```

Tracks:

- created
- queued
- dequeued
- breakerCheck
- transportStart
- responseReceived
- parseStart
- parseEnd
- completed
- failed

---

# Snapshot Mode (Production Debugging)

Capture structured metadata for diagnostics.

```ts
const api = createClient({
  snapshot: { enabled: true },
});
```

Snapshot includes:

- URL
- method
- duration
- retries
- redacted headers
- timeline
- error details

Sensitive headers are automatically masked.

---

# Enterprise Security Layer

Multi-layer configurable protection.

```ts
const api = createClient({
  security: {
    enforceHttps: true,
    allowedMethods: ["GET", "POST"],
    allowedDomains: ["api.example.com"],
    maxBodySize: 1_000_000,
    sanitizeHeaders: true,
    strictMode: true,
  },
});
```

Security features include:

- HTTPS enforcement
- Domain restrictions
- Method restrictions
- Header sanitization
- Snapshot redaction
- Body size guards
- Strict security preset

---

# Request Groups

Abort multiple related requests together.

```ts
import { RequestGroup } from "solvix";

const group = new RequestGroup();

api.get("/a", { group });
api.get("/b", { group });

group.abort();
```

---

# Dependency Chains

Ensure ordered execution in complex flows.

```ts
await api.get("/auth", { id: "auth" });

await api.get("/profile", {
  dependsOn: ["auth"],
});
```

---

# Shadow Mode (Primary + Secondary APIs)

Safely test new APIs in production.

```ts
const api = createClient({
  shadow: {
    secondaryBaseURL: "https://new-api.example.com",
    compareResponse: true,
    onDifference(primary, secondary) {
      console.log("Response mismatch detected");
    },
  },
});
```

Shadow execution never blocks the primary response.

---

# Offline Queue (Browser)

Queue requests when offline and replay later.

```ts
const api = createClient({
  offlineQueue: { enabled: true },
});
```

---

# ETag / Conditional Requests

Supports conditional requests to reduce bandwidth usage.

---

# Automatic Token Refresh

Centralized refresh orchestration for expired authentication tokens.

---

# Global Event Bus

Observe request lifecycle globally.

```ts
import { SolvixBus } from "solvix";

SolvixBus.on("request:start", (event) => {
  console.log(event.context.url);
});
```

Events:

- request:start
- request:retry
- request:error
- request:complete
- request:shadowStart
- request:shadowComplete
- request:shadowDifference
- request:shadowError

---

# Transport-Agnostic Mode

Override transport layer (HTTP2, RPC, custom adapters).

```ts
const api = createClient({
  transport: async (ctx) => {
    // Custom implementation
  },
});
```

---

# Supported HTTP Methods

- GET
- POST
- PUT
- PATCH
- DELETE
- HEAD
- OPTIONS

---

# Roadmap

- OpenTelemetry integration
- Plugin ecosystem
- Advanced monitoring adapters
- Performance optimizations
- Observability dashboards

---

# 🤝 Contributing

We welcome:

- Feature proposals
- Architecture discussions
- Bug reports
- Security reviews
- Performance improvements

Infrastructure grows stronger through collaboration.

---

# 📄 License

MIT License

---

# Philosophy

HTTP should not be fragile.

Solvix transforms API communication into a reliable, observable, secure, and orchestrated execution system.

It is not just a client.

It is infrastructure.

# ❤️ Support Solvix

Solvix is an independent open-source infrastructure project.

If Solvix helps your organization or production systems, consider supporting its long-term development.

Your support helps:

- Maintain enterprise-grade stability
- Improve performance and security
- Expand documentation and tooling
- Build advanced observability integrations
- Sustain long-term ecosystem growth

## Sponsor via OpenCollective

<p>
  <a href="https://opencollective.com/solvix">
    <img src="https://opencollective.com/solvix/tiers/backer.svg?avatarHeight=36" />
  </a>
</p>

You can contribute as:

- Individual supporter
- Company sponsor
- Infrastructure backer
- Enterprise partner

---

Solvix is built for serious systems — and sustained by serious support.
