"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Building2, BookOpen, Package, ShoppingCart, Truck, Factory,
  Users, FolderKanban, HeartPulse, Receipt, Headset, BarChart3,
  Shield, AlertTriangle, Lock, Scale,
  Search, MessageSquare, Settings, Home,
  List, Plus, Eye, RefreshCw, Send, XCircle, Trash2, Play,
} from "lucide-react";
import {
  getSkills, type Skill, skillDisplayName, categoryLabel,
  getActionIndex, type ActionIndexEntry,
} from "@/lib/api";
import { useChat } from "@/lib/chat";
import { Clock } from "lucide-react";

// ── Recent items (localStorage) ─────────────────────────────────────────────

const RECENT_KEY = "erpclaw_recent_cmdk";
const MAX_RECENT = 5;

interface RecentItem {
  label: string;
  path: string;
  skill?: string;
  icon?: string; // action type for icon resolution
}

function getRecentItems(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecentItem(item: RecentItem) {
  if (typeof window === "undefined") return;
  try {
    const current = getRecentItems();
    const deduped = [item, ...current.filter((r) => r.path !== item.path)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(deduped));
  } catch { /* ignore */ }
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  setup: <Building2 className="h-4 w-4" />,
  accounting: <BookOpen className="h-4 w-4" />,
  inventory: <Package className="h-4 w-4" />,
  selling: <ShoppingCart className="h-4 w-4" />,
  buying: <Truck className="h-4 w-4" />,
  manufacturing: <Factory className="h-4 w-4" />,
  hr: <Users className="h-4 w-4" />,
  projects: <FolderKanban className="h-4 w-4" />,
  crm: <HeartPulse className="h-4 w-4" />,
  billing: <Receipt className="h-4 w-4" />,
  support: <Headset className="h-4 w-4" />,
  analytics: <BarChart3 className="h-4 w-4" />,
  compliance: <Shield className="h-4 w-4" />,
  risk: <AlertTriangle className="h-4 w-4" />,
  audit: <Search className="h-4 w-4" />,
  security: <Lock className="h-4 w-4" />,
  governance: <Scale className="h-4 w-4" />,
};

function actionIcon(type: string) {
  switch (type) {
    case "list": return <List className="h-4 w-4" />;
    case "get": return <Eye className="h-4 w-4" />;
    case "add":
    case "create": return <Plus className="h-4 w-4" />;
    case "update": return <RefreshCw className="h-4 w-4" />;
    case "submit": return <Send className="h-4 w-4" />;
    case "cancel": return <XCircle className="h-4 w-4" />;
    case "delete": return <Trash2 className="h-4 w-4" />;
    default: return <Play className="h-4 w-4" />;
  }
}

/** Convert "list-work-orders" → "List Work Orders" */
function actionLabel(action: string): string {
  return action
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [actionIndex, setActionIndex] = useState<ActionIndexEntry[]>([]);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const { toggle: toggleChat } = useChat();

  // Detect current skill from URL for context-aware actions
  const currentSkill = useMemo(() => {
    const match = pathname.match(/^\/skills\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load data on first open
  useEffect(() => {
    if (open && skills.length === 0) {
      getSkills().then(setSkills).catch(() => {});
    }
    if (open && actionIndex.length === 0) {
      getActionIndex().then(setActionIndex).catch(() => {});
    }
  }, [open, skills.length, actionIndex.length]);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const navigate = useCallback((path: string, label?: string) => {
    setOpen(false);
    if (label) {
      pushRecentItem({ label, path });
    }
    router.push(path);
  }, [router]);

  // Build action route based on action type
  const navigateAction = useCallback((entry: ActionIndexEntry) => {
    setOpen(false);
    const { action, skill } = entry;
    const label = actionLabel(action);
    const skillLabel = skillDisplayName(skill, skills);
    if (action.startsWith("list-")) {
      const slug = action.replace(/^list-/, "");
      const path = `/skills/${skill}/${slug}`;
      pushRecentItem({ label: `${label} (${skillLabel})`, path, skill, icon: "list" });
      router.push(path);
    } else if (action.startsWith("add-") || action.startsWith("create-")) {
      const entityPart = action.replace(/^(add|create)-/, "");
      const slug = entityPart.endsWith("y")
        ? entityPart.slice(0, -1) + "ies"
        : entityPart + "s";
      const path = `/skills/${skill}/${slug}/new`;
      pushRecentItem({ label: `${label} (${skillLabel})`, path, skill, icon: "add" });
      router.push(path);
    } else {
      const path = `/skills/${skill}/actions?action=${action}`;
      pushRecentItem({ label: `${label} (${skillLabel})`, path, skill, icon: entry.type });
      router.push(path);
    }
  }, [router, skills]);

  // Show actions only when user has typed a query (otherwise too many items)
  const showActions = query.length >= 2;

  // Filtered actions for display — cmdk handles its own fuzzy filtering via the value prop,
  // but we pre-filter to limit DOM nodes when there's no query
  const displayActions = useMemo(() => {
    if (!showActions) return [];
    return actionIndex;
  }, [showActions, actionIndex]);

  // Recent items for empty state
  const recentItems = useMemo(() => {
    if (query.length > 0) return [];
    return getRecentItems();
  }, [query, open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search skills, actions, entities..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Recent items (when query is empty) */}
        {recentItems.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentItems.map((item) => (
                <CommandItem
                  key={item.path}
                  value={`recent ${item.label}`}
                  onSelect={() => navigate(item.path)}
                >
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Pages */}
        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => navigate("/dashboard", "Dashboard")}>
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => { setOpen(false); toggleChat(); }}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Open Chat
          </CommandItem>
          {currentSkill && currentSkill !== "webclaw" && (
            <CommandItem
              value={`action runner ${currentSkill} ${skillDisplayName(currentSkill, skills)}`}
              onSelect={() => navigate(`/skills/${currentSkill}/actions`, `Action Runner (${skillDisplayName(currentSkill, skills)})`)}
            >
              <Play className="mr-2 h-4 w-4" />
              Action Runner
              <span className="ml-auto text-xs text-muted-foreground">
                {skillDisplayName(currentSkill, skills)}
              </span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        {/* Skills */}
        <CommandGroup heading="Skills">
          {skills.map((skill) => {
            const label = skillDisplayName(skill.name, skills);
            return (
              <CommandItem
                key={skill.name}
                value={`skill ${skill.name} ${skill.description || ""} ${skill.category || ""}`}
                onSelect={() => navigate(`/skills/${skill.name}`, label)}
              >
                {CATEGORY_ICONS[skill.category || ""] || <Settings className="h-4 w-4" />}
                <span className="ml-2">{label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {categoryLabel(skill.category || "other")}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {/* Actions — only shown when user types a query */}
        {showActions && displayActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {displayActions.map((entry) => (
                <CommandItem
                  key={`${entry.skill}/${entry.action}`}
                  value={`action ${entry.action} ${entry.group} ${entry.skill} ${skillDisplayName(entry.skill, skills)}`}
                  onSelect={() => navigateAction(entry)}
                >
                  {actionIcon(entry.type)}
                  <span className="ml-2">{actionLabel(entry.action)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {skillDisplayName(entry.skill, skills)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

// Button to trigger from header
export function SearchButton() {
  return (
    <button
      onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
      className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span>Search...</span>
      <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}
