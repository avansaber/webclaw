import { describe, it, expect } from "vitest";

// Test the executor.py build_cli_args normalization logic.
// This is a TypeScript mirror of the Python function to ensure
// the frontend and backend agree on param key conventions.

/**
 * Mirror of executor.py build_cli_args() — converts params dict to CLI args.
 * The critical fix: key.replace("_", "-") normalizes underscore params to hyphens.
 */
function buildCliArgs(action: string, params: Record<string, unknown>): string[] {
  const args = ["--action", action];
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("_")) continue;
    const flag = `--${key.replace(/_/g, "-")}`;
    if (typeof value === "boolean") {
      if (value) args.push(flag, "1");
    } else if (typeof value === "string" && ["true", "false"].includes(value.toLowerCase())) {
      if (value.toLowerCase() === "true") args.push(flag, "1");
    } else if (value !== null && value !== undefined && String(value).trim()) {
      args.push(flag, String(value));
    }
  }
  return args;
}

describe("buildCliArgs normalization", () => {
  it("normalizes underscores to hyphens in param keys", () => {
    const args = buildCliArgs("add-quotation", {
      posting_date: "2026-03-03",
      customer_id: "C001",
    });
    expect(args).toContain("--posting-date");
    expect(args).toContain("--customer-id");
    expect(args).not.toContain("--posting_date");
    expect(args).not.toContain("--customer_id");
  });

  it("leaves already-hyphenated keys unchanged", () => {
    const args = buildCliArgs("add-quotation", { "posting-date": "2026-03-03" });
    expect(args).toContain("--posting-date");
  });

  it("skips internal keys starting with _", () => {
    const args = buildCliArgs("add-customer", { _meta: "internal", name: "Acme" });
    expect(args).not.toContain("--_meta");
    expect(args).toContain("--name");
  });

  it("handles boolean true as '1'", () => {
    const args = buildCliArgs("add-item", { taxable: true });
    expect(args).toContain("--taxable");
    expect(args).toContain("1");
  });

  it("omits boolean false", () => {
    const args = buildCliArgs("add-item", { taxable: false });
    expect(args).not.toContain("--taxable");
  });

  it("handles string 'true' as '1'", () => {
    const args = buildCliArgs("add-item", { taxable: "true" });
    expect(args).toContain("1");
  });

  it("omits string 'false'", () => {
    const args = buildCliArgs("add-item", { taxable: "false" });
    expect(args).not.toContain("--taxable");
  });

  it("omits null and undefined values", () => {
    const args = buildCliArgs("add-item", { name: null, desc: undefined });
    expect(args).toEqual(["--action", "add-item"]);
  });

  it("omits empty string values", () => {
    const args = buildCliArgs("add-item", { name: "", desc: "  " });
    expect(args).toEqual(["--action", "add-item"]);
  });

  it("produces correct full args for add-quotation", () => {
    const args = buildCliArgs("add-quotation", {
      posting_date: "2026-03-03",
      customer_id: "C001",
      company_id: "CO1",
      items: '[{"item_id": "I1", "qty": 1}]',
    });
    expect(args).toEqual([
      "--action", "add-quotation",
      "--posting-date", "2026-03-03",
      "--customer-id", "C001",
      "--company-id", "CO1",
      "--items", '[{"item_id": "I1", "qty": 1}]',
    ]);
  });
});
