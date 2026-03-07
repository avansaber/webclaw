// ── Child Table Schema Hook ──────────────────────────────────────────────────
// Fetches child table metadata from the backend introspection endpoint.
// Used by auto-form-spec.ts (L1 path) to render repeatable row sections
// for child tables instead of raw JSON textareas.

import { useState, useEffect } from "react";
import type { FieldType } from "./form-spec";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChildTableField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: string;
  min?: number;
  step?: number;
  entity_action?: string;
  entity_skill?: string;
  entity_value_field?: string;
  entity_display_field?: string;
}

export interface ChildTableInfo {
  table: string;
  param_name: string;
  fields: ChildTableField[];
}

export interface ChildTableSchema {
  skill: string;
  child_tables: Record<string, ChildTableInfo[]>; // keyed by parent entity
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: ChildTableSchema; fetchedAt: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchChildTableSchema(
  skill: string
): Promise<ChildTableSchema | null> {
  const cached = cache.get(skill);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  try {
    const res = await fetch(`/api/v1/schema/child-tables/${skill}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== "ok") return null;
    const data: ChildTableSchema = {
      skill: json.skill,
      child_tables: json.child_tables || {},
    };
    cache.set(skill, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChildTableSchema(skill: string) {
  const [schema, setSchema] = useState<ChildTableSchema | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const cached = cache.get(skill);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setSchema(cached.data);
      setLoading(false);
      return;
    }
    fetchChildTableSchema(skill).then((s) => {
      setSchema(s);
      setLoading(false);
    });
  }, [skill]);

  return { schema, loading };
}
