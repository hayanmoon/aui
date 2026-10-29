# Bedrock Claude InvokeModel provider

A single-file extension for Pi 0.84.1:

**Pi → extension → gateway `/model/{modelId}/invoke` → Bedrock**

Uses built-in `fetch` and Pi's existing packages. No AWS SDK imports,
streaming decoder, or additional runtime package is needed to load the extension.

## Quick setup for this project

1. Copy only `index.ts` into the project's extensions directory. From the project root:

   ```sh
   mkdir -p .pi/extensions/bedrock-invoke-provider
   cp examples/bedrock-invoke-provider/index.ts .pi/extensions/bedrock-invoke-provider/index.ts
   ```

   No separate package installation or build is needed for the extension.
   Pi loads the TypeScript file directly using its installed packages.

2. Set the gateway configuration in the terminal where you will start the app:

   ```sh
   export BEDROCK_GATEWAY_BASE_URL='https://your-gateway.example'
   export BEDROCK_GATEWAY_MODEL_ID='your-bedrock-claude-model-id'
   export BEDROCK_GATEWAY_API_KEY='your-gateway-key'
   ```

   Use the base URL only, without `/model/.../invoke`. The extension adds that path.
   The gateway must accept `x-api-key` authentication, forward the Claude request
   to Bedrock, and return native Claude Messages JSON. The gateway handles AWS
   authentication; this extension uses `BEDROCK_GATEWAY_API_KEY`.

3. Update these fields in `.pi/settings.json`, preserving any other settings:

   ```json
   {
     "defaultProvider": "bedrock-invoke-gateway",
     "defaultModel": "your-bedrock-claude-model-id",
     "defaultThinkingLevel": "off"
   }
   ```

   `defaultModel` must match `BEDROCK_GATEWAY_MODEL_ID`. This selects the gateway
   provider instead of this project's AWS bearer provider. Both extension files
   can remain installed.

4. Stop any running server, then start it from that same terminal:

   ```sh
   npm start
   ```

   Create a new session to use the new default. Existing sessions may retain their
   previous model. The server's session-provider log should show
   `bedrock-invoke-gateway`.

The extension targets Pi 0.84.1. In the copied `index.ts`, adjust `gatewayConfig`
for your model's display name, context window, output limit, and prices.
Zero prices display zero estimated cost.

For container execution, the worker must also forward the three
`BEDROCK_GATEWAY_*` variables into agent-runner containers. Its current bearer-token
forwarding alone is insufficient for this gateway extension.

## Configure

This provider supports Claude Messages on Bedrock only. It accepts Claude responses
and converts them into Pi messages. Changing the model ID to GLM or another model
family does not add support for that model or for OpenAI-compatible responses.

Edit `gatewayConfig` at the top of `index.ts`. Set your gateway URL, Claude model ID,
context window, output limit, and prices. The sample limits and zero prices are
placeholders; zero prices display zero estimated cost.

The URL and model ID can also come from these environment variables:

```sh
export BEDROCK_GATEWAY_BASE_URL='https://your-gateway.example'
export BEDROCK_GATEWAY_MODEL_ID='your-model-id'
```

Set `BEDROCK_GATEWAY_API_KEY` through your shell or secret manager. In zsh,
this prompts without displaying the key or putting it in shell history:

```sh
read -rs 'BEDROCK_GATEWAY_API_KEY?Gateway API key: '
export BEDROCK_GATEWAY_API_KEY
```

## Load in Pi

Copy only `index.ts` into your Pi project, for example as
`.pi/extensions/bedrock-invoke-provider/index.ts`. Pi loads that directory automatically.
Alternatively, load the file explicitly:

```sh
pi -e ./path/to/index.ts --provider bedrock-invoke-gateway --model your-model-id
```

For this checkout, run from the project root:

```sh
node ./node_modules/@earendil-works/pi-coding-agent/dist/cli.js \
  -e ./examples/bedrock-invoke-provider/index.ts \
  --provider bedrock-invoke-gateway --model "$BEDROCK_GATEWAY_MODEL_ID"
```

The package entry is used directly because this checkout's `.bin/pi` launcher
has a relative-import resolution issue. Pi's extension loader resolves the Pi
imports using the consuming installation; the extension contains no absolute
filesystem paths. The other scaffold files are optional development metadata.

## Request and response

The extension sends one JSON POST:

```http
POST /model/<URL-encoded-model-id>/invoke
Content-Type: application/json
Accept: application/json
x-api-key: <key>
```

```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 4096,
  "messages": [{ "role": "user", "content": "Hello" }]
}
```

System prompts and tool definitions are included when supplied by Pi. Model
selection goes in the URL. Gateway URL prefixes are preserved.

The gateway handles AWS authentication and must return native Claude JSON directly:

```json
{
  "content": [{ "type": "text", "text": "Hello!" }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 10, "output_tokens": 5 }
}
```

The extension converts this response into Pi text, tool calls, stop reason, and
usage. Tool results are sent back as Claude `tool_result` blocks. Thinking is
not requested; returned thinking signatures and redacted blocks are preserved
for subsequent Claude turns. Tool call IDs and matching tool-result IDs pass
through unchanged; they are not normalized or translated between providers.

Conversation history is expected to come from this Claude provider. No
cross-provider history conversion is implemented.

Pi requires an event-stream interface even for a buffered response. This
extension emits `start`, text events for each completed text block, then `done`
with the complete assistant message (or `error` on failure). The text events
keep this project’s text-delta consumers working. Pi reads tool calls, thinking,
and usage from the final message. Bedrock responses are still buffered.

Images are explicitly rejected. Streaming operations, Converse, extended-thinking
configuration, and deferred responses are outside this extension's scope.
Cancellation and a default 60-minute timeout are supported. HTTP and malformed
response failures become Pi errors. HTTP errors retain the upstream response body
so Pi can recognize context overflow. Gateway timeouts may be shorter.

Pi's optional `onPayload` callback runs before sending the request. It can modify
the body directly or return a replacement; returning `undefined` keeps the body.
The optional `onResponse` callback receives HTTP status and headers for both
successful and failed responses. Both callbacks may be asynchronous.

## Verification

The extension was checked with TypeScript and local mocked responses covering
text and tool round trips, events, usage, callbacks, HTTP errors, malformed
responses, and cancellation. No live gateway requests were run.
End-to-end verification still requires your actual gateway.

The optional package manifest pins the same Pi packages as this project and
provides `npm run typecheck` when those packages are installed directly in the
scaffold. It is not required when copying `index.ts` into a Pi project.

Request/response reference:
[AWS Claude Messages](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html).
Signature preservation reference:
[AWS thinking encryption](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-thinking-encryption.html).
