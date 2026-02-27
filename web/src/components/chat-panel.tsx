"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Plus,
  Send,
  X,
  Trash2,
  Bot,
  User,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useChat,
  type ChatMessage,
  type ChatSession,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { postAction } from "@/lib/api";
import { useToast } from "@/components/toast-provider";
import { ConfirmationCard } from "@/components/confirmation-card";
import type { CompositionResult } from "@/lib/composition-types";

// ── Toggle Button (used in page headers) ────────────────────────────────────

export function ChatToggleButton() {
  const { toggle, isOpen } = useChat();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5"
      onClick={toggle}
      title="Toggle AI Chat (Ctrl+Shift+K)"
    >
      <MessageSquare className="h-4 w-4" />
      <span className="hidden sm:inline">{isOpen ? "Close Chat" : "AI Chat"}</span>
    </Button>
  );
}

// ── Simple Markdown Renderer ────────────────────────────────────────────────

function renderMarkdown(text: string) {
  // Split into code blocks and non-code sections
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const content = part.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded bg-muted p-3 text-xs"
        >
          <code>{content}</code>
        </pre>
      );
    }
    // Inline formatting
    return (
      <span key={i}>
        {part.split("\n").map((line, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {renderInline(line)}
          </span>
        ))}
      </span>
    );
  });
}

function renderInline(text: string) {
  // Bold, italic, inline code
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .map((part, i) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 text-xs">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
}

// ── Composition parser ─────────────────────────────────────────────────────

function extractComposition(text: string): {
  textParts: string[];
  compositions: CompositionResult[];
} {
  const regex = /<composition>([\s\S]*?)<\/composition>/g;
  const textParts: string[] = [];
  const compositions: CompositionResult[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    textParts.push(text.slice(lastIndex, match.index));
    try {
      compositions.push(JSON.parse(match[1]));
    } catch {
      textParts.push(match[0]); // If parse fails, show raw
    }
    lastIndex = match.index + match[0].length;
  }
  textParts.push(text.slice(lastIndex));

  return { textParts, compositions };
}

// ── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const { pageContext } = useChat();
  const { showToast } = useToast();

  // Parse composition blocks from assistant messages
  const hasComposition =
    !isUser && message.content && message.content.includes("<composition>");
  const parsed = hasComposition
    ? extractComposition(message.content)
    : null;

  return (
    <div
      className={cn(
        "flex gap-2 px-3 py-2",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {isUser ? (
          message.content
        ) : message.content ? (
          parsed && parsed.compositions.length > 0 ? (
            <div className="space-y-3">
              {parsed.textParts.map(
                (part, i) =>
                  part.trim() && (
                    <div key={`text-${i}`} className="prose prose-sm dark:prose-invert max-w-none">
                      {renderMarkdown(part)}
                    </div>
                  )
              )}
              {parsed.compositions.map((comp, i) => (
                <ConfirmationCard
                  key={`comp-${i}`}
                  composition={comp}
                  skill={pageContext.skill || comp.action.split("-").slice(1).join("-")}
                  onSubmit={async (params) => {
                    const skill = pageContext.skill || "unknown";
                    const result = await postAction(skill, comp.action, params);
                    if (result.status === "ok") {
                      showToast({ type: "success", message: `${comp.action} completed` });
                    } else {
                      showToast({
                        type: "error",
                        message: result.message || "Action failed",
                        duration: 0,
                      });
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {renderMarkdown(message.content)}
            </div>
          )
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Thinking...
          </span>
        )}
      </div>
    </div>
  );
}

// ── Session List ────────────────────────────────────────────────────────────

function SessionList({
  sessions,
  currentId,
  onSwitch,
  onDelete,
  onNew,
}: {
  sessions: ChatSession[];
  currentId: string | null;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-1 p-2">
      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onNew}>
        <Plus className="h-3.5 w-3.5" />
        New Chat
      </Button>
      {sessions.map((s) => (
        <div
          key={s.id}
          className={cn(
            "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
            currentId === s.id && "bg-accent"
          )}
          onClick={() => onSwitch(s.id)}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{s.title || "Untitled"}</span>
          <button
            className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(s.id);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Chat Panel Content (shared between inline & Sheet) ──────────────────────

function ChatPanelContent() {
  const {
    messages,
    isStreaming,
    sendMessage,
    pageContext,
    sessionId,
    sessions,
    createSession,
    switchSession,
    deleteSession,
    close,
  } = useChat();

  const [input, setInput] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledRef = useRef(false);

  // Auto-scroll to bottom on new messages (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledRef.current = !atBottom;
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    userScrolledRef.current = false; // auto-scroll for new message
    await sendMessage(text);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const contextLabel = pageContext.skill
    ? pageContext.skill.replace(/^erpclaw-/, "")
    : pageContext.view || "general";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="flex-1 text-sm font-semibold">AI Assistant</span>
        <Badge variant="outline" className="text-xs">
          {contextLabel}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setShowSessions(!showSessions)}
          title="Chat history"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 lg:hidden"
          onClick={close}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Session list (togglable) */}
      {showSessions && (
        <>
          <SessionList
            sessions={sessions}
            currentId={sessionId}
            onSwitch={(id) => {
              switchSession(id);
              setShowSessions(false);
            }}
            onDelete={deleteSession}
            onNew={() => {
              createSession();
              setShowSessions(false);
            }}
          />
          <Separator />
        </>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Bot className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Ask me anything about your data.
            </p>
            {pageContext.skill && (
              <p className="text-xs text-muted-foreground">
                I can see you&apos;re viewing <strong>{contextLabel}</strong>.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1 py-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your data..."
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            rows={1}
            disabled={isStreaming}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main ChatPanel — inline on desktop, Sheet on mobile ─────────────────────

export function ChatPanel() {
  const { isOpen, close } = useChat();
  const [isDesktop, setIsDesktop] = useState(false);

  // Match the lg: breakpoint (1024px) to decide inline vs Sheet
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Keyboard shortcut: Ctrl+Shift+K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "K") {
        e.preventDefault();
        // Access toggle via the hook is tricky here since this is in useEffect;
        // we use a custom event to avoid stale closures
        window.dispatchEvent(new CustomEvent("ocui-chat-toggle"));
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <>
      {/* Desktop: inline panel */}
      {isOpen && (
        <aside className="hidden lg:flex h-full w-[360px] shrink-0 flex-col border-l bg-background">
          <ChatPanelContent />
        </aside>
      )}

      {/* Mobile: Sheet slide-over (only open on non-desktop to avoid aria-hidden on page) */}
      <Sheet open={isOpen && !isDesktop} onOpenChange={(open) => !open && close()}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 lg:hidden" showCloseButton={false}>
          <SheetHeader className="sr-only">
            <SheetTitle>AI Chat</SheetTitle>
            <SheetDescription>Chat with AI assistant</SheetDescription>
          </SheetHeader>
          <ChatPanelContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
