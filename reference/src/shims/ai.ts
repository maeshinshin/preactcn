// shortcut: the parts, tool states and message shape the examples read, not the AI SDK's full UIMessage; add a field when an example reads it
export type UIDataTypes = Record<string, unknown>
export type UITools = Record<string, { input: unknown; output: unknown }>

type Approval = { id: string; reason?: string }
type ToolCall<T extends UITools[string]> =
  | { state: "input-streaming"; input: Partial<T["input"]> | undefined }
  | { state: "input-available"; input: T["input"] }
  | { state: "approval-requested"; input: T["input"]; approval: Approval & { approved?: undefined } }
  | { state: "approval-responded"; input: T["input"]; approval: Approval & { approved: boolean } }
  | { state: "output-available"; input: T["input"]; output: T["output"]; approval?: Approval & { approved: true } }
  | { state: "output-error"; input: T["input"] | undefined; errorText: string; approval?: Approval & { approved: true } }
  | { state: "output-denied"; input: T["input"]; approval: Approval & { approved: false } }

type ToolPart<TOOLS extends UITools> = {
  [N in keyof TOOLS & string]: { type: `tool-${N}`; toolCallId: string } & ToolCall<TOOLS[N]>
}[keyof TOOLS & string]

type DataPart<DATA_PARTS extends UIDataTypes> = {
  [K in keyof DATA_PARTS & string]: { type: `data-${K}`; id?: string; data: DATA_PARTS[K] }
}[keyof DATA_PARTS & string]

export type UIMessage<METADATA = unknown, DATA_PARTS extends UIDataTypes = UIDataTypes, TOOLS extends UITools = UITools> = {
  id: string
  role: "system" | "user" | "assistant"
  metadata?: METADATA
  parts: (
    | { type: "text"; text: string; state?: "streaming" | "done" }
    | { type: "reasoning"; text: string; state?: "streaming" | "done" }
    | { type: "file"; mediaType: string; filename?: string; url: string }
    | { type: "source-url"; sourceId: string; title?: string; url: string }
    | { type: "source-document"; sourceId: string; title: string; mediaType: string; filename?: string }
    | DataPart<DATA_PARTS>
    | ToolPart<TOOLS>
  )[]
}

// resolves the next scripted assistant message for a transcript, or null once the script is exhausted
export type ChatTransport<M extends UIMessage = UIMessage> = (messages: M[]) => Promise<M | null>

export function isToolUIPart<P extends { type: string }>(part: P): part is Extract<P, { type: `tool-${string}` }> {
  return part.type.startsWith("tool-")
}

// shortcut: approvals settle at once (see useChat in ai-sdk-react), so "answered" means a tool part carries an approval decision
export function lastAssistantMessageIsCompleteWithApprovalResponses<M extends UIMessage>({ messages }: { messages: M[] }) {
  const last = messages.at(-1)
  if (last?.role !== "assistant") return false
  const tools = last.parts.filter(isToolUIPart)
  return tools.some((part) => (part as { approval?: { approved?: boolean } }).approval?.approved !== undefined)
}
