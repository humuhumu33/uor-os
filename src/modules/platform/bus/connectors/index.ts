/**
 * Universal Connectors — Barrel Export.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Import this file to register all built-in connectors on the bus.
 * Each connector self-registers via registerConnector() side-effect.
 *
 * @version 1.0.0
 */

import "./rest";
import "./graphql";
import "./neo4j";
import "./s3";
