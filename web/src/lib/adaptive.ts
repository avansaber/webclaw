/**
 * React Query hooks for the Adaptive ERP system.
 *
 * Provides profile management, expansion prompts, and usage tracking.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "./api";
import type { ProfileTemplate } from "@/components/profile-selector";

// ── Types ───────────────────────────────────────────────────────────────────

export interface AdaptiveProfile {
  id: string;
  profile_key: string;
  display_name: string;
  active_skills: string[];
  vocabulary_overrides: Record<string, string>;
  created_at: string;
}

export interface ExpansionPrompt {
  id: string;
  suggested_skill: string;
  message: string;
  status: string;
  created_at: string;
}

export interface UsageCounter {
  entity_type: string;
  skill_name: string;
  count: number;
  last_updated: string;
}

// ── Profile hooks ───────────────────────────────────────────────────────────

export function useProfileTemplates() {
  return useQuery({
    queryKey: ["adaptive", "templates"],
    queryFn: async (): Promise<ProfileTemplate[]> => {
      const res = await fetchApi("/adaptive/profiles");
      return (res.profiles as ProfileTemplate[]) || [];
    },
    staleTime: 60 * 60_000, // 1 hour (templates are static)
  });
}

export function useCurrentProfile() {
  return useQuery({
    queryKey: ["adaptive", "profile"],
    queryFn: async (): Promise<AdaptiveProfile | null> => {
      const res = await fetchApi("/adaptive/profiles/current");
      return (res.profile as AdaptiveProfile) || null;
    },
    staleTime: 30_000, // 30s
  });
}

export function useActivateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileKey,
      extraSkills,
    }: {
      profileKey: string;
      extraSkills?: string[];
    }) => {
      return fetchApi("/adaptive/profiles/activate", {
        method: "POST",
        body: JSON.stringify({
          profile_key: profileKey,
          extra_skills: extraSkills || [],
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adaptive", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

// ── Expansion prompt hooks ──────────────────────────────────────────────────

export function useExpansionPrompts() {
  return useQuery({
    queryKey: ["adaptive", "expansion-prompts"],
    queryFn: async (): Promise<ExpansionPrompt[]> => {
      const res = await fetchApi("/adaptive/expansion-prompts");
      return (res.prompts as ExpansionPrompt[]) || [];
    },
    staleTime: 60_000, // 1 min
  });
}

export function useAcceptExpansion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (promptId: string) => {
      return fetchApi(`/adaptive/expansion-prompts/${promptId}/accept`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adaptive"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useDismissExpansion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (promptId: string) => {
      return fetchApi(`/adaptive/expansion-prompts/${promptId}/dismiss`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["adaptive", "expansion-prompts"],
      });
    },
  });
}

// ── Usage hooks ─────────────────────────────────────────────────────────────

export function useUsageCounters() {
  return useQuery({
    queryKey: ["adaptive", "usage"],
    queryFn: async (): Promise<UsageCounter[]> => {
      const res = await fetchApi("/adaptive/usage");
      return (res.counters as UsageCounter[]) || [];
    },
    staleTime: 60_000,
  });
}
