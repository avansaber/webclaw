/* Context resolution and composition types — Sprint C1 */

export interface ResolvedField {
  field: string;
  value: unknown;
  confidence: number; // 0.0–1.0
  source: "explicit" | "conversation" | "session" | "history" | "default" | "inference";
  source_detail: string;
  alternatives?: unknown[];
}

export interface CompositionResult {
  action: string;
  resolved_fields: ResolvedField[];
  unresolved_fields: string[];
  summary: string;
  show_full_form: boolean;
}

export interface EntityMatch {
  id: string;
  name: string;
  entity_type: string;
  confidence: number;
  source_detail: string;
}

export interface ResolvedEntity {
  entity_type: string;
  query: string;
  match: EntityMatch | null;
  alternatives: EntityMatch[];
  resolved_at: string;
}

export interface ResolutionLogEntry {
  field: string;
  resolved_value: unknown;
  confidence: number;
  source: ResolvedField["source"];
  source_detail: string;
  timestamp: string;
}
