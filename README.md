# Pi chat POC

A chat page built with assistant-ui, and a Fastify server that creates one in-memory Pi agent per chat. The agent talks to LM Studio using `server/models.json`.

In production, **one server process** serves the UI and the chat API. The browser only talks to that host; only the server reaches LM Studio (same network boundary as Chainlit’s `@cl.on_message`).

## Requirements

- Node.js 22.19+, 24, or 26+ (`nvm use` reads `.nvmrc`)
- LM Studio serving `google/gemma-4-e2b` at `http://localhost:1234/v1`

## Run (one app — UI + API)

```bash
npm install
npm start
```

Open http://localhost:3001. The Fastify process serves the built web UI and `/api/*`. **New chat** starts another Pi session.

## Dev (Vite + API, hot reload)

```bash
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the Fastify server on port 3001.

## Auth (LDAP)

Chat APIs require a signed `auth` cookie from LDAP login. Against the local OpenLDAP in `dev/ldap` (`./start-slapd.sh` uses local slapd on Debian and a Docker container on macOS):

```bash
# terminal 1 — directory
cd dev/ldap && ./start-slapd.sh && ./seed.sh

# terminal 2 — app (defaults already point at local slapd)
npm run dev
```

Sign in as `jdoe` / `password123`. Env knobs: `LDAP_URL`, `LDAP_APP_DN`, `LDAP_APP_PASSWORD`, `LDAP_SEARCH_BASE`, `LDAP_ATTRIBUTE_FOR_USERNAME`, `LDAP_ATTRIBUTE_FOR_MAIL`, `AUTH_SECRET`.

- `POST /api/auth/login` `{ username, password }` → sets cookie
- `POST /api/auth/logout` clears cookie
- `GET /api/auth/me` → `{ authenticated, user? }`

## API

- `POST /api/session` creates a session and returns `{ sessionId }` (auth required)
- `POST /api/session/chat` with `{ sessionId, message }` continues that session and streams Server-Sent Events. Each event is `{ content }` with the reply so far, including thinking, text, and tool calls. The last event is `{ content, done: true }` (auth required)

Sessions live in memory and disappear when the server stops. Thinking is on. The agent can use the default tools: read, bash, edit, and write.
