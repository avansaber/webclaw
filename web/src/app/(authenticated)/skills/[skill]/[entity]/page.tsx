"use client";

import { useState, use, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { skillDisplayName } from "@/lib/api";
import { useUIConfig } from "@/lib/ui-config";
import { DataTable } from "@/components/data-table";
import { useEntityList, useSkillActions } from "@/lib/hooks";
import {
  listActionFromSlug,
  entityKeyFromSlug,
  entityLabel,
  deriveAddAction,
  deriveGetAction,
  getEntityDetailUrl,
  getEntityNewUrl,
} from "@/lib/entity-routing";

const PAGE_SIZE = 20;

export default function EntityListPage({
  params,
}: {
  params: Promise<{ skill: string; entity: string }>;
}) {
  const { skill, entity: slug } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { config: uiConfig } = useUIConfig(skill);
  const { actions: allActions } = useSkillActions(skill);

  const listAction = listActionFromSlug(slug);
  const entityKey = entityKeyFromSlug(slug, uiConfig);
  const entityDef = entityKey && uiConfig?.entities?.[entityKey] ? uiConfig.entities[entityKey] : undefined;
  const label = entityLabel(slug, uiConfig);

  const [page, setPage] = useState(0);

  // Derive add and get actions
  const addAction = entityDef
    ? (() => {
        for (const [act, entry] of Object.entries(uiConfig?.action_map || {})) {
          if ((act.startsWith("add-") || act.startsWith("create-")) && entry.entity === entityKey) {
            return act;
          }
        }
        return deriveAddAction(listAction, allActions);
      })()
    : deriveAddAction(listAction, allActions);

  const getAction = deriveGetAction(listAction, allActions.length > 0 ? allActions : undefined);

  // Build query params from URL search params (filters)
  const queryParams = useMemo(() => {
    const p: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(page),
    };
    searchParams.forEach((value, key) => {
      if (key !== "page") p[key] = value;
    });
    return p;
  }, [page, searchParams]);

  // Load data via React Query
  const { data, isLoading, error } = useEntityList(skill, listAction, queryParams);

  // Extract items from response
  const arrayKey = data
    ? Object.keys(data).find((k) => Array.isArray(data[k]) && k !== "tags" && k !== "requires")
    : null;
  const items = arrayKey ? (data![arrayKey] as Record<string, unknown>[]) : [];
  const totalCount = data?.total_count as number | undefined;
  const hasMore = (data?.has_more as boolean) || false;

  // Disable row clicks for list-only entities (row_click: null in UI.yaml)
  const rowClickDisabled = entityDef?.views?.list?.row_click === null;

  function handleRowClick(row: Record<string, unknown>) {
    if (rowClickDisabled) return;
    const id = String(row.id || row.name || "");
    if (!id || !getAction) return;
    router.push(getEntityDetailUrl(skill, slug, id));
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{label}</h2>
          {totalCount != null && (
            <Badge variant="secondary">{totalCount} records</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {addAction && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => router.push(getEntityNewUrl(skill, slug))}
            >
              <Plus className="h-3.5 w-3.5" />
              New {label.replace(/s$/, "").replace(/ies$/, "y")}
            </Button>
          )}
        </div>
      </div>

      {/* Data table */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Could not load {label.toLowerCase()}.
              {error instanceof Error && error.message && !error.message.includes("Unknown action")
                ? ` ${error.message}`
                : " This entity may require additional parameters or is not available."}
            </p>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">No records found.</p>
            {addAction && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => router.push(getEntityNewUrl(skill, slug))}
              >
                <Plus className="h-3.5 w-3.5" />
                Create your first {label.replace(/s$/, "").replace(/ies$/, "y").toLowerCase()}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <DataTable
            data={items}
            onRowClick={getAction && !rowClickDisabled ? handleRowClick : undefined}
            exportFilename={`${skill}-${slug}`}
            entityDef={entityDef}
            statusColors={entityDef?.status_colors}
          />

          {/* Pagination */}
          {(page > 0 || hasMore) && (
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Showing {page + 1}–{page + items.length}{totalCount != null ? ` of ${totalCount}` : ""}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(Math.max(0, page - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => setPage(page + PAGE_SIZE)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
