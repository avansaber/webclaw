"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAccessToken } from "./auth";
import type { ResolvedEntity } from "./composition-types";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PageContext {
  skill?: string;
  entity?: string;
  recordId?: string;
  view?: "list" | "detail" | "form" | "dashboard";
  filters?: Record<string, string>;
}

export interface ChatSession {
  id: string;
  title: string;
  context: PageContext;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  context: PageContext;
  created_at: string;
}

interface ChatContextType {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;

  pageContext: PageContext;
  setPageContext: (ctx: PageContext) => void;

  sessionId: string | null;
  sessions: ChatSession[];
  createSession: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;

  // Context resolution (C1)
  resolvedEntities: ResolvedEntity[];
  addResolvedEntity: (entity: ResolvedEntity) => void;
  clearResolvedEntities: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

const API_BASE = "/api/v1/chat";
const PANEL_STORAGE_KEY = "ocui-chat-panel-open";

// ── Provider ───────────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [resolvedEntities, setResolvedEntities] = useState<ResolvedEntity[]>([]);
  const pendingRef = useRef<string | null>(null); // queued message while streaming

  // Restore panel state from localStorage (only on desktop — avoids
  // Sheet auto-opening and covering the entire mobile screen)
  useEffect(() => {
    const saved = localStorage.getItem(PANEL_STORAGE_KEY);
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (saved === "true" && isDesktop) setIsOpen(true);
  }, []);

  // Persist panel state
  useEffect(() => {
    localStorage.setItem(PANEL_STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  async function apiFetch(path: string, options?: RequestInit) {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    return res.json();
  }

  async function loadSessions() {
    try {
      const data = await apiFetch("/sessions");
      if (data.status === "ok") {
        setSessions(data.sessions || []);
      }
    } catch {}
  }

  async function loadMessages(sid: string) {
    try {
      const data = await apiFetch(`/sessions/${sid}/messages`);
      if (data.status === "ok") {
        setMessages(data.messages || []);
      }
    } catch {}
  }

  const createSession = useCallback(async () => {
    try {
      const data = await apiFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "New Chat", context: pageContext }),
      });
      if (data.status === "ok") {
        const session = data.session as ChatSession;
        setSessions((prev) => [session, ...prev]);
        setSessionId(session.id);
        setMessages([]);
      }
    } catch {}
  }, [pageContext]);

  const switchSession = useCallback(async (id: string) => {
    setSessionId(id);
    await loadMessages(id);
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/sessions/${id}`, { method: "DELETE" });
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (sessionId === id) {
          setSessionId(null);
          setMessages([]);
        }
      } catch {}
    },
    [sessionId]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Queue if already streaming
      if (isStreaming) {
        pendingRef.current = text;
        return;
      }

      setIsStreaming(true);

      // Optimistic: add user message to UI immediately
      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: text,
        context: pageContext,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      // Add placeholder for assistant response
      const tempAssistantMsg: ChatMessage = {
        id: `temp-assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        context: pageContext,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempAssistantMsg]);

      try {
        const token = getAccessToken();
        const res = await fetch(`${API_BASE}/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: text,
            session_id: sessionId,
            context: pageContext,
            resolved_entities: resolvedEntities
              .filter((e) => e.match)
              .map((e) => e.match),
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";
        let newSessionId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6);
            try {
              const event = JSON.parse(dataStr);
              if (event.type === "delta" && event.text) {
                fullText += event.text;
                // Update the assistant message in-place
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: fullText,
                    };
                  }
                  return updated;
                });
              } else if (event.type === "done") {
                newSessionId = event.session_id || null;
              }
            } catch {}
          }
        }

        // If server auto-created a session, update our state
        if (newSessionId && !sessionId) {
          setSessionId(newSessionId);
          loadSessions(); // refresh session list
        }
      } catch (e) {
        // Update assistant message with error
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: `[Connection error: ${String(e)}]`,
            };
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);

        // Send queued message if any
        if (pendingRef.current) {
          const queued = pendingRef.current;
          pendingRef.current = null;
          // Use setTimeout to avoid synchronous recursion
          setTimeout(() => sendMessage(queued), 0);
        }
      }
    },
    [isStreaming, sessionId, pageContext]
  );

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const addResolvedEntity = useCallback((entity: ResolvedEntity) => {
    setResolvedEntities((prev) => [...prev, entity]);
  }, []);
  const clearResolvedEntities = useCallback(() => setResolvedEntities([]), []);

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        toggle,
        open,
        close,
        pageContext,
        setPageContext,
        sessionId,
        sessions,
        createSession,
        switchSession,
        deleteSession,
        messages,
        isStreaming,
        sendMessage,
        resolvedEntities,
        addResolvedEntity,
        clearResolvedEntities,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
