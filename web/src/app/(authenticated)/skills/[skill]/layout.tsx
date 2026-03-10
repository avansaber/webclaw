"use client";

import { useEffect, useMemo } from "react";
import { useParams, usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { SearchButton } from "@/components/global-search";
import { ChatToggleButton } from "@/components/chat-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConnectionStatus } from "@/components/connection-status";
import { BreadcrumbNav, type BreadcrumbItem } from "@/components/breadcrumb-nav";
import { skillDisplayName } from "@/lib/api";
import { useUIConfig } from "@/lib/ui-config";
import { useChat } from "@/lib/chat";
import { entityLabel } from "@/lib/entity-routing";

export default function SkillLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const skill = params.skill as string;
  const displayName = skillDisplayName(skill);
  const { config: uiConfig } = useUIConfig(skill);
  const { setPageContext } = useChat();

  // Set chat context so the AI knows which skill the user is viewing
  useEffect(() => {
    setPageContext({ skill, view: "dashboard" });
  }, [skill, setPageContext]);

  // Build breadcrumb items based on current path depth
  const breadcrumbItems = useMemo((): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [];
    // Always link back to skill dashboard
    const entitySlug = params.entity as string | undefined;
    const entityId = params.id as string | undefined;

    if (entitySlug) {
      // On entity page — skill name links to skill dashboard
      items.push({ label: displayName, href: `/skills/${skill}` });
      const eLabel = entityLabel(entitySlug, uiConfig);
      if (entityId) {
        // On detail/edit page — entity label links to list
        items.push({ label: eLabel, href: `/skills/${skill}/${entitySlug}` });
        // Check if this is an edit page
        if (pathname.endsWith("/edit")) {
          items.push({ label: "Edit" });
        } else if (pathname.endsWith("/new")) {
          items.push({ label: "New" });
        } else {
          items.push({ label: entityId.length > 12 ? entityId.slice(0, 8) + "…" : entityId });
        }
      } else if (pathname.endsWith("/new")) {
        items.push({ label: eLabel, href: `/skills/${skill}/${entitySlug}` });
        items.push({ label: "New" });
      } else {
        items.push({ label: eLabel });
      }
    } else if (pathname.endsWith("/actions")) {
      items.push({ label: displayName, href: `/skills/${skill}` });
      items.push({ label: "Action Runner" });
    } else {
      // On skill dashboard
      items.push({ label: displayName });
    }
    return items;
  }, [displayName, skill, params.entity, params.id, pathname, uiConfig]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex h-14 items-center gap-4 border-b bg-background px-6 shrink-0">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <BreadcrumbNav items={breadcrumbItems} />
        <div className="ml-auto flex items-center gap-2">
          <ConnectionStatus />
          <SearchButton />
          {uiConfig && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
              UI
            </Badge>
          )}
          <ThemeToggle />
          <ChatToggleButton />
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
