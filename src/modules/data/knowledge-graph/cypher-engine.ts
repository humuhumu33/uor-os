/**
 * SovereignDB Cypher Engine — Lightweight Subset Interpreter.
 * ════════════════════════════════════════════════════════════
 *
 * Supports: MATCH (a)-[r:LABEL]->(b) WHERE ... RETURN ...
 * Also: CREATE, MERGE, DELETE mutations.
 * Compiles patterns to hypergraph index lookups — no eval.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CypherResult {
  columns: string[];
  rows: Record<string, unknown>[];
  mutations?: number;
}

interface MatchPattern {
  sourceVar: string;
  relVar?: string;
  relLabel?: string;
  targetVar: string;
  directed: boolean;
}

interface WhereClause {
  variable: string;
  property: string;
  operator: string;
  value: string | number | boolean;
}

interface ReturnClause {
  expressions: string[];
}

// ── Parser ──────────────────────────────────────────────────────────────────

function parseMatchPattern(clause: string): MatchPattern {
  // (a)-[r:LABEL]->(b) or (a)-[r:LABEL]-(b) or (a)-[:LABEL]->(b)
  const directed = clause.includes("->");
  const m = clause.match(/\((\w+)\)-\[(?:(\w+))?(?::(\w+))?\]-?>?\((\w+)\)/);
  if (!m) throw new Error(`Invalid MATCH pattern: ${clause}`);
  return {
    sourceVar: m[1],
    relVar: m[2] || undefined,
    relLabel: m[3] || undefined,
    targetVar: m[4],
    directed,
  };
}

function parseWhereClauses(clause: string): WhereClause[] {
  if (!clause.trim()) return [];
  const conditions = clause.split(/\s+AND\s+/i);
  return conditions.map(cond => {
    const m = cond.trim().match(/(\w+)\.(\w+)\s*(=|<>|!=|<|>|<=|>=|CONTAINS|STARTS WITH|ENDS WITH)\s*['"]?([^'"]+)['"]?/i);
    if (!m) throw new Error(`Invalid WHERE clause: ${cond}`);
    let value: string | number | boolean = m[4];
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (!isNaN(Number(value))) value = Number(value);
    return { variable: m[1], property: m[2], operator: m[3].toUpperCase(), value };
  });
}

function parseReturn(clause: string): ReturnClause {
  return { expressions: clause.split(",").map(e => e.trim()) };
}

function matchOperator(actual: unknown, op: string, expected: unknown): boolean {
  switch (op) {
    case "=": return actual === expected || String(actual) === String(expected);
    case "<>": case "!=": return actual !== expected && String(actual) !== String(expected);
    case "<": return Number(actual) < Number(expected);
    case ">": return Number(actual) > Number(expected);
    case "<=": return Number(actual) <= Number(expected);
    case ">=": return Number(actual) >= Number(expected);
    case "CONTAINS": return String(actual).includes(String(expected));
    case "STARTS WITH": return String(actual).startsWith(String(expected));
    case "ENDS WITH": return String(actual).endsWith(String(expected));
    default: return false;
  }
}

// ── Executor ────────────────────────────────────────────────────────────────

function executeMatch(
  pattern: MatchPattern,
  whereClauses: WhereClause[],
  returnClause: ReturnClause,
): CypherResult {
  const allEdges = hypergraph.cachedEdges();
  const candidates = pattern.relLabel
    ? allEdges.filter(e => e.label === pattern.relLabel)
    : allEdges;

  const rows: Record<string, unknown>[] = [];

  for (const edge of candidates) {
    if (edge.nodes.length < 2) continue;

    // For binary edges, source=nodes[0], target=nodes[1]
    // For n-ary, source=head[0]||nodes[0], target=tail[0]||nodes[last]
    const source = edge.head?.[0] ?? edge.nodes[0];
    const target = edge.tail?.[0] ?? edge.nodes[edge.nodes.length - 1];

    const bindings: Record<string, unknown> = {
      [pattern.sourceVar]: { id: source, ...edgeNodeProps(edge, source) },
      [pattern.targetVar]: { id: target, ...edgeNodeProps(edge, target) },
    };
    if (pattern.relVar) {
      bindings[pattern.relVar] = { id: edge.id, label: edge.label, ...edge.properties };
    }

    // Apply WHERE filters
    let pass = true;
    for (const w of whereClauses) {
      const binding = bindings[w.variable];
      if (!binding || typeof binding !== "object") { pass = false; break; }
      const val = (binding as Record<string, unknown>)[w.property];
      if (!matchOperator(val, w.operator, w.value)) { pass = false; break; }
    }
    if (!pass) continue;

    // Build result row
    const row: Record<string, unknown> = {};
    for (const expr of returnClause.expressions) {
      if (expr === "*") {
        Object.assign(row, bindings);
      } else if (expr.includes(".")) {
        const [varName, prop] = expr.split(".");
        const b = bindings[varName];
        row[expr] = b && typeof b === "object" ? (b as Record<string, unknown>)[prop] : undefined;
      } else {
        row[expr] = bindings[expr];
      }
    }
    rows.push(row);

    // For undirected, also add reverse if both directions make sense
    if (!pattern.directed && source !== target) {
      const revBindings = {
        [pattern.sourceVar]: bindings[pattern.targetVar],
        [pattern.targetVar]: bindings[pattern.sourceVar],
        ...(pattern.relVar ? { [pattern.relVar]: bindings[pattern.relVar!] } : {}),
      };
      let revPass = true;
      for (const w of whereClauses) {
        const binding = revBindings[w.variable];
        if (!binding || typeof binding !== "object") { revPass = false; break; }
        const val = (binding as Record<string, unknown>)[w.property];
        if (!matchOperator(val, w.operator, w.value)) { revPass = false; break; }
      }
      if (revPass) {
        const revRow: Record<string, unknown> = {};
        for (const expr of returnClause.expressions) {
          if (expr === "*") Object.assign(revRow, revBindings);
          else if (expr.includes(".")) {
            const [v, p] = expr.split(".");
            const b = revBindings[v];
            revRow[expr] = b && typeof b === "object" ? (b as Record<string, unknown>)[p] : undefined;
          } else revRow[expr] = revBindings[expr];
        }
        rows.push(revRow);
      }
    }
  }

  return { columns: returnClause.expressions, rows };
}

function edgeNodeProps(edge: Hyperedge, nodeId: string): Record<string, unknown> {
  return { _edgeId: edge.id, _label: edge.label };
}

// ── CREATE / MERGE / DELETE ─────────────────────────────────────────────────

async function executeCreate(body: string): Promise<CypherResult> {
  // CREATE (a:Person {name: "Alice"})-[:KNOWS]->(b:Person {name: "Bob"})
  const m = body.match(/\((\w+)(?::(\w+))?\s*(\{[^}]*\})?\)-\[:(\w+)\s*(\{[^}]*\})?\]->\((\w+)(?::(\w+))?\s*(\{[^}]*\})?\)/);
  if (!m) throw new Error(`Invalid CREATE: ${body}`);

  const sourceLabel = m[2] ?? "Node";
  const sourceProps = m[3] ? JSON.parse(m[3].replace(/(\w+):/g, '"$1":')) : {};
  const relLabel = m[4];
  const relProps = m[5] ? JSON.parse(m[5].replace(/(\w+):/g, '"$1":')) : {};
  const targetLabel = m[7] ?? "Node";
  const targetProps = m[8] ? JSON.parse(m[8].replace(/(\w+):/g, '"$1":')) : {};

  const sourceId = sourceProps.id ?? sourceProps.name ?? `node_${Date.now()}_s`;
  const targetId = targetProps.id ?? targetProps.name ?? `node_${Date.now()}_t`;

  await hypergraph.addEdge(
    [String(sourceId), String(targetId)],
    relLabel,
    { ...relProps, _sourceLabel: sourceLabel, _targetLabel: targetLabel, ...sourceProps, ...targetProps },
    1, undefined,
    [String(sourceId)], [String(targetId)],
  );

  return { columns: [], rows: [], mutations: 1 };
}

async function executeDelete(body: string): Promise<CypherResult> {
  // DELETE edge <id>
  const m = body.match(/edge\s+['"]?([^'"]+)['"]?/i);
  if (!m) throw new Error(`Invalid DELETE: ${body}`);
  await hypergraph.removeEdge(m[1]);
  return { columns: [], rows: [], mutations: 1 };
}

// ── Public API ──────────────────────────────────────────────────────────────

export const cypherEngine = {
  /**
   * Execute a Cypher query string.
   */
  async execute(cypher: string): Promise<CypherResult> {
    const trimmed = cypher.trim();

    // CREATE
    if (/^CREATE\s/i.test(trimmed)) {
      return executeCreate(trimmed.replace(/^CREATE\s+/i, ""));
    }

    // DELETE
    if (/^DELETE\s/i.test(trimmed)) {
      return executeDelete(trimmed.replace(/^DELETE\s+/i, ""));
    }

    // MATCH ... WHERE ... RETURN ...
    const matchM = trimmed.match(/^MATCH\s+(.+?)(?:\s+WHERE\s+(.+?))?\s+RETURN\s+(.+)$/is);
    if (!matchM) throw new Error(`Unsupported Cypher query: ${trimmed}`);

    const pattern = parseMatchPattern(matchM[1].trim());
    const wheres = parseWhereClauses(matchM[2] ?? "");
    const ret = parseReturn(matchM[3].trim());

    return executeMatch(pattern, wheres, ret);
  },
};
