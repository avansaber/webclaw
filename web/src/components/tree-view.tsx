"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TreeNode {
  id: string;
  name: string;
  label?: string;
  children?: TreeNode[];
  data?: Record<string, unknown>;
  isGroup?: boolean;
}

export interface TreeViewProps {
  nodes: TreeNode[];
  onSelect?: (node: TreeNode) => void;
  defaultExpanded?: Set<string>;
  renderLabel?: (node: TreeNode) => React.ReactNode;
}

// ── TreeNode Component ───────────────────────────────────────────────────────

function TreeNodeItem({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  renderLabel,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect?: (node: TreeNode) => void;
  renderLabel?: (node: TreeNode) => React.ReactNode;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isGroup = node.isGroup ?? hasChildren;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 rounded-sm hover:bg-accent/50 cursor-pointer group"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          onSelect?.(node);
        }}
      >
        {/* Expand/collapse arrow */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            className="flex-shrink-0 p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}

        {/* Icon */}
        {isGroup ? (
          isExpanded ? <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" /> : <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
        ) : (
          <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}

        {/* Label */}
        {renderLabel ? (
          renderLabel(node)
        ) : (
          <span className="text-sm truncate ml-1">
            {node.label || node.name}
          </span>
        )}

        {/* Badge for child count */}
        {hasChildren && (
          <Badge variant="secondary" className="text-[10px] h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            {node.children!.length}
          </Badge>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              renderLabel={renderLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main TreeView ────────────────────────────────────────────────────────────

export function TreeView({ nodes, onSelect, defaultExpanded, renderLabel }: TreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded || new Set());

  const toggleNode = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const all = new Set<string>();
    function collect(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.children?.length) {
          all.add(n.id);
          collect(n.children);
        }
      }
    }
    collect(nodes);
    setExpanded(all);
  }, [nodes]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No items to display.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={expandAll}>Expand All</Button>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={collapseAll}>Collapse All</Button>
      </div>
      <div className="rounded-md border p-1">
        {nodes.map((node) => (
          <TreeNodeItem
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggleNode}
            onSelect={onSelect}
            renderLabel={renderLabel}
          />
        ))}
      </div>
    </div>
  );
}
