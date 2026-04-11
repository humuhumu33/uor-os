/**
 * Protocol Adapter — The Universal Translation Interface.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Every external protocol reduces to ONE function:
 *
 *   translate(op, params, conn) → { url, init }
 *
 * That's the entire interoperability contract. REST is the identity
 * function. GraphQL adds a body wrapper. Neo4j maps Cypher to HTTP.
 * S3 maps bucket/key to path segments. Same pattern, every protocol.
 *
 * A ProtocolAdapter is a pure, stateless, serializable object.
 * No classes. No side effects. No module-level variables.
 * Testable in isolation, portable across any runtime.
 *
 * @version 2.0.0
 */

// ── Core Types ────────────────────────────────────────────────────────────

/** An active connection to an external service. */
export interface Connection {
  /** Unique connection ID (user-assigned or auto-generated). */
  readonly id: string;
  /** Protocol adapter name (e.g. "neo4j", "graphql"). */
  readonly protocol: string;
  /** Base endpoint URL. */
  readonly endpoint: string;
  /** Authentication headers (injected into every request). */
  readonly auth: Record<string, string>;
  /** Protocol-specific config (database name, region, etc). */
  readonly config: Record<string, unknown>;
  /** Timestamp when connection was established. */
  readonly connectedAt: number;
}

/** Parameters needed to open a new connection. */
export interface ConnectionParams {
  /** Optional custom ID (defaults to protocol name). */
  id?: string;
  /** Protocol adapter name. */
  protocol: string;
  /** Base endpoint URL. */
  endpoint: string;
  /** Auth config — becomes headers. */
  auth?: {
    type: "bearer" | "basic" | "header" | "none";
    token?: string;
    username?: string;
    password?: string;
    headerName?: string;
    headerValue?: string;
  };
  /** Protocol-specific config passed through to the adapter. */
  config?: Record<string, unknown>;
}

/** The result of translate(): a fully-formed fetch request. */
export interface TranslatedRequest {
  url: string;
  init: RequestInit;
}

/**
 * Protocol Adapter — a pure, stateless translation layer.
 *
 * Converts logical operations into HTTP requests and parses responses.
 * No state, no side effects, no classes. Just functions and data.
 */
export interface ProtocolAdapter {
  /** Protocol identifier (e.g. "rest", "neo4j", "graphql", "s3"). */
  readonly name: string;
  /** Human-readable label. */
  readonly label: string;
  /** JSON Schema describing ConnectionParams.config for this protocol. */
  readonly configSchema?: Record<string, unknown>;

  /**
   * Translate a logical operation into an HTTP request.
   * This is the ONLY function that varies per protocol.
   */
  translate(op: string, params: Record<string, unknown>, conn: Connection): TranslatedRequest;

  /**
   * Parse an HTTP response back into domain data.
   * Default: JSON parse with error detection.
   */
  parse(response: Response, op: string): Promise<unknown>;

  /**
   * Generate a health-check request for this protocol.
   * Default: HEAD request to the endpoint.
   */
  ping?(conn: Connection): TranslatedRequest;

  /**
   * Operations this protocol supports (for introspection / OpenRPC).
   * Keys are operation names, values describe what they do.
   */
  readonly operations: Record<string, {
    description: string;
    paramsSchema?: Record<string, unknown>;
  }>;
}
