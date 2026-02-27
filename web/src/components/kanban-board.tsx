"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Types ────────────────────────────────────────────────────────────────────

export interface KanbanItem {
  id: string;
  title: string;
  subtitle?: string;
  status: string;
  fields?: { label: string; value: string }[];
  badge?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  color?: string;
}

export interface KanbanBoardProps {
  columns: KanbanColumn[];
  items: KanbanItem[];
  onMove?: (itemId: string, fromColumn: string, toColumn: string) => Promise<void>;
  onItemClick?: (item: KanbanItem) => void;
}

// ── Sortable Card ────────────────────────────────────────────────────────────

function SortableCard({ item, onItemClick }: { item: KanbanItem; onItemClick?: (item: KanbanItem) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onItemClick?.(item)}
      className="cursor-grab active:cursor-grabbing"
    >
      <KanbanCard item={item} />
    </div>
  );
}

function KanbanCard({ item }: { item: KanbanItem }) {
  return (
    <Card className="mb-2 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight">{item.title}</p>
          {item.badge && <Badge variant="outline" className="text-[10px] shrink-0">{item.badge}</Badge>}
        </div>
        {item.subtitle && <p className="text-xs text-muted-foreground">{item.subtitle}</p>}
        {item.fields && item.fields.length > 0 && (
          <div className="space-y-0.5">
            {item.fields.map((f, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="font-medium">{f.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Column Component ─────────────────────────────────────────────────────────

function Column({ column, items, onItemClick }: { column: KanbanColumn; items: KanbanItem[]; onItemClick?: (item: KanbanItem) => void }) {
  return (
    <div className="flex flex-col min-w-[260px] max-w-[320px] flex-1">
      <div className="flex items-center gap-2 mb-2 px-1">
        {column.color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: column.color }} />}
        <h3 className="text-sm font-medium">{column.title}</h3>
        <Badge variant="secondary" className="text-[10px] h-5">{items.length}</Badge>
      </div>
      <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-2 min-h-[200px]">
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableCard key={item.id} item={item} onItemClick={onItemClick} />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            No items
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ── Main KanbanBoard ─────────────────────────────────────────────────────────

export function KanbanBoard({ columns, items, onMove, onItemClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState(items);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const activeItem = activeId ? localItems.find((i) => i.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const draggedItem = localItems.find((i) => i.id === active.id);
    if (!draggedItem) return;

    // Determine target column: either dropping on a column directly or on an item in a column
    let targetColumnId: string | null = null;

    // Check if dropped on a column
    const targetColumn = columns.find((c) => c.id === over.id);
    if (targetColumn) {
      targetColumnId = targetColumn.id;
    } else {
      // Dropped on another item — find its column
      const targetItem = localItems.find((i) => i.id === over.id);
      if (targetItem) {
        targetColumnId = targetItem.status;
      }
    }

    if (!targetColumnId || targetColumnId === draggedItem.status) return;

    // Optimistic update
    const fromColumn = draggedItem.status;
    setLocalItems((prev) =>
      prev.map((i) => (i.id === draggedItem.id ? { ...i, status: targetColumnId! } : i))
    );

    // API call
    try {
      await onMove?.(draggedItem.id, fromColumn, targetColumnId);
    } catch {
      // Rollback on failure
      setLocalItems((prev) =>
        prev.map((i) => (i.id === draggedItem.id ? { ...i, status: fromColumn } : i))
      );
    }
  }

  // Sync localItems when props change
  if (items !== localItems && JSON.stringify(items) !== JSON.stringify(localItems)) {
    setLocalItems(items);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <Column
            key={col.id}
            column={col}
            items={localItems.filter((i) => i.status === col.id)}
            onItemClick={onItemClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeItem ? <KanbanCard item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
