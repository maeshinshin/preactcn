import { Fragment, h, type ComponentType } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";

const examples = import.meta.glob<Record<string, unknown>>("../src/examples/*.tsx");
const tooltip = import.meta.glob<{ TooltipProvider: ComponentType }>("../src/components/ui/tooltip.tsx");
const sonner = import.meta.glob<{ Toaster: ComponentType }>("../src/components/ui/sonner.tsx");

describe("SSR", () => {
  for (const [path, load] of Object.entries(examples)) {
    const name = path.split("/").pop()!.replace(/\.tsx$/, "");
    it(name, async () => {
      const mod = await load();
      const Example = (mod.default ??
        Object.values(mod).find((v) => typeof v === "function")) as ComponentType;
      expect(typeof Example).toBe("function");
      // upstream examples rely on the docs app wrapping everything in a TooltipProvider
      const Provider = (await Object.values(tooltip)[0]?.())?.TooltipProvider ?? Fragment;
      const Toaster = (await Object.values(sonner)[0]?.())?.Toaster ?? Fragment;
      expect(renderToString(h(Provider, null, h(Example, {}), h(Toaster, {})))).not.toBe("");
    });
  }
});
