"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { populateActionSkillCache } from "./ui-yaml-to-form";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30s — data considered fresh
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Populate the action→skill cache on mount (non-blocking)
  useEffect(() => {
    populateActionSkillCache();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
