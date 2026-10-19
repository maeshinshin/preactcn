import registry from "../../packages/registry/registry.json";
import { existsSync, readFileSync } from "node:fs";

// paths are relative to site/, where astro runs (import.meta.url points into dist/ during the build)
// name -> category; a ui item missing here (a new upstream release) lands in "Other" without breaking the build
const categories: Record<string, string[]> = {
  Form: ["button", "button-group", "calendar", "checkbox", "combobox", "field", "input", "input-group", "input-otp", "label", "native-select", "radio-group", "select", "slider", "switch", "textarea", "toggle", "toggle-group"],
  Overlay: ["alert-dialog", "command", "context-menu", "dialog", "drawer", "dropdown-menu", "hover-card", "popover", "sheet", "tooltip"],
  Navigation: ["breadcrumb", "menubar", "navigation-menu", "pagination", "sidebar", "tabs"],
  Layout: ["accordion", "aspect-ratio", "card", "carousel", "collapsible", "direction", "resizable", "scroll-area", "separator"],
  "Data display": ["avatar", "badge", "chart", "code-block", "empty", "item", "kbd", "table"],
  Feedback: ["alert", "progress", "skeleton", "sonner", "spinner"],
  "Chat / AI": ["attachment", "bubble", "marker", "message", "message-scroller", "questionnaire", "trace"],
};
const byName = new Map(Object.entries(categories).flatMap(([category, names]) => names.map((n) => [n, category] as const)));

export type Item = { name: string; category: string; docs?: string; example: boolean };

export const items: Item[] = registry.items
  .filter((i) => i.type === "registry:ui")
  .map(({ name }) => {
    const upstream = `../packages/pipeline/upstream/radix-nova/${name}.json`;
    const docs: string | undefined = existsSync(upstream) ? JSON.parse(readFileSync(upstream, "utf8")).meta?.links?.docs : undefined;
    return { name, category: byName.get(name) ?? "Other", docs, example: existsSync(`src/examples/${name}-example.tsx`) };
  });

export const grouped = [...new Set([...Object.keys(categories), "Other"])]
  .map((category) => ({ category, items: items.filter((i) => i.category === category) }))
  .filter((g) => g.items.length);
