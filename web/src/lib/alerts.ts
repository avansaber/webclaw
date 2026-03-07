/**
 * Alerts hook — fetches predictive alerts from the backend.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "./api";

export interface Alert {
  severity: "warning" | "critical" | "info";
  message: string;
  count: number;
  skill: string;
  link: string;
}

export function useAlerts() {
  return useQuery<Alert[]>({
    queryKey: ["alerts"],
    queryFn: async () => {
      const data = await fetchApi("/alerts");
      return (data.alerts as Alert[]) || [];
    },
    staleTime: 5 * 60_000, // 5 min
    refetchInterval: 5 * 60_000,
  });
}
