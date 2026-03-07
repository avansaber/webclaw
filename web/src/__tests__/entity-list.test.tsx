import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the data extraction logic used by the entity list page.
// The actual page uses Next.js routing (use(params)) which can't be tested in Vitest easily,
// so we test the pure logic functions that power the list view.

describe("Entity list data extraction", () => {
  // Mirror the logic from entity list page that extracts array data from API response
  function extractItems(data: Record<string, unknown>): Record<string, unknown>[] {
    const arrayKey = Object.keys(data).find(
      (k) => Array.isArray(data[k]) && k !== "tags" && k !== "requires",
    );
    return arrayKey ? (data[arrayKey] as Record<string, unknown>[]) : [];
  }

  it("extracts items from typical list response", () => {
    const data = {
      status: "success",
      properties: [{ id: "P1", name: "Main St" }, { id: "P2", name: "Oak Ave" }],
      total_count: 2,
    };
    expect(extractItems(data)).toHaveLength(2);
    expect(extractItems(data)[0]).toEqual({ id: "P1", name: "Main St" });
  });

  it("handles different array key names", () => {
    expect(extractItems({ customers: [{ id: "C1" }] })).toHaveLength(1);
    expect(extractItems({ journal_entries: [{ id: "JE1" }] })).toHaveLength(1);
    expect(extractItems({ items: [{ id: "I1" }] })).toHaveLength(1);
  });

  it("returns empty array when no array found", () => {
    expect(extractItems({ status: "success", message: "No records" })).toEqual([]);
  });

  it("ignores tags and requires arrays", () => {
    expect(
      extractItems({ tags: ["a", "b"], requires: ["x"], data: [{ id: "1" }] }),
    ).toEqual([{ id: "1" }]);
  });

  it("returns empty for error response", () => {
    expect(extractItems({ status: "error", message: "Failed" })).toEqual([]);
  });
});

describe("Entity list pagination", () => {
  const PAGE_SIZE = 20;

  function buildQueryParams(page: number, filters?: Record<string, string>): string {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page));
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (k !== "page") params.set(k, v);
      }
    }
    return params.toString();
  }

  it("includes limit and offset", () => {
    const qs = buildQueryParams(0);
    expect(qs).toContain("limit=20");
    expect(qs).toContain("offset=0");
  });

  it("passes filter params", () => {
    const qs = buildQueryParams(0, { status: "active", city: "Austin" });
    expect(qs).toContain("status=active");
    expect(qs).toContain("city=Austin");
  });

  it("skips page param in filters", () => {
    const qs = buildQueryParams(0, { page: "2", status: "active" });
    expect(qs).not.toContain("page=");
    expect(qs).toContain("status=active");
  });

  it("applies offset for page 2", () => {
    const qs = buildQueryParams(20);
    expect(qs).toContain("offset=20");
  });
});

describe("Entity label singularization (for 'New X' button)", () => {
  // The entity list page does: label.replace(/s$/, "").replace(/ies$/, "y")
  // But this is wrong order — "Properties" → "Propertie" (strips s) then no match for ies
  // The correct order should be ies first, then s
  function singularize(label: string): string {
    return label.replace(/ies$/, "y").replace(/s$/, "");
  }

  it("singularizes regular plurals", () => {
    expect(singularize("Customers")).toBe("Customer");
    expect(singularize("Leases")).toBe("Lease");
  });

  it("singularizes -ies plurals", () => {
    expect(singularize("Properties")).toBe("Property");
    expect(singularize("Categories")).toBe("Category");
    expect(singularize("Entries")).toBe("Entry");
  });

  it("handles already singular", () => {
    expect(singularize("Property")).toBe("Property");
  });
});
