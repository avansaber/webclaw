/**
 * Entity routing utilities for webclaw v2.
 *
 * Maps between:
 *   - Entity URL slugs (e.g. "properties", "work-orders")
 *   - List action names (e.g. "list-properties", "list-work-orders")
 *   - UI.yaml entity keys (e.g. "propertyclaw_property", "propertyclaw_work_order")
 *
 * Slug convention: the slug IS the action name minus "list-" prefix.
 *   list-properties     → slug: properties
 *   list-work-orders    → slug: work-orders
 *   list-gl-entries     → slug: gl-entries
 */

import type { UIConfig, ActionMapEntry } from "./ui-yaml-types";

// ── Singularization ─────────────────────────────────────────────────────────

/**
 * Singularize a kebab-case plural word.
 * Only singularizes the LAST segment: "deal-stages" → "deal-stage"
 */
export function singularize(word: string): string {
  const parts = word.split("-");
  let last = parts[parts.length - 1];
  if (last.endsWith("ies") && last.length > 3) {
    last = last.slice(0, -3) + "y";
  } else if (last.endsWith("sses")) {
    last = last.slice(0, -2);
  } else if (
    last.endsWith("shes") ||
    last.endsWith("ches") ||
    last.endsWith("xes") ||
    last.endsWith("zes")
  ) {
    last = last.slice(0, -2);
  } else if (last.endsWith("s") && !last.endsWith("ss")) {
    last = last.slice(0, -1);
  }
  parts[parts.length - 1] = last;
  return parts.join("-");
}

// ── Slug ↔ Action mapping ────────────────────────────────────────────────────

/** list-properties → properties */
export function slugFromListAction(listAction: string): string {
  return listAction.replace(/^list-/, "");
}

/** properties → list-properties */
export function listActionFromSlug(slug: string): string {
  return `list-${slug}`;
}

/** list-properties → add-property (singular) */
export function deriveAddAction(listAction: string, availableActions?: string[]): string | null {
  const plural = listAction.replace(/^list-/, "");
  const singular = singularize(plural);
  const addCandidate = `add-${singular}`;
  const createCandidate = `create-${singular}`;
  if (availableActions) {
    if (availableActions.includes(addCandidate)) return addCandidate;
    if (availableActions.includes(createCandidate)) return createCandidate;
    return null;
  }
  return addCandidate;
}

/** list-properties → get-property (singular) */
export function deriveGetAction(listAction: string, availableActions?: string[]): string | null {
  const plural = listAction.replace(/^list-/, "");
  const singular = singularize(plural);
  const getCandidate = `get-${singular}`;
  if (availableActions) {
    return availableActions.includes(getCandidate) ? getCandidate : null;
  }
  return getCandidate;
}

// ── Entity key resolution ────────────────────────────────────────────────────

/**
 * Given a URL slug and UIConfig, find the entity key.
 * slug "properties" → list action "list-properties" → action_map lookup → entity key "propertyclaw_property"
 */
export function entityKeyFromSlug(slug: string, uiConfig: UIConfig | null): string | null {
  if (!uiConfig) return null;
  const listAction = listActionFromSlug(slug);
  const entry = uiConfig.action_map?.[listAction];
  return entry?.entity || null;
}

/**
 * Given a UI.yaml entity key, find its URL slug.
 * entity key "propertyclaw_property" → find list action that maps to it → extract slug
 */
export function slugFromEntityKey(entityKey: string, uiConfig: UIConfig): string | null {
  for (const [action, entry] of Object.entries(uiConfig.action_map || {})) {
    if (action.startsWith("list-") && entry.entity === entityKey) {
      return slugFromListAction(action);
    }
  }
  return null;
}

/**
 * Get entity label for display (e.g. "Properties", "Work Orders")
 */
export function entityLabel(slug: string, uiConfig: UIConfig | null): string {
  if (uiConfig) {
    const key = entityKeyFromSlug(slug, uiConfig);
    if (key && uiConfig.entities?.[key]) {
      return uiConfig.entities[key].label_plural || uiConfig.entities[key].label;
    }
  }
  // Fallback: slug "work-orders" → "Work Orders"
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── ID parameter helpers ─────────────────────────────────────────────────────

/**
 * Derive the entity-specific ID parameter name from a slug (kebab-case).
 * The API gateway converts param keys directly to CLI flags (--{key}),
 * so we must use kebab-case to match skill conventions.
 * "properties" → "property-id", "work-orders" → "work-order-id"
 */
export function entityIdParam(slug: string): string {
  return `${singularize(slug)}-id`;
}

/**
 * Build query string with both generic `id` and entity-specific ID params.
 * Supports both ERPClaw (uses `--id`) and PropertyClaw (uses `--property-id`) conventions.
 */
export function buildIdQuery(slug: string, id: string): string {
  const encoded = encodeURIComponent(id);
  const param = entityIdParam(slug);
  if (param === "id") return `id=${encoded}`;
  return `id=${encoded}&${param}=${encoded}`;
}

/**
 * Build payload object with both `id` and entity-specific ID fields.
 */
export function buildIdPayload(slug: string, id: string): Record<string, string> {
  const param = entityIdParam(slug);
  if (param === "id") return { id };
  return { id, [param]: id };
}

// ── URL builders ─────────────────────────────────────────────────────────────

export function getSkillDashboardUrl(skill: string): string {
  return `/skills/${skill}`;
}

export function getEntityListUrl(skill: string, slug: string): string {
  return `/skills/${skill}/${slug}`;
}

export function getEntityNewUrl(skill: string, slug: string): string {
  return `/skills/${skill}/${slug}/new`;
}

export function getEntityDetailUrl(skill: string, slug: string, id: string): string {
  return `/skills/${skill}/${slug}/${encodeURIComponent(id)}`;
}

export function getEntityEditUrl(skill: string, slug: string, id: string): string {
  return `/skills/${skill}/${slug}/${encodeURIComponent(id)}/edit`;
}

export function getActionRunnerUrl(skill: string, action?: string): string {
  const base = `/skills/${skill}/actions`;
  return action ? `${base}?action=${action}` : base;
}

// ── Old URL → New URL migration ──────────────────────────────────────────────

/**
 * Convert old ?action= query param URLs to new path-based URLs.
 * Returns the new path, or null if no redirect needed.
 */
export function migrateActionUrl(
  skillPath: string,
  searchParams: URLSearchParams,
): string | null {
  const action = searchParams.get("action");
  if (!action) return null;

  const id = searchParams.get("id") || searchParams.get("name");

  if (action.startsWith("list-")) {
    const slug = slugFromListAction(action);
    // Preserve other params (e.g. status=active)
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("action");
    newParams.delete("id");
    newParams.delete("name");
    const qs = newParams.toString();
    return `${skillPath}/${slug}${qs ? `?${qs}` : ""}`;
  }

  if (action.startsWith("add-") || action.startsWith("create-")) {
    // Derive entity slug from add/create action
    const entityPart = action.replace(/^(add|create)-/, "");
    // Pluralize: property → properties, work-order → work-orders
    const slug = entityPart.endsWith("y")
      ? entityPart.slice(0, -1) + "ies"
      : entityPart.endsWith("s") || entityPart.endsWith("x") || entityPart.endsWith("ch") || entityPart.endsWith("sh")
        ? entityPart + "es"
        : entityPart + "s";
    // Preserve any pre-fill params
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("action");
    const qs = newParams.toString();
    return `${skillPath}/${slug}/new${qs ? `?${qs}` : ""}`;
  }

  if (action.startsWith("get-") && id) {
    const entityPart = action.replace(/^get-/, "");
    const slug = entityPart.endsWith("y")
      ? entityPart.slice(0, -1) + "ies"
      : entityPart.endsWith("s") || entityPart.endsWith("x") || entityPart.endsWith("ch") || entityPart.endsWith("sh")
        ? entityPart + "es"
        : entityPart + "s";
    return `${skillPath}/${slug}/${encodeURIComponent(id)}`;
  }

  // Other actions (submit-*, cancel-*, etc) → action runner
  return `${skillPath}/actions?action=${action}`;
}
