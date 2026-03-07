"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getAccessToken } from "./auth";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

type EventHandler = (event: SSEEvent) => void;

interface EventsContextValue {
  status: ConnectionStatus;
  subscribe: (handler: EventHandler) => () => void;
}

const EventsContext = createContext<EventsContextValue>({
  status: "disconnected",
  subscribe: () => () => {},
});

export function useEvents() {
  return useContext(EventsContext);
}

const MAX_BACKOFF = 30000;
const BASE_BACKOFF = 1000;

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const handlersRef = useRef<Set<EventHandler>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token || !mountedRef.current) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");
    const es = new EventSource(`/api/v1/events?token=${encodeURIComponent(token)}`);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setStatus("connected");
      retryRef.current = 0;
    };

    es.onmessage = (msg) => {
      if (!mountedRef.current) return;
      try {
        const data: SSEEvent = JSON.parse(msg.data);
        if (data.type === "heartbeat") return;
        for (const handler of handlersRef.current) {
          handler(data);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (!mountedRef.current) return;
      setStatus("disconnected");

      // Exponential backoff reconnect
      const delay = Math.min(BASE_BACKOFF * 2 ** retryRef.current, MAX_BACKOFF);
      retryRef.current++;
      setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  const subscribe = useCallback((handler: EventHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return (
    <EventsContext.Provider value={{ status, subscribe }}>
      {children}
    </EventsContext.Provider>
  );
}
