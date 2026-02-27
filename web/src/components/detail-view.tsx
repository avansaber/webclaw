"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { detectFieldType, renderCell, formatHeader, type FieldType } from "@/components/data-table";

interface DetailViewProps {
  data: Record<string, unknown>;
  title?: string;
}

export function DetailView({ data, title }: DetailViewProps) {
  const keys = Object.keys(data);

  // Group: ID fields, main fields, date fields
  const idFields = keys.filter((k) => k === "id" || k.endsWith("_id"));
  const dateFields = keys.filter(
    (k) => k.includes("date") || k.includes("_at")
  );
  const mainFields = keys.filter(
    (k) => !idFields.includes(k) && !dateFields.includes(k)
  );

  function renderFieldValue(key: string, value: unknown) {
    const fieldType = detectFieldType(key, value);
    // For detail view, use the shared cell renderers
    return renderCell(value, fieldType);
  }

  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {/* Main fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          {mainFields.map((key) => (
            <div key={key} className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {formatHeader(key)}
              </p>
              <div className="text-sm font-medium">
                {renderFieldValue(key, data[key])}
              </div>
            </div>
          ))}
        </div>

        {/* Dates */}
        {dateFields.length > 0 && (
          <>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-2">
              {dateFields.map((key) => (
                <div key={key} className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {formatHeader(key)}
                  </p>
                  <div className="text-sm font-medium">
                    {renderFieldValue(key, data[key])}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* IDs (collapsed) */}
        {idFields.length > 0 && (
          <>
            <Separator />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                Show IDs ({idFields.length})
              </summary>
              <div className="mt-2 space-y-1 font-mono">
                {idFields.map((key) => (
                  <div key={key}>
                    <span className="text-muted-foreground">
                      {formatHeader(key)}:
                    </span>{" "}
                    {String(data[key] ?? "-")}
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
