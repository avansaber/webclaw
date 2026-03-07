"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, DollarSign, AlertCircle, Clock, Plus, ArrowRight } from "lucide-react";
import { fetchApi, skillDisplayName, type Skill } from "@/lib/api";
import { useUIConfig } from "@/lib/ui-config";
import { useSkills, useActivity } from "@/lib/hooks";
import type { DashboardConfig, KpiDef, QuickActionDef } from "@/lib/ui-yaml-types";
import { slugFromListAction, getEntityListUrl, getEntityNewUrl, getActionRunnerUrl } from "@/lib/entity-routing";
import { getListActions } from "@/lib/ui-yaml-to-form";

// ── Icon resolution ──────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  "trending-up": <TrendingUp className="h-4 w-4" />,
  "dollar-sign": <DollarSign className="h-4 w-4" />,
  "alert-circle": <AlertCircle className="h-4 w-4" />,
  clock: <Clock className="h-4 w-4" />,
  plus: <Plus className="h-4 w-4" />,
};

function resolveIcon(name?: string) {
  return name && ICON_MAP[name] ? ICON_MAP[name] : <TrendingUp className="h-4 w-4" />;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function severityColor(s?: string) {
  switch (s) {
    case "warning": return "border-l-amber-500";
    case "success": return "border-l-emerald-500";
    default: return "border-l-primary";
  }
}

function KpiCard({
  kpi,
  value,
  subtitle,
  loading,
  onClick,
}: {
  kpi: KpiDef;
  value: string | number | null;
  subtitle?: string;
  loading: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`border-l-4 ${severityColor(kpi.severity)} ${onClick ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""}`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {resolveIcon(kpi.icon)}
          {kpi.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <p className="text-2xl font-bold">
              {kpi.type === "currency" && value !== null ? `$${Number(value).toLocaleString()}` : String(value ?? "—")}
            </p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Activity Feed ────────────────────────────────────────────────────────────

function ActivityFeed({ skill }: { skill: string }) {
  const { data, isLoading } = useActivity({ skill, limit: 8 });
  const items = data
    ? (Array.isArray(data.items) ? data.items : Array.isArray(data.activity) ? data.activity : []) as Record<string, unknown>[]
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading activity...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No recent activity.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 text-sm">
          <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
          <div>
            <p>{String(item.message || item.description || item.action || "Activity")}</p>
            {item.timestamp ? (
              <p className="text-xs text-muted-foreground">{String(item.timestamp)}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main: Skill Dashboard ────────────────────────────────────────────────────

export default function SkillDashboardPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill } = use(params);
  const router = useRouter();
  const { config: uiConfig, loading: uiLoading } = useUIConfig(skill);
  const displayName = skillDisplayName(skill);
  const { data: skillsList } = useSkills();
  const skillMeta = skillsList?.find((s) => s.name === skill) ?? null;
  const [kpiValues, setKpiValues] = useState<Record<string, { value: string | number | null; subtitle?: string; loading: boolean }>>({});

  // Load KPI values
  useEffect(() => {
    if (!uiConfig?.dashboard?.kpis) return;

    const kpis = uiConfig.dashboard.kpis;
    // Initialize all as loading
    const init: typeof kpiValues = {};
    for (const kpi of kpis) {
      init[kpi.key] = { value: null, loading: true };
    }
    setKpiValues(init);

    // Fetch each KPI independently
    for (const kpi of kpis) {
      const params = new URLSearchParams();
      params.set("limit", "0");
      if (kpi.filter) {
        for (const [k, v] of Object.entries(kpi.filter)) {
          params.set(k, String(v));
        }
      }
      fetchApi(`/${skill}/${kpi.action}?${params.toString()}`)
        .then((data) => {
          const field = kpi.field || "total_count";
          const raw = data[field] ?? data.total_count ?? null;
          const val = raw !== null ? (typeof raw === "number" ? raw : String(raw)) : null;
          setKpiValues((prev) => ({
            ...prev,
            [kpi.key]: { value: val, loading: false },
          }));

          // Fetch total (for subtitle like "of $52,000")
          if (kpi.total_action) {
            fetchApi(`/${skill}/${kpi.total_action}?limit=0`)
              .then((totalData) => {
                const totalField = kpi.total_field || kpi.field || "total_count";
                const totalVal = totalData[totalField] ?? totalData.total_count;
                if (totalVal != null) {
                  const prefix = kpi.type === "currency" ? "of $" : "of ";
                  setKpiValues((prev) => ({
                    ...prev,
                    [kpi.key]: {
                      ...prev[kpi.key],
                      subtitle: `${prefix}${Number(totalVal).toLocaleString()}`,
                    },
                  }));
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {
          setKpiValues((prev) => ({
            ...prev,
            [kpi.key]: { value: null, loading: false },
          }));
        });
    }
  }, [skill, uiConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get entity list info for KPI drill-down navigation
  const entityListActions = uiConfig ? getListActions(uiConfig) : [];

  function handleKpiClick(kpi: KpiDef) {
    if (kpi.drill_action) {
      const slug = slugFromListAction(kpi.drill_action);
      const params = kpi.drill_filter ? `?${new URLSearchParams(kpi.drill_filter as Record<string, string>).toString()}` : "";
      router.push(getEntityListUrl(skill, slug) + params);
    } else if (kpi.action.startsWith("list-")) {
      const slug = slugFromListAction(kpi.action);
      const filterParams = kpi.filter ? `?${new URLSearchParams(kpi.filter as Record<string, string>).toString()}` : "";
      router.push(getEntityListUrl(skill, slug) + filterParams);
    }
  }

  function handleQuickAction(qa: QuickActionDef) {
    if (qa.action.startsWith("add-") || qa.action.startsWith("create-")) {
      // Navigate to entity new form
      const entityPart = qa.action.replace(/^(add|create)-/, "");
      const slug = entityPart.endsWith("y")
        ? entityPart.slice(0, -1) + "ies"
        : entityPart.endsWith("s") || entityPart.endsWith("x") || entityPart.endsWith("ch") || entityPart.endsWith("sh")
          ? entityPart + "es"
          : entityPart + "s";
      router.push(getEntityNewUrl(skill, slug));
    } else {
      router.push(getActionRunnerUrl(skill, qa.action));
    }
  }

  // Loading state
  if (uiLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No UI.yaml: redirect to action runner
  if (!uiConfig) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{displayName}</h2>
          {skillMeta?.description && (
            <p className="text-muted-foreground mt-1">{String(skillMeta.description)}</p>
          )}
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">
              This skill does not have a UI configuration. Use the action runner to execute commands.
            </p>
            <Button onClick={() => router.push(getActionRunnerUrl(skill))}>
              Open Action Runner <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dashboard = uiConfig.dashboard;

  return (
    <div className="p-6 space-y-6">
      {/* Skill description */}
      {skillMeta && (
        <div>
          <p className="text-muted-foreground">{String(skillMeta.description || "")}</p>
          <div className="mt-2 flex gap-2">
            <Badge>Tier {String(skillMeta.tier)}</Badge>
            <Badge variant="secondary">{String(skillMeta.category)}</Badge>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {dashboard?.kpis && dashboard.kpis.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.kpis.map((kpi) => {
            const kv = kpiValues[kpi.key];
            return (
              <KpiCard
                key={kpi.key}
                kpi={kpi}
                value={kv?.value ?? null}
                subtitle={kv?.subtitle}
                loading={kv?.loading ?? true}
                onClick={() => handleKpiClick(kpi)}
              />
            );
          })}
        </div>
      )}

      {/* Quick Actions + Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Quick Actions */}
          {dashboard?.quick_actions && dashboard.quick_actions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {dashboard.quick_actions.map((qa) => (
                    <Button
                      key={qa.action}
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleQuickAction(qa)}
                    >
                      {resolveIcon(qa.icon)}
                      {qa.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entity shortcuts */}
          {entityListActions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Browse Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {entityListActions.map((item) => (
                    <Button
                      key={item.action}
                      variant="outline"
                      size="sm"
                      className="capitalize"
                      onClick={() => {
                        const slug = slugFromListAction(item.action);
                        router.push(getEntityListUrl(skill, slug));
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Activity Feed */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed skill={skill} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action Runner link */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => router.push(getActionRunnerUrl(skill))}>
          Advanced: Action Runner <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
