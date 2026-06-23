---
name: Bug Report
about: Report a behavior that doesn't match expectations
title: ""
labels: bug
assignees: ""
---

**Describe the bug**
A clear and concise description of what the bug is.

**Minimal reproduction**

```ts
import { createClient } from "@adityadev13/solvix";

// Code that reproduces the issue
const client = createClient({ baseURL: "https://api.example.com" });
const res = await client.get("/test");
console.log(res);
```

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened (error message, wrong response, crash, etc.).

**Environment**

- Runtime: Node.js / Browser / Deno / Bun (specify version)
- Solvix version:
- `undici` version (if using proxy/TLS features):

**Additional context**
Logs, screenshots, or anything else relevant.
