import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The KpiCard is currently inline in the skill dashboard page.
// This test validates the KPI rendering logic that should be extracted into kpi-grid.tsx.
// For now, we test the severity color logic and display format directly.

describe("KPI display logic", () => {
  // Severity color mapping (mirrors skill dashboard page logic)
  function severityColor(s?: string) {
    switch (s) {
      case "warning": return "border-l-amber-500";
      case "success": return "border-l-emerald-500";
      default: return "border-l-primary";
    }
  }

  it("returns amber for warning severity", () => {
    expect(severityColor("warning")).toBe("border-l-amber-500");
  });

  it("returns emerald for success severity", () => {
    expect(severityColor("success")).toBe("border-l-emerald-500");
  });

  it("returns primary for undefined severity", () => {
    expect(severityColor()).toBe("border-l-primary");
    expect(severityColor("info")).toBe("border-l-primary");
  });

  // Currency formatting (mirrors dashboard logic)
  function formatCurrency(val: unknown): string {
    const num = typeof val === "string" ? parseFloat(val as string) : Number(val);
    if (isNaN(num)) return String(val);
    if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
    if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  }

  it("formats millions", () => {
    expect(formatCurrency(2500000)).toBe("$2.5M");
  });

  it("formats thousands", () => {
    expect(formatCurrency(45200)).toBe("$45.2K");
  });

  it("formats small values", () => {
    expect(formatCurrency(500)).toBe("$500");
  });

  it("handles string numbers", () => {
    expect(formatCurrency("127000")).toBe("$127.0K");
  });

  it("handles non-numeric gracefully", () => {
    expect(formatCurrency("N/A")).toBe("N/A");
  });
});

describe("KPI config validation", () => {
  // Validate that a dashboard KPI definition has required fields
  interface KpiDef {
    key: string;
    label: string;
    action: string;
    type?: string;
    icon?: string;
    severity?: string;
    field?: string;
    filter?: Record<string, string>;
    drill_action?: string;
  }

  function validateKpiDef(kpi: KpiDef): string[] {
    const errors: string[] = [];
    if (!kpi.key) errors.push("missing key");
    if (!kpi.label) errors.push("missing label");
    if (!kpi.action) errors.push("missing action");
    if (kpi.action && !kpi.action.startsWith("list-") && !kpi.action.startsWith("get-")) {
      errors.push(`action "${kpi.action}" should start with list- or get-`);
    }
    return errors;
  }

  it("accepts valid KPI def", () => {
    expect(
      validateKpiDef({ key: "rent", label: "Rent Collected", action: "list-leases", type: "currency" }),
    ).toEqual([]);
  });

  it("rejects KPI without key", () => {
    expect(validateKpiDef({ key: "", label: "Test", action: "list-x" })).toContain("missing key");
  });

  it("rejects KPI with non-list action", () => {
    expect(validateKpiDef({ key: "k", label: "Test", action: "submit-x" })).toEqual(
      expect.arrayContaining([expect.stringContaining("should start with list-")]),
    );
  });
});
