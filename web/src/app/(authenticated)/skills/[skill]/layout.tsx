"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { SearchButton } from "@/components/global-search";
import { ChatToggleButton } from "@/components/chat-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConnectionStatus } from "@/components/connection-status";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { skillDisplayName } from "@/lib/api";
import { useUIConfig } from "@/lib/ui-config";
import { useChat } from "@/lib/chat";

export default function SkillLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const skill = params.skill as string;
  const displayName = skillDisplayName(skill);
  const { config: uiConfig } = useUIConfig(skill);
  const { setPageContext } = useChat();

  // Set chat context so the AI knows which skill the user is viewing
  useEffect(() => {
    setPageContext({ skill, view: "dashboard" });
  }, [skill, setPageContext]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex h-14 items-center gap-4 border-b bg-background px-6 shrink-0">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <BreadcrumbNav items={[{ label: "Skills", href: "/dashboard" }, { label: displayName }]} />
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
