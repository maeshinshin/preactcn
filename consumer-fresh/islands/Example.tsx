import type { ComponentType } from "preact";
import { useEffect } from "preact/hooks";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// shortcut: eager glob puts every example into every page, so one example that fails to load fails all pages;
// split into one lazy island per example if the failures need to be attributed
const examples = import.meta.glob<Record<string, unknown>>("../examples/*.tsx", {
  eager: true,
});

export default function Example({ name }: { name: string }) {
  const mod = examples[`../examples/${name}.tsx`];
  const Component = (mod.default ??
    Object.values(mod).find((v) => typeof v === "function")) as ComponentType;
  // set after hydration, which is what the browser stage waits for
  useEffect(() => {
    document.body.dataset.mounted = "";
  }, []);
  // upstream examples rely on the docs app wrapping everything in a TooltipProvider and mounting a Toaster; context does not cross island roots
  return (
    <TooltipProvider>
      <Component />
      <Toaster />
    </TooltipProvider>
  );
}
