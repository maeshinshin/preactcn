import { createElement, type ComponentType } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import "./index.css"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

// mounts the example named by ?example=<name>, the React twin of consumer/src/browser.tsx, driven by consumer/scripts/diff.mjs
const examples = import.meta.glob<Record<string, unknown>>("./components/*.tsx")

const name = new URLSearchParams(location.search).get("example")
const mod = await examples[`./components/${name}.tsx`]!()
const Example = (mod.default ?? Object.values(mod).find((v) => typeof v === "function")) as ComponentType
flushSync(() => createRoot(document.getElementById("app")!).render(createElement(TooltipProvider, null, createElement(Example), createElement(Toaster))))
document.body.dataset.mounted = ""
