/**
 * React Query hooks for webclaw v2 data fetching.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, postAction, getSkills, getActionIndex } from "./api";
import type { ApiResponse } from "./api";
import { buildIdQuery } from "./entity-routing";

// ── Skills ───────────────────────────────────────────────────────────────────

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: getSkills,
    staleTime: 5 * 60_000, // 5 min
  });
}

export function useActionIndex() {
  return useQuery({
    queryKey: ["action-index"],
    queryFn: getActionIndex,
    staleTime: 5 * 60_000,
  });
}

// ── Entity data ──────────────────────────────────────────────────────────────

export function useEntityList(
  skill: string,
  action: string,
  params?: Record<string, string>,
  options?: { enabled?: boolean },
) {
  const searchParams = new URLSearchParams(params);
  return useQuery({
    queryKey: ["entity-list", skill, action, params],
    queryFn: () => fetchApi(`/${skill}/${action}?${searchParams.toString()}`),
    enabled: options?.enabled !== false && !!skill && !!action,
  });
}

export function useEntityDetail(
  skill: string,
  action: string,
  id: string,
  options?: { enabled?: boolean; entitySlug?: string },
) {
  const slug = options?.entitySlug;
  return useQuery({
    queryKey: ["entity-detail", skill, action, id],
    queryFn: () => fetchApi(`/${skill}/${action}?${slug ? buildIdQuery(slug, id) : `id=${encodeURIComponent(id)}`}`),
    enabled: options?.enabled !== false && !!skill && !!action && !!id,
  });
}

export function useSkillStatus(skill: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["skill-status", skill],
    queryFn: () => fetchApi(`/${skill}/status`),
    enabled: options?.enabled !== false && !!skill,
  });
}

export function useActivity(params?: { skill?: string; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.skill) searchParams.set("skill", params.skill);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  return useQuery({
    queryKey: ["activity", params],
    queryFn: () => fetchApi(`/activity?${searchParams.toString()}`),
    staleTime: 10_000, // 10s
  });
}

/** Discover available actions for a skill.
 *
 * Uses the dedicated schema discovery endpoint which has 3-level fallback
 * (argparse probe → error parsing → SKILL.md YAML). This works for all skills
 * including standalone ones whose `status` action doesn't return an actions list.
 */
export function useSkillActions(skill: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["skill-actions", skill],
    queryFn: () => fetchApi(`/schema/actions/${skill}`),
    staleTime: 5 * 60_000, // 5 min — action lists rarely change
    enabled: !!skill,
  });
  const actions = (data?.actions as string[]) || [];
  return { actions, isLoading, data };
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useEntityMutation(skill: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, body }: { action: string; body?: Record<string, unknown> }) =>
      postAction(skill, action, body),
    onSuccess: () => {
      // Invalidate all list queries for this skill
      queryClient.invalidateQueries({ queryKey: ["entity-list", skill] });
      // Invalidate skill status (KPIs may have changed)
      queryClient.invalidateQueries({ queryKey: ["skill-status", skill] });
      // Invalidate activity feeds
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
