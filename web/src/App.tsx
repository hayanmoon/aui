import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type ThreadMessage,
} from "@assistant-ui/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

function messageText(message: ThreadMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

type TextPart = { type: "text"; text: string };
type ReasoningPart = { type: "reasoning"; text: string };
type ToolPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  isError?: boolean;
};
type ContentPart = TextPart | ReasoningPart | ToolPart;
type ChatEvent = { content?: ContentPart[]; text?: string; done?: boolean; error?: string };
type AuthUser = { username: string; email: string };

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((entry) => entry.startsWith("data: "));
      if (!line) continue;
      yield JSON.parse(line.slice(6)) as ChatEvent;
    }
    if (done) return;
  }
}

function createAdapter(sessionId: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const user = [...messages].reverse().find((message) => message.role === "user");
      const message = user ? messageText(user) : "";
      const response = await fetch("/api/session/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId, message }),
        signal: abortSignal,
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Chat failed");
      }
      if (!response.body) throw new Error("Chat failed");

      let content: ContentPart[] = [];
      for await (const event of readEvents(response.body)) {
        if (event.error) throw new Error(event.error);
        if (event.content) content = event.content;
        else if (typeof event.text === "string") content = [{ type: "text", text: event.text }];
        if (content.length === 0) continue;
        yield { content: content as ChatModelRunResult["content"] };
      }
    },
  };
}

function Chat({ sessionId }: { sessionId: string }) {
  const adapter = useMemo(() => createAdapter(sessionId), [sessionId]);
  const runtime = useLocalRuntime(adapter);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TooltipProvider>
        <Thread />
      </TooltipProvider>
    </AssistantRuntimeProvider>
  );
}

function Login({
  onLoggedIn,
}: {
  onLoggedIn: (user: AuthUser) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json()) as { user?: AuthUser; error?: string };
      if (!response.ok || !data.user) {
        throw new Error(data.error ?? "Login failed");
      }
      onLoggedIn(data.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex h-svh items-center justify-center px-4">
      <form onSubmit={(event) => void submit(event)} className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-lg font-medium">Sign in</h1>
        <p className="text-sm text-muted-foreground">Use your LDAP username and password.</p>
        <label className="flex flex-col gap-1 text-sm">
          Username
          <input
            className="h-9 rounded-lg border border-border bg-background px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            className="h-9 rounded-lg border border-border bg-background px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/session", { method: "POST", credentials: "include" });
      const data = (await response.json()) as { sessionId?: string; error?: string };
      if (!response.ok || !data.sessionId) {
        throw new Error(data.error ?? "Could not start a chat");
      }
      setSessionId(data.sessionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start a chat");
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void start();
  }, [user, start]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setSessionId(null);
  };

  if (!authReady) {
    return <main className="flex h-svh items-center justify-center text-sm text-muted-foreground">Loading…</main>;
  }

  if (!user) {
    return <Login onLoggedIn={setUser} />;
  }

  return (
    <main className="flex h-svh flex-col">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <p className="truncate text-sm text-muted-foreground">{user.username}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void start()} disabled={pending}>
            New chat
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </div>
      {error ? <p className="px-4 text-sm text-destructive">{error}</p> : null}
      <div className="min-h-0 flex-1">
        {sessionId ? <Chat key={sessionId} sessionId={sessionId} /> : null}
      </div>
    </main>
  );
}
