"use client";

import Link from "next/link";
import { AlertTriangle, AlertCircle, Info, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAlerts, type Alert } from "@/lib/alerts";

const SEVERITY_CONFIG: Record<Alert["severity"], {
  icon: typeof AlertTriangle;
  badgeClass: string;
  borderClass: string;
}> = {
  critical: {
    icon: AlertCircle,
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    borderClass: "border-l-red-500",
  },
  warning: {
    icon: AlertTriangle,
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    borderClass: "border-l-amber-500",
  },
  info: {
    icon: Info,
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    borderClass: "border-l-blue-500",
  },
};

export function AlertCards() {
  const { data: alerts = [] } = useAlerts();

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Alerts
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {alerts.map((alert, i) => {
          const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
          const Icon = config.icon;
          return (
            <Link key={i} href={alert.link}>
              <Card className={`border-l-4 ${config.borderClass} transition-colors hover:bg-accent/50 cursor-pointer`}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{alert.message}</p>
                    </div>
                    <Badge className={`shrink-0 ${config.badgeClass}`}>
                      {alert.count}
                    </Badge>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
