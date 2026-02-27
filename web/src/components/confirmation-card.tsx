"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Edit2,
  Send,
  Loader2,
} from "lucide-react";
import type { CompositionResult, ResolvedField } from "@/lib/composition-types";

// ── Confidence indicator ──────────────────────────────────────────────────

function ConfidenceBadge({ confidence, source }: { confidence: number; source: string }) {
  const pct = Math.round(confidence * 100);
  const variant =
    confidence >= 0.9 ? "default" :
    confidence >= 0.7 ? "secondary" :
    "outline";
  const color =
    confidence >= 0.9 ? "text-green-600 dark:text-green-400" :
    confidence >= 0.7 ? "text-yellow-600 dark:text-yellow-400" :
    "text-orange-600 dark:text-orange-400";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant={variant} className={`text-[10px] ${color}`}>
            {pct}%
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            Confidence: {pct}% ({source})
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Resolved field row ────────────────────────────────────────────────────

interface FieldRowProps {
  field: ResolvedField;
  editing: boolean;
  onEdit: () => void;
  onUpdate: (value: unknown) => void;
}

function FieldRow({ field, editing, onEdit, onUpdate }: FieldRowProps) {
  const [tempValue, setTempValue] = useState(String(field.value ?? ""));

  const label = field.field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-1/3 text-sm font-medium text-muted-foreground truncate">
        {label}
      </div>
      <div className="flex-1 flex items-center gap-2">
        {editing ? (
          <div className="flex gap-2 flex-1">
            <Input
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onUpdate(tempValue);
                if (e.key === "Escape") onEdit();
              }}
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" variant="ghost" onClick={() => onUpdate(tempValue)}>
              <Check className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 text-sm hover:underline cursor-pointer"
          >
            <span className="font-mono">{String(field.value ?? "—")}</span>
            <Edit2 className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
      <ConfidenceBadge confidence={field.confidence} source={field.source} />
    </div>
  );
}

// ── Unresolved field row ──────────────────────────────────────────────────

interface UnresolvedRowProps {
  field: string;
  value: string;
  onChange: (value: string) => void;
}

function UnresolvedRow({ field, value, onChange }: UnresolvedRowProps) {
  const label = field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-1/3 text-sm font-medium text-muted-foreground truncate">
        {label}
      </div>
      <div className="flex-1">
        <Input
          placeholder={`Enter ${label.toLowerCase()}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <Badge variant="outline" className="text-[10px] text-orange-500">
        <AlertCircle className="h-3 w-3 mr-1" />
        Required
      </Badge>
    </div>
  );
}

// ── Confirmation Card ─────────────────────────────────────────────────────

export interface ConfirmationCardProps {
  composition: CompositionResult;
  skill: string;
  onSubmit: (params: Record<string, unknown>) => Promise<void>;
  onShowFullForm?: () => void;
  onCancel?: () => void;
}

export function ConfirmationCard({
  composition,
  skill,
  onSubmit,
  onShowFullForm,
  onCancel,
}: ConfirmationCardProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [resolvedOverrides, setResolvedOverrides] = useState<Record<string, unknown>>({});
  const [unresolvedValues, setUnresolvedValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const hasUnresolved = composition.unresolved_fields.length > 0;
  const allUnresolvedFilled = composition.unresolved_fields.every(
    (f) => (unresolvedValues[f] || "").trim() !== ""
  );
  const canSubmit = !hasUnresolved || allUnresolvedFilled;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Build params from resolved + overrides + unresolved
      const params: Record<string, unknown> = {};
      for (const f of composition.resolved_fields) {
        params[f.field] = resolvedOverrides[f.field] ?? f.value;
      }
      for (const f of composition.unresolved_fields) {
        params[f] = unresolvedValues[f] || "";
      }
      await onSubmit(params);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFieldUpdate(field: string, value: unknown) {
    setResolvedOverrides((prev) => ({ ...prev, [field]: value }));
    setEditingField(null);
  }

  // Split fields by confidence for display
  const highConfidence = composition.resolved_fields.filter((f) => f.confidence >= 0.8);
  const lowConfidence = composition.resolved_fields.filter((f) => f.confidence < 0.8);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{composition.summary}</CardTitle>
            <CardDescription className="mt-1">
              Action: <code className="text-xs">{composition.action}</code> on{" "}
              <code className="text-xs">{skill}</code>
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {composition.resolved_fields.length} resolved
            {hasUnresolved && `, ${composition.unresolved_fields.length} needed`}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Unresolved fields (always visible, user must fill) */}
        {hasUnresolved && (
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground mb-1">
              Needs your input
            </p>
            {composition.unresolved_fields.map((f) => (
              <UnresolvedRow
                key={f}
                field={f}
                value={unresolvedValues[f] || ""}
                onChange={(v) => setUnresolvedValues((prev) => ({ ...prev, [f]: v }))}
              />
            ))}
          </div>
        )}

        {hasUnresolved && highConfidence.length > 0 && <Separator />}

        {/* High-confidence resolved fields */}
        {highConfidence.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground mb-1">
              Auto-filled (click to edit)
            </p>
            {highConfidence.map((f) => (
              <FieldRow
                key={f.field}
                field={{
                  ...f,
                  value: resolvedOverrides[f.field] ?? f.value,
                }}
                editing={editingField === f.field}
                onEdit={() => setEditingField(editingField === f.field ? null : f.field)}
                onUpdate={(v) => handleFieldUpdate(f.field, v)}
              />
            ))}
          </div>
        )}

        {/* Low-confidence fields (collapsed by default) */}
        {lowConfidence.length > 0 && (
          <div>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {lowConfidence.length} lower-confidence fields
            </button>
            {expanded &&
              lowConfidence.map((f) => (
                <FieldRow
                  key={f.field}
                  field={{
                    ...f,
                    value: resolvedOverrides[f.field] ?? f.value,
                  }}
                  editing={editingField === f.field}
                  onEdit={() => setEditingField(editingField === f.field ? null : f.field)}
                  onUpdate={(v) => handleFieldUpdate(f.field, v)}
                />
              ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="gap-2"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {submitting ? "Submitting..." : "Confirm & Submit"}
        </Button>
        {onShowFullForm && (
          <Button variant="outline" onClick={onShowFullForm}>
            Show All Fields
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
