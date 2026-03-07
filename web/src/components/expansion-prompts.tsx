"use client";

import { useState } from "react";
import {
  useExpansionPrompts,
  useAcceptExpansion,
  useDismissExpansion,
} from "@/lib/adaptive";
import { ExpansionPromptCard } from "./expansion-prompt-card";

export function ExpansionPrompts() {
  const { data: prompts, isLoading } = useExpansionPrompts();
  const acceptMutation = useAcceptExpansion();
  const dismissMutation = useDismissExpansion();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  if (isLoading || !prompts || prompts.length === 0) return null;

  function handleAccept(id: string) {
    setAcceptingId(id);
    acceptMutation.mutate(id, {
      onSettled: () => setAcceptingId(null),
    });
  }

  function handleDismiss(id: string) {
    dismissMutation.mutate(id);
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Suggested Modules
      </h3>
      {prompts.map((prompt) => (
        <ExpansionPromptCard
          key={prompt.id}
          id={prompt.id}
          suggestedSkill={prompt.suggested_skill}
          message={prompt.message}
          onAccept={handleAccept}
          onDismiss={handleDismiss}
          accepting={acceptingId === prompt.id}
        />
      ))}
    </div>
  );
}
