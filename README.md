# preactcn

shadcn/ui components for Preact. Every upstream shadcn/ui release is converted automatically to Preact: no React, no `preact/compat`, Preact 10 and 11, Vite and Deno Fresh 2. The components are served as a shadcn registry (`@preactcn`) and installed into your project with the official `shadcn` CLI, so you own the code, as with shadcn/ui.

## Vite + Preact + Tailwind v4

Start from `npm create vite@latest my-app -- --template preact-ts`, then in the project:

**1. Dependencies.** The registry items add the rest (`clsx`, `class-variance-authority`, `lucide-preact`, ...) when you install them.

```sh
pnpm add tailwindcss @tailwindcss/vite tw-animate-css shadcn
```

**2. `vite.config.ts`**

```ts
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

**3. `tsconfig.app.json`**: replace the template's `react` and `react-dom` entries in `paths` (nothing here uses `preact/compat`). Do not add `baseUrl` (deprecated in TypeScript 6).

```json
"paths": { "@/*": ["./src/*"] },
```

The `shadcn` CLI reads `paths` from `tsconfig.json`, not from `tsconfig.app.json`, so add the same entry there:

```json
{
  "files": [],
  "compilerOptions": { "paths": { "@/*": ["./src/*"] } },
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**4. `src/index.css`**: replace the template's file with this theme (the shadcn "neutral" theme, `radix-nova` style).

<details>
<summary>src/index.css</summary>

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-heading: var(--font-sans);
  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-foreground: var(--foreground);
  --color-background: var(--background);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

</details>

**5. `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {
    "@preactcn": "https://maeshinshin.github.io/preactcn/r/{name}.json"
  }
}
```

**6. Add components**

```sh
npx shadcn@latest add @preactcn/button @preactcn/dialog @preactcn/select
```

```tsx
import { Button } from "@/components/ui/button";

export function App() {
  return <Button variant="outline">Hello</Button>;
}
```

The registry follows the latest shadcn release, so use the latest CLI.

## Deno Fresh 2

Tested with Fresh 2.3 (Preact 10) and Deno 2.9. The `shadcn` CLI treats the folder as a Node project, so the setup adds a few files for it next to Fresh's own.

**1. Create the app**

```sh
deno run -A jsr:@fresh/init ./my-app --tailwind
cd my-app
```

**2. Dependencies.** Create an empty `package.json` first: without it the CLI starts its new-project prompt, and with it `deno add` writes npm packages there (the registry items add the rest when you install them).

```sh
echo '{}' > package.json
deno add npm:shadcn npm:tw-animate-css
```

**3. `tsconfig.json`**: only the CLI reads it, to resolve the `@/` aliases. Deno resolves `@/` through the `"@/": "./"` entry that `@fresh/init` already wrote into `deno.json`.

```json
{
  "compilerOptions": { "paths": { "@/*": ["./*"] } }
}
```

**4. `deno.json`**: add `sloppy-imports`. The installed files import `./internal/x` and `@/lib/utils` without extensions; the Vite build resolves them, `deno check` needs this.

```json
"unstable": ["sloppy-imports"]
```

**5. `assets/styles.css`**: replace Fresh's file with the theme from step 4 of the Vite section (`client.ts` already imports it).

**6. `components.json`**: as in the Vite section, with the CSS path `assets/styles.css`.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "assets/styles.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {
    "@preactcn": "https://maeshinshin.github.io/preactcn/r/{name}.json"
  }
}
```

**7. Add components.** `--no-config` keeps Deno from holding the CLI to the version in `package.json`.

```sh
deno run -A --no-config npm:shadcn@latest add @preactcn/button @preactcn/dialog @preactcn/tooltip
```

**8. Use them in an island.** Islands are separate render roots and context does not cross them, so a provider goes inside each island that needs it: `TooltipProvider` for `tooltip` and anything built on it, `Toaster` for `sonner`.

`islands/Demo.tsx`

```tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function Demo() {
  return (
    <TooltipProvider>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hello from Fresh</DialogTitle>
            <DialogDescription>preactcn components, no React.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent>Tooltip</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

`routes/index.tsx`

```tsx
import Demo from "../islands/Demo.tsx";

export default function Home() {
  return (
    <main class="p-8">
      <Demo />
    </main>
  );
}
```

```sh
deno task dev
```

If you git-ignore the component folders, register them with `@source` in `assets/styles.css`: Tailwind skips git-ignored files.

## Notes

- `chart` depends on the npm package `@preactcn/recharts`, recharts converted to Preact with the same method. It is installed from npm, not copied into your project.
- The shims for React-only libraries (Radix, cmdk, sonner, vaul, react-day-picker, embla-carousel, ...) are copied into your project under `src/lib/radix` and `src/lib/shims`, and implement only what the upstream components use. For example, `sonner` has `toast`, `toast.success/info/warning/error/loading/dismiss` and `Toaster`, but not `toast.promise`, `toast.custom` or `toast.message`; the `calendar` locales are `es` only (other date-fns locales work with English labels).
- Upstream components take `ref` as a prop (React 19). Preact 11 does that natively; on Preact 10 the shims install a small `options.vnode` hook that does the same.

## How it works

A daily job checks for a new shadcn release. A new release is snapshotted, rewritten by an AST codemod (imports, React types, Radix and other React libraries to the copied Preact shims), type-checked, built, rendered on Preact 10, Preact 11 and Fresh, and compared with the React original (DOM and screenshots). Only a green run is published.

## License

[Apache License 2.0](LICENSE); see [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) for the MIT-licensed projects this code derives from. `packages/recharts` is a conversion of recharts and keeps recharts' MIT license.
