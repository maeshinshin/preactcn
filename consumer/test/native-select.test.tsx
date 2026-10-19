// @vitest-environment happy-dom
import type { render as Render } from "preact";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

// Preact core alone, which is what an app that never imports preact/compat runs: compat's vnode hook would implement defaultValue itself.
const root = document.createElement("div");
let render: typeof Render;
let view: (props: Record<string, unknown>) => void;

beforeAll(async () => {
  const preact = await import("preact");
  const { NativeSelect, NativeSelectOption } = await import("@/components/ui/native-select");
  render = preact.render;
  view = (props) =>
    render(
      preact.h(NativeSelect, props, ["a", "b", "c"].map((value) => preact.h(NativeSelectOption, { value }, value))),
      root
    );
});

afterEach(() => render(null, root));

const select = () => root.querySelector("select")!;

describe("native-select defaultValue", () => {
  it("selects the default option on mount", () => {
    view({ defaultValue: "b" });
    expect(select().value).toBe("b");
    expect(select().hasAttribute("defaultvalue")).toBe(false);
  });

  it("keeps the user's choice across a re-render, even with another defaultValue", () => {
    view({ defaultValue: "b" });
    select().value = "c";
    select().dispatchEvent(new Event("change", { bubbles: true }));
    view({ defaultValue: "a", className: "other" });
    expect(select().value).toBe("c");
  });

  it("prefers value when both are given", () => {
    view({ value: "a", defaultValue: "b" });
    expect(select().value).toBe("a");
  });

  it("leaves the first option selected without a defaultValue", () => {
    view({});
    expect(select().value).toBe("a");
  });
});
