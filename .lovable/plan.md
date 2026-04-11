

# Stripe Lessons Applied to Universal Connector

## Key Insights from Stripe's Evolution

Stripe's genius was three things: **7-line integration**, **one state machine for all payment methods**, and **progressive disclosure** (simple by default, powerful when needed). Their journey from `Charge` → `Sources` → `PaymentIntents` mirrors exactly what we've already done — collapsing multiple protocol-specific modules into one `translate → fetch → parse` pipeline.

But there are concrete lessons we haven't yet applied:

### What We Can Steal

1. **One-liner quickstart** — Stripe's `curl https://api.stripe.com/v1/charges -u sk_test -d amount=1000` is iconic. Our equivalent should be equally terse. Right now `connect/open` + `connect/call` is two steps. Stripe's first API was *one call*. We need an `execute` shorthand that auto-opens ephemeral connections.

2. **Idempotency keys** — Stripe uses `Idempotency-Key` headers so retries are safe. Our `execute()` pipeline has no idempotency. For IoT/MQTT/WebSocket this matters enormously.

3. **Webhook-style event streaming** — Stripe's webhook system (`stripe listen --forward-to`) lets devs react to async events. Our Universal Connector currently only does request/response. We need an `onEvent` subscription primitive for adapters that support push (WebSocket, MQTT, SSE).

4. **Error taxonomy** — Stripe has typed errors (`card_declined`, `insufficient_funds`, `rate_limit`). Our pipeline throws generic `Error`. Protocol adapters should return structured errors with codes the caller can switch on.

5. **Built-in test mode** — Stripe's `sk_test_` vs `sk_live_` prefix lets devs test without real transactions. We can add a `sandbox: true` flag to `ConnectionParams` that makes adapters return mock responses.

## Implementation Plan

### Step 1: Add `connect/execute` — The One-Liner (~20 lines in connector.ts)

A single bus call that combines open + call + close for stateless protocols:

```typescript
bus.call("connect/execute", {
  protocol: "graphql",
  endpoint: "https://api.example.com/graphql",
  auth: { type: "bearer", token: "..." },
  op: "query",
  params: { query: "{ users { id name } }" }
})
```

No connection management needed. Opens ephemeral connection, executes, returns result. Like Stripe's single `curl` call.

### Step 2: Add idempotency to the pipeline (~15 lines in connector.ts)

Add optional `idempotencyKey` to execute params. Cache results by key in a simple `Map<string, { result; expiry }>` with TTL. If the same key arrives again within TTL, return cached result without re-fetching.

### Step 3: Add `onEvent` to ProtocolAdapter interface (~10 lines in protocol-adapter.ts)

Optional method on adapters for push-based protocols:

```typescript
onEvent?(conn: Connection, handler: (event: unknown) => void): () => void;
```

WebSocket and MQTT adapters implement it. REST/GraphQL/S3/Neo4j don't — they're request/response only. The Universal Connector registers `connect/subscribe` on the bus.

### Step 4: Structured error responses (~20 lines in connector.ts)

Wrap pipeline errors in a typed `ConnectorError` with `code`, `protocol`, `retriable`, and `detail`. Each adapter's `parse()` can throw `ConnectorError` with protocol-specific codes (e.g. Neo4j's `Neo.ClientError.Statement.SyntaxError`).

### Step 5: Sandbox mode (~15 lines in connector.ts)

Add `sandbox?: boolean` to `ConnectionParams`. When true, `execute()` skips `runtime.fetch()` and returns the adapter's `translate()` output as a dry-run response — showing the developer exactly what *would* be sent. Zero-cost testing without a live endpoint.

## File Changes

| File | Change |
|------|--------|
| `bus/connector.ts` | Add `execute` shorthand, idempotency cache, sandbox mode, structured errors |
| `bus/connectors/protocol-adapter.ts` | Add `onEvent?` method, `ConnectorError` type |
| `bus/connectors/websocket.ts` | Implement `onEvent` |
| `bus/connectors/mqtt.ts` | Implement `onEvent` |
| `bus/index.ts` | Export `ConnectorError` |

~80 lines of new code total. Every addition follows the same pattern: pure functions, zero state leakage, protocol-agnostic pipeline.

## Why This Matters

Stripe's lesson isn't about payments — it's about **progressive disclosure of complexity**. The simplest path (`connect/execute`) is one call. Need persistence? Use `connect/open`. Need events? Add `onEvent`. Need safety? Add `idempotencyKey`. Need testing? Set `sandbox: true`. Each layer is opt-in, and the zero-config default just works.

