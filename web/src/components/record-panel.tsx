"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Send,
  XCircle,
  Trash2,
  MessageSquare,
  Loader2,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import {
  DataTable,
  detectFieldType,
  formatHeader,
  renderCell,
  StatusBadge,
} from "@/components/data-table";
import { fetchApi } from "@/lib/api";
import { useChat } from "@/lib/chat";
import { useToast } from "@/components/toast-provider";

interface RecordPanelProps {
  open: boolean;
  onClose: () => void;
  skill: string;
  getAction: string | null;
  recordName: string;
  previewData?: Record<string, unknown>;
  allActions: string[];
  onRecordChange?: () => void;
}

export function RecordPanel({
  open,
  onClose,
  skill,
  getAction,
  recordName,
  previewData,
  allActions,
  onRecordChange,
}: RecordPanelProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [childTables, setChildTables] = useState<
    Record<string, Record<string, unknown>[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { open: openChat, sendMessage, setPageContext } = useChat();
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) {
      setData(null);
      setChildTables({});
      return;
    }
    if (getAction && recordName) {
      fetchRecord();
    } else if (previewData) {
      setData(previewData);
      setChildTables({});
    }
  }, [open, recordName, getAction]);

  async function fetchRecord() {
    setLoading(true);
    try {
      const result = await fetchApi(
        `/${skill}/${getAction}?name=${encodeURIComponent(recordName)}`
      );
      if (result.status === "ok") {
        const main: Record<string, unknown> = {};
        const children: Record<string, Record<string, unknown>[]> = {};
        let foundObject = false;

        for (const [key, value] of Object.entries(result)) {
          if (key === "status" || key === "message" || key === "_ui") continue;
          if (
            Array.isArray(value) &&
            value.length > 0 &&
            typeof value[0] === "object"
          ) {
            children[key] = value as Record<string, unknown>[];
          } else if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          ) {
            Object.assign(main, value as Record<string, unknown>);
            foundObject = true;
          } else if (!foundObject) {
            main[key] = value;
          }
        }

        setData(Object.keys(main).length > 0 ? main : previewData || null);
        setChildTables(children);
      } else {
        setData(previewData || null);
        setChildTables({});
      }
    } catch {
      setData(previewData || null);
      setChildTables({});
    } finally {
      setLoading(false);
    }
  }

  const entity = getAction ? getAction.replace("get-", "") : "";

  function getContextualActions() {
    if (!data || !entity) return [];
    const status = String(
      data.status || data.docstatus || ""
    ).toLowerCase();
    const actions: {
      label: string;
      action: string;
      variant: "default" | "destructive" | "outline";
      icon: React.ReactNode;
      confirm?: string;
    }[] = [];

    if (status === "draft" || status === "0") {
      if (allActions.includes(`submit-${entity}`))
        actions.push({
          label: "Submit",
          action: `submit-${entity}`,
          variant: "default",
          icon: <Send className="h-3.5 w-3.5" />,
          confirm: `Submit ${recordName}?`,
        });
      if (allActions.includes(`delete-${entity}`))
        actions.push({
          label: "Delete",
          action: `delete-${entity}`,
          variant: "destructive",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          confirm: `Delete ${recordName}? This cannot be undone.`,
        });
    } else if (status === "submitted" || status === "1") {
      if (allActions.includes(`cancel-${entity}`))
        actions.push({
          label: "Cancel",
          action: `cancel-${entity}`,
          variant: "destructive",
          icon: <XCircle className="h-3.5 w-3.5" />,
          confirm: `Cancel ${recordName}? This will reverse all ledger entries.`,
        });
    }

    return actions;
  }

  async function executeContextAction(action: string) {
    setActionLoading(action);
    try {
      const result = await fetchApi(`/${skill}/${action}`, {
        method: "POST",
        body: JSON.stringify({ name: recordName }),
      });
      if (result.status === "ok") {
        showToast({ type: "success", message: `${action} completed` });
        if (getAction) fetchRecord();
        onRecordChange?.();
      } else {
        showToast({
          type: "error",
          message: result.message || `${action} failed`,
          duration: 0,
        });
      }
    } catch (e) {
      showToast({ type: "error", message: String(e) });
    } finally {
      setActionLoading(null);
    }
  }

  function askAI() {
    const label = entity ? entity.replace(/-/g, " ") : "this record";
    onClose();
    setPageContext({ skill, entity, recordId: recordName, view: "detail" });
    openChat();
    setTimeout(() => {
      sendMessage(`Tell me about ${label} ${recordName}`);
    }, 150);
  }

  const contextActions = getContextualActions();

  const displayTitle = data
    ? String(
        data.title ||
          data.customer_name ||
          data.supplier_name ||
          data.employee_name ||
          data.item_name ||
          data.name ||
          recordName
      )
    : recordName;

  const displayStatus = data
    ? String(data.status || data.docstatus || "")
    : "";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg lg:max-w-2xl p-0 flex flex-col"
        showCloseButton={false}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{displayTitle}</SheetTitle>
          <SheetDescription>Record detail view</SheetDescription>
        </SheetHeader>

        {/* Header */}
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold truncate">
                {displayTitle}
              </h2>
              {displayTitle !== recordName && (
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {recordName}
                </p>
              )}
            </div>
            {displayStatus && <StatusBadge value={displayStatus} />}
          </div>

          <div className="flex gap-2 mt-3 flex-wrap">
            {contextActions.map((a) => (
              <Button
                key={a.action}
                variant={a.variant}
                size="sm"
                className="gap-1.5"
                disabled={actionLoading !== null}
                onClick={() => {
                  if (a.confirm && !window.confirm(a.confirm)) return;
                  executeContextAction(a.action);
                }}
              >
                {actionLoading === a.action ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  a.icon
                )}
                {a.label}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={askAI}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Ask AI
            </Button>
            {getAction && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 ml-auto"
                onClick={fetchRecord}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading && !data ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data ? (
            <>
              <RecordFields data={data} />
              {Object.entries(childTables).map(
                ([key, items]) =>
                  items.length > 0 && (
                    <div key={key}>
                      <Separator className="mb-4" />
                      <h3 className="text-sm font-semibold mb-3">
                        {formatHeader(key)}{" "}
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {items.length}
                        </Badge>
                      </h3>
                      <DataTable data={items} />
                    </div>
                  )
              )}
            </>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Record not found
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Record Fields ──────────────────────────────────────────────────────────

function RecordFields({ data }: { data: Record<string, unknown> }) {
  const keys = Object.keys(data);
  const idFields = keys.filter(
    (k) => k === "id" || (k.endsWith("_id") && k !== "tax_id")
  );
  const dateFields = keys.filter(
    (k) => k.includes("date") || k.endsWith("_at")
  );
  const skip = new Set([...idFields, ...dateFields, "status", "docstatus"]);
  const mainFields = keys.filter((k) => !skip.has(k));

  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {mainFields.map((key) => {
          const value = data[key];
          if (typeof value === "object" && value !== null) return null;
          const fieldType = detectFieldType(key, value);
          return (
            <div key={key} className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                {formatHeader(key)}
              </p>
              <div className="text-sm font-medium">
                {renderCell(value, fieldType)}
              </div>
            </div>
          );
        })}
      </div>

      {dateFields.length > 0 && (
        <>
          <Separator />
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {dateFields.map((key) => {
              const fieldType = detectFieldType(key, data[key]);
              return (
                <div key={key} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    {formatHeader(key)}
                  </p>
                  <div className="text-sm font-medium">
                    {renderCell(data[key], fieldType)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {idFields.length > 0 && (
        <>
          <Separator />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              System IDs ({idFields.length})
            </summary>
            <div className="mt-2 space-y-1 font-mono">
              {idFields.map((key) => (
                <div key={key}>
                  <span>{formatHeader(key)}:</span> {String(data[key] ?? "—")}
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
