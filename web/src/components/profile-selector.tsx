"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

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
  stethoscope: "\u{1FA7A}",
  "building-2": "\u{1F3E5}",
  "heart-pulse": "\u{1F43E}",
  brain: "\u{1F9E0}",
  home: "\u{1F3E0}",
  factory: "\u{1F3ED}",
  users: "\u{1F465}",
  "graduation-cap": "\u{1F393}",
};

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
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {profiles.map((p) => {
        const isSelected = selected === p.key;
        return (
          <Card
            key={p.key}
            className={`cursor-pointer transition-all ${
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
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {p.core_skills.length} core
                  </Badge>
                  {p.optional_skills.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
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
  );
}

// ── Skill Toggle Grid ───────────────────────────────────────────────────────

function skillLabel(name: string): string {
  // erpclaw-selling → Selling, healthclaw-dental → Dental, propclaw → PropClaw
  if (name === "propclaw") return "PropClaw";
  if (name === "healthclaw") return "HealthClaw";
  if (name === "educlaw") return "EduClaw";
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
