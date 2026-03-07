"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";

interface ExpansionPromptCardProps {
  id: string;
  suggestedSkill: string;
  message: string;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  accepting?: boolean;
}

export function ExpansionPromptCard({
  id,
  suggestedSkill,
  message,
  onAccept,
  onDismiss,
  accepting,
}: ExpansionPromptCardProps) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm">{message}</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs"
              onClick={() => onAccept(id)}
              disabled={accepting}
            >
              {accepting ? "Activating..." : "Enable"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onDismiss(id)}
              disabled={accepting}
            >
              <X className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
