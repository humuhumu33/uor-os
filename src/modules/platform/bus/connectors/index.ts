/**
 * Universal Connector — Protocol Adapters.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Import this file to register all built-in protocol adapters.
 * Each adapter self-registers via registerAdapter() side-effect.
 * Adding a new protocol = adding one file + one import here.
 *
 * @version 2.0.0
 */

import "./rest";
import "./graphql";
import "./neo4j";
import "./s3";

// Re-export types for convenience
export type { ProtocolAdapter, Connection, ConnectionParams } from "./protocol-adapter";
