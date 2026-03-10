"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronLeft } from "lucide-react";

export interface ProfileTemplate {
  key: string;
  display_name: string;
  description: string;
  icon: string;
  core_skills: string[];
  optional_skills: string[];
}

// Map profile icon names to emoji (lucide icons require static imports;
// emoji keeps the component simple and avoids a large icon map)
const ICON_MAP: Record<string, string> = {
  briefcase: "\u{1F4BC}",
  "shopping-cart": "\u{1F6D2}",
  factory: "\u{1F3ED}",
  users: "\u{1F465}",
  truck: "\u{1F69A}",
  cloud: "\u{2601}\u{FE0F}",
  home: "\u{1F3E0}",
  "building-2": "\u{1F3E5}",
  stethoscope: "\u{1FA7A}",
  "heart-pulse": "\u{1F43E}",
  brain: "\u{1F9E0}",
  "home-heart": "\u{1F3E0}",
  "graduation-cap": "\u{1F393}",
  "heart-handshake": "\u{1F91D}",
  building: "\u{1F3E2}",
  layers: "\u{1F4DA}",
  settings: "\u{2699}\u{FE0F}",
};

// ── Category groupings ─────────────────────────────────────────────────────
// Groups the 18 profiles into browsable categories for the "What are you building?" step

interface Category {
  key: string;
  label: string;
  emoji: string;
  description: string;
  profileKeys: string[];
}

const CATEGORIES: Category[] = [
  {
    key: "business",
    label: "Business",
    emoji: "\u{1F4BC}",
    description: "Sales, purchasing, inventory, CRM",
    profileKeys: ["small-business", "retail", "distribution", "saas"],
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    emoji: "\u{1F3ED}",
    description: "Production, BOMs, quality control",
    profileKeys: ["manufacturing"],
  },
  {
    key: "services",
    label: "Services",
    emoji: "\u{1F465}",
    description: "Consulting, agencies, projects",
    profileKeys: ["professional-services"],
  },
  {
    key: "healthcare",
    label: "Healthcare",
    emoji: "\u{1FA7A}",
    description: "Medical, dental, veterinary, mental health",
    profileKeys: ["healthcare", "dental", "veterinary", "mental-health", "home-health"],
  },
  {
    key: "education",
    label: "Education",
    emoji: "\u{1F393}",
    description: "K-12 schools, colleges, universities",
    profileKeys: ["k12-school", "college-university"],
  },
  {
    key: "property",
    label: "Property",
    emoji: "\u{1F3E0}",
    description: "Rentals, leases, tenants, maintenance",
    profileKeys: ["property-management"],
  },
  {
    key: "more",
    label: "More",
    emoji: "\u{2699}\u{FE0F}",
    description: "Nonprofit, enterprise, full suite, custom",
    profileKeys: ["nonprofit", "enterprise", "full-erp", "custom"],
  },
];

interface ProfileSelectorProps {
  profiles: ProfileTemplate[];
  selected: string | null;
  onSelect: (key: string) => void;
}

export function ProfileSelector({
  profiles,
  selected,
  onSelect,
}: ProfileSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(() => {
    // If a profile is already selected, open its category
    if (selected) {
      const cat = CATEGORIES.find((c) => c.profileKeys.includes(selected));
      return cat?.key ?? null;
    }
    return null;
  });

  const profileMap = new Map(profiles.map((p) => [p.key, p]));

  // If a category has exactly 1 profile, clicking the category selects it directly
  function handleCategoryClick(cat: Category) {
    if (cat.profileKeys.length === 1) {
      const profile = profileMap.get(cat.profileKeys[0]);
      if (profile) {
        onSelect(profile.key);
        setActiveCategory(cat.key);
      }
    } else {
      setActiveCategory(cat.key);
    }
  }

  // Category cards view
  if (!activeCategory) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATEGORIES.map((cat) => {
          const hasSelection = selected && cat.profileKeys.includes(selected);
          const selectedProfile = hasSelection
            ? profileMap.get(selected!)
            : null;
          return (
            <Card
              key={cat.key}
              className={`cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${
                hasSelection
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "hover:border-muted-foreground/50"
              }`}
              onClick={() => handleCategoryClick(cat)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl shrink-0">{cat.emoji}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{cat.label}</p>
                      {hasSelection && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {hasSelection
                        ? selectedProfile?.display_name
                        : cat.description}
                    </p>
                    {cat.profileKeys.length > 1 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 mt-2"
                      >
                        {cat.profileKeys.length} options
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // Sub-selection view: show profiles within the selected category
  const category = CATEGORIES.find((c) => c.key === activeCategory);
  if (!category) return null;

  const categoryProfiles = category.profileKeys
    .map((k) => profileMap.get(k))
    .filter(Boolean) as ProfileTemplate[];

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setActiveCategory(null)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        All categories
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categoryProfiles.map((p) => {
          const isSelected = selected === p.key;
          return (
            <Card
              key={p.key}
              className={`cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "hover:border-muted-foreground/50"
              }`}
              onClick={() => onSelect(p.key)}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div className="text-2xl shrink-0 mt-0.5">
                  {ICON_MAP[p.icon] || "\u{1F4BC}"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{p.display_name}</p>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {p.description}
                  </p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {p.core_skills.length} core
                    </Badge>
                    {p.optional_skills.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        +{p.optional_skills.length} optional
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Skill Toggle Grid ───────────────────────────────────────────────────────

function skillLabel(name: string): string {
  // erpclaw-selling → Selling, healthclaw-dental → Dental, propertyclaw → PropertyClaw
  if (name === "propertyclaw") return "PropertyClaw";
  if (name === "healthclaw") return "HealthClaw";
  if (name === "educlaw") return "EduClaw";
  if (name === "retailclaw") return "RetailClaw";
  if (name === "nonprofitclaw") return "NonprofitClaw";
  const parts = name.split("-");
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1);
}

interface SkillToggleGridProps {
  coreSkills: string[];
  optionalSkills: string[];
  selectedExtras: string[];
  onToggleExtra: (skill: string) => void;
}

export function SkillToggleGrid({
  coreSkills,
  optionalSkills,
  selectedExtras,
  onToggleExtra,
}: SkillToggleGridProps) {
  return (
    <div className="space-y-3">
      {/* Core skills — always on */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Core modules (always active)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {coreSkills.map((s) => (
            <Badge key={s} variant="default" className="text-xs gap-1">
              <Check className="h-3 w-3" />
              {skillLabel(s)}
            </Badge>
          ))}
        </div>
      </div>

      {/* Optional skills — toggleable */}
      {optionalSkills.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Optional modules (click to add)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {optionalSkills.map((s) => {
              const active = selectedExtras.includes(s);
              return (
                <Badge
                  key={s}
                  variant={active ? "default" : "outline"}
                  className={`text-xs cursor-pointer transition-colors gap-1 ${
                    active ? "" : "hover:bg-accent"
                  }`}
                  onClick={() => onToggleExtra(s)}
                >
                  {active && <Check className="h-3 w-3" />}
                  {skillLabel(s)}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
