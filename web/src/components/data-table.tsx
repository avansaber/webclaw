"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Columns3,
  Copy,
  Check,
  Mail,
  Download,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DataTableProps {
  data: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
  /** Optional prefix for the CSV download filename (e.g. "erpclaw-selling-customers") */
  exportFilename?: string;
}

type FieldType =
  | "currency"
  | "decimal"
  | "integer"
  | "quantity"
  | "percent"
  | "date"
  | "datetime"
  | "status"
  | "boolean"
  | "email"
  | "id"
  | "text";

// ── Field Type Detection ─────────────────────────────────────────────────────

const HIDDEN_EXACT = new Set(["id"]);
const HIDDEN_SUFFIXES = ["_id"];

function shouldShowColumn(key: string): boolean {
  if (HIDDEN_EXACT.has(key)) return false;
  if (key !== "tax_id" && HIDDEN_SUFFIXES.some((s) => key.endsWith(s))) return false;
  return true;
}

const CURRENCY_KEYS = ["amount", "balance", "total", "price", "rate", "cost", "revenue", "expense", "debit", "credit", "net", "gross", "tax_amount", "grand_total", "base_amount", "outstanding"];
const QUANTITY_KEYS = ["qty", "quantity", "stock_qty", "actual_qty", "projected_qty"];
const PERCENT_KEYS = ["percent", "percentage", "margin", "ratio", "discount"];

function detectFieldType(key: string, sampleValue: unknown): FieldType {
  // Exact matches
  if (key === "id" || key.endsWith("_id")) return "id";
  if (key === "email" || key === "email_address") return "email";
  if (key === "status" || key === "docstatus") return "status";

  // Boolean
  if (key.startsWith("is_") || key.startsWith("enable_") || key.startsWith("has_") ||
      key === "perpetual_inventory" || key === "enable_negative_stock") return "boolean";

  // Date/datetime
  if (key.endsWith("_at") || key === "created_at" || key === "updated_at" || key === "last_login") return "datetime";
  if (key.includes("date") || key === "posting_date" || key === "due_date") return "date";

  // Percent
  if (PERCENT_KEYS.some((p) => key.includes(p))) return "percent";

  // Currency
  if (CURRENCY_KEYS.some((c) => key.includes(c)) && !isNaN(Number(sampleValue))) return "currency";

  // Quantity
  if (QUANTITY_KEYS.some((q) => key.includes(q)) && !isNaN(Number(sampleValue))) return "quantity";

  // Integer (whole numbers)
  if (typeof sampleValue === "number" && Number.isInteger(sampleValue)) return "integer";

  // Decimal
  if (!isNaN(Number(sampleValue)) && sampleValue !== null && sampleValue !== "" && typeof sampleValue !== "boolean") {
    const num = Number(sampleValue);
    if (!Number.isInteger(num)) return "decimal";
  }

  return "text";
}

// ── Cell Renderers ───────────────────────────────────────────────────────────

function CurrencyCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  const num = Number(value);
  const formatted = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span className={`font-mono tabular-nums text-right block ${num < 0 ? "text-destructive" : ""}`}>
      {formatted}
    </span>
  );
}

function DecimalCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  return <span className="font-mono tabular-nums text-right block">{Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>;
}

function IntegerCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  return <span className="font-mono tabular-nums text-right block">{Number(value).toLocaleString("en-US")}</span>;
}

function QuantityCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  return <span className="font-mono tabular-nums text-right block">{Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>;
}

function PercentCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  return <span className="font-mono tabular-nums text-right block">{Number(value).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%</span>;
}

function DateCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return <span>{String(value)}</span>;
  return <span>{d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>;
}

function DateTimeCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return <span>{String(value)}</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </TooltipTrigger>
        <TooltipContent>
          {d.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function getStatusStyle(status: string): string {
  const s = status.toLowerCase();
  // Draft / gray
  if (s === "draft" || s === "0") {
    return "bg-muted text-muted-foreground";
  }
  // Submitted / Active / blue
  if (s === "submitted" || s === "active" || s === "1") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  }
  // Cancelled / red
  if (s === "cancelled" || s === "canceled" || s === "inactive" || s === "2") {
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  }
  // Paid / Completed / Closed / green
  if (s === "paid" || s === "completed" || s === "closed" || s === "approved" || s === "resolved") {
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }
  // Overdue / Expired / orange
  if (s === "overdue" || s === "expired" || s === "rejected") {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  }
  // Open / Pending / In Progress / yellow
  if (s === "open" || s === "pending" || s === "in progress" || s === "in_progress" || s === "working") {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  }
  // Default fallback
  return "";
}

function StatusBadge({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  const s = String(value);
  const label = s === "0" ? "Draft" : s === "1" ? "Submitted" : s === "2" ? "Cancelled" : s.charAt(0).toUpperCase() + s.slice(1);
  const colorClass = getStatusStyle(s);
  if (colorClass) {
    return (
      <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
        {label}
      </span>
    );
  }
  return <Badge variant="outline" className="text-xs">{label}</Badge>;
}

function BooleanPill({ value }: { value: unknown }) {
  const truthy = value === true || value === 1 || value === "1" || value === "true";
  return <Badge variant={truthy ? "default" : "secondary"} className="text-xs">{truthy ? "Yes" : "No"}</Badge>;
}

function EmailLink({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  return (
    <a href={`mailto:${value}`} className="inline-flex items-center gap-1 text-primary hover:underline text-sm" onClick={(e) => e.stopPropagation()}>
      <Mail className="h-3 w-3" /> {String(value)}
    </a>
  );
}

function IdCell({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  if (value === null || value === undefined) return <Null />;
  const s = String(value);
  const short = s.length > 12 ? s.slice(0, 8) + "..." : s;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
      {short}
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(s);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}

function TextCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Null />;
  const s = String(value);
  if (s.length <= 60) return <span>{s}</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{s.slice(0, 60)}...</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="break-words">{s}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Null() {
  return <span className="text-muted-foreground">-</span>;
}

// Renderer dispatch
function renderCell(value: unknown, fieldType: FieldType): React.ReactNode {
  switch (fieldType) {
    case "currency": return <CurrencyCell value={value} />;
    case "decimal": return <DecimalCell value={value} />;
    case "integer": return <IntegerCell value={value} />;
    case "quantity": return <QuantityCell value={value} />;
    case "percent": return <PercentCell value={value} />;
    case "date": return <DateCell value={value} />;
    case "datetime": return <DateTimeCell value={value} />;
    case "status": return <StatusBadge value={value} />;
    case "boolean": return <BooleanPill value={value} />;
    case "email": return <EmailLink value={value} />;
    case "id": return <IdCell value={value} />;
    case "text": return <TextCell value={value} />;
  }
}

// ── Column Header ────────────────────────────────────────────────────────────

function formatHeader(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function SortableHeader({ column, label }: { column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void }; label: string }) {
  const sorted = column.getIsSorted();
  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => column.toggleSorting(sorted === "asc")}>
      {label}
      {sorted === "asc" ? <ArrowUp className="h-3 w-3" /> : sorted === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />}
    </Button>
  );
}

// ── Right-aligned types ──────────────────────────────────────────────────────

const RIGHT_ALIGNED: Set<FieldType> = new Set(["currency", "decimal", "integer", "quantity", "percent"]);

// ── CSV Export ────────────────────────────────────────────────────────────────

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If the value contains a comma, quote, or newline, wrap in quotes and escape inner quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function exportTableToCsv(
  headers: string[],
  rows: Record<string, unknown>[],
  filename: string,
) {
  const headerRow = headers.map(escapeCsvCell).join(",");
  const dataRows = rows.map((row) =>
    headers.map((h) => escapeCsvCell(row[h])).join(",")
  );
  const csv = [headerRow, ...dataRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DataTable({ data, onRowClick, exportFilename }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Build columns from data
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!data || data.length === 0) return [];

    const allKeys = Object.keys(data[0]);
    const visibleKeys = allKeys.filter(shouldShowColumn);

    return visibleKeys.map((key) => {
      const sampleValue = data.find((row) => row[key] !== null && row[key] !== undefined)?.[key] ?? null;
      const fieldType = detectFieldType(key, sampleValue);
      const isRight = RIGHT_ALIGNED.has(fieldType);

      return {
        accessorKey: key,
        header: ({ column }) => <SortableHeader column={column} label={formatHeader(key)} />,
        cell: ({ getValue }) => renderCell(getValue(), fieldType),
        meta: { fieldType, isRight },
        sortingFn: fieldType === "currency" || fieldType === "decimal" || fieldType === "integer" || fieldType === "quantity" || fieldType === "percent"
          ? (rowA, rowB, columnId) => {
              const a = Number(rowA.getValue(columnId)) || 0;
              const b = Number(rowB.getValue(columnId)) || 0;
              return a - b;
            }
          : "auto",
      } satisfies ColumnDef<Record<string, unknown>>;
    });
  }, [data]);

  const table = useReactTable({
    data: data || [],
    columns,
    state: { sorting, globalFilter, columnVisibility, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: "includesString",
  });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        No data found
      </div>
    );
  }

  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-3">
      {/* Toolbar: search + column visibility */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search all columns..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 max-h-64 overflow-y-auto">
            {table.getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onCheckedChange={(v) => col.toggleVisibility(!!v)}
                  className="text-xs"
                >
                  {formatHeader(col.id)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9"
                onClick={() => {
                  const visibleHeaders = table
                    .getVisibleFlatColumns()
                    .map((c) => c.id);
                  const filteredRows = table
                    .getFilteredRowModel()
                    .rows.map((r) => r.original);
                  const ts = new Date()
                    .toISOString()
                    .replace(/[:.]/g, "-")
                    .slice(0, 19);
                  const name = exportFilename
                    ? `${exportFilename}-${ts}.csv`
                    : `export-${ts}.csv`;
                  exportTableToCsv(visibleHeaders, filteredRows, name);
                }}
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download visible data as CSV</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {globalFilter && (
          <span className="text-xs text-muted-foreground">
            {filteredCount} of {data.length} rows
          </span>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { isRight?: boolean } | undefined;
                  return (
                    <TableHead key={header.id} className={`whitespace-nowrap ${meta?.isRight ? "text-right" : ""}`}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results match your search.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { isRight?: boolean } | undefined;
                    return (
                      <TableCell key={cell.id} className={`whitespace-nowrap ${meta?.isRight ? "text-right" : ""}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-2">
        {table.getRowModel().rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
            No results match your search.
          </div>
        ) : (
          table.getRowModel().rows.map((row) => {
            const visibleCells = row.getVisibleCells().slice(0, 5);
            return (
              <div
                key={row.id}
                className={`rounded-md border p-3 space-y-1.5 ${onRowClick ? "cursor-pointer hover:bg-muted/50 active:bg-muted" : ""}`}
                onClick={() => onRowClick?.(row.original)}
              >
                {visibleCells.map((cell) => {
                  const meta = cell.column.columnDef.meta as { fieldType?: FieldType; isRight?: boolean } | undefined;
                  const fieldType = meta?.fieldType;
                  return (
                    <div key={cell.id} className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatHeader(cell.column.id)}
                      </span>
                      <span className={`text-sm text-right ${fieldType === "status" ? "" : "truncate"}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Re-export individual renderers for use in DetailView and other components
export {
  CurrencyCell,
  DecimalCell,
  IntegerCell,
  QuantityCell,
  PercentCell,
  DateCell,
  DateTimeCell,
  StatusBadge,
  BooleanPill,
  EmailLink,
  IdCell,
  TextCell,
  detectFieldType,
  formatHeader,
  renderCell,
  type FieldType,
};
