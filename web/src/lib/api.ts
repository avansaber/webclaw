import { getAccessToken, refreshAuth } from "./auth";
import type { UIDirectives } from "./ui-types";

const API_BASE = "/api/v1";

export interface Skill {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  tier?: number;
  tags?: string[];
  requires?: string[];
}

export interface ApiResponse {
  status: string;
  message?: string;
  _ui?: UIDirectives;
  [key: string]: unknown;
}

export async function fetchApi(
  path: string,
  options?: RequestInit
): Promise<ApiResponse> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // On 401: try refresh once, then retry
  if (res.status === 401 && token) {
    const refreshed = await refreshAuth();
    if (refreshed) {
      const newToken = getAccessToken();
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`;
        res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          credentials: "include",
        });
      }
    }
  }

  return res.json();
}

export async function getSkills(): Promise<Skill[]> {
  const data = await fetchApi("/schema/skills");
  return (data.skills as Skill[]) || [];
}

export async function executeAction(
  skill: string,
  action: string,
  params?: Record<string, string>
): Promise<ApiResponse> {
  const query = params
    ? "?" + new URLSearchParams(params).toString()
    : "";
  return fetchApi(`/${skill}/${action}${query}`);
}

export async function postAction(
  skill: string,
  action: string,
  body?: Record<string, unknown>
): Promise<ApiResponse> {
  return fetchApi(`/${skill}/${action}`, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

// ── Entity resolution (C1) ──────────────────────────────────────────────────

export interface EntityMatch {
  id: string;
  name: string;
  entity_type: string;
  confidence: number;
  source_detail: string;
  extra?: Record<string, unknown>;
}

export async function resolveEntity(
  query: string,
  entityType?: string,
  limit?: number,
): Promise<EntityMatch[]> {
  const body: Record<string, unknown> = { query };
  if (entityType) body.entity_type = entityType;
  if (limit) body.limit = limit;
  const data = await fetchApi("/chat/resolve-entity", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return (data.matches as EntityMatch[]) || [];
}

// ── Generic display helpers ─────────────────────────────────────────────────

// Detect common prefix across skill names and strip it for display
let _prefixCache: { prefix: string; skills: string[] } | null = null;

function findCommonPrefix(names: string[]): string {
  if (names.length < 2) return "";
  const first = names[0];
  const idx = first.indexOf("-");
  if (idx === -1) return "";
  const candidate = first.slice(0, idx + 1);
  if (names.every((n) => n.startsWith(candidate))) return candidate;
  return "";
}

export function skillDisplayName(name: string, allSkills?: Skill[]): string {
  // If we have the full skill list, detect and strip common prefix
  if (allSkills && allSkills.length > 0) {
    if (!_prefixCache || _prefixCache.skills.length !== allSkills.length) {
      _prefixCache = {
        prefix: findCommonPrefix(allSkills.map((s) => s.name)),
        skills: allSkills.map((s) => s.name),
      };
    }
    if (_prefixCache.prefix && name.startsWith(_prefixCache.prefix)) {
      name = name.slice(_prefixCache.prefix.length);
    } else if (!_prefixCache.prefix) {
      // Multi-suite mode: strip this skill's own suite prefix (e.g. "erpclaw-" from "erpclaw-gl")
      const idx = name.indexOf("-");
      if (idx > 0) {
        name = name.slice(idx + 1);
      }
    }
  } else {
    // Fallback: strip common ERP prefixes
    name = name.replace(/^erpclaw-/, "");
  }

  return name
    .split("-")
    .map((w) => {
      // Uppercase short acronyms (gl, hr, crm, ai)
      if (w.length <= 3) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// Categorize skills for sidebar navigation
export function categorizeSkills(skills: Skill[]): Record<string, Skill[]> {
  const cats: Record<string, Skill[]> = {};
  for (const s of skills) {
    const cat = s.category || "other";
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(s);
  }
  return cats;
}

// Known category display config (extensible — unknown categories auto-labeled)
export const CATEGORY_CONFIG: Record<
  string,
  { label: string; order: number }
> = {
  // ERP categories
  setup:         { label: "Setup",         order: 1 },
  accounting:    { label: "Accounting",    order: 2 },
  inventory:     { label: "Inventory",     order: 3 },
  selling:       { label: "Selling",       order: 4 },
  buying:        { label: "Buying",        order: 5 },
  manufacturing: { label: "Manufacturing", order: 6 },
  hr:            { label: "HR",            order: 7 },
  projects:      { label: "Projects",      order: 8 },
  crm:           { label: "CRM",           order: 9 },
  billing:       { label: "Billing",       order: 10 },
  support:       { label: "Support",       order: 11 },
  analytics:     { label: "Analytics",     order: 12 },
  // GRC / compliance categories
  compliance:    { label: "Compliance",    order: 13 },
  risk:          { label: "Risk",          order: 14 },
  audit:         { label: "Audit",         order: 15 },
  security:      { label: "Security",      order: 16 },
  governance:    { label: "Governance",    order: 17 },
  other:         { label: "Other",         order: 99 },
};

/** Get display label for any category (auto-capitalize unknown ones). */
export function categoryLabel(cat: string): string {
  return CATEGORY_CONFIG[cat]?.label ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

// ── Multi-suite sidebar helpers ─────────────────────────────────────────────

export interface SuiteGroup {
  prefix: string;
  label: string;
  skills: Skill[];
  categories: Record<string, Skill[]>;
}

const KNOWN_SUITE_NAMES: Record<string, string> = {
  erpclaw: "ERPClaw",
  auditclaw: "AuditClaw",
  webclaw: "Webclaw",
};

/** Extract suite prefix from skill name (everything before the first hyphen). */
function suitePrefix(name: string): string {
  const idx = name.indexOf("-");
  return idx > 0 ? name.slice(0, idx) : name;
}

/** Format a suite prefix into a display name. */
export function suiteDisplayName(prefix: string): string {
  if (KNOWN_SUITE_NAMES[prefix]) return KNOWN_SUITE_NAMES[prefix];
  // Capitalise first letter, append " App" if it's a single word
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

/**
 * Detect skill suites from installed skills.
 * Returns empty array if all skills share the same prefix (single suite mode).
 * In single-suite mode the sidebar uses flat category grouping instead.
 */
export function detectSuites(skills: Skill[]): SuiteGroup[] {
  const byPrefix: Record<string, Skill[]> = {};
  for (const s of skills) {
    const p = suitePrefix(s.name);
    if (!byPrefix[p]) byPrefix[p] = [];
    byPrefix[p].push(s);
  }

  const prefixes = Object.keys(byPrefix);
  // Single suite (or zero): use flat category view
  if (prefixes.length <= 1) return [];

  // Multiple suites: build grouped structure
  return prefixes
    .sort((a, b) => {
      // erpclaw first, then alphabetical
      if (a === "erpclaw") return -1;
      if (b === "erpclaw") return 1;
      return a.localeCompare(b);
    })
    .map((prefix) => ({
      prefix,
      label: suiteDisplayName(prefix),
      skills: byPrefix[prefix],
      categories: categorizeSkills(byPrefix[prefix]),
    }));
}
