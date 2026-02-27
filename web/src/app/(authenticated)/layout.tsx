"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { ChatProvider, useChat } from "@/lib/chat";
import { GlobalSearch } from "@/components/global-search";
import { ToastProvider } from "@/components/toast-provider";
import { EventsProvider } from "@/lib/events";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAuth } from "@/lib/auth";

// Inner component that can use useChat (must be inside ChatProvider)
function ChatKeyboardToggle() {
  const { toggle } = useChat();
  useEffect(() => {
    function handleToggle() {
      toggle();
    }
    window.addEventListener("ocui-chat-toggle", handleToggle);
    return () => window.removeEventListener("ocui-chat-toggle", handleToggle);
  }, [toggle]);
  return null;
}

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <ToastProvider>
      <EventsProvider>
        <ChatProvider>
          <ChatKeyboardToggle />
          <GlobalSearch />
          <SidebarProvider>
            <AppSidebar />
            <main className="flex-1 min-w-0 overflow-auto">
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
            <ChatPanel />
          </SidebarProvider>
        </ChatProvider>
      </EventsProvider>
    </ToastProvider>
  );
}
