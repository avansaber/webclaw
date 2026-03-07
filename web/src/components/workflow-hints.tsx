"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  X,
} from "lucide-react";
import type { WorkflowSuggestion } from "@/lib/ui-yaml-types";

export interface WorkflowHintsProps {
  /** The action that just completed */
  completedAction: string;
  /** Suggestions to show */
  suggestions: WorkflowSuggestion[];
  /** API response from the completed action (for param mapping) */
  responseData: Record<string, unknown>;
  /** Current skill name */
  skill: string;
  /** Called when user picks a suggestion */
  onSelect: (action: string, skill: string, prefill: Record<string, string>) => void;
  /** Called when user dismisses */
  onDismiss: () => void;
}

/** Resolve `pass` mappings: maps target param names to values from the API response. */
function resolvePassParams(
  pass: Record<string, string> | undefined,
  responseData: Record<string, unknown>,
): Record<string, string> {
  if (!pass) return {};
  const result: Record<string, string> = {};
  for (const [targetParam, sourceField] of Object.entries(pass)) {
    // Look in top-level response, then in nested data/record objects
    let value = responseData[sourceField];
    if (value === undefined && responseData.data && typeof responseData.data === "object") {
      value = (responseData.data as Record<string, unknown>)[sourceField];
    }
    if (value === undefined && responseData.record && typeof responseData.record === "object") {
      value = (responseData.record as Record<string, unknown>)[sourceField];
    }
    if (value !== undefined && value !== null) {
      result[targetParam] = String(value);
    }
  }
  return result;
}

/** Format action name for display: "approve-application" → "Approved application" */
function completedLabel(action: string): string {
  return action
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const AUTO_DISMISS_MS = 15_000;

export function WorkflowHints({
  completedAction,
  suggestions,
  responseData,
  skill,
  onSelect,
  onDismiss,
}: WorkflowHintsProps) {
  const [visible, setVisible] = useState(true);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // wait for slide-out animation
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  function handleDismiss() {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] transition-all duration-300 ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      }`}
    >
      <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              {completedLabel(completedAction)} — Success
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">What would you like to do next?</p>
          <div className="flex flex-col gap-2">
            {suggestions.map((s) => {
              const prefill = resolvePassParams(s.pass, responseData);
              const targetSkill = s.skill || skill;
              return (
                <Button
                  key={`${targetSkill}/${s.action}`}
                  variant="outline"
                  className="justify-between h-auto py-3 px-4 text-left"
                  onClick={() => onSelect(s.action, targetSkill, prefill)}
                >
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{s.label}</p>
                      {targetSkill !== skill && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {targetSkill.replace(/^erpclaw-/, "")}
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
