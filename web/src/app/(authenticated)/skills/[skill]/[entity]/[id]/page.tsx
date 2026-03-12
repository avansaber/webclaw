"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Pencil, XCircle, Trash2, Send, ChevronDown } from "lucide-react";
import { postAction } from "@/lib/api";
import { useUIConfig } from "@/lib/ui-config";
import { useToast } from "@/components/toast-provider";
import { DataTable } from "@/components/data-table";
import { useSkillActions, useEntityDetail } from "@/lib/hooks";
import type { DetailSectionDef, EntityDef } from "@/lib/ui-yaml-types";
import {
  entityKeyFromSlug,
  entityLabel,
  deriveGetAction,
  getEntityListUrl,
  getEntityEditUrl,
  getSkillDashboardUrl,
  listActionFromSlug,
  buildIdPayload,
  singularize,
} from "@/lib/entity-routing";

function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bid\b/gi, "ID")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  // Format currency-looking fields (exclude count/unit fields)
  const isCurrency = (key.includes("amount") || key.includes("price") || key.includes("rate") || key.includes("balance")
    || (key.includes("total") && !key.includes("unit") && !key.includes("count") && !key.includes("quantity")))
    && !key.includes("_count") && !key.includes("_units");
  if (isCurrency && !isNaN(Number(s))) {
    return `$${Number(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return s;
}

function StatusBadge({ status, colors }: { status: string; colors?: Record<string, string> }) {
  const colorMap: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    gray: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  };
  const defaultMap: Record<string, string> = {
    active: "green", submitted: "green", approved: "green", paid: "green", completed: "green",
    draft: "blue", pending: "blue", open: "blue", in_progress: "blue",
    cancelled: "red", rejected: "red", overdue: "red", denied: "red",
    expired: "yellow", on_hold: "yellow",
  };

  const colorName = colors?.[status] || defaultMap[status.toLowerCase()] || "gray";
  const classes = colorMap[colorName] || colorMap.gray;

  return <Badge className={`${classes} capitalize`}>{status.replace(/_/g, " ")}</Badge>;
}

// ── Sectioned Layout (UI.yaml-driven) ─────────────────────────────────────────

function DetailSection({
  section,
  record,
  entityDef,
  skill,
  slug,
}: {
  section: DetailSectionDef;
  record: Record<string, unknown>;
  entityDef: EntityDef;
  skill: string;
  slug: string;
}) {
  const [open, setOpen] = useState(!section.collapsible);

  // Child table section: find array in record matching child_entity
  if (section.type === "child_table" && section.child_entity) {
    const childKey = section.child_entity;
    // Try: exact match, then strip prefix (e.g. "sales_invoice_item" → "items")
    const childData = (
      record[childKey] ||
      record[childKey + "s"] ||
      Object.entries(record).find(([k, v]) =>
        Array.isArray(v) && (k.includes(childKey.split("_").pop() || "") || k === section.label.toLowerCase().replace(/ /g, "_")),
      )?.[1]
    ) as Record<string, unknown>[] | undefined;

    if (!childData || !Array.isArray(childData) || childData.length === 0) return null;

    const content = (
      <>
        <DataTable
          data={childData}
          exportFilename={`${skill}-${slug}-${childKey}`}
        />
        {section.summary_fields && section.summary_fields.length > 0 && (
          <div className="flex gap-6 mt-2 justify-end">
            {section.summary_fields.map((sf) => {
              const total = childData.reduce((sum, row) => {
                const val = Number(row[sf.field]);
                return isNaN(val) ? sum : sum + val;
              }, 0);
              return (
                <span key={sf.field} className="text-sm font-medium">
                  {formatFieldLabel(sf.field)}: ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              );
            })}
          </div>
        )}
      </>
    );

    if (section.collapsible) {
      return (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full text-left">
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
              <h3 className="text-sm font-semibold capitalize">
                {section.label} ({childData.length})
              </h3>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">{content}</CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <div>
        <h3 className="text-sm font-semibold mb-2 capitalize">
          {section.label} ({childData.length})
        </h3>
        {content}
      </div>
    );
  }

  // Related list section: skip for now (would need async fetch)
  if (section.type === "related_list") return null;

  // Regular field section
  const fields = section.fields || [];
  if (fields.length === 0) return null;

  const cols = section.columns || 2;
  const gridClass = cols === 1 ? "grid-cols-1" : cols === 3 ? "grid-cols-1 md:grid-cols-3" : cols >= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 md:grid-cols-2";

  const content = (
    <div className={`grid ${gridClass} gap-4`}>
      {fields.map((fieldKey) => {
        const value = record[fieldKey];
        if (value === undefined) return null;
        return (
          <div key={fieldKey}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {entityDef.fields?.[fieldKey]?.label || formatFieldLabel(fieldKey)}
            </p>
            <p className="text-sm mt-0.5">{formatFieldValue(fieldKey, value)}</p>
          </div>
        );
      })}
    </div>
  );

  if (section.collapsible) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 w-full text-left">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            <h3 className="text-sm font-semibold">{section.label}</h3>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">{content}</CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{section.label}</h3>
      {content}
    </div>
  );
}

export default function EntityDetailPage({
  params,
}: {
  params: Promise<{ skill: string; entity: string; id: string }>;
}) {
  const { skill, entity: slug, id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { config: uiConfig } = useUIConfig(skill);
  const { showToast } = useToast();

  const listAction = listActionFromSlug(slug);
  const entityKey = entityKeyFromSlug(slug, uiConfig);
  const entityDef = entityKey && uiConfig?.entities?.[entityKey] ? uiConfig.entities[entityKey] : undefined;
  const label = entityLabel(slug, uiConfig);
  const singularLabel = singularize(label.toLowerCase()).split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const [confirmAction, setConfirmAction] = useState<{ action: string; label: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const decodedId = decodeURIComponent(id);

  // Discover actions via React Query (cached across pages)
  const { actions: allActions, isLoading: actionsLoading } = useSkillActions(skill);
  const actionsLoaded = !actionsLoading;

  // Validate getAction against available actions (prevents calling non-existent actions)
  const getAction = actionsLoaded
    ? deriveGetAction(listAction, allActions.length > 0 ? allActions : undefined)
    : null;

  // Load record via React Query (only after getAction is validated)
  const { data: recordData, isLoading: recordLoading } = useEntityDetail(
    skill, getAction || "", decodedId,
    { enabled: !!getAction, entitySlug: slug },
  );

  // Extract record from response
  const record = recordData
    ? ((recordData.data || recordData.record || recordData) as Record<string, unknown>)
    : null;
  const loading = actionsLoading || recordLoading;

  // Determine available actions for this record
  const status = record?.status as string | undefined;
  const detailViewActions = entityDef?.views?.detail?.actions || [];
  const availableActions = detailViewActions.filter((a) => {
    if (a.requires_status && status && a.requires_status !== status) return false;
    return allActions.includes(a.action);
  });

  // Also offer generic actions based on available actions list
  const genericActions: { action: string; label: string; icon: React.ReactNode; variant: "default" | "outline" | "destructive" }[] = [];
  const entityName = singularize(slug).replace(/-/g, "_");
  if (allActions.includes(`update-${entityName}`) && status === "draft") {
    genericActions.push({ action: "edit", label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, variant: "outline" });
  }
  if (allActions.includes(`submit-${entityName}`) && status === "draft") {
    genericActions.push({ action: `submit-${entityName}`, label: "Submit", icon: <Send className="h-3.5 w-3.5" />, variant: "default" });
  }
  if (allActions.includes(`cancel-${entityName}`) && status === "submitted") {
    genericActions.push({ action: `cancel-${entityName}`, label: "Cancel", icon: <XCircle className="h-3.5 w-3.5" />, variant: "destructive" });
  }
  if (allActions.includes(`delete-${entityName}`) && status === "draft") {
    genericActions.push({ action: `delete-${entityName}`, label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, variant: "destructive" });
  }

  async function executeAction(action: string) {
    setActionLoading(true);
    try {
      await postAction(skill, action, buildIdPayload(slug, decodedId));
      showToast({ type: "success", message: `${action} completed successfully` });
      setConfirmAction(null);
      // Refetch record and related queries
      queryClient.invalidateQueries({ queryKey: ["entity-detail", skill] });
      queryClient.invalidateQueries({ queryKey: ["entity-list", skill] });
      queryClient.invalidateQueries({ queryKey: ["skill-status", skill] });
    } catch (err) {
      showToast({ type: "error", message: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (actionsLoaded && !getAction) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(getEntityListUrl(skill, slug))}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to {label}
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Detail view is not available for {label.toLowerCase()}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(getEntityListUrl(skill, slug))}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to {label}
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">Record not found: {decodedId}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Resolve header fields from UI.yaml or defaults
  const detailHeader = entityDef?.views?.detail?.header;
  const primaryField = detailHeader?.title_field || entityDef?.primary_field || "name";
  const subtitleField = detailHeader?.subtitle_field || entityDef?.secondary_field;
  const statusField = detailHeader?.status_field || entityDef?.status_field || "status";
  const amountField = detailHeader?.amount_field;

  // Section-based layout (from UI.yaml) vs auto-layout
  const sections = entityDef?.views?.detail?.sections;
  const useSections = sections && sections.length > 0;

  // Auto-layout: group fields for display
  const hiddenFields = new Set(["id", "created_at", "updated_at", "company_id", "_ui"]);
  const displayFields = !useSections ? Object.entries(record).filter(
    ([key]) => !hiddenFields.has(key) && key !== primaryField && key !== statusField && !key.endsWith("_id"),
  ) : [];

  // Separate child arrays from scalar fields (only include arrays of objects, not strings/numbers)
  const scalarFields: [string, unknown][] = displayFields.filter(([, v]) => !Array.isArray(v));
  const arrayFields: [string, Record<string, unknown>[]][] = displayFields
    .filter(([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null)
    .map(([k, v]) => [k, v as Record<string, unknown>[]]);

  // Action buttons (shared between both layouts)
  const actionButtons = (genericActions.length > 0 || availableActions.length > 0) ? (
    <>
      <Separator />
      <div className="flex gap-2 flex-wrap">
        {genericActions.map((ga) =>
          ga.action === "edit" ? (
            <Button
              key={ga.action}
              variant={ga.variant}
              size="sm"
              className="gap-1.5"
              onClick={() => router.push(getEntityEditUrl(skill, slug, decodedId))}
            >
              {ga.icon} {ga.label}
            </Button>
          ) : (
            <Button
              key={ga.action}
              variant={ga.variant}
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmAction({ action: ga.action, label: ga.label })}
            >
              {ga.icon} {ga.label}
            </Button>
          ),
        )}
        {availableActions.map((da) => (
          <Button
            key={da.action}
            variant={da.destructive ? "destructive" : da.primary ? "default" : "outline"}
            size="sm"
            onClick={() => setConfirmAction({ action: da.action, label: da.label })}
          >
            {da.label}
          </Button>
        ))}
      </div>
    </>
  ) : null;

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(getEntityListUrl(skill, slug))}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {label}
        </Button>
      </div>

      {/* Record card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">
                {String(record[primaryField] || record.name || record.id || decodedId)}
              </CardTitle>
              {subtitleField && record[subtitleField] ? (
                <p className="text-muted-foreground mt-1">{String(record[subtitleField])}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {amountField && record[amountField] != null ? (
                <span className="text-lg font-semibold">
                  {formatFieldValue(amountField, record[amountField])}
                </span>
              ) : null}
              {record[statusField] ? (
                <StatusBadge
                  status={String(record[statusField])}
                  colors={entityDef?.status_colors}
                />
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {useSections ? (
            /* ── UI.yaml section-based layout ── */
            <>
              {sections.map((section, idx) => (
                <div key={section.label}>
                  {idx > 0 && <Separator className="mb-4" />}
                  <DetailSection
                    section={section}
                    record={record}
                    entityDef={entityDef!}
                    skill={skill}
                    slug={slug}
                  />
                </div>
              ))}

              {/* Timestamps */}
              {(record.created_at || record.updated_at) ? (
                <>
                  <Separator />
                  <div className="flex gap-6 text-xs text-muted-foreground">
                    {record.created_at ? <span>Created: {String(record.created_at)}</span> : null}
                    {record.updated_at ? <span>Updated: {String(record.updated_at)}</span> : null}
                  </div>
                </>
              ) : null}

              {actionButtons}
            </>
          ) : (
            /* ── Auto-layout (no UI.yaml sections) ── */
            <>
              {/* Scalar fields in 2-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scalarFields.map(([key, value]) => (
                  <div key={key}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {entityDef?.fields?.[key]?.label || formatFieldLabel(key)}
                    </p>
                    <p className="text-sm mt-0.5">{formatFieldValue(key, value)}</p>
                  </div>
                ))}
              </div>

              {/* Timestamps */}
              {(record.created_at || record.updated_at) ? (
                <>
                  <Separator />
                  <div className="flex gap-6 text-xs text-muted-foreground">
                    {record.created_at ? <span>Created: {String(record.created_at)}</span> : null}
                    {record.updated_at ? <span>Updated: {String(record.updated_at)}</span> : null}
                  </div>
                </>
              ) : null}

              {/* Child tables */}
              {arrayFields.map(([key, value]) => {
                const items = value as Record<string, unknown>[];
                if (items.length === 0) return null;
                return (
                  <div key={key}>
                    <Separator />
                    <h3 className="text-sm font-semibold mt-4 mb-2 capitalize">
                      {formatFieldLabel(key)} ({items.length})
                    </h3>
                    <DataTable data={items} exportFilename={`${skill}-${slug}-${key}`} />
                  </div>
                );
              })}

              {actionButtons}
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm: {confirmAction?.label}</DialogTitle>
            <DialogDescription>
              Are you sure you want to {confirmAction?.label.toLowerCase()} this {singularLabel.toLowerCase()}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.action.startsWith("cancel-") || confirmAction?.action.startsWith("delete-") ? "destructive" : "default"}
              disabled={actionLoading}
              onClick={() => confirmAction && executeAction(confirmAction.action)}
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {confirmAction?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
