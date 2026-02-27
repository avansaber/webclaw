// ── Response Introspection ──────────────────────────────────────────────────
// Layer 2: Runtime schema discovery by calling list-* actions and analyzing
// the JSON response structure. Discovers actual column types, smart list
// columns, and entity key names.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntrospectedColumn {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "date" | "datetime" | "boolean" | "badge" | "id";
  hidden: boolean; // Should hide from list view
}

export interface IntrospectedSchema {
  entityKey: string; // The array key in the response (e.g., "resources", "bookings")
  columns: IntrospectedColumn[];
  listColumns: string[]; // Smart selection for data table (visible, ordered)
  idColumn: string;
  statusColumn?: string;
  cachedAt: number;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const cache = new Map<string, IntrospectedSchema>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const pendingRequests = new Map<string, Promise<IntrospectedSchema | null>>();

// ── Column type inference from values ─────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const CURRENCY_RE = /^-?\d+\.\d{2}$/;

// Columns that should always be hidden in list views
const HIDDEN_COLUMNS = new Set([
  "id", "created_at", "updated_at", "created_by", "updated_by",
  "modified_at", "modified_by", "company_id", "docstatus",
]);

// Column name suffixes that indicate IDs (hidden in list)
const ID_SUFFIXES = ["_id"];

// Status-like column names
const STATUS_COLUMNS = new Set(["status", "docstatus", "state", "stage"]);

// Badge-worthy short string columns (enum-like)
const BADGE_COLUMNS = new Set([
  "status", "state", "type", "resource_type", "category", "purpose",
  "priority", "severity", "stage",
]);

function kebabToTitle(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function inferColumnType(
  key: string,
  value: unknown
): IntrospectedColumn["type"] {
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "string") {
    if (UUID_RE.test(value)) return "id";
    if (ISO_DATETIME_RE.test(value)) return "datetime";
    if (ISO_DATE_RE.test(value)) return "date";
    if (CURRENCY_RE.test(value)) return "currency";
    // Short string that looks like an enum
    if (BADGE_COLUMNS.has(key) && value.length < 30 && !value.includes(" ")) {
      return "badge";
    }
  }
  // Integer 0/1 with boolean-like name
  if (
    (value === 0 || value === 1) &&
    (key.startsWith("is_") || key.startsWith("has_") || key.startsWith("enable_"))
  ) {
    return "boolean";
  }
  return "text";
}

function shouldHideColumn(key: string): boolean {
  if (HIDDEN_COLUMNS.has(key)) return true;
  if (ID_SUFFIXES.some((suffix) => key.endsWith(suffix))) return true;
  return false;
}

// ── Smart list column selection ──────────────────────────────────────────────

function selectSmartColumns(columns: IntrospectedColumn[]): string[] {
  const visible = columns.filter((c) => !c.hidden);
  if (visible.length === 0) return [];

  // Priority scoring
  const scored = visible.map((col) => {
    let score = 0;
    // Name/title column = highest priority
    if (col.key === "name" || col.key === "title") score += 100;
    // Status = always include
    if (STATUS_COLUMNS.has(col.key)) score += 90;
    // Badges (enum-like) are informative
    if (col.type === "badge") score += 70;
    // Currency = informative
    if (col.type === "currency") score += 60;
    // Numbers = useful
    if (col.type === "number") score += 50;
    // Dates
    if (col.type === "date") score += 40;
    // Boolean
    if (col.type === "boolean") score += 30;
    // Text (generic)
    if (col.type === "text") score += 20;
    return { key: col.key, score };
  });

  // Sort by score descending, take top 7
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 7).map((s) => s.key);
}

// ── Main introspection function ──────────────────────────────────────────────

export async function introspectEntity(
  skill: string,
  listAction: string
): Promise<IntrospectedSchema | null> {
  const cacheKey = `${skill}/${listAction}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached;
  }

  // Deduplicate concurrent requests
  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const promise = _doIntrospect(skill, listAction, cacheKey);
  pendingRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

async function _doIntrospect(
  skill: string,
  listAction: string,
  cacheKey: string
): Promise<IntrospectedSchema | null> {
  try {
    const res = await fetch(`/api/v1/${skill}/${listAction}?limit=5`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== "ok") return null;

    // Find the array key in the response (skip "status", "count", etc.)
    const arrayKey = Object.keys(json).find(
      (k) =>
        Array.isArray(json[k]) &&
        !["tags", "requires", "status"].includes(k)
    );
    if (!arrayKey) return null;

    const rows = json[arrayKey] as Record<string, unknown>[];
    if (rows.length === 0) return null;

    // Use first row to infer column types
    const firstRow = rows[0];
    const columns: IntrospectedColumn[] = [];
    let idColumn = "id";
    let statusColumn: string | undefined;

    for (const [key, value] of Object.entries(firstRow)) {
      const colType = inferColumnType(key, value);
      const hidden = shouldHideColumn(key) || colType === "id";

      columns.push({
        key,
        label: kebabToTitle(key),
        type: colType,
        hidden,
      });

      if (colType === "id" && key === "id") idColumn = key;
      if (STATUS_COLUMNS.has(key)) statusColumn = key;
    }

    const listColumns = selectSmartColumns(columns);

    const schema: IntrospectedSchema = {
      entityKey: arrayKey,
      columns,
      listColumns,
      idColumn,
      statusColumn,
      cachedAt: Date.now(),
    };

    cache.set(cacheKey, schema);
    return schema;
  } catch {
    return null;
  }
}

// ── Cache management ─────────────────────────────────────────────────────────

export function clearIntrospectionCache(skill?: string) {
  if (skill) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${skill}/`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}
