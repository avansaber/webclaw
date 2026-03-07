"use client";

import { useEvents } from "@/lib/events";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

export function ConnectionStatus() {
  const { status } = useEvents();

  const config = {
    connected: {
      icon: Wifi,
      color: "text-green-500",
      label: "Connected — live updates active",
    },
    connecting: {
      icon: Loader2,
      color: "text-yellow-500 animate-spin",
      label: "Connecting...",
    },
    disconnected: {
      icon: WifiOff,
      color: "text-muted-foreground",
      label: "Disconnected — reconnecting...",
    },
  }[status];

  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent">
            <Icon className={`h-4 w-4 ${config.color}`} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
