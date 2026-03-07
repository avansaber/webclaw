// ── Param Schema Fetcher ────────────────────────────────────────────────────
// Client-side hook to load action parameter metadata parsed from SKILL.md body.
// Used by auto-form-spec.ts to generate FormSpecs for skills without UI.yaml.

import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParamField {
  name: string;
  label: string;
  type: "text" | "number" | "currency" | "date" | "time" | "textarea" | "select" | "entity-lookup" | "boolean" | "json" | "email" | "phone";
  required: boolean;
  default?: string;
  step?: number;
  description?: string;
  options?: { label: string; value: string }[];
  lookup_action?: string;
  lookup_skill?: string;
}

export interface ActionParamSchema {
  action_type: string;
  entity_group?: string;
  description?: string;
  required: ParamField[];
  optional: ParamField[];
}

export interface EntityGroup {
  name: string;
  actions: string[];
}

export interface ParamSchema {
  skill: string;
  schema_source: string;
  actions: Record<string, ActionParamSchema>;
  entity_groups: EntityGroup[];
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: ParamSchema; fetchedAt: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchParamSchema(skill: string): Promise<ParamSchema | null> {
  const cached = cache.get(skill);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  try {
    const res = await fetch(`/api/v1/schema/params/${skill}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== "ok") return null;
    const data: ParamSchema = {
      skill: json.skill,
      schema_source: json.schema_source,
      actions: json.actions,
      entity_groups: json.entity_groups,
    };
    cache.set(skill, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useParamSchema(skill: string) {
  const [schema, setSchema] = useState<ParamSchema | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const cached = cache.get(skill);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setSchema(cached.data);
      setLoading(false);
      return;
    }
    fetchParamSchema(skill).then((s) => {
      setSchema(s);
      setLoading(false);
    });
  }, [skill]);

  return { schema, loading };
}
