/**
 * SovereignDB Schema Constraints — Lightweight Property Validation.
 * ══════════════════════════════════════════════════════════════════
 *
 * Optional schema enforcement on hyperedge labels.
 * Validates on write — not a DDL language, just guard rails.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

export type PropertyType = "string" | "number" | "boolean" | "object" | "array";

export interface PropertyConstraint {
  type: PropertyType;
  required?: boolean;
  /** For numbers: minimum value */
  min?: number;
  /** For numbers: maximum value */
  max?: number;
  /** For strings: regex pattern */
  pattern?: string;
  /** Enforce uniqueness across all edges of the same label */
  unique?: boolean;
}

export interface SchemaDefinition {
  /** Label this schema applies to */
  label: string;
  /** Property constraints */
  properties: Record<string, PropertyConstraint>;
  /** Minimum arity (default 2) */
  minArity?: number;
  /** Maximum arity (undefined = unlimited) */
  maxArity?: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

// ── Schema Registry ─────────────────────────────────────────────────────────

const schemas = new Map<string, SchemaDefinition>();

export const schemaRegistry = {
  /** Register a schema for a label. */
  register(label: string, schema: SchemaDefinition): void {
    schemas.set(label, { ...schema, label });
  },

  /** Get schema for a label. */
  get(label: string): SchemaDefinition | undefined {
    return schemas.get(label);
  },

  /** Remove a schema. */
  remove(label: string): boolean {
    return schemas.delete(label);
  },

  /** Get all registered schemas. */
  all(): Map<string, SchemaDefinition> {
    return new Map(schemas);
  },

  /**
   * Validate properties against a registered schema.
   * @param existingEdges — pass existing edges of same label for uniqueness checks.
   */
  validate(label: string, properties: Record<string, unknown>, existingEdges?: Array<Record<string, unknown>>): ValidationError[] {
    const schema = schemas.get(label);
    if (!schema) return [];

    const errors: ValidationError[] = [];

    for (const [key, constraint] of Object.entries(schema.properties)) {
      const val = properties[key];

      if (constraint.required && (val === undefined || val === null)) {
        errors.push({ field: key, message: `"${key}" is required` });
        continue;
      }

      if (val === undefined || val === null) continue;

      // Type check
      const actualType = Array.isArray(val) ? "array" : typeof val;
      if (actualType !== constraint.type) {
        errors.push({ field: key, message: `"${key}" must be ${constraint.type}, got ${actualType}` });
        continue;
      }

      // Numeric range
      if (constraint.type === "number" && typeof val === "number") {
        if (constraint.min !== undefined && val < constraint.min) {
          errors.push({ field: key, message: `"${key}" must be >= ${constraint.min}` });
        }
        if (constraint.max !== undefined && val > constraint.max) {
          errors.push({ field: key, message: `"${key}" must be <= ${constraint.max}` });
        }
      }

      // String pattern
      if (constraint.type === "string" && typeof val === "string" && constraint.pattern) {
        if (!new RegExp(constraint.pattern).test(val)) {
          errors.push({ field: key, message: `"${key}" must match pattern ${constraint.pattern}` });
        }
      }

      // Uniqueness check
      if (constraint.unique && existingEdges) {
        const duplicate = existingEdges.some(e => e[key] === val);
        if (duplicate) {
          errors.push({ field: key, message: `"${key}" must be unique — value "${val}" already exists` });
        }
      }
    }

    return errors;
  },

  /** Clear all schemas. */
  clear(): void {
    schemas.clear();
  },
};
