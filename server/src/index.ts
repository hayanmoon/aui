import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { clearAuthCookie, readAuthUser, requireAuth, setAuthCookie } from "./auth.js";
import { authenticateLdap, ldapConfigFromEnv } from "./ldap.js";

const serverDir = dirname(fileURLToPath(import.meta.url));
const modelsPath = join(serverDir, "../models.json");
const repoRoot = join(serverDir, "../..");
const webDist = join(repoRoot, "web/dist");
const modelId = "google/gemma-4-e2b";

const resourceLoader: ResourceLoader = {
  getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
  getSkills: () => ({ skills: [], diagnostics: [] }),
  getPrompts: () => ({ prompts: [], diagnostics: [] }),
  getThemes: () => ({ themes: [], diagnostics: [] }),
  getAgentsFiles: () => ({ agentsFiles: [] }),
  getSystemPrompt: () => "You are a helpful assistant.",
  getSystemPromptSource: () => undefined,
  getAppendSystemPrompt: () => [],
  getAppendSystemPromptSources: () => [],
  extendResources: () => {},
  reload: async () => {},
};

const settingsManager = SettingsManager.inMemory();

const modelRuntime = await ModelRuntime.create({
  modelsPath,
  refreshOnCreate: false,
  credentials: {
    async read() {
      return undefined;
    },
    async list() {
      return [];
    },
    async modify(_providerId, update) {
      return update(undefined);
    },
    async delete() {},
  },
});

const model = modelRuntime.getModel("lmstudio", modelId);
if (!model) {
  throw new Error(`Model lmstudio/${modelId} was not found in ${modelsPath}`);
}

const sessions = new Map<string, AgentSession>();

async function createSession(): Promise<AgentSession> {
  const { session } = await createAgentSession({
    model,
    thinkingLevel: "medium",
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(),
    cwd: repoRoot,
  });
  sessions.set(session.sessionId, session);
  return session;
}

function assistantError(session: AgentSession): string | undefined {
  const last = session.messages.at(-1);
  if (!last || !("errorMessage" in last)) return undefined;
  return typeof last.errorMessage === "string" && last.errorMessage.length > 0
    ? last.errorMessage
    : undefined;
}

const app = Fastify({ logger: true });
const ldapConfig = ldapConfigFromEnv();

await app.register(cookie);

app.get("/api/auth/me", async (request) => {
  const user = readAuthUser(request);
  if (!user) return { authenticated: false };
  return { authenticated: true, user };
});

app.post("/api/auth/login", async (request, reply) => {
  const body = request.body as { username?: unknown; password?: unknown };
  if (typeof body?.username !== "string" || typeof body?.password !== "string") {
    return reply.code(400).send({ error: "username and password are required" });
  }
  const user = await authenticateLdap(ldapConfig, body.username, body.password);
  if (!user) {
    return reply.code(401).send({ error: "Invalid credentials" });
  }
  setAuthCookie(reply, user);
  return { user: { username: user.username, email: user.email } };
});

app.post("/api/auth/logout", async (_request, reply) => {
  clearAuthCookie(reply);
  return { ok: true };
});

app.post("/api/session", async (request, reply) => {
  if (!(await requireAuth(request, reply))) return;
  const session = await createSession();
  return { sessionId: session.sessionId };
});

type ToolPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  isError?: boolean;
};

type TextPart = { type: "text"; text: string };
type ReasoningPart = { type: "reasoning"; text: string };
type ContentPart = TextPart | ReasoningPart | ToolPart;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assistantParts(message: { role: string; content: unknown }): ContentPart[] {
  if (message.role !== "assistant" || !Array.isArray(message.content)) return [];
  const parts: ContentPart[] = [];
  let text = "";
  const flushText = () => {
    if (!text) return;
    parts.push({ type: "text", text });
    text = "";
  };
  for (const part of message.content) {
    if (!isRecord(part) || typeof part.type !== "string") continue;
    if (part.type === "text" && typeof part.text === "string") {
      text += part.text;
      continue;
    }
    if (part.type === "thinking" && typeof part.thinking === "string" && part.thinking.length > 0) {
      flushText();
      parts.push({ type: "reasoning", text: part.thinking });
      continue;
    }
    if (part.type === "toolCall" && typeof part.id === "string" && typeof part.name === "string") {
      flushText();
      const args = isRecord(part.arguments) ? part.arguments : {};
      parts.push({
        type: "tool-call",
        toolCallId: part.id,
        toolName: part.name,
        args,
        argsText: JSON.stringify(args),
      });
    }
  }
  flushText();
  return parts;
}

function toolResultValue(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) return result;
  const text = result.content
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("");
  return text || result;
}

app.post("/api/session/chat", async (request, reply) => {
  if (!(await requireAuth(request, reply))) return;

  const body = request.body as { sessionId?: unknown; message?: unknown };
  if (typeof body?.sessionId !== "string" || typeof body.message !== "string" || !body.message.trim()) {
    return reply.code(400).send({ error: "sessionId and message are required" });
  }

  const session = sessions.get(body.sessionId);
  if (!session) {
    return reply.code(404).send({ error: "Unknown session" });
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (event: { content?: ContentPart[]; done?: boolean; error?: string }) => {
    if (reply.raw.writableEnded || reply.raw.destroyed) return;
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  request.raw.on("aborted", () => {
    void session.abort();
  });

  const settled: ContentPart[] = [];
  let live: ContentPart[] = [];
  let sent = "";
  const results = new Map<string, { result: unknown; isError: boolean }>();

  const applyResults = (parts: ContentPart[]) => {
    for (const part of parts) {
      if (part.type !== "tool-call") continue;
      const saved = results.get(part.toolCallId);
      if (!saved) continue;
      part.result = saved.result;
      part.isError = saved.isError;
    }
    return parts;
  };

  const publish = (done = false) => {
    const content = [...settled, ...live];
    const payload = JSON.stringify({ content, ...(done ? { done: true } : {}) });
    if (payload === sent) return;
    sent = payload;
    send(done ? { content, done: true } : { content });
  };

  const rememberToolResult = (toolCallId: string, result: unknown, isError: boolean) => {
    results.set(toolCallId, { result: toolResultValue(result), isError });
    applyResults(settled);
    applyResults(live);
    publish();
  };

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.message.role === "assistant") {
      live = applyResults(assistantParts(event.message));
      publish();
      return;
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      settled.push(...applyResults(assistantParts(event.message)));
      live = [];
      publish();
      return;
    }
    if (event.type === "tool_execution_end") {
      rememberToolResult(event.toolCallId, event.result, event.isError);
    }
  });

  try {
    await session.prompt(body.message);
    const error = assistantError(session);
    const content = [...settled, ...live];
    if (error && content.length === 0) send({ error });
    else publish(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    send({ error: message });
  } finally {
    unsubscribe();
    reply.raw.end();
  }
});

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (process.env.SERVE_WEB === "1") {
  if (!(await pathExists(join(webDist, "index.html")))) {
    throw new Error(`SERVE_WEB=1 but ${webDist}/index.html was not found. Run npm run build first.`);
  }
  await app.register(fastifyStatic, {
    root: webDist,
    wildcard: false,
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
  app.log.info(`Serving web UI from ${webDist}`);
}

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
