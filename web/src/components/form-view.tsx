"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Save,
  Send,
  XCircle,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Plus,
  Minus,
} from "lucide-react";
import { postAction, fetchApi } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FieldDef {
  name: string;
  label?: string;
  type: "text" | "textarea" | "integer" | "decimal" | "currency" | "percent" |
        "date" | "datetime" | "select" | "boolean" | "email" | "link" | "hidden";
  required?: boolean;
  placeholder?: string;
  options?: string[];  // for select
  default?: unknown;
  section?: string;
  linkAction?: string; // for link fields: action to search (e.g. "list-customers")
  linkSkill?: string;  // skill for link search
  linkLabelField?: string; // which field to show as label
}

export interface FormSection {
  title: string;
  fields: string[];
}

export interface FormViewProps {
  skill: string;
  action: string;       // e.g. "add-sales-invoice"
  fields: FieldDef[];
  sections?: FormSection[];
  initialValues?: Record<string, unknown>;
  onSuccess?: (result: Record<string, unknown>) => void;
  onCancel?: () => void;
  title?: string;
  submitLabel?: string;
}

// ── Field Components ─────────────────────────────────────────────────────────

function TextField({ field, value, onChange, error }: {
  field: FieldDef; value: string; onChange: (v: string) => void; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.name} className="text-sm">
        {field.label || formatLabel(field.name)}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {field.type === "textarea" ? (
        <textarea
          id={field.name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <Input
          id={field.name}
          type={field.type === "email" ? "email" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function NumberField({ field, value, onChange, error }: {
  field: FieldDef; value: string; onChange: (v: string) => void; error?: string;
}) {
  const prefix = field.type === "currency" ? "$" : undefined;
  const suffix = field.type === "percent" ? "%" : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.name} className="text-sm">
        {field.label || formatLabel(field.name)}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">{prefix}</span>}
        <Input
          id={field.name}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) onChange(v);
          }}
          placeholder={field.placeholder || "0"}
          className={`font-mono tabular-nums ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`}
        />
        {suffix && <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function DateField({ field, value, onChange, error }: {
  field: FieldDef; value: string; onChange: (v: string) => void; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.name} className="text-sm">
        {field.label || formatLabel(field.name)}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Input
        id={field.name}
        type={field.type === "datetime" ? "datetime-local" : "date"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SelectField({ field, value, onChange, error }: {
  field: FieldDef; value: string; onChange: (v: string) => void; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {field.label || formatLabel(field.name)}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={field.placeholder || "Select..."} />
        </SelectTrigger>
        <SelectContent>
          {(field.options || []).map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function BooleanField({ field, value, onChange }: {
  field: FieldDef; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-input"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <Label className="text-sm cursor-pointer" onClick={() => onChange(!value)}>
        {field.label || formatLabel(field.name)}
      </Label>
    </div>
  );
}

function LinkField({ field, value, onChange, error, skill }: {
  field: FieldDef; value: string; onChange: (v: string) => void; error?: string; skill: string;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!field.linkAction || q.length < 1) return;
    setLoading(true);
    try {
      const sk = field.linkSkill || skill;
      const data = await fetchApi(`/${sk}/${field.linkAction}?search=${encodeURIComponent(q)}&limit=10`);
      const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]) && k !== "status");
      if (arrayKey) setOptions(data[arrayKey] as Record<string, unknown>[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, [field.linkAction, field.linkSkill, skill]);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {field.label || formatLabel(field.name)}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="relative">
        <Input
          value={search || value}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            doSearch(e.target.value);
          }}
          onFocus={() => { if (search || value) setOpen(true); }}
          placeholder={field.placeholder || "Search..."}
        />
        {open && options.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
            {options.map((opt, i) => {
              const label = String(opt[field.linkLabelField || "name"] || opt["id"] || "");
              const id = String(opt["id"] || "");
              return (
                <button
                  key={i}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onChange(id);
                    setSearch(label);
                    setOpen(false);
                  }}
                >
                  {label}
                  {id !== label && <span className="ml-2 text-xs text-muted-foreground">{id.slice(0, 8)}</span>}
                </button>
              );
            })}
          </div>
        )}
        {loading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Child Table (Line Items) ─────────────────────────────────────────────────

export interface ChildTableProps {
  label: string;
  columns: FieldDef[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
}

export function ChildTable({ label, columns, rows, onChange }: ChildTableProps) {
  function addRow() {
    const empty: Record<string, string> = {};
    for (const col of columns) empty[col.name] = String(col.default ?? "");
    onChange([...rows, empty]);
  }

  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx));
  }

  function updateCell(rowIdx: number, field: string, value: string) {
    const updated = rows.map((r, i) => i === rowIdx ? { ...r, [field]: value } : r);
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
          <Plus className="h-3 w-3" /> Add Row
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                {columns.map((col) => (
                  <th key={col.name} className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
                    {col.label || formatLabel(col.name)}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b last:border-0">
                  <td className="px-2 py-1 text-xs text-muted-foreground">{rowIdx + 1}</td>
                  {columns.map((col) => (
                    <td key={col.name} className="px-1 py-1">
                      <Input
                        value={row[col.name] || ""}
                        onChange={(e) => updateCell(rowIdx, col.name, e.target.value)}
                        className="h-7 text-xs"
                        placeholder={col.placeholder}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(rowIdx)} className="h-7 w-7 p-0">
                      <Minus className="h-3 w-3 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── WizardFlow (Submit confirmation) ─────────────────────────────────────────

export interface WizardFlowProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  loading: boolean;
  result?: { status: "ok" | "error"; message?: string } | null;
  destructive?: boolean;
}

export function WizardFlow({ open, onClose, title, description, onConfirm, loading, result, destructive }: WizardFlowProps) {
  const step = result ? "result" : loading ? "processing" : "confirm";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !loading) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "result" && result?.status === "ok" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {step === "result" && result?.status === "error" && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {step === "processing" && <Loader2 className="h-5 w-5 animate-spin" />}
            {title}
          </DialogTitle>
          <DialogDescription>
            {step === "confirm" && description}
            {step === "processing" && "Processing..."}
            {step === "result" && (result?.message || (result?.status === "ok" ? "Action completed successfully." : "An error occurred."))}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
                {destructive ? "Confirm" : "Proceed"}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Main FormView ────────────────────────────────────────────────────────────

export function FormView({ skill, action, fields, sections, initialValues, onSuccess, onCancel, title, submitLabel }: FormViewProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const f of fields) {
      initial[f.name] = initialValues?.[f.name] ?? f.default ?? (f.type === "boolean" ? false : "");
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<Record<string, unknown> | null>(null);

  function setValue(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (f.required && !values[f.name] && values[f.name] !== 0 && values[f.name] !== false) {
        errs[f.name] = `${f.label || formatLabel(f.name)} is required`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      // Build params: only include non-empty values, skip hidden
      const params: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.type === "hidden") continue;
        const v = values[f.name];
        if (v !== "" && v !== null && v !== undefined) {
          params[f.name] = v;
        }
      }
      const result = await postAction(skill, action, params);
      setSubmitResult(result);
      if (result.status === "ok" && onSuccess) {
        onSuccess(result);
      }
    } catch (e) {
      setSubmitResult({ status: "error", message: String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  // Group fields by section
  const sectionedFields = sections
    ? sections.map((s) => ({
        ...s,
        fieldDefs: s.fields.map((fname) => fields.find((f) => f.name === fname)).filter(Boolean) as FieldDef[],
      }))
    : [{ title: "", fields: fields.map((f) => f.name), fieldDefs: fields.filter((f) => f.type !== "hidden") }];

  function renderField(field: FieldDef) {
    const value = values[field.name];
    const error = errors[field.name];

    switch (field.type) {
      case "hidden":
        return null;
      case "boolean":
        return <BooleanField field={field} value={!!value} onChange={(v) => setValue(field.name, v)} />;
      case "select":
        return <SelectField field={field} value={String(value || "")} onChange={(v) => setValue(field.name, v)} error={error} />;
      case "date":
      case "datetime":
        return <DateField field={field} value={String(value || "")} onChange={(v) => setValue(field.name, v)} error={error} />;
      case "integer":
      case "decimal":
      case "currency":
      case "percent":
        return <NumberField field={field} value={String(value || "")} onChange={(v) => setValue(field.name, v)} error={error} />;
      case "link":
        return <LinkField field={field} value={String(value || "")} onChange={(v) => setValue(field.name, v)} error={error} skill={skill} />;
      case "text":
      case "textarea":
      case "email":
      default:
        return <TextField field={field} value={String(value || "")} onChange={(v) => setValue(field.name, v)} error={error} />;
    }
  }

  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Fill in the fields and save.</CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-6">
        {sectionedFields.map((section, idx) => (
          <div key={idx} className="space-y-4">
            {section.title && (
              <>
                {idx > 0 && <Separator />}
                <h3 className="text-sm font-medium text-muted-foreground">{section.title}</h3>
              </>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {section.fieldDefs.map((field) => (
                <div key={field.name}>{renderField(field)}</div>
              ))}
            </div>
          </div>
        ))}

        {/* Result message */}
        {submitResult && (
          <div className={`flex items-start gap-2 rounded-md p-3 text-sm ${submitResult.status === "ok" ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-destructive/10 text-destructive"}`}>
            {submitResult.status === "ok" ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertTriangle className="h-4 w-4 mt-0.5" />}
            <span>{String(submitResult.message || (submitResult.status === "ok" ? "Saved successfully" : "An error occurred"))}</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={submitting} className="gap-2 ml-auto">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {submitLabel || "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Action Buttons for DetailView ────────────────────────────────────────────

export interface ActionButtonConfig {
  action: string;
  label: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
  icon?: "submit" | "cancel" | "delete";
  confirm?: boolean;
  confirmMessage?: string;
}

export interface ActionButtonBarProps {
  skill: string;
  entityId: string;
  actions: ActionButtonConfig[];
  onActionComplete?: (action: string, result: Record<string, unknown>) => void;
}

export function ActionButtonBar({ skill, entityId, actions, onActionComplete }: ActionButtonBarProps) {
  const [wizard, setWizard] = useState<{ action: ActionButtonConfig; loading: boolean; result: { status: "ok" | "error"; message?: string } | null } | null>(null);

  async function executeAction(cfg: ActionButtonConfig) {
    if (cfg.confirm) {
      setWizard({ action: cfg, loading: false, result: null });
      return;
    }
    await doAction(cfg);
  }

  async function doAction(cfg: ActionButtonConfig) {
    setWizard((prev) => prev ? { ...prev, loading: true } : { action: cfg, loading: true, result: null });
    try {
      const result = await postAction(skill, cfg.action, { id: entityId });
      setWizard((prev) => prev ? { ...prev, loading: false, result: { status: result.status as "ok" | "error", message: result.message as string | undefined } } : null);
      if (result.status === "ok") onActionComplete?.(cfg.action, result);
    } catch (e) {
      setWizard((prev) => prev ? { ...prev, loading: false, result: { status: "error", message: String(e) } } : null);
    }
  }

  const iconMap = {
    submit: <Send className="h-3.5 w-3.5" />,
    cancel: <XCircle className="h-3.5 w-3.5" />,
    delete: <Trash2 className="h-3.5 w-3.5" />,
  };

  return (
    <>
      <div className="flex gap-2">
        {actions.map((cfg) => (
          <Button
            key={cfg.action}
            variant={cfg.variant || "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => executeAction(cfg)}
          >
            {cfg.icon && iconMap[cfg.icon]}
            {cfg.label}
          </Button>
        ))}
      </div>

      {wizard && (
        <WizardFlow
          open={true}
          onClose={() => setWizard(null)}
          title={wizard.action.label}
          description={wizard.action.confirmMessage || `Are you sure you want to ${wizard.action.label.toLowerCase()}?`}
          onConfirm={() => doAction(wizard.action)}
          loading={wizard.loading}
          result={wizard.result}
          destructive={wizard.action.variant === "destructive"}
        />
      )}
    </>
  );
}
