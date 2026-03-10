import { describe, it, expect } from "vitest";
import {
  slugFromListAction,
  listActionFromSlug,
  deriveAddAction,
  deriveGetAction,
  entityIdParam,
  buildIdQuery,
  buildIdPayload,
  entityKeyFromSlug,
  entityLabel,
  getEntityListUrl,
  getEntityDetailUrl,
  getEntityEditUrl,
  getEntityNewUrl,
  getActionRunnerUrl,
  migrateActionUrl,
} from "./entity-routing";

// ── Slug ↔ Action mapping ─────────────────────────────────────────────────

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

// ── Action derivation ─────────────────────────────────────────────────────

describe("deriveAddAction", () => {
  it("derives singular add action from list action", () => {
    expect(deriveAddAction("list-properties")).toBe("add-property");
    expect(deriveAddAction("list-customers")).toBe("add-customer");
    expect(deriveAddAction("list-gl-entries")).toBe("add-gl-entry");
  });

  it("handles -ies → -y pluralization", () => {
    expect(deriveAddAction("list-companies")).toBe("add-company");
  });

  it("returns null when action not in available list", () => {
    expect(deriveAddAction("list-properties", ["list-properties"])).toBeNull();
  });

  it("prefers add- over create-", () => {
    expect(deriveAddAction("list-properties", ["add-property", "create-property"])).toBe("add-property");
  });

  it("falls back to create- if add- not available", () => {
    expect(deriveAddAction("list-properties", ["create-property"])).toBe("create-property");
  });
});

describe("deriveGetAction", () => {
  it("derives singular get action from list action", () => {
    expect(deriveGetAction("list-properties")).toBe("get-property");
    expect(deriveGetAction("list-customers")).toBe("get-customer");
    expect(deriveGetAction("list-sales-orders")).toBe("get-sales-order");
  });

  it("returns null when action not in available list", () => {
    expect(deriveGetAction("list-sales-partners", ["list-sales-partners", "add-customer"])).toBeNull();
  });

  it("returns action when it exists in available list", () => {
    expect(deriveGetAction("list-customers", ["get-customer", "list-customers"])).toBe("get-customer");
  });
});

// ── ID parameter helpers ──────────────────────────────────────────────────

describe("entityIdParam", () => {
  it("derives kebab-case entity-specific ID param", () => {
    expect(entityIdParam("properties")).toBe("property-id");
    expect(entityIdParam("work-orders")).toBe("work-order-id");
    expect(entityIdParam("customers")).toBe("customer-id");
  });

  it("handles -ies → -y pluralization", () => {
    expect(entityIdParam("companies")).toBe("company-id");
  });
});

describe("buildIdQuery", () => {
  it("includes both generic id and entity-specific param", () => {
    const qs = buildIdQuery("properties", "abc-123");
    expect(qs).toBe("id=abc-123&property-id=abc-123");
  });

  it("encodes special characters", () => {
    const qs = buildIdQuery("properties", "PROP-2026/001");
    expect(qs).toContain("id=PROP-2026%2F001");
  });
});

describe("buildIdPayload", () => {
  it("includes both id and entity-specific param", () => {
    expect(buildIdPayload("properties", "abc-123")).toEqual({
      id: "abc-123",
      "property-id": "abc-123",
    });
  });
});

// ── Entity key resolution ─────────────────────────────────────────────────

describe("entityKeyFromSlug", () => {
  it("returns null without config", () => {
    expect(entityKeyFromSlug("properties", null)).toBeNull();
  });

  it("resolves entity key via action_map", () => {
    const config = {
      ocui_version: "1.0",
      skill: "propertyclaw",
      skill_version: "1.0",
      display_name: "PropertyClaw",
      entities: {},
      action_map: {
        "list-properties": { component: "DataTable" as const, entity: "propertyclaw_property" },
      },
    };
    expect(entityKeyFromSlug("properties", config)).toBe("propertyclaw_property");
  });
});

describe("entityLabel", () => {
  it("falls back to slug formatting", () => {
    expect(entityLabel("work-orders", null)).toBe("Work Orders");
    expect(entityLabel("properties", null)).toBe("Properties");
  });
});

// ── URL builders ──────────────────────────────────────────────────────────

describe("URL builders", () => {
  it("getEntityListUrl", () => {
    expect(getEntityListUrl("propertyclaw", "properties")).toBe("/skills/propertyclaw/properties");
  });

  it("getEntityDetailUrl encodes id", () => {
    expect(getEntityDetailUrl("propertyclaw", "properties", "abc-123")).toBe("/skills/propertyclaw/properties/abc-123");
    expect(getEntityDetailUrl("propertyclaw", "properties", "a/b")).toBe("/skills/propertyclaw/properties/a%2Fb");
  });

  it("getEntityEditUrl", () => {
    expect(getEntityEditUrl("propertyclaw", "properties", "abc-123")).toBe("/skills/propertyclaw/properties/abc-123/edit");
  });

  it("getEntityNewUrl", () => {
    expect(getEntityNewUrl("propertyclaw", "properties")).toBe("/skills/propertyclaw/properties/new");
  });

  it("getActionRunnerUrl", () => {
    expect(getActionRunnerUrl("propertyclaw")).toBe("/skills/propertyclaw/actions");
    expect(getActionRunnerUrl("propertyclaw", "list-properties")).toBe("/skills/propertyclaw/actions?action=list-properties");
  });
});

// ── URL migration ─────────────────────────────────────────────────────────

describe("migrateActionUrl", () => {
  it("redirects list actions to entity slugs", () => {
    const params = new URLSearchParams("action=list-properties");
    expect(migrateActionUrl("/skills/propertyclaw", params)).toBe("/skills/propertyclaw/properties");
  });

  it("redirects add actions to /new", () => {
    const params = new URLSearchParams("action=add-property");
    expect(migrateActionUrl("/skills/propertyclaw", params)).toBe("/skills/propertyclaw/properties/new");
  });

  it("redirects get actions with id to detail url", () => {
    const params = new URLSearchParams("action=get-property&id=abc-123");
    expect(migrateActionUrl("/skills/propertyclaw", params)).toBe("/skills/propertyclaw/properties/abc-123");
  });

  it("redirects other actions to action runner", () => {
    const params = new URLSearchParams("action=submit-property");
    expect(migrateActionUrl("/skills/propertyclaw", params)).toBe("/skills/propertyclaw/actions?action=submit-property");
  });

  it("returns null when no action param", () => {
    const params = new URLSearchParams("status=active");
    expect(migrateActionUrl("/skills/propertyclaw", params)).toBeNull();
  });

  it("preserves extra params on list redirect", () => {
    const params = new URLSearchParams("action=list-properties&status=active");
    expect(migrateActionUrl("/skills/propertyclaw", params)).toBe("/skills/propertyclaw/properties?status=active");
  });
});
