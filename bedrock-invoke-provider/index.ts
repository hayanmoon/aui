/** Pi 0.84.1 adapter for a gateway exposing Bedrock's Claude InvokeModel API. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import {
  createAssistantMessageEventStream,
  calculateCost,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type Usage,
} from "@earendil-works/pi-ai"

const PROVIDER = "bedrock-invoke-gateway"
const API = "bedrock-invoke-claude"

// Configure a Bedrock Claude model here. Changing the ID does not support other model families.
// The URL, model ID, limits, and prices below are placeholders.
const gatewayConfig = {
  baseUrl: process.env.BEDROCK_GATEWAY_BASE_URL ?? "https://your-gateway.example",
  modelId: process.env.BEDROCK_GATEWAY_MODEL_ID ?? "YOUR_BEDROCK_CLAUDE_MODEL_ID",
  modelName: "Gateway Claude",
  contextWindow: 200_000,
  maxTokens: 4096,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
}

type ClaudeContentBlock = Record<string, unknown>
type CompletedAssistantMessage = AssistantMessage & {
  stopReason: "stop" | "length" | "toolUse"
}

type ClaudeRequest = {
  anthropic_version: string
  max_tokens: number
  messages: ClaudeMessage[]
  system?: string
  temperature?: number
  tools?: {
    name: string
    description: string
    input_schema: unknown
  }[]
}

type ClaudeMessage = {
  role: "user" | "assistant"
  content: ClaudeContentBlock[]
}

export default function registerGateway(pi: ExtensionAPI) {
  pi.registerProvider(PROVIDER, {
    name: "Bedrock Claude Invoke Gateway",
    baseUrl: gatewayConfig.baseUrl,
    apiKey: "$BEDROCK_GATEWAY_API_KEY",
    authHeader: false,
    api: API,
    streamSimple: streamInvoke,
    models: [{
      id: gatewayConfig.modelId,
      name: gatewayConfig.modelName,
      reasoning: false,
      input: ["text"],
      contextWindow: gatewayConfig.contextWindow,
      maxTokens: gatewayConfig.maxTokens,
      cost: gatewayConfig.cost,
    }],
  })
}

/** Pi requires an event stream even though /invoke returns one complete response. */
function streamInvoke(model: Model<Api>, context: Context, options: SimpleStreamOptions = {}) {
  const stream = createAssistantMessageEventStream()
  let output = createAssistantMessage(model)

  async function run() {
    try {
      stream.push({
        type: "start",
        partial: output,
      })

      const message = await invokeClaude(model, context, options)
      output = message
      publishTextEvents(stream, message)

      stream.push({
        type: "done",
        reason: message.stopReason,
        message: message,
      })
    } catch (error) {
      output.stopReason = "error"
      if (options.signal && options.signal.aborted) {
        output.stopReason = "aborted"
      }

      if (error instanceof Error) {
        output.errorMessage = error.message
      } else {
        output.errorMessage = String(error)
      }
      stream.push({
        type: "error",
        reason: output.stopReason,
        error: output,
      })
    } finally {
      stream.end()
    }
  }

  void run()
  return stream
}

async function invokeClaude(
  model: Model<Api>,
  context: Context,
  options: SimpleStreamOptions,
): Promise<CompletedAssistantMessage> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 3_600_000)
  let signal = timeout
  if (options.signal) {
    signal = AbortSignal.any([options.signal, timeout])
  }
  signal.throwIfAborted()

  const apiKey = options.apiKey ?? process.env.BEDROCK_GATEWAY_API_KEY
  if (!apiKey) {
    throw new Error("Set BEDROCK_GATEWAY_API_KEY or pass options.apiKey.")
  }

  let payload: unknown = buildClaudeRequest(model, context, options)
  const url = invokeUrl(model)

  // Let Pi inspect or replace the completed request body before sending it.
  if (options.onPayload) {
    const replacement = await options.onPayload(payload, model)
    if (replacement !== undefined) {
      payload = replacement
    }
  }
  signal.throwIfAborted()

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    signal: signal,
    redirect: "error",
  })

  // Report HTTP status and headers for both successful and failed requests.
  if (options.onResponse) {
    await options.onResponse({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    }, model)
  }
  signal.throwIfAborted()

  if (!response.ok) {
    let errorMessage = `Bedrock gateway HTTP ${response.status}`

    try {
      // Pi uses the upstream message to recognize context-overflow errors.
      const errorBody = await response.text()
      if (errorBody.trim()) {
        errorMessage += `: ${errorBody.trim()}`
      }
    } catch {
      // Keep the HTTP status if the error body cannot be read.
    }

    signal.throwIfAborted()
    throw new Error(errorMessage)
  }

  const data = await response.json()
  signal.throwIfAborted()
  return readClaudeResponse(data, model)
}

function publishTextEvents(stream: AssistantMessageEventStream, output: AssistantMessage) {
  // This project's drivers display text_delta events. Send each completed
  // text block once; tools and thinking are included in the final message.
  for (const [contentIndex, block] of output.content.entries()) {
    if (block.type !== "text") {
      continue
    }
    const text = block.text
    block.text = ""
    stream.push({
      type: "text_start",
      contentIndex: contentIndex,
      partial: output,
    })
    block.text = text
    stream.push({
      type: "text_delta",
      contentIndex: contentIndex,
      delta: text,
      partial: output,
    })
    stream.push({
      type: "text_end",
      contentIndex: contentIndex,
      content: text,
      partial: output,
    })
  }
}

function invokeUrl(model: Model<Api>): string {
  const base = model.baseUrl.replace(/\/$/, "")
  const modelId = encodeURIComponent(model.id)
  const url = new URL(base)

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("Use HTTPS for the gateway URL.")
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new Error("Use a base URL without credentials, query parameters, or fragment.")
  }

  return `${base}/model/${modelId}/invoke`
}

/** Convert Pi's conversation into the body documented by AWS for Claude Messages. */
function buildClaudeRequest(
  model: Model<Api>,
  context: Context,
  options: SimpleStreamOptions,
): ClaudeRequest {
  if (options.reasoning) {
    throw new Error("Thinking is disabled in this Claude InvokeModel provider.")
  }
  if (options.deferred) {
    throw new Error("InvokeModel does not support deferred responses.")
  }

  const payload: ClaudeRequest = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: Math.min(options.maxTokens ?? model.maxTokens, model.maxTokens),
    messages: convertConversation(context),
  }
  if (context.systemPrompt) {
    payload.system = context.systemPrompt
  }
  if (options.temperature !== undefined) {
    payload.temperature = options.temperature
  }
  if (context.tools && context.tools.length > 0) {
    payload.tools = context.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }))
  }
  return payload
}

function convertConversation(context: Context): ClaudeMessage[] {
  const messages: ClaudeMessage[] = []
  for (const message of context.messages) {
    let role: ClaudeMessage["role"]
    let content: ClaudeContentBlock[]

    if (message.role === "user") {
      role = "user"
      if (typeof message.content === "string") {
        content = [{ type: "text", text: message.content }]
      } else {
        content = message.content.map(convertTextBlock)
      }
    } else if (message.role === "toolResult") {
      role = "user"
      let result = message.content.map(convertTextBlock)
      if (result.length === 0) {
        result = [{ type: "text", text: "(empty result)" }]
      }
      content = [{
        type: "tool_result",
        tool_use_id: message.toolCallId,
        is_error: message.isError,
        content: result,
      }]
    } else {
      if (["error", "aborted", "pending"].includes(message.stopReason)) {
        continue
      }
      role = "assistant"
      content = convertAssistantHistory(message)
    }

    if (content.length === 0) {
      continue
    }
    const previous = messages.at(-1)
    if (previous && previous.role === role) {
      previous.content.push(...content)
    } else {
      messages.push({ role: role, content: content })
    }
  }

  return messages
}

function convertAssistantHistory(message: AssistantMessage): ClaudeContentBlock[] {
  const content: ClaudeContentBlock[] = []
  for (const block of message.content) {
    if (block.type === "text") {
      content.push({ type: "text", text: block.text })
    } else if (block.type === "toolCall") {
      content.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.arguments,
      })
    } else if (block.type === "thinking") {
      // Replay Claude thinking blocks unchanged, including their opaque signatures.
      if (block.redacted) {
        content.push({ type: "redacted_thinking", data: block.thinkingSignature })
      } else if (block.thinkingSignature) {
        content.push({
          type: "thinking",
          thinking: block.thinking,
          signature: block.thinkingSignature,
        })
      }
    }
  }
  return content
}

function readClaudeResponse(data: unknown, model: Model<Api>): CompletedAssistantMessage {
  const output = createAssistantMessage(model)
  if (!isObject(data) || !Array.isArray(data.content)) {
    throw new Error("Expected Claude Messages JSON with a content array.")
  }

  const stopReason = readStopReason(data.stop_reason)
  output.rawStopReason = data.stop_reason as string
  if (typeof data.id === "string") {
    output.responseId = data.id
  }
  if (typeof data.model === "string") {
    output.responseModel = data.model
  }

  output.content = data.content.map(readClaudeBlock)
  output.usage = readUsage(data.usage, model)

  return { ...output, stopReason: stopReason }
}

function readClaudeBlock(block: unknown): AssistantMessage["content"][number] {
  if (!isObject(block)) {
    throw new Error("Invalid Claude content block.")
  }

  switch (block.type) {
    case "text":
      if (typeof block.text !== "string") {
        throw new Error("Expected Claude text to be a string.")
      }
      return { type: "text", text: block.text }

    case "tool_use":
      if (typeof block.id !== "string" || typeof block.name !== "string" || !isObject(block.input)) {
        throw new Error("Expected Claude tool_use to have an ID, name, and input object.")
      }
      return {
        type: "toolCall",
        id: block.id,
        name: block.name,
        arguments: block.input,
      }

    case "thinking":
      if (typeof block.thinking !== "string" || typeof block.signature !== "string") {
        throw new Error("Expected Claude thinking to have text and a signature.")
      }
      return {
        type: "thinking",
        thinking: block.thinking,
        thinkingSignature: block.signature,
      }

    case "redacted_thinking":
      if (typeof block.data !== "string") {
        throw new Error("Expected Claude redacted thinking data to be a string.")
      }
      return {
        type: "thinking",
        thinking: "",
        thinkingSignature: block.data,
        redacted: true,
      }

    default:
      throw new Error(`Unsupported Claude content block: ${block.type}`)
  }
}

function readUsage(data: unknown, model: Model<Api>): Usage {
  let responseUsage: Record<string, unknown> = {}
  if (isObject(data)) {
    responseUsage = data
  }

  const usage: Usage = {
    input: readTokenCount(responseUsage.input_tokens),
    output: readTokenCount(responseUsage.output_tokens),
    cacheRead: readTokenCount(responseUsage.cache_read_input_tokens),
    cacheWrite: readTokenCount(responseUsage.cache_creation_input_tokens),
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  }
  usage.totalTokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite
  usage.cost = calculateCost(model, usage)
  return usage
}

function readStopReason(value: unknown): CompletedAssistantMessage["stopReason"] {
  switch (value) {
    case "end_turn":
    case "stop_sequence":
    case "refusal":
      return "stop"
    case "max_tokens":
    case "model_context_window_exceeded":
      return "length"
    case "tool_use":
      return "toolUse"
    default:
      throw new Error(`Unsupported Claude stop reason: ${value}`)
  }
}

function createAssistantMessage(model: Model<Api>): AssistantMessage {
  return {
    role: "assistant",
    api: model.api,
    provider: model.provider,
    model: model.id,
    timestamp: Date.now(),
    content: [],
    stopReason: "pending",
    usage: readUsage(undefined, model),
  }
}

function convertTextBlock(block: {
  type: string
  text?: string
}): ClaudeContentBlock {
  if (block.type !== "text") {
    throw new Error("This provider supports text only. Images are not supported.")
  }
  if (typeof block.text !== "string") {
    throw new Error("Expected a text block with a text string.")
  }
  return { type: "text", text: block.text }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readTokenCount(value: unknown): number {
  if (typeof value === "number") {
    return value
  }
  return 0
}
