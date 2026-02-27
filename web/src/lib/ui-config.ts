// ── UI Config Fetcher ────────────────────────────────────────────────────────
// Client-side hook to load and cache parsed UI.yaml for a skill.

import { useState, useEffect } from "react";
import type { UIConfig } from "./ui-yaml-types";

// In-memory cache: skill → { config, version, fetchedAt }
const cache = new Map<
  string,
  { config: UIConfig; version: string; fetchedAt: number }
>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchUIConfig(skill: string): Promise<UIConfig | null> {
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

  useEffect(() => {
    setLoading(true);
    // Check sync cache first
    const cached = cache.get(skill);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setConfig(cached.config);
      setLoading(false);
      return;
    }
    fetchUIConfig(skill).then((c) => {
      setConfig(c);
      setLoading(false);
    });
  }, [skill]);

  return { config, loading };
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
