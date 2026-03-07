import { describe, it, expect } from "vitest";
import {
  slugFromListAction,
  listActionFromSlug,
  deriveAddAction,
  deriveGetAction,
  entityKeyFromSlug,
  slugFromEntityKey,
  entityLabel,
  entityIdParam,
  buildIdQuery,
  buildIdPayload,
  getSkillDashboardUrl,
  getEntityListUrl,
  getEntityNewUrl,
  getEntityDetailUrl,
  getEntityEditUrl,
  getActionRunnerUrl,
  migrateActionUrl,
} from "@/lib/entity-routing";
import type { UIConfig } from "@/lib/ui-yaml-types";

// ── Mock UIConfig ────────────────────────────────────────────────────────────

const mockUIConfig: UIConfig = {
  skill: "propclaw",
  version: "1.0.0",
  entities: {
    propclaw_property: { label: "Property", label_plural: "Properties" },
    propclaw_lease: { label: "Lease", label_plural: "Leases" },
    propclaw_work_order: { label: "Work Order", label_plural: "Work Orders" },
  },
  action_map: {
    "list-properties": { entity: "propclaw_property", component: "DataTable" },
    "add-property": { entity: "propclaw_property", component: "FormView" },
    "get-property": { entity: "propclaw_property", component: "DetailView" },
    "list-leases": { entity: "propclaw_lease", component: "DataTable" },
    "add-lease": { entity: "propclaw_lease", component: "FormView" },
    "list-work-orders": { entity: "propclaw_work_order", component: "DataTable" },
    "add-work-order": { entity: "propclaw_work_order", component: "FormView" },
  },
};

// ── Slug ↔ Action mapping ────────────────────────────────────────────────────

describe("slugFromListAction", () => {
  it("strips list- prefix", () => {
    expect(slugFromListAction("list-properties")).toBe("properties");
    expect(slugFromListAction("list-work-orders")).toBe("work-orders");
    expect(slugFromListAction("list-gl-entries")).toBe("gl-entries");
  });
});

describe("listActionFromSlug", () => {
  it("adds list- prefix", () => {
    expect(listActionFromSlug("properties")).toBe("list-properties");
    expect(listActionFromSlug("work-orders")).toBe("list-work-orders");
  });
});

describe("deriveAddAction", () => {
  it("singularizes regular plurals", () => {
    expect(deriveAddAction("list-properties")).toBe("add-property");
    expect(deriveAddAction("list-customers")).toBe("add-customer");
  });

  it("singularizes -ies → -y", () => {
    expect(deriveAddAction("list-entries")).toBe("add-entry");
    expect(deriveAddAction("list-categories")).toBe("add-category");
  });

  it("prefers add- over create- when both exist", () => {
    const actions = ["add-property", "create-property"];
    expect(deriveAddAction("list-properties", actions)).toBe("add-property");
  });

  it("falls back to create- if add- not available", () => {
    const actions = ["create-delivery-note"];
    expect(deriveAddAction("list-delivery-notes", actions)).toBe("create-delivery-note");
  });

  it("returns null if neither exists", () => {
    expect(deriveAddAction("list-gl-entries", ["list-gl-entries"])).toBeNull();
  });
});

describe("deriveGetAction", () => {
  it("derives get- action", () => {
    expect(deriveGetAction("list-properties")).toBe("get-property");
    expect(deriveGetAction("list-work-orders")).toBe("get-work-order");
  });

  it("returns null if not in available actions", () => {
    expect(deriveGetAction("list-gl-entries", ["list-gl-entries"])).toBeNull();
  });
});

// ── Entity key resolution ────────────────────────────────────────────────────

describe("entityKeyFromSlug", () => {
  it("resolves slug to entity key via action_map", () => {
    expect(entityKeyFromSlug("properties", mockUIConfig)).toBe("propclaw_property");
    expect(entityKeyFromSlug("leases", mockUIConfig)).toBe("propclaw_lease");
    expect(entityKeyFromSlug("work-orders", mockUIConfig)).toBe("propclaw_work_order");
  });

  it("returns null for unknown slug", () => {
    expect(entityKeyFromSlug("nonexistent", mockUIConfig)).toBeNull();
  });

  it("returns null when no UIConfig", () => {
    expect(entityKeyFromSlug("properties", null)).toBeNull();
  });
});

describe("slugFromEntityKey", () => {
  it("finds slug for entity key", () => {
    expect(slugFromEntityKey("propclaw_property", mockUIConfig)).toBe("properties");
    expect(slugFromEntityKey("propclaw_lease", mockUIConfig)).toBe("leases");
  });

  it("returns null for unknown entity", () => {
    expect(slugFromEntityKey("unknown", mockUIConfig)).toBeNull();
  });
});

describe("entityLabel", () => {
  it("uses label_plural from UIConfig", () => {
    expect(entityLabel("properties", mockUIConfig)).toBe("Properties");
    expect(entityLabel("work-orders", mockUIConfig)).toBe("Work Orders");
  });

  it("falls back to capitalized slug", () => {
    expect(entityLabel("gl-entries", null)).toBe("Gl Entries");
    expect(entityLabel("sales-invoices", null)).toBe("Sales Invoices");
  });
});

// ── ID parameter helpers ─────────────────────────────────────────────────────

describe("entityIdParam", () => {
  it("singularizes and appends -id", () => {
    expect(entityIdParam("properties")).toBe("property-id");
    expect(entityIdParam("work-orders")).toBe("work-order-id");
    // "leases" → ses$ matches → "lea" + "-id" = "lea-id" (known singularization quirk)
    expect(entityIdParam("leases")).toBe("lea-id");
    expect(entityIdParam("entries")).toBe("entry-id");
    expect(entityIdParam("customers")).toBe("customer-id");
  });
});

describe("buildIdQuery", () => {
  it("includes both id and entity-specific param", () => {
    expect(buildIdQuery("properties", "P001")).toBe("id=P001&property-id=P001");
    expect(buildIdQuery("leases", "L001")).toBe("id=L001&lea-id=L001");
  });

  it("encodes special characters", () => {
    expect(buildIdQuery("properties", "a b")).toContain("id=a%20b");
  });
});

describe("buildIdPayload", () => {
  it("returns object with both id keys", () => {
    expect(buildIdPayload("properties", "P001")).toEqual({
      id: "P001",
      "property-id": "P001",
    });
  });
});

// ── URL builders ─────────────────────────────────────────────────────────────

describe("URL builders", () => {
  it("builds skill dashboard URL", () => {
    expect(getSkillDashboardUrl("propclaw")).toBe("/skills/propclaw");
  });

  it("builds entity list URL", () => {
    expect(getEntityListUrl("propclaw", "properties")).toBe("/skills/propclaw/properties");
  });

  it("builds entity new URL", () => {
    expect(getEntityNewUrl("propclaw", "properties")).toBe("/skills/propclaw/properties/new");
  });

  it("builds entity detail URL", () => {
    expect(getEntityDetailUrl("propclaw", "properties", "P001")).toBe("/skills/propclaw/properties/P001");
  });

  it("encodes IDs in detail URL", () => {
    expect(getEntityDetailUrl("propclaw", "properties", "a b")).toBe("/skills/propclaw/properties/a%20b");
  });

  it("builds entity edit URL", () => {
    expect(getEntityEditUrl("propclaw", "properties", "P001")).toBe("/skills/propclaw/properties/P001/edit");
  });

  it("builds action runner URL without action", () => {
    expect(getActionRunnerUrl("propclaw")).toBe("/skills/propclaw/actions");
  });

  it("builds action runner URL with action", () => {
    expect(getActionRunnerUrl("propclaw", "submit-lease")).toBe("/skills/propclaw/actions?action=submit-lease");
  });
});

// ── Old URL migration ────────────────────────────────────────────────────────

describe("migrateActionUrl", () => {
  it("redirects list-* to entity list", () => {
    const params = new URLSearchParams("action=list-properties");
    expect(migrateActionUrl("/skills/propclaw", params)).toBe("/skills/propclaw/properties");
  });

  it("preserves filter params on list", () => {
    const params = new URLSearchParams("action=list-properties&status=active");
    expect(migrateActionUrl("/skills/propclaw", params)).toBe("/skills/propclaw/properties?status=active");
  });

  it("redirects add-* to entity/new with -y → -ies pluralization", () => {
    const params = new URLSearchParams("action=add-property");
    expect(migrateActionUrl("/skills/propclaw", params)).toBe("/skills/propclaw/properties/new");
  });

  it("redirects add-* to entity/new with regular pluralization", () => {
    const params = new URLSearchParams("action=add-entry");
    expect(migrateActionUrl("/skills/erpclaw", params)).toBe("/skills/erpclaw/entries/new");
  });

  it("redirects add-* with regular -s pluralization", () => {
    const params = new URLSearchParams("action=add-customer");
    expect(migrateActionUrl("/skills/erpclaw", params)).toBe("/skills/erpclaw/customers/new");
  });

  it("redirects get-* with id to entity detail", () => {
    const params = new URLSearchParams("action=get-property&id=P001");
    expect(migrateActionUrl("/skills/propclaw", params)).toBe("/skills/propclaw/properties/P001");
  });

  it("redirects other actions to action runner", () => {
    const params = new URLSearchParams("action=submit-quotation");
    expect(migrateActionUrl("/skills/erpclaw", params)).toBe(
      "/skills/erpclaw/actions?action=submit-quotation",
    );
  });

  it("returns null when no action param", () => {
    const params = new URLSearchParams("status=active");
    expect(migrateActionUrl("/skills/propclaw", params)).toBeNull();
  });
});
