import { Fragment, h, render, type ComponentType } from "preact";
import "./index.css";

// mounts the example named by ?example=<name> the way test/ssr.test.tsx renders it, driven by scripts/browser.mjs
const examples = import.meta.glob<Record<string, unknown>>("./examples/*.tsx");
const tooltip = import.meta.glob<{ TooltipProvider: ComponentType }>("./components/ui/tooltip.tsx");
const sonner = import.meta.glob<{ Toaster: ComponentType }>("./components/ui/sonner.tsx");

const name = new URLSearchParams(location.search).get("example");
const mod = await examples[`./examples/${name}.tsx`]!();
const Example = (mod.default ?? Object.values(mod).find((v) => typeof v === "function")) as ComponentType;
const Provider = (await Object.values(tooltip)[0]?.())?.TooltipProvider ?? Fragment;
// without a Toaster, examples that call toast() show nothing, in the diff stage too
const Toaster = (await Object.values(sonner)[0]?.())?.Toaster ?? Fragment;
render(h(Provider, null, h(Example, {}), h(Toaster, {})), document.getElementById("app")!);
document.body.dataset.mounted = "";
