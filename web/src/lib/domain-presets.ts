/**
 * AURA Layer 2: Profile-based domain filtering for ERPClaw sidebar.
 *
 * Maps adaptive profile keys → visible ERPClaw domain keys.
 * Vertical skills (healthclaw, educlaw, propertyclaw) show all their domains
 * since the user explicitly opted in by selecting that profile.
 *
 * Only ERPClaw needs this because it has 31 domains — verticals have 3-8.
 */

// ── Domain groupings (building blocks for presets) ───────────────────────────

const SETUP = ["company", "defaults", "users"];
const ACCOUNTING = ["chart_of_accounts", "general_ledger", "fiscal", "budgeting", "terms"];
const ACCOUNTING_ADVANCED = ["currencies", "system", "entry", "ledger_entry", "template", "withholding_category"];
const ITEMS = ["category", "item_master", "pricing"];
const INVENTORY = ["warehousing", "stock_transactions", "tracking"];
const SALES = ["customers", "sales", "fulfillment", "sales_billing"];
const PURCHASING = ["suppliers", "purchasing", "receiving", "purchase_billing"];
const SUBSCRIPTION = ["meter", "rate_plan", "subscription_billing"];

// ── Profile → ERPClaw domain presets ─────────────────────────────────────────

const ERPCLAW_DOMAIN_PRESETS: Record<string, string[]> = {
  // Business profiles — show relevant domains
  "small-business":        [...SETUP, ...ITEMS, ...SALES, ...PURCHASING, "chart_of_accounts"],
  "retail":                [...SETUP, ...ITEMS, ...INVENTORY, ...SALES, ...PURCHASING, "chart_of_accounts"],
  "manufacturing":         [...SETUP, ...ITEMS, ...INVENTORY, ...SALES, ...PURCHASING, ...ACCOUNTING],
  "professional-services": [...SETUP, ...ITEMS, ...SALES, ...PURCHASING, ...ACCOUNTING],
  "distribution":          [...SETUP, ...ITEMS, ...INVENTORY, ...SALES, ...PURCHASING, ...ACCOUNTING],
  "saas":                  [...SETUP, ...ITEMS, ...SALES, ...SUBSCRIPTION, "chart_of_accounts"],

  // Vertical profiles — only show ERP domains they need (billing + basic setup)
  "property-management":   [...SETUP, ...ITEMS, ...SALES, ...PURCHASING, "chart_of_accounts"],
  "healthcare":            [...SETUP, ...ITEMS, ...SALES, ...PURCHASING, "chart_of_accounts"],
  "dental":                [...SETUP, "customers", "sales_billing", "chart_of_accounts"],
  "veterinary":            [...SETUP, "customers", "sales_billing", "chart_of_accounts"],
  "mental-health":         [...SETUP, "customers", "sales_billing", "chart_of_accounts"],
  "home-health":           [...SETUP, "customers", "sales_billing", "chart_of_accounts"],
  "k12-school":            [...SETUP, ...ITEMS, ...SALES, ...PURCHASING, "chart_of_accounts"],
  "college-university":    [...SETUP, ...ITEMS, ...SALES, ...PURCHASING, ...ACCOUNTING],
  "nonprofit":             [...SETUP, ...ITEMS, ...SALES, ...PURCHASING, ...ACCOUNTING],

  // Power profiles — show everything
  "enterprise":            [], // empty = show all
  "full-erp":              [], // empty = show all
  "custom":                [], // empty = show all
};

// Default domain set when no profile is active (covers typical small business use)
const DEFAULT_DOMAINS = ERPCLAW_DOMAIN_PRESETS["small-business"];

/**
 * Get visible ERPClaw domains for a profile.
 * Returns null if all domains should be shown (no filtering).
 */
export function getVisibleDomains(
  profileKey: string | undefined | null,
  skillName: string,
): string[] | null {
  // Only filter ERPClaw domains — verticals show everything
  if (skillName !== "erpclaw") return null;

  // No profile = use default preset (progressive disclosure for new users)
  if (!profileKey) return DEFAULT_DOMAINS;

  const preset = ERPCLAW_DOMAIN_PRESETS[profileKey];
  // Unknown profile = use default; empty preset = show all (enterprise/full-erp)
  if (preset === undefined) return DEFAULT_DOMAINS;
  if (preset.length === 0) return null;

  return preset;
}

// localStorage key for "show all domains" override
const SHOW_ALL_KEY = "erpclaw_show_all_domains";

export function getShowAllDomains(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHOW_ALL_KEY) === "1";
}

export function setShowAllDomains(show: boolean): void {
  if (typeof window === "undefined") return;
  if (show) {
    localStorage.setItem(SHOW_ALL_KEY, "1");
  } else {
    localStorage.removeItem(SHOW_ALL_KEY);
  }
}
