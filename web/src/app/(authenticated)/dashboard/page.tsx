"use client";

import { useEffect, useState, useCallback } from "react";
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
  getSkills,
  fetchApi,
  type Skill,
  skillDisplayName,
  CATEGORY_CONFIG,
  categoryLabel,
} from "@/lib/api";
import { useChat } from "@/lib/chat";
import { ConnectionStatus } from "@/components/connection-status";

const APP_TITLE = process.env.NEXT_PUBLIC_OCUI_TITLE || "Webclaw";

// ── KPI extraction ──────────────────────────────────────────────────────────

interface KpiCard {
  label: string;
  value: string;
  icon: React.ElementType;
  trend?: string;
  color?: string;
  skill?: string;
}

/** Try calling status on a skill and extract numeric KPIs. */
async function fetchSkillKpis(skill: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchApi(`/${skill}/status`);
    if (res.status === "ok") return res;
    return null;
  } catch {
    return null;
  }
}

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

function extractKpis(results: Record<string, Record<string, unknown>>): KpiCard[] {
  const kpis: KpiCard[] = [];

  // Revenue from selling or analytics
  const selling = results["erpclaw-selling"];
  if (selling?.total_revenue) {
    kpis.push({
      label: "Total Revenue",
      value: formatCurrency(selling.total_revenue),
      icon: DollarSign,
      color: "text-green-600",
      skill: "erpclaw-selling",
    });
  }

  // Outstanding from selling
  if (selling?.total_outstanding) {
    kpis.push({
      label: "Outstanding AR",
      value: formatCurrency(selling.total_outstanding),
      icon: FileText,
      color: Number(selling.total_outstanding) > 0 ? "text-orange-500" : "text-green-600",
      skill: "erpclaw-selling",
    });
  }

  // Customer count
  if (selling?.customer_count || selling?.customers) {
    kpis.push({
      label: "Customers",
      value: formatNumber(selling.customer_count || selling.customers),
      icon: Users,
      skill: "erpclaw-selling",
    });
  }

  // Inventory
  const inv = results["erpclaw-inventory"];
  if (inv?.item_count || inv?.items) {
    kpis.push({
      label: "Items",
      value: formatNumber(inv.item_count || inv.items),
      icon: Package,
      skill: "erpclaw-inventory",
    });
  }

  if (inv?.total_stock_value) {
    kpis.push({
      label: "Stock Value",
      value: formatCurrency(inv.total_stock_value),
      icon: Package,
      color: "text-blue-600",
      skill: "erpclaw-inventory",
    });
  }

  // HR
  const hr = results["erpclaw-hr"];
  if (hr?.employee_count || hr?.employees) {
    kpis.push({
      label: "Employees",
      value: formatNumber(hr.employee_count || hr.employees),
      icon: Users,
      skill: "erpclaw-hr",
    });
  }

  // Analytics
  const analytics = results["erpclaw-analytics"];
  if (analytics?.net_profit) {
    kpis.push({
      label: "Net Profit",
      value: formatCurrency(analytics.net_profit),
      icon: TrendingUp,
      color: Number(analytics.net_profit) >= 0 ? "text-green-600" : "text-red-500",
      skill: "erpclaw-analytics",
    });
  }

  // For non-erpclaw skills: extract meaningful numeric top-level keys
  const SKIP_KEYS = new Set([
    "status", "message", "version", "name", "skill", "description",
    "tier", "id", "port", "pid", "uptime", "code", "error",
  ]);
  for (const [skill, data] of Object.entries(results)) {
    if (skill.startsWith("erpclaw-")) continue; // Already handled
    if (!data) continue;
    for (const [key, val] of Object.entries(data)) {
      if (SKIP_KEYS.has(key) || key.startsWith("_")) continue;
      // Skip if value is a string that looks non-numeric (e.g. "Booking APP")
      if (typeof val === "string" && isNaN(Number(val))) continue;
      const num = typeof val === "number" ? val : Number(val);
      if (!isNaN(num) && kpis.length < 8) {
        const label = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        kpis.push({
          label,
          value: key.includes("amount") || key.includes("revenue") || key.includes("value")
            ? formatCurrency(num) : formatNumber(num),
          icon: BarChart3,
          skill,
        });
      }
    }
  }

  return kpis.slice(0, 8);
}

// ── Activity types ──────────────────────────────────────────────────────────

interface ActivityItem {
  skill: string;
  action: string;
  user_id?: string;
  created_at: string;
}

// ── Quick action discovery ──────────────────────────────────────────────────

interface QuickAction {
  skill: string;
  action: string;
  label: string;
  category: string;
}

function discoverQuickActions(skills: Skill[]): QuickAction[] {
  // Return top create/add actions based on category order
  const priority = [
    { skill: "erpclaw-selling", action: "add-customer", label: "New Customer" },
    { skill: "erpclaw-selling", action: "add-sales-order", label: "New Sales Order" },
    { skill: "erpclaw-selling", action: "add-sales-invoice", label: "New Invoice" },
    { skill: "erpclaw-buying", action: "add-supplier", label: "New Supplier" },
    { skill: "erpclaw-buying", action: "add-purchase-order", label: "New Purchase Order" },
    { skill: "erpclaw-inventory", action: "add-item", label: "New Item" },
    { skill: "erpclaw-payments", action: "add-payment", label: "New Payment" },
    { skill: "erpclaw-journals", action: "add-journal-entry", label: "New Journal Entry" },
    { skill: "erpclaw-hr", action: "add-employee", label: "New Employee" },
    { skill: "erpclaw-crm", action: "add-lead", label: "New Lead" },
    { skill: "erpclaw-projects", action: "add-project", label: "New Project" },
    { skill: "erpclaw-support", action: "add-issue", label: "New Issue" },
  ];

  const installed = new Set(skills.map((s) => s.name));
  return priority
    .filter((a) => installed.has(a.skill))
    .slice(0, 8)
    .map((a) => ({
      ...a,
      category: skills.find((s) => s.name === a.skill)?.category || "other",
    }));
}

// ── Dashboard component ─────────────────────────────────────────────────────

export default function Dashboard() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiCard[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const { setPageContext } = useChat();

  useEffect(() => {
    setPageContext({ view: "dashboard" });
  }, [setPageContext]);

  // Load skills
  useEffect(() => {
    getSkills()
      .then(setSkills)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load KPIs from skill status actions (parallel)
  const loadKpis = useCallback(async () => {
    if (skills.length === 0) return;
    setKpisLoading(true);

    // Call status on key skills in parallel
    const statusSkills = skills
      .filter((s) => s.name !== "erpclaw-web" && s.name !== "webclaw")
      .slice(0, 10); // cap at 10 to avoid flooding

    const promises = statusSkills.map(async (s) => {
      const data = await fetchSkillKpis(s.name);
      return [s.name, data] as [string, Record<string, unknown> | null];
    });

    const results = await Promise.all(promises);
    const statusMap: Record<string, Record<string, unknown>> = {};
    for (const [name, data] of results) {
      if (data) statusMap[name] = data;
    }

    setKpis(extractKpis(statusMap));
    setKpisLoading(false);
  }, [skills]);

  useEffect(() => {
    if (!loading && skills.length > 0) loadKpis();
  }, [loading, skills, loadKpis]);

  // Load recent activity
  useEffect(() => {
    fetchApi("/activity?limit=10")
      .then((res) => {
        if (res.status === "ok" && Array.isArray(res.activity)) {
          setActivity(res.activity as ActivityItem[]);
        }
      })
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, []);

  // Show onboarding banner when no KPI data exists and not dismissed
  useEffect(() => {
    if (!kpisLoading && kpis.length === 0 && !localStorage.getItem("erpclaw_onboarding_dismissed")) {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
    }
  }, [kpisLoading, kpis]);

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
        // Dismiss onboarding and reload KPIs
        localStorage.setItem("erpclaw_onboarding_dismissed", "1");
        setShowOnboarding(false);
        setDemoLoading(false);
        // Reload KPIs to reflect new demo data
        loadKpis();
      } else {
        setDemoLoading(false);
      }
    } catch {
      setDemoLoading(false);
    }
  }

  const quickActions = discoverQuickActions(skills);

  // Group skills by category for compact grid
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
        {/* Hero */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{APP_TITLE}</h2>
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
                <h3 className="text-lg font-semibold">
                  Welcome to Webclaw!
                </h3>
                <p className="text-sm text-white/80 mt-1">
                  Get started by loading demo data or creating your first
                  company.
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
                  className="border-white/30 text-white hover:bg-white/10 hover:text-white"
                >
                  Start Fresh
                </Button>
              </div>
            </div>
            {/* Decorative background circles */}
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
                Setting up Stark Manufacturing sample data. This may take a
                moment...
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
            {kpis.map((kpi, i) => {
              const Icon = kpi.icon;
              return (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {kpi.label}
                    </CardTitle>
                    <Icon className={`h-4 w-4 ${kpi.color || "text-muted-foreground"}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{kpi.value}</div>
                    {kpi.skill && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {skillDisplayName(kpi.skill, skills)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
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

        {/* Quick Actions + Activity in 2-column layout */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Quick Actions (2/3 width) */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-semibold">Quick Actions</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((qa) => (
                <Link
                  key={`${qa.skill}-${qa.action}`}
                  href={`/skills/${qa.skill}?action=${qa.action}`}
                >
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
                onClick={() => {
                  setActivityLoading(true);
                  fetchApi("/activity?limit=10")
                    .then((res) => {
                      if (res.status === "ok" && Array.isArray(res.activity)) {
                        setActivity(res.activity as ActivityItem[]);
                      }
                    })
                    .catch(() => {})
                    .finally(() => setActivityLoading(false));
                }}
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
                              href={`/skills/${item.skill}`}
                              className="text-sm font-medium hover:underline"
                            >
                              {item.action}
                            </Link>
                            <p className="text-xs text-muted-foreground truncate">
                              {skillDisplayName(item.skill, skills)}
                              {item.created_at && (
                                <> &middot; {new Date(item.created_at).toLocaleString()}</>
                              )}
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

        {/* Skill Overview (compact) */}
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
                          T{skill.tier}
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
