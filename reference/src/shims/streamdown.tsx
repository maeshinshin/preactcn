import { createContext, useContext } from "react"
import type { ComponentProps, ComponentType, ReactNode } from "react"

// stand-in for streamdown's markdown renderer, which is React-only and app-level here (only code-block-example uses it)
// shortcut: paragraphs, fenced code and `inline code` only, the rest of markdown renders as text; add a block when an example uses it
export type ExtraProps = { node?: unknown }
type CodeProps = ComponentProps<"code"> & ExtraProps

const FenceIncomplete = createContext(false)
export const useIsCodeFenceIncomplete = () => useContext(FenceIncomplete)

type Block = { fence: false; text: string } | { fence: true; language: string; code: string; open: boolean }

function blocks(markdown: string): Block[] {
  const out: Block[] = []
  let text: string[] = []
  let fence: { language: string; lines: string[] } | null = null
  const flush = () => {
    if (text.join("").trim()) out.push({ fence: false, text: text.join("\n").trim() })
    text = []
  }
  for (const line of markdown.split("\n")) {
    if (fence) {
      if (line.startsWith("```")) {
        out.push({ fence: true, language: fence.language, code: fence.lines.join("\n"), open: false })
        fence = null
      } else fence.lines.push(line)
    } else if (line.startsWith("```")) {
      flush()
      fence = { language: line.slice(3).trim(), lines: [] }
    } else if (line.trim() === "") flush()
    else text.push(line)
  }
  flush()
  if (fence) out.push({ fence: true, language: fence.language, code: fence.lines.join("\n"), open: true })
  return out
}

export function Streamdown({
  children,
  components,
  isAnimating = false,
}: {
  children: string
  components?: { code?: ComponentType<CodeProps> }
  controls?: boolean
  isAnimating?: boolean
}) {
  const Code = components?.code ?? "code"
  return (
    <div className="space-y-4 whitespace-normal">
      {blocks(children).map((block, index) => {
        if (block.fence)
          return (
            <FenceIncomplete.Provider key={index} value={block.open && isAnimating}>
              <Code data-block="" className={block.language ? `language-${block.language}` : undefined}>
                {block.code}
              </Code>
            </FenceIncomplete.Provider>
          )
        const parts: ReactNode[] = block.text.split("`").map((piece, i) => (i % 2 ? <Code key={i}>{piece}</Code> : piece))
        return <p key={index}>{parts}</p>
      })}
    </div>
  )
}
