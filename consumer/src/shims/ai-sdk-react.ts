import { useRef, useState } from "preact/hooks"
import type { ChatTransport, UIMessage } from "ai"

type ApprovalResponse = { id: string; approved: boolean; reason?: string }

// shortcut: no streaming phase, status goes ready -> submitted -> ready and never reports "streaming" or "error"; add them if an example renders those states
// shortcut: a tool approval settles at once to output-available (with the output the script gave) or output-denied, there is no "approval-responded" step
export function useChat<M extends UIMessage>({
  messages: initial,
  transport,
  sendAutomaticallyWhen,
}: {
  messages: M[]
  transport: ChatTransport<M>
  sendAutomaticallyWhen?: (options: { messages: M[] }) => boolean
}) {
  const [messages, setMessages] = useState(initial)
  const [status, setStatus] = useState<"submitted" | "streaming" | "ready" | "error">("ready")
  const run = useRef(0)
  async function reply(sent: M[]) {
    const mine = ++run.current
    setMessages(sent)
    setStatus("submitted")
    const next = await transport(sent)
    if (mine !== run.current) return
    if (next) setMessages([...sent, next])
    setStatus("ready")
  }
  return {
    messages,
    status,
    setMessages,
    sendMessage: (message: M) => reply([...messages, message]),
    async addToolApprovalResponse({ id, approved, reason }: ApprovalResponse) {
      const settled = messages.map((message) => ({
        ...message,
        parts: message.parts.map((part) => {
          const tool = part as { approval?: { id: string }; scriptedOutput?: unknown }
          if (tool.approval?.id !== id) return part
          const { scriptedOutput, ...rest } = tool
          return approved
            ? { ...rest, state: "output-available", output: scriptedOutput, approval: { id, approved, reason } }
            : { ...rest, state: "output-denied", approval: { id, approved, reason } }
        }),
      })) as M[]
      if (sendAutomaticallyWhen?.({ messages: settled })) await reply(settled)
      else setMessages(settled)
    },
    stop() {
      run.current++
      setStatus("ready")
    },
  }
}
