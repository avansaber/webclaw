"use client";

import { useEffect, useState, use, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  List,
  Eye,
  Plus,
  Send,
  XCircle,
  Trash2,
  RefreshCw,
  Play,
  MessageSquare,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { DynamicForm } from "@/components/dynamic-form";
import { WorkflowHints } from "@/components/workflow-hints";
import {
  fetchApi,
  postAction,
  skillDisplayName,
} from "@/lib/api";
import { useSkillActions } from "@/lib/hooks";
import { useChat } from "@/lib/chat";
import { useToast } from "@/components/toast-provider";
import { useUIConfig } from "@/lib/ui-config";
import { generateFormSpec } from "@/lib/ui-yaml-to-form";
import type { FormSpec } from "@/lib/form-spec";
import { useParamSchema } from "@/lib/param-schema";
import { useChildTableSchema } from "@/lib/child-table-schema";
import { generateAutoFormSpec } from "@/lib/auto-form-spec";
import type { WorkflowSuggestion } from "@/lib/ui-yaml-types";
import { getSkillDashboardUrl, getEntityNewUrl } from "@/lib/entity-routing";

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

// ── Action Runner ────────────────────────────────────────────────────────────

function ActionRunner({ skill, action }: { skill: string; action: string }) {
  const { showToast } = useToast();
  const [params, setParams] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  async function execute() {
    setLoading(true);
    setResult(null);
    try {
      const pairs = params
        .split("&")
        .filter(Boolean)
        .map((p) => p.split("=").map((s) => s.trim()));
      const paramObj: Record<string, string> = {};
      for (const [k, v] of pairs) {
        if (k) paramObj[k] = v ?? "";
      }

      const aType = actionType(action);
      let data: Record<string, unknown>;
      if (["add", "update", "submit", "cancel", "delete"].includes(aType)) {
        data = await postAction(skill, action, paramObj) as Record<string, unknown>;
      } else {
        const qs = new URLSearchParams(paramObj).toString();
        data = await fetchApi(`/${skill}/${action}${qs ? `?${qs}` : ""}`);
      }
      setResult(data);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Unknown error" });
      showToast({ type: "error", message: "Action failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="key=value&key2=value2"
          value={params}
          onChange={(e) => setParams(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && execute()}
          className="font-mono text-sm"
        />
        <Button onClick={execute} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run
        </Button>
      </div>
      {result && (
        <pre className="rounded bg-muted p-4 text-xs overflow-auto max-h-96">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ActionsPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { config: uiConfig, loading: uiLoading } = useUIConfig(skill);
  const { schema: paramSchema, loading: paramLoading } = useParamSchema(skill);
  const { schema: childTableSchema } = useChildTableSchema(skill);
  const { sendMessage, toggle: openChat } = useChat();
  const displayName = skillDisplayName(skill);

  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [workflowHint, setWorkflowHint] = useState<{
    action: string;
    suggestions: WorkflowSuggestion[];
    responseData: Record<string, unknown>;
  } | null>(null);

  // Load actions via React Query (cached)
  const { actions: statusActions, isLoading: actionsLoading } = useSkillActions(skill);

  // Merge with paramSchema actions as fallback
  const allActions = useMemo(() => {
    if (statusActions.length > 0) return statusActions;
    return Object.keys(paramSchema?.actions || {});
  }, [statusActions, paramSchema]);

  // Pick up pre-selected action from URL
  const urlAction = searchParams.get("action");
  useEffect(() => {
    if (urlAction && !activeForm) {
      const spec = resolveFormSpec(urlAction);
      if (spec) {
        setActiveForm(urlAction);
      } else {
        setSelectedAction(urlAction);
      }
    }
  }, [urlAction]); // eslint-disable-line react-hooks/exhaustive-deps

  function resolveFormSpec(action: string): FormSpec | null {
    if (uiConfig) {
      const spec = generateFormSpec(uiConfig, action);
      if (spec) return spec;
    }
    if (uiLoading) return null;
    if (paramSchema?.actions?.[action]) {
      return generateAutoFormSpec(skill, action, paramSchema.actions[action], childTableSchema ?? undefined);
    }
    return null;
  }

  // Group actions by type
  const visibleActions = allActions.filter((a) => {
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

  return (
    <div className="p-6 space-y-6">
      {/* Back to dashboard */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(getSkillDashboardUrl(skill))}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Dashboard
      </Button>

      {/* Workflow hints (fixed overlay in bottom-right) */}
      {workflowHint && (
        <WorkflowHints
          completedAction={workflowHint.action}
          suggestions={workflowHint.suggestions}
          responseData={workflowHint.responseData}
          skill={skill}
          onSelect={(action, targetSkill, prefill) => {
            setWorkflowHint(null);
            if (targetSkill !== skill) {
              const params = new URLSearchParams({ action });
              for (const [k, v] of Object.entries(prefill)) params.set(k, v);
              router.push(`/skills/${targetSkill}/actions?${params.toString()}`);
            } else {
              setActiveForm(action);
            }
          }}
          onDismiss={() => setWorkflowHint(null)}
        />
      )}

      {activeForm ? (
        (() => {
          const formSpec = resolveFormSpec(activeForm);
          if (formSpec) {
            return (
              <div className="max-w-4xl">
                <DynamicForm
                  spec={formSpec}
                  skill={skill}
                  onSuccess={(action, result) => {
                    const rule = uiConfig?.workflows?.find((w) => w.after === action);
                    if (rule && rule.suggest.length > 0) {
                      setActiveForm(null);
                      setWorkflowHint({
                        action,
                        suggestions: rule.suggest,
                        responseData: result as Record<string, unknown>,
                      });
                      return;
                    }
                    setActiveForm(null);
                  }}
                  onCancel={() => setActiveForm(null)}
                />
              </div>
            );
          }
          setActiveForm(null);
          return null;
        })()
      ) : (
        <>
          {/* Quick create actions */}
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
                  .filter((a) => !uiConfig?.action_map?.[a]?.hidden)
                  .map((a) => {
                    const label = a.replace(/^(add|create)-/, "").replace(/-/g, " ");
                    const hasForm = !!resolveFormSpec(a);
                    return (
                      <Button
                        key={a}
                        variant={hasForm ? "default" : "outline"}
                        size="sm"
                        className="gap-1.5 capitalize"
                        onClick={() => {
                          if (hasForm) setActiveForm(a);
                          else { openChat(); sendMessage(`Create a new ${label}`); }
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        New {label}
                        {hasForm && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />}
                      </Button>
                    );
                  })}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openChat()}>
                  <MessageSquare className="h-3.5 w-3.5" />
                  Ask AI
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* All actions explorer */}
          {actionsLoading ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Discovering actions...</span>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {displayName} Actions ({visibleActions.length})
                </CardTitle>
                <CardDescription>
                  Select an action to execute with custom parameters.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {typeOrder.map((type) => {
                  const group = grouped[type];
                  if (!group?.length) return null;
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
          )}

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
        </>
      )}
    </div>
  );
}
