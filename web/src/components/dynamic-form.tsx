"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Trash2,
  Check,
  ChevronsUpDown,
  Search,
  X,
  HelpCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchApi, postAction } from "@/lib/api";
import { useToast } from "@/components/toast-provider";
import type {
  FormSpec,
  FormFieldSpec,
  FormSectionSpec,
} from "@/lib/form-spec";
import { resolveDefault } from "@/lib/form-spec";

// ── Entity Lookup ──────────────────────────────────────────────────────────

interface EntityLookupProps {
  field: FormFieldSpec;
  skill: string;
  value: string;
  onChange: (value: string) => void;
}

function EntityLookup({ field, skill, value, onChange }: EntityLookupProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const targetSkill = field.entity_skill || skill;
  const valueField = field.entity_value_field || "id";
  const displayField = field.entity_display_field || "name";

  // Click outside → close
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Fetch options on first open
  useEffect(() => {
    if (open && options.length === 0) fetchOptions();
  }, [open]);

  // Sync display text when value or options change
  useEffect(() => {
    if (value && options.length > 0) {
      const match = options.find((o) => String(o[valueField]) === value);
      if (match) setDisplayText(String(match[displayField] || ""));
    } else if (!value) {
      setDisplayText("");
    }
  }, [value, options]);

  async function fetchOptions() {
    setLoading(true);
    try {
      const result = await fetchApi(
        `/${targetSkill}/${field.entity_action}?limit=100`
      );
      const arrayKey = Object.keys(result).find(
        (k) => Array.isArray(result[k]) && k !== "tags" && k !== "requires"
      );
      if (arrayKey) {
        const items = result[arrayKey] as Record<string, unknown>[];
        setOptions(items);
        if (value) {
          const match = items.find((o) => String(o[valueField]) === value);
          if (match) setDisplayText(String(match[displayField] || ""));
        }
      }
    } catch {
      // Silently fail — dropdown will show "No results"
    } finally {
      setLoading(false);
    }
  }

  const filtered = search
    ? options.filter((o) => {
        const d = String(o[displayField] || "").toLowerCase();
        const n = String(o["name"] || "").toLowerCase();
        const q = search.toLowerCase();
        return d.includes(q) || n.includes(q);
      })
    : options;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={open ? search : displayText}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={field.placeholder || "Search..."}
          className="pl-8 pr-8"
        />
        {value && !open && (
          <button
            type="button"
            className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
            onClick={() => {
              onChange("");
              setDisplayText("");
              setSearch("");
              setOpen(true);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {!value && !open && (
          <ChevronsUpDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-52 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            filtered.map((option, i) => {
              const optValue = String(option[valueField]);
              const optDisplay = String(option[displayField] || "");
              const optName = String(option["name"] || "");
              const selected = optValue === value;
              return (
                <button
                  key={i}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 ${
                    selected ? "bg-accent" : ""
                  }`}
                  onClick={() => {
                    onChange(optValue);
                    setDisplayText(optDisplay);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{optDisplay}</span>
                  {optName && optName !== optDisplay && (
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      {optName}
                    </span>
                  )}
                  {selected && (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Field Renderer ──────────────────────────────────────────────────────────

interface FieldRendererProps {
  field: FormFieldSpec;
  skill: string;
  value: string;
  onChange: (value: string) => void;
}

function FieldRenderer({ field, skill, value, onChange }: FieldRendererProps) {
  switch (field.type) {
    case "entity-lookup":
      return (
        <EntityLookup
          field={field}
          skill={skill}
          value={value}
          onChange={onChange}
        />
      );

    case "select":
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "textarea":
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      );

    case "boolean":
      return (
        <label className="flex items-center gap-2 cursor-pointer h-9">
          <input
            type="checkbox"
            checked={value === "true" || value === "1"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-input"
          />
          <span className="text-sm">{field.label}</span>
        </label>
      );

    case "date":
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step || 1}
        />
      );

    case "currency":
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || "0.00"}
          min={0}
          step={0.01}
          className="font-mono"
        />
      );

    default:
      return (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
  }
}

// ── Repeatable Group (Line Items) ───────────────────────────────────────────

interface RepeatableGroupProps {
  section: FormSectionSpec;
  skill: string;
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
}

function RepeatableGroup({
  section,
  skill,
  rows,
  onChange,
}: RepeatableGroupProps) {
  function addRow() {
    const newRow: Record<string, string> = {};
    for (const field of section.fields) {
      newRow[field.key] = resolveDefault(field.default);
    }
    onChange([...rows, newRow]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function updateCell(rowIndex: number, key: string, value: string) {
    const updated = [...rows];
    updated[rowIndex] = { ...updated[rowIndex], [key]: value };
    onChange(updated);
  }

  // Calculate row total (qty * rate)
  const qtyField = section.fields.find((f) => f.key === "qty");
  const rateField = section.fields.find(
    (f) => f.type === "currency" && (f.key === "rate" || f.key === "price")
  );
  const hasTotal = !!qtyField && !!rateField;

  function rowTotal(row: Record<string, string>): number {
    if (!qtyField || !rateField) return 0;
    const qty = parseFloat(row[qtyField.key] || "0");
    const rate = parseFloat(row[rateField.key] || "0");
    return isNaN(qty) || isNaN(rate) ? 0 : qty * rate;
  }

  const grandTotal = rows.reduce((sum, row) => sum + rowTotal(row), 0);

  const colTemplate = `${section.fields.map(() => "1fr").join(" ")}${hasTotal ? " 90px" : ""} 40px`;

  return (
    <div className="space-y-2">
      {/* Column headers (desktop) */}
      <div
        className="hidden sm:grid gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider"
        style={{ gridTemplateColumns: colTemplate }}
      >
        {section.fields.map((f) => (
          <div key={f.key}>{f.label}</div>
        ))}
        {hasTotal && <div className="text-right">Amount</div>}
        <div />
      </div>

      {/* Data rows */}
      {rows.map((row, ri) => {
        const total = rowTotal(row);
        return (
          <div
            key={ri}
            className="grid gap-2 items-start"
            style={{ gridTemplateColumns: colTemplate }}
          >
            {section.fields.map((field) => (
              <div key={field.key}>
                <span className="sm:hidden text-xs text-muted-foreground block mb-1">
                  {field.label}
                </span>
                <FieldRenderer
                  field={field}
                  skill={skill}
                  value={row[field.key] || ""}
                  onChange={(v) => updateCell(ri, field.key, v)}
                />
              </div>
            ))}
            {hasTotal && (
              <div className="flex items-center justify-end h-9 text-sm font-mono tabular-nums">
                {total > 0
                  ? total.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"}
              </div>
            )}
            <div className="flex items-center h-9">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(ri)}
                disabled={rows.length <= (section.min_rows || 0)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}

      {/* Grand total row */}
      {hasTotal && rows.length > 0 && grandTotal > 0 && (
        <div
          className="grid gap-2 border-t pt-2"
          style={{ gridTemplateColumns: colTemplate }}
        >
          {section.fields.map((f) => (
            <div key={f.key} />
          ))}
          <div className="flex items-center justify-end text-sm font-semibold font-mono tabular-nums">
            {grandTotal.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div />
        </div>
      )}

      {/* Add row button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 mt-1"
        onClick={addRow}
        disabled={
          section.max_rows !== undefined && rows.length >= section.max_rows
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Add Row
      </Button>
    </div>
  );
}

// ── Main DynamicForm Component ──────────────────────────────────────────────

export interface DynamicFormProps {
  spec: FormSpec;
  skill: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function DynamicForm({
  spec,
  skill,
  onSuccess,
  onCancel,
}: DynamicFormProps) {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Simple field state (non-repeatable sections)
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const section of spec.sections) {
      if (section.type !== "repeatable") {
        for (const field of section.fields) {
          initial[field.key] = resolveDefault(field.default);
        }
      }
    }
    return initial;
  });

  // Repeatable group state
  const [repeatables, setRepeatables] = useState<
    Record<string, Record<string, string>[]>
  >(() => {
    const initial: Record<string, Record<string, string>[]> = {};
    for (const section of spec.sections) {
      if (section.type === "repeatable" && section.key) {
        const row: Record<string, string> = {};
        for (const field of section.fields) {
          row[field.key] = resolveDefault(field.default);
        }
        initial[section.key] = [row];
      }
    }
    return initial;
  });

  function updateField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    for (const section of spec.sections) {
      if (section.type === "repeatable" && section.key) {
        const rows = repeatables[section.key] || [];
        if ((section.min_rows || 0) > 0 && rows.length === 0) {
          return `${section.label}: At least ${section.min_rows} row required`;
        }
        for (let i = 0; i < rows.length; i++) {
          for (const field of section.fields) {
            if (field.required && !rows[i][field.key]) {
              return `${section.label} row ${i + 1}: ${field.label} is required`;
            }
          }
        }
      } else {
        for (const field of section.fields) {
          if (field.required && !fields[field.key]) {
            return `${field.label} is required`;
          }
        }
      }
    }
    return null;
  }

  async function handleSubmit() {
    const error = validate();
    if (error) {
      showToast({ type: "error", message: error });
      return;
    }

    setSubmitting(true);
    try {
      const params: Record<string, unknown> = {};
      // Scalar fields — convert string booleans to actual booleans for gateway
      for (const [k, v] of Object.entries(fields)) {
        if (v === "") continue;
        if (v === "true") { params[k] = true; continue; }
        if (v === "false") { params[k] = false; continue; }
        params[k] = v;
      }
      // Repeatable groups as JSON strings
      for (const [key, rows] of Object.entries(repeatables)) {
        if (rows.length > 0) {
          params[key] = JSON.stringify(rows);
        }
      }

      const result = await postAction(skill, spec.submit_action, params);

      if (result.status === "ok") {
        showToast({
          type: "success",
          message: `${spec.title.replace("New ", "")} created successfully`,
        });
        onSuccess?.();
      } else {
        showToast({
          type: "error",
          message: result.message || "Action failed",
          duration: 0,
        });
      }
    } catch (e) {
      showToast({ type: "error", message: String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{spec.title}</CardTitle>
        {spec.description && (
          <CardDescription>{spec.description}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {spec.sections.map((section, si) => (
          <div key={si}>
            {si > 0 && <Separator className="mb-4" />}
            <h3 className="text-sm font-semibold mb-3">{section.label}</h3>

            {section.type === "repeatable" && section.key ? (
              <RepeatableGroup
                section={section}
                skill={skill}
                rows={repeatables[section.key] || []}
                onChange={(rows) =>
                  setRepeatables((prev) => ({
                    ...prev,
                    [section.key!]: rows,
                  }))
                }
              />
            ) : (
              <div
                className={`grid gap-4 ${
                  section.columns === 2 ? "sm:grid-cols-2" : "grid-cols-1"
                }`}
              >
                {section.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    {field.type !== "boolean" && (
                      <Label className="inline-flex items-center gap-1">
                        {field.label}
                        {field.required && (
                          <span className="text-destructive ml-0.5">*</span>
                        )}
                        {field.description && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">{field.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </Label>
                    )}
                    <FieldRenderer
                      field={field}
                      skill={skill}
                      value={fields[field.key] || ""}
                      onChange={(v) => updateField(field.key, v)}
                    />
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground">
                        {field.helpText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <CardFooter className="flex gap-2 border-t pt-4">
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="gap-2"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {submitting ? "Creating..." : spec.submit_label || "Create"}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
