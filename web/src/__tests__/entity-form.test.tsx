import { describe, it, expect, vi } from "vitest";

// Test the form spec resolution logic used by entity form pages.
// The actual DynamicForm is a complex React component; here we test the
// data flow logic that determines which form to show and how params are mapped.

describe("Form spec resolution layers", () => {
  // L2: UI.yaml form spec (highest priority)
  // L1: Auto-FormSpec from SKILL.md param schema (fallback)
  // L0: Raw action runner (last resort)

  interface FormField {
    key: string;
    label: string;
    type: string;
    required?: boolean;
    default?: string;
  }

  interface FormSpec {
    action: string;
    title: string;
    fields: FormField[];
  }

  function resolveFormSpec(
    uiYamlSpec: FormSpec | null,
    autoSpec: FormSpec | null,
  ): FormSpec | null {
    return uiYamlSpec || autoSpec || null;
  }

  it("prefers UI.yaml spec over auto spec", () => {
    const uiYaml: FormSpec = { action: "add-property", title: "New Property", fields: [{ key: "name", label: "Name", type: "text", required: true }] };
    const auto: FormSpec = { action: "add-property", title: "Add Property", fields: [{ key: "name", label: "name", type: "text" }] };
    expect(resolveFormSpec(uiYaml, auto)?.title).toBe("New Property");
  });

  it("falls back to auto spec when no UI.yaml", () => {
    const auto: FormSpec = { action: "add-item", title: "Add Item", fields: [] };
    expect(resolveFormSpec(null, auto)?.title).toBe("Add Item");
  });

  it("returns null when nothing available", () => {
    expect(resolveFormSpec(null, null)).toBeNull();
  });
});

describe("Form default value resolution", () => {
  function resolveDefault(defaultStr: string | undefined): string | undefined {
    if (!defaultStr) return undefined;
    if (defaultStr === "today") return new Date().toISOString().split("T")[0];
    if (defaultStr === "now") return new Date().toISOString();
    return defaultStr;
  }

  it("resolves 'today' to current date", () => {
    const result = resolveDefault("today");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resolves 'now' to ISO datetime", () => {
    const result = resolveDefault("now");
    expect(result).toContain("T");
  });

  it("passes through static defaults", () => {
    expect(resolveDefault("Draft")).toBe("Draft");
    expect(resolveDefault("0")).toBe("0");
  });

  it("returns undefined for missing default", () => {
    expect(resolveDefault(undefined)).toBeUndefined();
  });
});

describe("Form param key normalization", () => {
  // The executor.py now normalizes _ → - in param keys.
  // But the UI.yaml may define param_name with underscores.
  // The form should send keys as-is (underscore or hyphen) — executor handles it.

  function normalizeForCli(key: string): string {
    return key.replace(/_/g, "-");
  }

  it("converts underscores to hyphens", () => {
    expect(normalizeForCli("posting_date")).toBe("posting-date");
    expect(normalizeForCli("customer_id")).toBe("customer-id");
    expect(normalizeForCli("company_id")).toBe("company-id");
  });

  it("leaves hyphens unchanged", () => {
    expect(normalizeForCli("posting-date")).toBe("posting-date");
  });

  it("handles mixed case", () => {
    expect(normalizeForCli("from_date")).toBe("from-date");
    expect(normalizeForCli("to_date")).toBe("to-date");
  });
});

describe("Form field extraction from UI.yaml", () => {
  interface FieldDef {
    label: string;
    type: string;
    required?: boolean;
    param_name?: string;
    default?: string;
    options?: string[];
  }

  function fieldDefToFormKey(key: string, field: FieldDef): string {
    // Matches ui-yaml-to-form.ts logic: use param_name if provided, else convert _ to -
    return (field.param_name || key).replace(/_/g, "-");
  }

  it("uses param_name when provided", () => {
    expect(fieldDefToFormKey("quotation_date", { label: "Date", type: "date", param_name: "posting_date" })).toBe("posting-date");
  });

  it("converts entity key underscores to hyphens", () => {
    expect(fieldDefToFormKey("customer_id", { label: "Customer", type: "link" })).toBe("customer-id");
  });

  it("handles already-hyphenated keys", () => {
    expect(fieldDefToFormKey("company-id", { label: "Company", type: "link" })).toBe("company-id");
  });
});

describe("Pre-fill from URL search params", () => {
  function extractPrefill(searchParams: URLSearchParams): Record<string, string> {
    const prefill: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (key !== "action" && key !== "page") {
        prefill[key] = value;
      }
    });
    return prefill;
  }

  it("extracts pre-fill params", () => {
    const params = new URLSearchParams("property-id=P001&unit-id=U001");
    expect(extractPrefill(params)).toEqual({ "property-id": "P001", "unit-id": "U001" });
  });

  it("skips action and page params", () => {
    const params = new URLSearchParams("action=add-lease&page=1&property-id=P001");
    expect(extractPrefill(params)).toEqual({ "property-id": "P001" });
  });

  it("handles empty params", () => {
    expect(extractPrefill(new URLSearchParams())).toEqual({});
  });
});
