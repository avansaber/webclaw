// ── UI Config Fetcher ────────────────────────────────────────────────────────
// Client-side hook to load and cache parsed UI.yaml for a skill.
// Falls back to auto-generated config when UI.yaml is missing.

import { useState, useEffect } from "react";
import type { UIConfig } from "./ui-yaml-types";

// In-memory cache: skill → { config, version, fetchedAt }
const cache = new Map<
  string,
  { config: UIConfig; version: string; fetchedAt: number }
>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchUIConfig(skill: string): Promise<UIConfig | null> {
  const cached = cache.get(skill);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.config;
  }

  try {
    const res = await fetch(`/api/ui-config/${skill}`);
    if (!res.ok) return null;
    const config = (await res.json()) as UIConfig;
    cache.set(skill, {
      config,
      version: config.skill_version,
      fetchedAt: Date.now(),
    });
    return config;
  } catch {
    return null;
  }
}

export function useUIConfig(skill: string) {
  const [config, setConfig] = useState<UIConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setLoading(true);
    setGenerating(false);

    // Check sync cache first
    const cached = cache.get(skill);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setConfig(cached.config);
      setLoading(false);
      return;
    }

    // Show "generating" state after a short delay (indicates auto-generation)
    const genTimer = setTimeout(() => setGenerating(true), 500);

    fetchUIConfig(skill).then((c) => {
      clearTimeout(genTimer);
      setConfig(c);
      setLoading(false);
      setGenerating(false);
    });
  }, [skill]);

  return { config, loading, generating };
}

// Invalidate cache for a skill (called after admin actions)
export function invalidateUICache(skill: string) {
  cache.delete(skill);
}

// Check if config is stale vs current skill version
export function isConfigStale(
  skill: string,
  currentVersion: string
): boolean {
  const cached = cache.get(skill);
  if (!cached) return true;
  return cached.version !== currentVersion;
}
