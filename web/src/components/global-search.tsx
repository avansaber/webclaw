"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  Shield, AlertTriangle, Lock, Scale, Puzzle,
  Search, MessageSquare, Settings, Home,
} from "lucide-react";
import { getSkills, type Skill, skillDisplayName, CATEGORY_CONFIG, categoryLabel } from "@/lib/api";
import { useChat } from "@/lib/chat";

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

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const router = useRouter();
  const { toggle: toggleChat } = useChat();

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

  // Load skills on first open
  useEffect(() => {
    if (open && skills.length === 0) {
      getSkills().then(setSkills).catch(() => {});
    }
  }, [open, skills.length]);

  const navigate = useCallback((path: string) => {
    setOpen(false);
    router.push(path);
  }, [router]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search skills, actions, pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => navigate("/")}>
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => { setOpen(false); toggleChat(); }}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Open Chat
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Skills */}
        <CommandGroup heading="Skills">
          {skills.map((skill) => (
            <CommandItem
              key={skill.name}
              value={`${skill.name} ${skill.description || ""} ${skill.category || ""}`}
              onSelect={() => navigate(`/skills/${skill.name}`)}
            >
              {CATEGORY_ICONS[skill.category || ""] || <Settings className="h-4 w-4" />}
              <span className="ml-2">{skillDisplayName(skill.name, skills)}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {categoryLabel(skill.category || "other")}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
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
