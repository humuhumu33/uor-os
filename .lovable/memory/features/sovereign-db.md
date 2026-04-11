---
name: SovereignDB product API
description: Unified hypergraph database facade — SovereignDB.open(), addEdge, query builder, transactions, schema constraints, indexes, IO adapters (JSON-LD/CSV/NQuads/Cypher), Neo4j interop
type: feature
---
SovereignDB is the product name for the sovereign hypergraph database.
Entry point: `sovereign-db.ts` → `SovereignDB.open("name")`.
Modules: query-builder.ts, transaction.ts, schema-constraints.ts, index-manager.ts, io-adapters.ts.
Neo4j interop: binary edges map 1:1; n-ary edges use star expansion with hub nodes.
Export formats: JSON-LD, N-Quads, CSV, Cypher.
All 19 unit tests pass in `__tests__/sovereign-db.test.ts`.
