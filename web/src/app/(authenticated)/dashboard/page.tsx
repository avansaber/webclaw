"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Activity,
  Zap,
  DollarSign,
  Users,
  Package,
  TrendingUp,
  Plus,
  Clock,
  ArrowRight,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  FileText,
  RefreshCw,
  Loader2,
  X,
  Database,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChatToggleButton } from "@/components/chat-panel";
import { SearchButton } from "@/components/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  fetchApi,
  type Skill,
  skillDisplayName,
  CATEGORY_CONFIG,
  categoryLabel,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useChat } from "@/lib/chat";
import { ConnectionStatus } from "@/components/connection-status";
import { ExpansionPrompts } from "@/components/expansion-prompts";
import { AlertCards } from "@/components/alert-cards";
import { fetchUIConfig } from "@/lib/ui-config";
import type { UIConfig, KpiDef } from "@/lib/ui-yaml-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSkills, useActivity } from "@/lib/hooks";

// ── Greeting ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(fullName?: string): string {
  if (!fullName) return "";
  return fullName.split(" ")[0];
}

// Map audit-log skill (domain name) to actual routable skill path
const ERPCLAW_DOMAINS = new Set([
  "erpclaw-selling", "erpclaw-buying", "erpclaw-stock", "erpclaw-accounting",
  "erpclaw-hr", "erpclaw-payroll", "erpclaw-billing", "erpclaw-tax",
  "erpclaw-setup", "erpclaw-advanced-accounting",
]);

function activitySkillHref(skill: string): string {
  // erpclaw internal domains → /skills/erpclaw
  if (ERPCLAW_DOMAINS.has(skill)) return "/skills/erpclaw";
  // Vertical sub-domains (prop-propertyclaw-tenants → propertyclaw)
  if (skill.startsWith("prop-propertyclaw")) return "/skills/propertyclaw";
  if (skill.startsWith("health-healthclaw")) return "/skills/healthclaw";
  if (skill.startsWith("edu-educlaw") || skill === "educlaw") return "/skills/educlaw";
  // Default: try as-is
  return `/skills/${skill}`;
}

// ── Format helpers ──────────────────────────────────────────────────────────

function formatCurrency(val: unknown): string {
  const num = typeof val === "string" ? parseFloat(val) : Number(val);
  if (isNaN(num)) return String(val);
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function formatNumber(val: unknown): string {
  const num = typeof val === "string" ? parseFloat(val) : Number(val);
  if (isNaN(num)) return String(val);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

// ── Icon resolution ─────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  "trending-up": <TrendingUp className="h-4 w-4" />,
  "dollar-sign": <DollarSign className="h-4 w-4" />,
  "alert-circle": <AlertCircle className="h-4 w-4" />,
  clock: <Clock className="h-4 w-4" />,
  plus: <Plus className="h-4 w-4" />,
  users: <Users className="h-4 w-4" />,
  package: <Package className="h-4 w-4" />,
};

function resolveIcon(name?: string): React.ReactNode {
  return name && ICON_MAP[name] ? ICON_MAP[name] : <BarChart3 className="h-4 w-4" />;
}

// ── Headline KPI types ──────────────────────────────────────────────────────

interface HeadlineKpi {
  skill: string;
  skillLabel: string;
  label: string;
  value: string | number | null;
  subtitle?: string;
  type: "count" | "currency" | "percent";
  severity?: string;
  icon?: string;
  loading: boolean;
}

// ── Quick action URL derivation ─────────────────────────────────────────────

function quickActionUrl(skill: string, action: string): string {
  if (action.startsWith("add-") || action.startsWith("create-")) {
    const entityPart = action.replace(/^(add|create)-/, "");
    const slug = entityPart.endsWith("y") && !entityPart.endsWith("ey") && !entityPart.endsWith("ay") && !entityPart.endsWith("oy")
      ? entityPart.slice(0, -1) + "ies"
      : entityPart.endsWith("s") || entityPart.endsWith("x") || entityPart.endsWith("ch") || entityPart.endsWith("sh")
        ? entityPart + "es"
        : entityPart + "s";
    return `/skills/${skill}/${slug}/new`;
  }
  if (action.startsWith("list-")) {
    const slug = action.replace(/^list-/, "");
    return `/skills/${skill}/${slug}`;
  }
  return `/skills/${skill}/actions?action=${action}`;
}

// ── Quick action discovery ──────────────────────────────────────────────────

interface QuickAction {
  skill: string;
  action: string;
  label: string;
}

function discoverQuickActions(skills: Skill[]): QuickAction[] {
  const priority = [
    { skill: "erpclaw", action: "add-customer", label: "New Customer" },
    { skill: "erpclaw", action: "add-sales-order", label: "New Sales Order" },
    { skill: "erpclaw", action: "add-sales-invoice", label: "New Invoice" },
    { skill: "erpclaw", action: "add-supplier", label: "New Supplier" },
    { skill: "erpclaw", action: "add-purchase-order", label: "New Purchase Order" },
    { skill: "erpclaw", action: "add-item", label: "New Item" },
    { skill: "erpclaw", action: "add-payment", label: "New Payment" },
    { skill: "erpclaw", action: "add-journal-entry", label: "New Journal Entry" },
    { skill: "erpclaw", action: "add-employee", label: "New Employee" },
    { skill: "erpclaw-growth", action: "add-lead", label: "New Lead" },
    { skill: "erpclaw-ops", action: "add-project", label: "New Project" },
    { skill: "erpclaw-ops", action: "add-issue", label: "New Issue" },
    { skill: "propertyclaw", action: "add-property", label: "New Property" },
    { skill: "propertyclaw", action: "add-work-order", label: "New Work Order" },
  ];

  const installed = new Set(skills.map((s) => s.name));
  return priority.filter((a) => installed.has(a.skill)).slice(0, 8);
}

// ── Activity types ──────────────────────────────────────────────────────────

interface ActivityItem {
  skill: string;
  action: string;
  user_id?: string;
  created_at: string;
}

// ── KPI loading from UI.yaml configs ────────────────────────────────────────

async function loadHeadlineKpis(
  skills: Skill[],
): Promise<HeadlineKpi[]> {
  const kpis: HeadlineKpi[] = [];

  // Fetch UI configs + KPI values in parallel (cap at 12 skills)
  const targetSkills = skills
    .filter((s) => s.name !== "erpclaw-web" && s.name !== "webclaw")
    .slice(0, 12);

  const results = await Promise.all(
    targetSkills.map(async (skill): Promise<HeadlineKpi | null> => {
      // Try UI config first
      const config = await fetchUIConfig(skill.name);
      if (config?.dashboard?.kpis?.[0]) {
        const kpiDef = config.dashboard.kpis[0];
        try {
          const params = new URLSearchParams();
          params.set("limit", "0");
          if (kpiDef.filter) {
            for (const [k, v] of Object.entries(kpiDef.filter)) {
              params.set(k, String(v));
            }
          }
          const data = await fetchApi(`/${skill.name}/${kpiDef.action}?${params.toString()}`);
          const field = kpiDef.field || "total_count";
          const raw = data[field] ?? data.total_count ?? null;
          const value = raw !== null ? (typeof raw === "number" ? raw : Number(raw)) : null;

          let subtitle: string | undefined;
          if (kpiDef.total_action) {
            try {
              const totalData = await fetchApi(`/${skill.name}/${kpiDef.total_action}?limit=0`);
              const totalField = kpiDef.total_field || kpiDef.field || "total_count";
              const totalVal = totalData[totalField] ?? totalData.total_count;
              if (totalVal != null) {
                const prefix = kpiDef.type === "currency" ? "of $" : "of ";
                subtitle = `${prefix}${Number(totalVal).toLocaleString()}`;
              }
            } catch { /* ignore */ }
          }

          return {
            skill: skill.name,
            skillLabel: config.display_name || skillDisplayName(skill.name, skills),
            label: kpiDef.label,
            value,
            subtitle,
            type: kpiDef.type,
            severity: kpiDef.severity,
            icon: kpiDef.icon,
            loading: false,
          };
        } catch {
          return null;
        }
      }

      // Fallback: extract from status endpoint
      try {
        const status = await fetchApi(`/${skill.name}/status`);
        if (status.status !== "ok") return null;

        // Look for the first meaningful numeric value
        const SKIP = new Set([
          "status", "message", "version", "name", "skill", "description",
          "tier", "id", "port", "pid", "uptime", "code", "error", "actions",
        ]);
        for (const [key, val] of Object.entries(status)) {
          if (SKIP.has(key) || key.startsWith("_")) continue;
          if (typeof val === "string" && isNaN(Number(val))) continue;
          if (Array.isArray(val) || typeof val === "object") continue;
          const num = Number(val);
          if (!isNaN(num)) {
            const isCurrency = key.includes("amount") || key.includes("revenue") || key.includes("value") || key.includes("total");
            return {
              skill: skill.name,
              skillLabel: skillDisplayName(skill.name, skills),
              label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              value: num,
              type: isCurrency ? "currency" : "count",
              loading: false,
            };
          }
        }
      } catch { /* ignore */ }

      return null;
    }),
  );

  for (const r of results) {
    if (r) kpis.push(r);
  }

  return kpis.slice(0, 8);
}

// ── Severity styling ────────────────────────────────────────────────────────

function severityBorderColor(severity?: string): string {
  switch (severity) {
    case "warning": return "border-l-amber-500";
    case "success": return "border-l-emerald-500";
    default: return "border-l-primary";
  }
}

// ── Dashboard component ─────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: skills = [], isLoading: loading } = useSkills();
  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity } = useActivity({ limit: 10 });
  const activity = (Array.isArray(activityData?.activity) ? activityData.activity : []) as ActivityItem[];

  const { data: kpis = [], isLoading: kpisLoading } = useQuery({
    queryKey: ["headline-kpis", skills.map((s) => s.name).sort()],
    queryFn: () => loadHeadlineKpis(skills),
    enabled: skills.length > 0,
    staleTime: 60_000,
  });

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const { setPageContext } = useChat();

  useEffect(() => {
    setPageContext({ view: "dashboard" });
  }, [setPageContext]);

  // Show onboarding banner only when no data exists and not dismissed
  useEffect(() => {
    if (localStorage.getItem("erpclaw_onboarding_dismissed")) {
      setShowOnboarding(false);
      return;
    }
    // Hide banner if KPI data loaded or activity exists (system has data)
    const hasAct = activity.length > 0;
    if (!kpisLoading && (kpis.length > 0 || hasAct)) {
      setShowOnboarding(false);
    } else if (!kpisLoading && kpis.length === 0 && !hasAct) {
      setShowOnboarding(true);
    }
  }, [kpisLoading, kpis, activity]);

  function handleDismissOnboarding() {
    localStorage.setItem("erpclaw_onboarding_dismissed", "1");
    setShowOnboarding(false);
  }

  async function handleLoadDemoData() {
    setDemoLoading(true);
    try {
      const res = await fetchApi("/skills/erpclaw/execute", {
        method: "POST",
        body: JSON.stringify({ action: "seed-demo-data" }),
      });
      if (res.status === "ok") {
        localStorage.setItem("erpclaw_onboarding_dismissed", "1");
        setShowOnboarding(false);
        setDemoLoading(false);
        queryClient.invalidateQueries({ queryKey: ["headline-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["activity"] });
      } else {
        setDemoLoading(false);
      }
    } catch {
      setDemoLoading(false);
    }
  }

  const quickActions = discoverQuickActions(skills);

  // Warning KPIs for "Needs Attention"
  const warningKpis = kpis.filter((k) => k.severity === "warning" && k.value !== null && Number(k.value) > 0);

  // Group skills by category
  const grouped: Record<string, Skill[]> = {};
  for (const s of skills) {
    const cat = s.category || "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) =>
      (CATEGORY_CONFIG[a]?.order ?? 99) - (CATEGORY_CONFIG[b]?.order ?? 99)
  );

  const greeting = getGreeting();
  const name = firstName(user?.full_name);

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <div className="ml-auto flex items-center gap-2">
          <ConnectionStatus />
          <SearchButton />
          <ThemeToggle />
          <ChatToggleButton />
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        {/* Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {greeting}{name ? `, ${name}` : ""}
            </h2>
            <p className="text-muted-foreground">
              {skills.length > 0
                ? `${skills.length} skills installed across ${sortedCategories.length} categories`
                : "Loading skills..."}
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            System Online
          </Badge>
        </div>

        {/* Onboarding Banner */}
        {showOnboarding && (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg">
            <button
              onClick={handleDismissOnboarding}
              className="absolute top-3 right-3 rounded-full p-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Rocket className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">Welcome to Webclaw!</h3>
                <p className="text-sm text-white/80 mt-1">
                  Get started by loading demo data or creating your first company.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  onClick={handleLoadDemoData}
                  disabled={demoLoading}
                  className="bg-white text-blue-700 hover:bg-white/90 shadow-sm"
                >
                  {demoLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4 mr-1.5" />
                      Load Demo Data
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDismissOnboarding}
                  className="bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white"
                >
                  Start Fresh
                </Button>
              </div>
            </div>
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-white/5" />
            <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/5" />
          </div>
        )}

        {/* Demo Data Loading Modal */}
        <Dialog open={demoLoading} onOpenChange={() => {}}>
          <DialogContent showCloseButton={false} className="sm:max-w-sm">
            <DialogHeader className="items-center text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
              <DialogTitle>Loading Demo Data</DialogTitle>
              <DialogDescription>
                Setting up sample data. This may take a moment...
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>

        {/* KPI Cards */}
        {kpisLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : kpis.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi, i) => (
              <Link key={i} href={`/skills/${kpi.skill}`}>
                <Card className={`border-l-4 ${severityBorderColor(kpi.severity)} transition-colors hover:bg-accent/50 cursor-pointer h-full`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {kpi.label}
                    </CardTitle>
                    {resolveIcon(kpi.icon)}
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {kpi.type === "currency" && kpi.value !== null
                        ? formatCurrency(kpi.value)
                        : kpi.value !== null
                          ? formatNumber(kpi.value)
                          : "\u2014"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {kpi.subtitle || kpi.skillLabel}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Skills Installed</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{skills.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Categories</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sortedCategories.length}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Needs Attention */}
        {warningKpis.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Needs Attention
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {warningKpis.map((kpi, i) => (
                <Link key={i} href={`/skills/${kpi.skill}`}>
                  <Card className="border-l-4 border-l-amber-500 transition-colors hover:bg-accent/50 cursor-pointer">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {kpi.type === "currency" && kpi.value !== null
                              ? formatCurrency(kpi.value)
                              : formatNumber(kpi.value)} {kpi.label.toLowerCase()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{kpi.skillLabel}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Predictive Alerts (E2) */}
        <AlertCards />

        {/* Expansion Prompts (AI-driven module suggestions) */}
        <ExpansionPrompts />

        {/* Quick Actions + Activity in 2-column layout */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Quick Actions (2/3 width) */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-semibold">Quick Actions</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((qa) => (
                <Link key={`${qa.skill}-${qa.action}`} href={quickActionUrl(qa.skill, qa.action)}>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 h-auto py-3"
                  >
                    <Plus className="h-4 w-4 text-primary" />
                    <span className="text-sm">{qa.label}</span>
                  </Button>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity (1/3 width) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recent Activity</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchActivity()}
              >
                <RefreshCw className={`h-3 w-3 ${activityLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {activityLoading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                        <div className="flex-1 space-y-1">
                          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                          <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activity.length > 0 ? (
                  <ul className="divide-y">
                    {activity.map((item, i) => {
                      const isError = item.action.startsWith("delete-") || item.action.startsWith("cancel-");
                      const isCreate = item.action.startsWith("add-") || item.action.startsWith("create-");
                      const isSubmit = item.action.startsWith("submit-");
                      const StatusIcon = isError
                        ? AlertCircle
                        : isCreate
                          ? Plus
                          : isSubmit
                            ? CheckCircle2
                            : Clock;
                      const statusColor = isError
                        ? "text-orange-500"
                        : isCreate
                          ? "text-green-600"
                          : isSubmit
                            ? "text-blue-600"
                            : "text-muted-foreground";

                      return (
                        <li key={i} className="flex items-start gap-3 px-4 py-3">
                          <StatusIcon className={`h-4 w-4 mt-0.5 ${statusColor}`} />
                          <div className="flex-1 min-w-0">
                            <Link
                              href={activitySkillHref(item.skill)}
                              className="text-sm font-medium hover:underline"
                            >
                              {item.action}
                            </Link>
                            <p className="text-xs text-muted-foreground truncate">
                              {skillDisplayName(item.skill, skills)}
                              {item.created_at ? (
                                <> &middot; {new Date(item.created_at).toLocaleString()}</>
                              ) : null}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No recent activity
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Skill Overview */}
        {!loading && skills.length > 0 && (
          <>
            <Separator />
            <h3 className="text-lg font-semibold">Installed Skills</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {skills.map((skill) => (
                <Link key={skill.name} href={`/skills/${skill.name}`}>
                  <Card className="h-full transition-colors hover:bg-accent/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">
                          {skillDisplayName(skill.name, skills)}
                        </CardTitle>
                        <Badge variant="secondary" className="text-xs">
                          {["Basic","Standard","Advanced","Professional","Enterprise"][Number(skill.tier)] ?? `T${skill.tier}`}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2 text-xs">
                        {skill.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {CATEGORY_CONFIG[skill.category || ""]?.label ?? skill.category}
                        </Badge>
                        {skill.tags?.slice(0, 2).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
