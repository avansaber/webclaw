"use client";

import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import { skillDisplayName } from "@/lib/api";
import { useUIConfig } from "@/lib/ui-config";
import { useParamSchema } from "@/lib/param-schema";
import { useChildTableSchema } from "@/lib/child-table-schema";
import { generateFormSpec } from "@/lib/ui-yaml-to-form";
import { generateAutoFormSpec } from "@/lib/auto-form-spec";
import { DynamicForm } from "@/components/dynamic-form";
import { WorkflowHints } from "@/components/workflow-hints";
import { useSkillActions } from "@/lib/hooks";
import type { WorkflowSuggestion } from "@/lib/ui-yaml-types";
import {
  entityKeyFromSlug,
  entityLabel,
  deriveAddAction,
  getEntityListUrl,
  getEntityDetailUrl,
  getEntityNewUrl,
  getSkillDashboardUrl,
  slugFromListAction,
  listActionFromSlug,
} from "@/lib/entity-routing";

export default function EntityNewPage({
  params,
}: {
  params: Promise<{ skill: string; entity: string }>;
}) {
  const { skill, entity: slug } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { config: uiConfig, loading: uiLoading } = useUIConfig(skill);
  const { schema: paramSchema, loading: paramLoading } = useParamSchema(skill);
  const { schema: childTableSchema } = useChildTableSchema(skill);

  const listAction = listActionFromSlug(slug);
  const entityKey = entityKeyFromSlug(slug, uiConfig);
  const label = entityLabel(slug, uiConfig);

  const { actions: allActions } = useSkillActions(skill);
  const [workflowHint, setWorkflowHint] = useState<{
    action: string;
    suggestions: WorkflowSuggestion[];
    responseData: Record<string, unknown>;
  } | null>(null);

  // Find the add/create action for this entity
  const addAction = (() => {
    if (uiConfig && entityKey) {
      for (const [act, entry] of Object.entries(uiConfig.action_map || {})) {
        if ((act.startsWith("add-") || act.startsWith("create-")) && entry.entity === entityKey) {
          return act;
        }
      }
    }
    return deriveAddAction(listAction, allActions.length > 0 ? allActions : undefined);
  })();

  // Resolve form spec (3-layer: UI.yaml → auto-FormSpec → null)
  const formSpec = (() => {
    if (!addAction) return null;
    // L2: UI.yaml
    if (uiConfig) {
      const spec = generateFormSpec(uiConfig, addAction);
      if (spec) return spec;
    }
    if (uiLoading) return null;
    // L1: Auto from SKILL.md
    if (paramSchema?.actions?.[addAction]) {
      return generateAutoFormSpec(skill, addAction, paramSchema.actions[addAction], childTableSchema ?? undefined);
    }
    return null;
  })();

  // Loading
  if (uiLoading || paramLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No form spec available
  if (!formSpec) {
    return (
      <div className="p-6 space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(getEntityListUrl(skill, slug))}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to {label}
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No form configuration available for creating a new {label.replace(/s$/, "").replace(/ies$/, "y").toLowerCase()}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      {/* Back link */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(getEntityListUrl(skill, slug))}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to {label}
      </Button>

      {/* Form */}
      <DynamicForm
        spec={formSpec}
        skill={skill}
        onSuccess={(action, result) => {
          // Check for workflow hints
          const rule = uiConfig?.workflows?.find((w) => w.after === action);
          if (rule && rule.suggest.length > 0) {
            setWorkflowHint({
              action,
              suggestions: rule.suggest,
              responseData: result as Record<string, unknown>,
            });
            return;
          }
          // Navigate to entity list (or detail if we have an ID)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = result as Record<string, any>;
          const createdId = r?.id || r?.data?.id;
          if (createdId) {
            router.push(getEntityDetailUrl(skill, slug, String(createdId)));
          } else {
            router.push(getEntityListUrl(skill, slug));
          }
        }}
        onCancel={() => router.push(getEntityListUrl(skill, slug))}
      />

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
              for (const [k, v] of Object.entries(prefill)) {
                params.set(k, v);
              }
              router.push(`/skills/${targetSkill}/actions?${params.toString()}`);
            } else {
              const entityPart = action.replace(/^(add|create)-/, "");
              const targetSlug = entityPart.endsWith("y")
                ? entityPart.slice(0, -1) + "ies"
                : entityPart + "s";
              const qs = new URLSearchParams(prefill).toString();
              router.push(getEntityNewUrl(skill, targetSlug) + (qs ? `?${qs}` : ""));
            }
          }}
          onDismiss={() => setWorkflowHint(null)}
        />
      )}
    </div>
  );
}
