"use client";

import { Suspense, useEffect, useState, useMemo, use, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  List,
  Eye,
  Plus,
  Send,
  XCircle,
  Trash2,
  RefreshCw,
  Play,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Loader2,
  Route,
} from "lucide-react";
import { DataTable } from "@/components/data-table";
import { DetailView } from "@/components/detail-view";
import { RecordPanel } from "@/components/record-panel";
import { DynamicForm } from "@/components/dynamic-form";
import { ChatToggleButton } from "@/components/chat-panel";
import { SearchButton } from "@/components/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import {
  fetchApi,
  type ApiResponse,
  skillDisplayName,
} from "@/lib/api";
import { useChat } from "@/lib/chat";
import { useToast } from "@/components/toast-provider";
import { processUIDirectives } from "@/lib/ui-processor";
import type { ActionButton as UIActionButton, Highlight, Warning, Suggestion } from "@/lib/ui-types";
import { ConnectionStatus } from "@/components/connection-status";
import { useUIConfig } from "@/lib/ui-config";
import { generateFormSpec, getListActions, getFormActions } from "@/lib/ui-yaml-to-form";
import type { FormSpec } from "@/lib/form-spec";
import { useParamSchema } from "@/lib/param-schema";
import { useChildTableSchema } from "@/lib/child-table-schema";
import { generateAutoFormSpec } from "@/lib/auto-form-spec";
import { WorkflowGuide, hasWorkflow } from "@/components/workflow-guide";

// ── Helpers ──────────────────────────────────────────────────────────────────

function actionType(name: string): "list" | "get" | "add" | "update" | "submit" | "cancel" | "delete" | "other" {
  if (name.startsWith("list-")) return "list";
  if (name.startsWith("get-")) return "get";
  if (name.startsWith("add-") || name.startsWith("create-")) return "add";
  if (name.startsWith("update-")) return "update";
  if (name.startsWith("submit-")) return "submit";
  if (name.startsWith("cancel-")) return "cancel";
  if (name.startsWith("delete-")) return "delete";
  return "other";
}

function actionIcon(type: string) {
  switch (type) {
    case "list": return <List className="h-3.5 w-3.5" />;
    case "get": return <Eye className="h-3.5 w-3.5" />;
    case "add": return <Plus className="h-3.5 w-3.5" />;
    case "update": return <RefreshCw className="h-3.5 w-3.5" />;
    case "submit": return <Send className="h-3.5 w-3.5" />;
    case "cancel": return <XCircle className="h-3.5 w-3.5" />;
    case "delete": return <Trash2 className="h-3.5 w-3.5" />;
    default: return <Play className="h-3.5 w-3.5" />;
  }
}

function actionVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "list":
    case "get": return "secondary";
    case "add": return "default";
    case "submit": return "default";
    case "cancel":
    case "delete": return "destructive";
    default: return "outline";
  }
}

function deriveGetAction(listAction: string, allActions: string[]): string | null {
  if (!listAction.startsWith("list-")) return null;
  const plural = listAction.replace("list-", "");
  const candidates = [
    plural,
    plural.replace(/ies$/, "y"),
    plural.replace(/ses$/, "s"),
    plural.replace(/es$/, "e"),
    plural.replace(/es$/, ""),
    plural.replace(/s$/, ""),
  ];
  for (const c of candidates) {
    if (allActions.includes(`get-${c}`)) return `get-${c}`;
  }
  return null;
}

// ── Dashboard KPIs ───────────────────────────────────────────────────────────

function DashboardKPIs({ skill }: { skill: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchApi(`/${skill}/status`)
      .then((res) => {
        if (res.status === "ok") setData(res);
        else setData(null);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [skill]);

  if (loading) return null;
  if (!data) return null;

  // Extract KPI-worthy fields
  const kpis: { label: string; value: string; icon: React.ReactNode; color?: string }[] = [];

  // Revenue/totals
  if (data.total_revenue !== undefined) {
    kpis.push({
      label: "Revenue",
      value: `$${Number(data.total_revenue).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      icon: <DollarSign className="h-4 w-4" />,
    });
  }
  if (data.total_receivable !== undefined || data.total_outstanding !== undefined) {
    const val = data.total_receivable ?? data.total_outstanding;
    kpis.push({
      label: "Outstanding",
      value: `$${Number(val).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      icon: <TrendingUp className="h-4 w-4" />,
    });
  }

  // Count-based metrics
  const countKeys = [
    { key: "total_customers", label: "Customers" },
    { key: "draft_invoices", label: "Draft Invoices" },
    { key: "unpaid_invoices", label: "Unpaid Invoices" },
    { key: "overdue_invoices", label: "Overdue", color: "text-orange-600" },
    { key: "open_sales_orders", label: "Open Orders" },
    { key: "draft_quotations", label: "Draft Quotes" },
  ];

  for (const { key, label, color } of countKeys) {
    if (data[key] !== undefined && Number(data[key]) > 0) {
      kpis.push({
        label,
        value: String(data[key]),
        icon: key.includes("overdue")
          ? <AlertCircle className="h-4 w-4" />
          : <TrendingUp className="h-4 w-4" />,
        color,
      });
    }
  }

  if (kpis.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.slice(0, 4).map((kpi) => (
        <Card key={kpi.label} className="py-3">
          <CardContent className="px-4 py-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <span className={kpi.color || "text-muted-foreground"}>{kpi.icon}</span>
            </div>
            <p className={`text-xl font-bold mt-1 ${kpi.color || ""}`}>{kpi.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── ActionRunner (unchanged from original) ───────────────────────────────────

interface ActionRunnerProps {
  skill: string;
  action: string;
}

function ActionRunner({ skill, action }: ActionRunnerProps) {
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [paramInput, setParamInput] = useState({ key: "", value: "" });
  const [nextActions, setNextActions] = useState<UIActionButton[]>([]);
  const [highlights, setHighlights] = useState<Record<string, Highlight>>({});
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const { showToast } = useToast();
  const router = useRouter();

  const type = actionType(action);
  const isRead = type === "list" || type === "get" || type === "other";

  async function run() {
    setLoading(true);
    setResult(null);
    setNextActions([]);
    setHighlights({});
    setWarnings([]);
    setSuggestions([]);
    try {
      const uiCallbacks = {
        showToast,
        setAvailableActions: setNextActions,
        applyHighlights: setHighlights,
        showWarnings: setWarnings,
        showSuggestions: setSuggestions,
        scheduleRedirect: (r: { action: string; delay?: number }) => {
          const delay = r.delay ?? 0;
          setTimeout(() => router.push(`/skills/${skill}?action=${r.action}`), delay);
        },
      };
      if (isRead) {
        const query = Object.entries(params)
          .map(([k, v]) => `${k.replace(/^--?/, "")}=${encodeURIComponent(v)}`)
          .join("&");
        const path = `/${skill}/${action}${query ? "?" + query : ""}`;
        const data = await fetchApi(path);
        setResult(data);
        processUIDirectives(data, uiCallbacks);
      } else {
        const data = await fetchApi(`/${skill}/${action}`, {
          method: "POST",
          body: JSON.stringify(params),
        });
        setResult(data);
        processUIDirectives(data, uiCallbacks);
      }
    } catch (e) {
      setResult({ status: "error", message: String(e) });
    } finally {
      setLoading(false);
    }
  }

  function addParam() {
    if (paramInput.key.trim()) {
      setParams((p) => ({ ...p, [paramInput.key.trim()]: paramInput.value }));
      setParamInput({ key: "", value: "" });
    }
  }

  function removeParam(key: string) {
    setParams((p) => { const copy = { ...p }; delete copy[key]; return copy; });
  }

  function renderResult() {
    if (!result) return null;

    if (result.status === "error") {
      return (
        <Card className="border-destructive">
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-destructive">{result.message}</p>
            {Object.keys(highlights).length > 0 && (
              <div className="space-y-1 mt-2">
                {Object.entries(highlights).map(([field, h]) => (
                  <div key={field} className="flex items-center gap-2 text-xs">
                    <Badge variant={h.type === "error" ? "destructive" : "secondary"} className="text-[10px]">
                      {field.replace(/_/g, " ")}
                    </Badge>
                    {h.type === "status_change" && <span>{h.from} → {h.to}</span>}
                    {h.type === "delta" && <span className="font-mono">{h.delta}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    const arrayKey = Object.keys(result).find(
      (k) => Array.isArray(result[k]) && k !== "tags" && k !== "requires"
    );

    if (arrayKey && Array.isArray(result[arrayKey])) {
      const items = result[arrayKey] as Record<string, unknown>[];
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {result.total_count !== undefined
              ? `${items.length} of ${result.total_count} records`
              : `${items.length} records`}
          </p>
          <DataTable data={items} />
        </div>
      );
    }

    const dataKeys = Object.keys(result).filter(
      (k) => k !== "status" && k !== "message" && typeof result[k] === "object" && result[k] !== null && !Array.isArray(result[k])
    );

    if (dataKeys.length === 1) {
      return (
        <DetailView
          data={result[dataKeys[0]] as Record<string, unknown>}
          title={dataKeys[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        />
      );
    }

    return (
      <Card>
        <CardContent className="pt-6">
          <pre className="max-h-96 overflow-auto rounded bg-muted p-4 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {Object.entries(params).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(params).map(([k, v]) => (
              <Badge key={k} variant="secondary" className="gap-1 pr-1">
                {k}={v}
                <button onClick={() => removeParam(k)} className="ml-1 hover:text-destructive">
                  <XCircle className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="param name"
            value={paramInput.key}
            onChange={(e) => setParamInput((p) => ({ ...p, key: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addParam()}
            className="max-w-[200px]"
          />
          <Input
            placeholder="value"
            value={paramInput.value}
            onChange={(e) => setParamInput((p) => ({ ...p, value: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addParam()}
            className="max-w-[200px]"
          />
          <Button variant="outline" size="sm" onClick={addParam}>Add Param</Button>
        </div>
      </div>

      <Button onClick={run} disabled={loading} className="gap-2">
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : actionIcon(type)}
        {loading ? "Running..." : `Execute ${action}`}
      </Button>

      {renderResult()}

      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
              w.severity === "warning"
                ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
                : "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
            }`}>
              <span className="shrink-0">{w.severity === "warning" ? "⚠" : "ℹ"}</span>
              <span>{w.message}{w.field && <span className="ml-1 opacity-60">({w.field})</span>}</span>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Suggestions</p>
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span className="text-sm">{s.message}</span>
                {s.action && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    setParams(Object.fromEntries(Object.entries(s.params || {}).map(([k, v]) => [k, String(v)])));
                  }}>
                    {s.action}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {nextActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-medium uppercase text-muted-foreground self-center mr-1">Next:</span>
          {nextActions.map((a) => (
            <Button
              key={a.action}
              variant={a.destructive ? "destructive" : a.primary ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (a.confirm && !window.confirm(a.confirm)) return;
                setParams(Object.fromEntries(Object.entries(a.params || {}).map(([k, v]) => [k, String(v)])));
              }}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SkillPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  return (
    <Suspense fallback={
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <SkillPageContent params={params} />
    </Suspense>
  );
}

function SkillPageContent({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill } = use(params);
  const searchParams = useSearchParams();
  const [skillMeta, setSkillMeta] = useState<Record<string, unknown> | null>(null);
  const [allActions, setAllActions] = useState<string[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [quickData, setQuickData] = useState<ApiResponse | null>(null);
  const [quickAction, setQuickAction] = useState<string>("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? (Math.max(1, parseInt(p, 10)) - 1) * 20 : 0;
  });
  const pageSize = 20;
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecordName, setDetailRecordName] = useState("");
  const [detailGetAction, setDetailGetAction] = useState<string | null>(null);
  const [detailPreview, setDetailPreview] = useState<Record<string, unknown> | undefined>();
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("browse");
  const router = useRouter();
  const { setPageContext, open: openChat, sendMessage } = useChat();
  const { showToast } = useToast();

  // Sync pagination state to URL search params (shallow — no full page reload)
  const updatePaginationUrl = useCallback(
    (offset: number) => {
      const pageNum = Math.floor(offset / pageSize) + 1;
      const params = new URLSearchParams(searchParams.toString());
      if (pageNum <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(pageNum));
      }
      const qs = params.toString();
      const newPath = `/skills/${skill}${qs ? "?" + qs : ""}`;
      router.replace(newPath, { scroll: false });
    },
    [searchParams, skill, router],
  );

  // Load UI.yaml config for this skill
  const { config: uiConfig, loading: uiConfigLoading } = useUIConfig(skill);

  // Load SKILL.md param schema (auto-gen fallback)
  const { schema: paramSchema, loading: paramLoading } = useParamSchema(skill);
  // Load child table schema for auto-repeatable rendering (L1 path)
  const { schema: childTableSchema } = useChildTableSchema(skill);

  // Get entity-aware list actions from UI.yaml
  const entityListActions = useMemo(() => {
    if (!uiConfig) return null;
    return getListActions(uiConfig);
  }, [uiConfig]);

  // Get form-capable actions from UI.yaml
  const formActions = useMemo(() => {
    if (!uiConfig) return null;
    return getFormActions(uiConfig);
  }, [uiConfig]);

  // Derive display name using UI.yaml or fallback
  const displayName = uiConfig?.display_name || skillDisplayName(skill);

  // Fallback list actions (when no UI.yaml)
  const listActions = allActions.filter((a) => a.startsWith("list-"));

  // Entity groups from paramSchema (Layer 0/1 — between UI.yaml and raw fallback)
  const paramEntityListActions = useMemo(() => {
    if (!paramSchema?.entity_groups?.length) return null;
    return paramSchema.entity_groups
      .map((g) => {
        const listAction = g.actions.find((a) => a.startsWith("list-"));
        const addAction = g.actions.find((a) => a.startsWith("add-") || a.startsWith("create-"));
        return listAction
          ? { action: listAction, entity: g.name, label: g.name, addAction }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [paramSchema]);

  // Set chat context
  useEffect(() => {
    setPageContext({ skill, view: "list" });
  }, [skill, setPageContext]);

  // Load skill metadata + actions
  useEffect(() => {
    fetchApi("/schema/skills").then((data) => {
      const skills = (data.skills || []) as Record<string, unknown>[];
      const found = skills.find((s) => s.name === skill);
      if (found) setSkillMeta(found);
    });

    setActionsLoading(true);
    setAllActions([]);
    setQuickAction("");
    setQuickData(null);
    setActiveForm(null);
    fetchApi(`/schema/actions/${skill}`)
      .then((data) => {
        const actions = (data.actions as string[]) || [];
        setAllActions(actions);
        // Auto-load first list action, respecting URL page param
        const firstList = actions.find((a) => a.startsWith("list-"));
        if (firstList) {
          const urlPage = searchParams.get("page");
          const initialOffset = urlPage ? (Math.max(1, parseInt(urlPage, 10)) - 1) * pageSize : 0;
          loadAction(firstList, initialOffset);
        }
      })
      .catch(() => {})
      .finally(() => setActionsLoading(false));
  }, [skill]);

  // When paramSchema loads entity groups and we haven't loaded any data yet,
  // auto-load the first list action from entity groups
  useEffect(() => {
    if (paramSchema?.entity_groups?.length && !quickAction && !actionsLoading) {
      const firstGroup = paramSchema.entity_groups[0];
      const listAction = firstGroup.actions.find((a) => a.startsWith("list-"));
      if (listAction) {
        // Also merge discovered actions from paramSchema
        if (allActions.length === 0) {
          const allFromSchema = paramSchema.entity_groups.flatMap((g) => g.actions);
          // Add any non-grouped actions too
          const grouped = new Set(allFromSchema);
          const extraActions = Object.keys(paramSchema.actions).filter((a) => !grouped.has(a));
          setAllActions([...allFromSchema, ...extraActions]);
        }
        loadAction(listAction);
      }
    }
  }, [paramSchema, quickAction, actionsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAction(action: string, offset = 0) {
    setQuickLoading(true);
    setQuickAction(action);
    setPage(offset);
    updatePaginationUrl(offset);
    try {
      const data = await fetchApi(`/${skill}/${action}?limit=${pageSize}&offset=${offset}`);
      setQuickData(data);
    } catch {
      setQuickData({ status: "error", message: "Failed to load" });
    } finally {
      setQuickLoading(false);
    }
  }

  function handleRowClick(row: Record<string, unknown>) {
    const name = String(row.name || row.id || "");
    if (!name) return;
    setDetailRecordName(name);
    // Use UI.yaml row_click if available, else derive
    const entityInfo = entityListActions?.find((e) => e.action === quickAction);
    const entity = entityInfo ? uiConfig?.entities[entityInfo.entity] : null;
    const rowClickAction = entity?.views?.list?.row_click;
    setDetailGetAction(
      rowClickAction || deriveGetAction(quickAction, allActions)
    );
    setDetailPreview(row);
    setDetailOpen(true);
  }

  // Resolve a FormSpec: UI.yaml first → SKILL.md auto-gen → null
  function resolveFormSpec(action: string): FormSpec | null {
    // L2: UI.yaml (richest forms — child tables, entity lookups, display fields)
    if (uiConfig) {
      const spec = generateFormSpec(uiConfig, action);
      if (spec) return spec;
    }
    // Don't fall through to auto-FormSpec while UI.yaml is still loading.
    // UI.yaml provides richer forms with explicit field configs.
    if (uiConfigLoading) return null;
    // L1: Auto-generate from SKILL.md param metadata (no UI.yaml available)
    if (paramSchema?.actions?.[action]) {
      return generateAutoFormSpec(skill, action, paramSchema.actions[action], childTableSchema ?? undefined);
    }
    return null;
  }

  // Get the add action for the current entity being browsed
  function getCurrentAddAction(): string | null {
    // UI.yaml path
    if (entityListActions) {
      const match = entityListActions.find((e) => e.action === quickAction);
      if (match?.addAction) return match.addAction;
    }
    // ParamSchema entity groups path
    if (paramEntityListActions) {
      const match = paramEntityListActions.find((e) => e.action === quickAction);
      if (match?.addAction && allActions.includes(match.addAction)) return match.addAction;
    }
    // Auto-derive: list-customers → add-customer or create-customer
    if (quickAction.startsWith("list-")) {
      const plural = quickAction.replace("list-", "");
      const singular = plural.replace(/ies$/, "y").replace(/ses$/, "s").replace(/s$/, "");
      const addCandidate = `add-${singular}`;
      const createCandidate = `create-${singular}`;
      if (allActions.includes(addCandidate)) return addCandidate;
      if (allActions.includes(createCandidate)) return createCandidate;
    }
    return null;
  }

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <BreadcrumbNav items={[{ label: "Skills", href: "/" }, { label: displayName }]} />
        <div className="ml-auto flex items-center gap-2">
          <ConnectionStatus />
          <SearchButton />
          {skillMeta && (
            <Badge variant="outline">v{String(skillMeta.version)}</Badge>
          )}
          {uiConfig && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
              UI
            </Badge>
          )}
          <ThemeToggle />
          <ChatToggleButton />
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        {/* Skill info */}
        {skillMeta && (
          <div className="flex items-start justify-between">
            <div>
              <p className="text-muted-foreground">
                {String(skillMeta.description || "")}
              </p>
              <div className="mt-2 flex gap-2">
                <Badge>Tier {String(skillMeta.tier)}</Badge>
                <Badge variant="secondary">{String(skillMeta.category)}</Badge>
                {((skillMeta.requires || []) as string[]).map((r) => (
                  <Badge key={r} variant="outline" className="text-xs">
                    requires: {r.replace("erpclaw-", "")}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dashboard KPIs */}
        <DashboardKPIs skill={skill} />

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setActiveForm(null); }}>
          <TabsList>
            <TabsTrigger value="browse">Browse Data</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            {hasWorkflow(skill) && (
              <TabsTrigger value="workflow" className="gap-1.5">
                <Route className="h-3.5 w-3.5" />
                Workflow
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── Browse Tab ──────────────────────────────────────────── */}
          <TabsContent value="browse" className="space-y-4">
            {actionsLoading && paramLoading ? (
              <div className="flex h-32 items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Discovering actions...</span>
              </div>
            ) : listActions.length === 0 && !paramEntityListActions?.length ? (
              <p className="text-muted-foreground">
                No list actions available. Use the Actions tab.
              </p>
            ) : (
              <>
                {/* Entity navigation buttons: UI.yaml → paramSchema groups → raw list actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {(entityListActions || paramEntityListActions || listActions.map((a) => ({
                    action: a,
                    entity: "",
                    label: a.replace("list-", "").replace(/-/g, " "),
                  }))).map((item) => (
                    <Button
                      key={item.action}
                      variant={quickAction === item.action ? "default" : "outline"}
                      size="sm"
                      onClick={() => loadAction(item.action)}
                      className="capitalize"
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>

                {/* Action bar: Add button + record count */}
                {quickAction && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const addAction = getCurrentAddAction();
                        if (!addAction) return null;
                        const formSpec = resolveFormSpec(addAction);
                        const label = addAction.replace(/^(add|create)-/, "").replace(/-/g, " ");
                        return (
                          <Button
                            size="sm"
                            className="gap-1.5 capitalize"
                            onClick={() => {
                              if (formSpec) {
                                setActiveForm(addAction);
                                setActiveTab("actions");
                              } else {
                                openChat();
                                sendMessage(`Create a new ${label}`);
                              }
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            New {label}
                          </Button>
                        );
                      })()}
                    </div>
                    {quickData && quickData.status !== "error" && (() => {
                      const arrayKey = Object.keys(quickData).find(
                        (k) => Array.isArray(quickData[k]) && k !== "tags" && k !== "requires"
                      );
                      if (!arrayKey) return null;
                      const items = quickData[arrayKey] as unknown[];
                      const total = (quickData.total_count as number) ?? items.length;
                      return (
                        <p className="text-sm text-muted-foreground">
                          Showing {page + 1}-{page + items.length} of {total}
                        </p>
                      );
                    })()}
                  </div>
                )}

                {/* Data table */}
                {quickLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : quickData ? (
                  <div className="space-y-3">
                    {quickData.status === "error" ? (
                      <Card className="border-destructive">
                        <CardContent className="pt-6">
                          <p className="text-sm text-destructive">{quickData.message}</p>
                        </CardContent>
                      </Card>
                    ) : (
                      (() => {
                        const arrayKey = Object.keys(quickData).find(
                          (k) => Array.isArray(quickData[k]) && k !== "tags" && k !== "requires"
                        );
                        if (!arrayKey) {
                          return (
                            <pre className="rounded bg-muted p-4 text-xs">
                              {JSON.stringify(quickData, null, 2)}
                            </pre>
                          );
                        }
                        const items = quickData[arrayKey] as Record<string, unknown>[];
                        const hasMore = quickData.has_more as boolean;
                        return (
                          <>
                            <DataTable
                              data={items}
                              onRowClick={handleRowClick}
                              exportFilename={`${skill}-${quickAction.replace("list-", "")}`}
                            />
                            {(page > 0 || hasMore) && (
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={page === 0}
                                  onClick={() => loadAction(quickAction, Math.max(0, page - pageSize))}
                                >
                                  <ChevronLeft className="h-4 w-4" /> Prev
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!hasMore}
                                  onClick={() => loadAction(quickAction, page + pageSize)}
                                >
                                  Next <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </>
                        );
                      })()
                    )}
                  </div>
                ) : null}
              </>
            )}
          </TabsContent>

          {/* ── Actions Tab ─────────────────────────────────────────── */}
          <TabsContent value="actions" className="space-y-4">
            {activeForm ? (
              (() => {
                const formSpec = resolveFormSpec(activeForm);
                if (formSpec) {
                  return (
                    <DynamicForm
                      spec={formSpec}
                      skill={skill}
                      onSuccess={() => {
                        setActiveForm(null);
                        setActiveTab("browse");
                        if (quickAction) loadAction(quickAction, 0);
                      }}
                      onCancel={() => setActiveForm(null)}
                    />
                  );
                }
                // No form spec — shouldn't happen but handle gracefully
                setActiveForm(null);
                return null;
              })()
            ) : (
              <>
                {/* Quick Actions: create forms */}
                <Card className="border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Plus className="h-4 w-4 text-primary" />
                      Quick Actions
                    </CardTitle>
                    <CardDescription>
                      Create new records using forms, or ask the AI assistant for anything else.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {allActions
                        .filter((a) => a.startsWith("add-") || a.startsWith("create-"))
                        .filter((a) => {
                          // Hide actions marked as hidden in UI.yaml
                          if (uiConfig?.action_map?.[a]?.hidden) return false;
                          return true;
                        })
                        .map((a) => {
                          const label = a.replace(/^(add|create)-/, "").replace(/-/g, " ");
                          const formSpec = resolveFormSpec(a);
                          const hasForm = !!formSpec;
                          return (
                            <Button
                              key={a}
                              variant={hasForm ? "default" : "outline"}
                              size="sm"
                              className="gap-1.5 capitalize"
                              onClick={() => {
                                if (hasForm) {
                                  setActiveForm(a);
                                } else {
                                  openChat();
                                  sendMessage(`Create a new ${label}`);
                                }
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              New {label}
                              {hasForm && (
                                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
                              )}
                            </Button>
                          );
                        })}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openChat()}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Ask AI
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Auto-generating forms indicator */}
                {paramLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Preparing forms...</span>
                  </div>
                ) : null}

                {/* All Actions (advanced) */}
                <ActionExplorer
                  skill={skill}
                  displayName={displayName}
                  actions={allActions}
                  loading={actionsLoading}
                  uiConfig={uiConfig}
                />
              </>
            )}
          </TabsContent>

          {/* ── Workflow Tab ──────────────────────────────────────── */}
          {hasWorkflow(skill) && (
            <TabsContent value="workflow" className="space-y-4">
              <WorkflowGuide skill={skill} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <RecordPanel
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        skill={skill}
        getAction={detailGetAction}
        recordName={detailRecordName}
        previewData={detailPreview}
        allActions={allActions}
        onRecordChange={() => quickAction && loadAction(quickAction, page)}
      />
    </div>
  );
}

// ── ActionExplorer ───────────────────────────────────────────────────────────

function ActionExplorer({
  skill,
  displayName,
  actions,
  loading,
  uiConfig,
}: {
  skill: string;
  displayName: string;
  actions: string[];
  loading: boolean;
  uiConfig: import("@/lib/ui-yaml-types").UIConfig | null;
}) {
  const [selectedAction, setSelectedAction] = useState<string>("");

  // Filter out hidden actions
  const visibleActions = actions.filter((a) => {
    if (uiConfig?.action_map?.[a]?.hidden) return false;
    return true;
  });

  const grouped: Record<string, string[]> = {};
  for (const a of visibleActions) {
    const t = actionType(a);
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(a);
  }

  const typeOrder = ["list", "get", "add", "update", "submit", "cancel", "delete", "other"];

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 pt-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Discovering actions...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {displayName} Actions ({visibleActions.length})
          </CardTitle>
          <CardDescription>
            Advanced: select an action to execute with custom parameters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {typeOrder.map((type) => {
            const group = grouped[type];
            if (!group || group.length === 0) return null;
            return (
              <div key={type}>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  {type === "other" ? "Other" : type}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.map((action) => (
                    <Button
                      key={action}
                      variant={selectedAction === action ? "default" : actionVariant(type)}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setSelectedAction(action)}
                    >
                      {actionIcon(type)}
                      {action}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {selectedAction && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-mono">{selectedAction}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionRunner skill={skill} action={selectedAction} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
