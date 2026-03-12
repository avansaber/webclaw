"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import { useUIConfig } from "@/lib/ui-config";
import { useParamSchema } from "@/lib/param-schema";
import { useChildTableSchema } from "@/lib/child-table-schema";
import { generateFormSpec } from "@/lib/ui-yaml-to-form";
import { generateAutoFormSpec } from "@/lib/auto-form-spec";
import { DynamicForm } from "@/components/dynamic-form";
import { useSkillActions, useEntityDetail } from "@/lib/hooks";
import {
  entityKeyFromSlug,
  entityLabel,
  deriveGetAction,
  getEntityDetailUrl,
  listActionFromSlug,
  entityIdParam,
  singularize,
} from "@/lib/entity-routing";

export default function EntityEditPage({
  params,
}: {
  params: Promise<{ skill: string; entity: string; id: string }>;
}) {
  const { skill, entity: slug, id } = use(params);
  const router = useRouter();
  const { config: uiConfig, loading: uiLoading } = useUIConfig(skill);
  const { schema: paramSchema, loading: paramLoading } = useParamSchema(skill);
  const { schema: childTableSchema } = useChildTableSchema(skill);

  const listAction = listActionFromSlug(slug);
  const entityKey = entityKeyFromSlug(slug, uiConfig);
  const label = entityLabel(slug, uiConfig);
  const singularLabel = singularize(label.toLowerCase()).split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const decodedId = decodeURIComponent(id);

  // Discover actions via React Query
  const { actions: allActions, isLoading: actionsLoading } = useSkillActions(skill);

  // Validate getAction against available actions
  const getAction = !actionsLoading
    ? deriveGetAction(listAction, allActions.length > 0 ? allActions : undefined)
    : null;

  // Load current record via React Query
  const { data: recordData, isLoading: recordLoading, error: recordError } = useEntityDetail(
    skill, getAction || "", decodedId,
    { enabled: !!getAction, entitySlug: slug },
  );

  // Extract record: handle {data:…}, {record:…}, or entity-name-keyed responses like {company:…}
  const record = (() => {
    if (!recordData) return null;
    if (recordData.data && typeof recordData.data === "object" && !Array.isArray(recordData.data)) {
      return recordData.data as Record<string, unknown>;
    }
    if (recordData.record && typeof recordData.record === "object" && !Array.isArray(recordData.record)) {
      return recordData.record as Record<string, unknown>;
    }
    const dataKeys = Object.keys(recordData).filter(k => !k.startsWith("_") && k !== "status" && k !== "request_id");
    const objectKeys = dataKeys.filter(k => {
      const val = (recordData as Record<string, unknown>)[k];
      return val && typeof val === "object" && !Array.isArray(val);
    });
    if (objectKeys.length === 1) {
      return (recordData as Record<string, unknown>)[objectKeys[0]] as Record<string, unknown>;
    }
    return recordData as Record<string, unknown>;
  })();

  // Find update action
  const entityName = singularize(slug).replace(/-/g, "_");
  const updateAction = (() => {
    if (uiConfig && entityKey) {
      for (const [act, entry] of Object.entries(uiConfig.action_map || {})) {
        if (act.startsWith("update-") && entry.entity === entityKey) {
          return act;
        }
      }
    }
    const candidate = `update-${entityName}`;
    return allActions.includes(candidate) ? candidate : null;
  })();

  // Resolve form spec for the update action
  const formSpec = (() => {
    if (!updateAction) return null;
    if (uiConfig) {
      const spec = generateFormSpec(uiConfig, updateAction);
      if (spec) return spec;
    }
    if (uiLoading) return null;
    if (paramSchema?.actions?.[updateAction]) {
      return generateAutoFormSpec(skill, updateAction, paramSchema.actions[updateAction], childTableSchema ?? undefined);
    }
    return null;
  })();

  if (uiLoading || paramLoading || recordLoading || actionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!formSpec || !record) {
    return (
      <div className="p-6 space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(getEntityDetailUrl(skill, slug, decodedId))}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to {singularLabel}
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {!record
                ? <>
                    {singularLabel} not found — <span className="font-mono text-xs">{decodedId}</span>
                    {recordError ? ` (${recordError instanceof Error ? recordError.message : "Unknown error"})` : ""}
                  </>
                : `No edit form available for ${singularLabel.toLowerCase()}.`}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pre-fill form with current record values
  const initialValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== null && value !== undefined && typeof value !== "object") {
      initialValues[key] = String(value);
    }
  }
  // Also inject entity-specific ID param (e.g. property_id) for skills that use it
  const idParam = entityIdParam(slug);
  if (idParam !== "id" && !initialValues[idParam]) {
    initialValues[idParam] = decodedId;
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(getEntityDetailUrl(skill, slug, decodedId))}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to {singularLabel}
      </Button>

      <DynamicForm
        spec={{ ...formSpec, title: `Edit ${singularLabel}` }}
        skill={skill}
        initialValues={initialValues}
        onSuccess={() => {
          router.push(getEntityDetailUrl(skill, slug, decodedId));
        }}
        onCancel={() => router.push(getEntityDetailUrl(skill, slug, decodedId))}
      />
    </div>
  );
}
