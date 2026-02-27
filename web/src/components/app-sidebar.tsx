"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  BookOpen,
  Receipt,
  BarChart3,
  Package,
  ShoppingCart,
  Truck,
  Factory,
  Users,
  FolderKanban,
  HeartPulse,
  Headset,
  LayoutDashboard,
  Zap,
  LogOut,
  ChevronUp,
  ChevronRight,
  Shield,
  AlertTriangle,
  Search,
  Lock,
  Scale,
  Puzzle,
  Layers,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  type Skill,
  type SuiteGroup,
  getSkills,
  skillDisplayName,
  CATEGORY_CONFIG,
  categoryLabel,
  detectSuites,
  suiteDisplayName,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Category-based icons (extensible)
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  setup: Building2,
  accounting: BookOpen,
  inventory: Package,
  selling: ShoppingCart,
  buying: Truck,
  manufacturing: Factory,
  hr: Users,
  projects: FolderKanban,
  crm: HeartPulse,
  billing: Receipt,
  support: Headset,
  analytics: BarChart3,
  compliance: Shield,
  risk: AlertTriangle,
  audit: Search,
  security: Lock,
  governance: Scale,
};

const APP_TITLE = process.env.NEXT_PUBLIC_OCUI_TITLE || "Webclaw";

// ── Recent Skills (localStorage) ────────────────────────────────────────────

const RECENT_SKILLS_KEY = "erpclaw_recent_skills";
const MAX_RECENT = 5;

function getRecentSkills(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SKILLS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecentSkill(skillName: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const current = getRecentSkills();
    const deduped = [skillName, ...current.filter((s) => s !== skillName)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SKILLS_KEY, JSON.stringify(deduped));
    return deduped;
  } catch {
    return [];
  }
}

// ── Skill list rendering (shared between single-suite and multi-suite) ──────

function SkillList({
  skills,
  allSkills,
  pathname,
}: {
  skills: Skill[];
  allSkills: Skill[];
  pathname: string;
}) {
  return (
    <SidebarMenu>
      {skills.map((skill) => {
        const Icon = CATEGORY_ICONS[skill.category || ""] || Puzzle;
        const href = `/skills/${skill.name}`;
        return (
          <SidebarMenuItem key={skill.name}>
            <SidebarMenuButton asChild isActive={pathname.startsWith(href)}>
              <Link href={href}>
                <Icon className="h-4 w-4" />
                <span>{skillDisplayName(skill.name, allSkills)}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

// ── Category groups (flat view, used in single-suite mode) ──────────────────

function CategoryGroups({
  grouped,
  allSkills,
  pathname,
}: {
  grouped: Record<string, Skill[]>;
  allSkills: Skill[];
  pathname: string;
}) {
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) =>
      (CATEGORY_CONFIG[a]?.order ?? 99) - (CATEGORY_CONFIG[b]?.order ?? 99)
  );

  return (
    <>
      {sortedCategories.map((cat) => (
        <SidebarGroup key={cat}>
          <SidebarGroupLabel>{categoryLabel(cat)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SkillList
              skills={grouped[cat]}
              allSkills={allSkills}
              pathname={pathname}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

// ── Suite section (collapsible, used in multi-suite mode) ───────────────────

function SuiteSection({
  suite,
  allSkills,
  pathname,
}: {
  suite: SuiteGroup;
  allSkills: Skill[];
  pathname: string;
}) {
  // Check if any skill in this suite is currently active
  const isActive = suite.skills.some((s) =>
    pathname.startsWith(`/skills/${s.name}`)
  );

  const sortedCategories = Object.keys(suite.categories).sort(
    (a, b) =>
      (CATEGORY_CONFIG[a]?.order ?? 99) - (CATEGORY_CONFIG[b]?.order ?? 99)
  );

  return (
    <Collapsible defaultOpen={isActive || suite.prefix === "erpclaw"}>
      <SidebarGroup>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
          <Layers className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">{suite.label}</span>
          <span className="text-[10px] font-normal text-muted-foreground/60">
            {suite.skills.length}
          </span>
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            {sortedCategories.length > 1 ? (
              // Multiple categories within suite: show sub-groups
              sortedCategories.map((cat) => (
                <div key={cat} className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {categoryLabel(cat)}
                  </p>
                  <SkillList
                    skills={suite.categories[cat]}
                    allSkills={suite.skills}
                    pathname={pathname}
                  />
                </div>
              ))
            ) : (
              // Single category: flat list
              <SkillList
                skills={suite.skills}
                allSkills={suite.skills}
                pathname={pathname}
              />
            )}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

// ── Main sidebar ────────────────────────────────────────────────────────────

export function AppSidebar() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentSkills, setRecentSkills] = useState<string[]>([]);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  useEffect(() => {
    getSkills().then(setSkills).catch(() => {});
    setRecentSkills(getRecentSkills());
  }, []);

  // Track recent skill visits
  useEffect(() => {
    const match = pathname.match(/^\/skills\/([^/?]+)/);
    if (match && match[1]) {
      const updated = pushRecentSkill(match[1]);
      setRecentSkills(updated);
    }
  }, [pathname]);

  // Detect multi-suite vs single-suite
  const suites = detectSuites(skills);
  const isMultiSuite = suites.length > 0;

  // Filter skills by search query
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills;
    const q = searchQuery.toLowerCase();
    return skills.filter((s) => {
      const display = skillDisplayName(s.name, skills).toLowerCase();
      const name = s.name.toLowerCase();
      return display.includes(q) || name.includes(q);
    });
  }, [skills, searchQuery]);

  // Single-suite mode: group by category (current behaviour)
  const grouped: Record<string, Skill[]> = {};
  const skillsForGrouping = searchQuery.trim() ? filteredSkills : skills;
  if (!isMultiSuite) {
    for (const s of skillsForGrouping) {
      const cat = s.category || "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    }
  }

  // Multi-suite mode: filter suites when searching
  const filteredSuites = useMemo(() => {
    if (!searchQuery.trim()) return suites;
    const filteredNames = new Set(filteredSkills.map((s) => s.name));
    return suites
      .map((suite) => ({
        ...suite,
        skills: suite.skills.filter((s) => filteredNames.has(s.name)),
        categories: Object.fromEntries(
          Object.entries(suite.categories)
            .map(([cat, catSkills]) => [cat, catSkills.filter((s) => filteredNames.has(s.name))])
            .filter(([, catSkills]) => (catSkills as Skill[]).length > 0)
        ),
      }))
      .filter((suite) => suite.skills.length > 0);
  }, [suites, filteredSkills, searchQuery]);

  // Recent skills resolved from skill list
  const recentItems = useMemo(() => {
    if (searchQuery.trim()) return []; // Hide recents while searching
    return recentSkills
      .map((name) => skills.find((s) => s.name === name))
      .filter((s): s is Skill => s !== undefined);
  }, [recentSkills, skills, searchQuery]);

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  // In multi-suite mode, use "Webclaw" as the title
  const title = isMultiSuite ? "Webclaw" : APP_TITLE;

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">{title}</span>
        </Link>
        <p className="text-xs text-muted-foreground">
          {isMultiSuite
            ? `${suites.length} suites, ${skills.length} skills`
            : "AI-native tools on OpenClaw"}
        </p>
      </SidebarHeader>
      <SidebarContent>
        {/* Search filter */}
        <div className="px-3 pt-2 pb-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Filter skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        {/* Dashboard link */}
        {!searchQuery.trim() && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/dashboard"}>
                    <Link href="/dashboard">
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Recent skills */}
        {recentItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="gap-1.5">
              <Clock className="h-3 w-3" />
              Recent
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SkillList
                skills={recentItems}
                allSkills={skills}
                pathname={pathname}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Multi-suite mode: collapsible suite sections */}
        {isMultiSuite &&
          filteredSuites.map((suite) => (
            <SuiteSection
              key={suite.prefix}
              suite={suite}
              allSkills={skills}
              pathname={pathname}
            />
          ))}

        {/* Single-suite mode: flat category groups */}
        {!isMultiSuite && skillsForGrouping.length > 0 && (
          <CategoryGroups
            grouped={grouped}
            allSkills={skills}
            pathname={pathname}
          />
        )}

        {/* No results */}
        {searchQuery.trim() && filteredSkills.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No skills match &ldquo;{searchQuery}&rdquo;
          </div>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials}
              </div>
              <div className="flex-1 truncate">
                <p className="truncate text-sm font-medium">
                  {user?.full_name || "User"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email}
                </p>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
