import type { ChatTransport, UIMessage } from "ai"

// stand-in for the docs app's `@/lib/ai` (which re-exports @shadcn/helpers/ai-sdk): only the scripted-chat builder the examples call
// shortcut: no streaming, so `sleep` after a part and `delayMs` of a part are accepted and ignored; only the delay before a reply is applied
type Part<M extends UIMessage> = M["parts"][number]
type OfType<M extends UIMessage, T extends string> = Extract<Part<M>, { type: T }>
type ToolPart<M extends UIMessage> = Extract<Part<M>, { toolCallId: string }>
type ToolName<M extends UIMessage> = ToolPart<M> extends infer P ? (P extends { type: `tool-${infer N}` } ? N : never) : never
type ToolOf<M extends UIMessage, N extends string> = Extract<ToolPart<M>, { type: `tool-${N}` }>
type Input<M extends UIMessage, N extends string> = Extract<ToolOf<M, N>, { state: "input-available" }>["input"]
type Output<M extends UIMessage, N extends string> = Extract<ToolOf<M, N>, { state: "output-available" }>["output"]
type Source<M extends UIMessage, T extends "source-url" | "source-document"> = Omit<OfType<M, T>, "type" | "sourceId"> & { sourceId?: string }

type ToolHandle<M extends UIMessage, N extends string> = {
  sleep(ms: number): ToolHandle<M, N>
  output(output: Output<M, N>): ToolHandle<M, N>
  error(errorText: string): ToolHandle<M, N>
}

type Writer<M extends UIMessage> = {
  text(text: string, options?: { delayMs?: number }): void
  reasoning(text: string, options?: { delayMs?: number }): void
  data(part: OfType<M, `data-${string}`>): void
  sourceUrl(part: Source<M, "source-url">): void
  sourceDocument(part: Source<M, "source-document">): void
  // with needsApproval the part waits as "approval-requested"; `output` is what an approval then settles it with
  tool<N extends ToolName<M>>(
    name: N,
    options: { title?: string; input: Input<M, N>; needsApproval?: boolean; output?: Output<M, N> }
  ): ToolHandle<M, N>
  sleep(ms: number): void
}

// the decision the user gave to a tool of the previous assistant message
type ToolDecision = { approved: boolean }
type Script<M extends UIMessage> = (context: { writer: Writer<M>; toolCall?: ToolDecision }) => void

export function createChat<M extends UIMessage = UIMessage>() {
  // a turn is built when it is read, because an assistant turn can depend on the approval that came before it
  const turns: { role: M["role"]; delayMs: number; build: (toolCall?: ToolDecision) => M }[] = []
  let delayMs = 0
  const add = (role: M["role"], build: (id: string, toolCall?: ToolDecision) => Part<M>[]) => {
    const id = `msg-${turns.length + 1}`
    turns.push({ role, delayMs, build: (toolCall) => ({ id, role, parts: build(id, toolCall) }) as M })
    delayMs = 0
  }
  const chat = {
    user(text: string, { files = [] }: { files?: Omit<OfType<M, "file">, "type">[] } = {}) {
      add("user", () => [{ type: "text", text }, ...files.map((file) => ({ type: "file" as const, ...file }))] as Part<M>[])
      return chat
    },
    assistant(input: string | Script<M>) {
      add("assistant", (id, toolCall) => {
        const parts: unknown[] = []
        const writer: Writer<M> = {
          text: (text) => parts.push({ type: "text", text }),
          reasoning: (text) => parts.push({ type: "reasoning", text }),
          data: (part) => parts.push(part),
          sourceUrl: (part) => parts.push({ type: "source-url", sourceId: `source-${parts.length + 1}`, ...part }),
          sourceDocument: (part) => parts.push({ type: "source-document", sourceId: `source-${parts.length + 1}`, ...part }),
          tool: (name, { input, needsApproval, output }) => {
            const toolCallId = `${id}-call-${parts.length + 1}`
            const part: Record<string, unknown> = needsApproval
              ? { type: `tool-${name}`, toolCallId, state: "approval-requested", input, approval: { id: `${toolCallId}-approval` }, scriptedOutput: output }
              : { type: `tool-${name}`, toolCallId, state: "input-available", input }
            parts.push(part)
            const handle: ToolHandle<M, typeof name> = {
              sleep: () => handle,
              output: (output) => (Object.assign(part, { state: "output-available", output }), handle),
              error: (errorText) => (Object.assign(part, { state: "output-error", errorText }), handle),
            }
            return handle
          },
          sleep: () => {},
        }
        if (typeof input === "string") writer.text(input)
        else input({ writer, toolCall })
        return parts as Part<M>[]
      })
      return chat
    },
    sleep(ms: number) {
      delayMs = ms
      return chat
    },
    get: (count = turns.length) => turns.slice(0, count).map((turn) => turn.build()),
    // shortcut: matches by transcript length, so the transcript must be a prefix of the script, as with useChat here
    next: (messages: M[]) => turns.slice(messages.length).find((turn) => turn.role === "user")?.build() ?? null,
    transport(_options?: { delayMs?: number }): ChatTransport<M> {
      return async (messages) => {
        const turn = turns[messages.length]
        if (turn?.role !== "assistant") return null
        await new Promise((done) => setTimeout(done, turn.delayMs))
        const approval = messages.at(-1)?.parts.find((part) => (part as { approval?: { approved?: boolean } }).approval?.approved !== undefined)
        return turn.build(approval && { approved: (approval as { approval: { approved: boolean } }).approval.approved })
      }
    },
  }
  return chat
}

export function getMessageText(message: Pick<UIMessage, "parts">) {
  return message.parts.reduce((text, part) => (part.type === "text" ? text + part.text : text), "")
}
