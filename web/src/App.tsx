import { useCallback, useEffect, useState } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { ChatStage } from "@/components/chat/chat-stage";
import { threadTitle } from "@/components/chat/thread-title";
import type { AuthUser, ChatThread } from "@/components/chat/types";
import { Sidebar } from "@/components/sidebar/sidebar";
import { deleteStoredThread, listSavedChats, rememberDraft, setDraftTitle, updateStoredTitle } from "@/lib/thread-db";

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" });
        const data = (await response.json()) as { authenticated?: boolean; user?: AuthUser };
        if (data.authenticated && data.user) setUser(data.user);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  const start = useCallback(async () => {
    if (!user) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/session", { method: "POST", credentials: "include" });
      const data = (await response.json()) as { sessionId?: string; error?: string };
      if (!response.ok || !data.sessionId) {
        throw new Error(data.error ?? "Could not start a chat");
      }
      const thread = { id: data.sessionId, title: "New chat", readOnly: false };
      rememberDraft(thread.id, user.username);
      setThreads((current) => [thread, ...current]);
      setActiveId(thread.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start a chat");
    } finally {
      setPending(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setHydrated(false);
    void (async () => {
      try {
        const stored = await listSavedChats(user.username);
        if (cancelled) return;
        setThreads(stored.map((thread) => ({ id: thread.id, title: thread.title, readOnly: true })));
        await start();
      } catch (caught) {
        if (cancelled) return;
        setThreads([]);
        setActiveId(null);
        setError(caught instanceof Error ? caught.message : "Could not load saved chats");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, start]);

  useEffect(() => {
    if (!user || !hydrated || threads.length > 0) return;
    void start();
  }, [user, hydrated, threads.length, start]);

  const titleFromMessage = useCallback((id: string, text: string) => {
    const title = threadTitle(text);
    let persist = false;
    setThreads((current) => {
      const thread = current.find((item) => item.id === id);
      if (!thread || thread.readOnly || thread.title !== "New chat") return current;
      persist = true;
      return current.map((item) => (item.id === id ? { ...item, title } : item));
    });
    if (persist) {
      setDraftTitle(id, title);
      void updateStoredTitle(id, title).catch((caught) => console.error(caught));
    }
  }, []);

  const renameThread = useCallback((id: string, title: string) => {
    let persist = false;
    setThreads((current) => {
      const thread = current.find((item) => item.id === id);
      if (!thread || thread.readOnly) return current;
      persist = true;
      return current.map((item) => (item.id === id ? { ...item, title } : item));
    });
    if (persist) {
      setDraftTitle(id, title);
      void updateStoredTitle(id, title).catch((caught) => console.error(caught));
    }
  }, []);

  const deleteThread = useCallback((id: string) => {
    void (async () => {
      try {
        await deleteStoredThread(id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not delete chat");
        return;
      }
      let remaining: ChatThread[] = [];
      setThreads((current) => {
        remaining = current.filter((thread) => thread.id !== id);
        return remaining;
      });
      setActiveId((active) => (active === id ? (remaining[0]?.id ?? null) : active));
    })();
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setThreads([]);
    setActiveId(null);
    setHydrated(false);
  };

  if (!authReady || (user && !hydrated)) {
    return <main className="flex h-svh items-center justify-center text-sm text-muted-foreground">Loading…</main>;
  }

  if (!user) {
    return <LoginForm onLoggedIn={setUser} />;
  }

  return (
    <Sidebar
      username={user.username}
      threads={threads}
      activeId={activeId}
      pending={pending}
      onNewChat={() => void start()}
      onSelect={setActiveId}
      onRename={renameThread}
      onDelete={deleteThread}
      onSignOut={() => void logout()}
    >
      <ChatStage threads={threads} activeId={activeId} error={error} onFirstMessage={titleFromMessage} />
    </Sidebar>
  );
}
