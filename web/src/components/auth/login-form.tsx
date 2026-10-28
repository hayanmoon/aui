import { FormEvent, useState } from "react";
import type { AuthUser } from "@/components/chat/types";
import { Button } from "@/components/ui/button";

export function LoginForm({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
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
