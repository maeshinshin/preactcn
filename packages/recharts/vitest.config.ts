import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// PREACT=11 runs the suite on the preact11 alias dependency. Packages that import preact are inlined so the alias reaches them too.
// `recharts` is what the stress page (written like upstream code) imports and `@preactcn/recharts` what the converted shadcn chart imports:
// the tests point both at the built package.
const preact11 = process.env.PREACT === "11"
const here = (path: string) => fileURLToPath(new URL(`./${path}`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^(@preactcn\/)?recharts$/, replacement: here("dist/index.js") },
      { find: /^@\/components\/ui\/chart$/, replacement: here("test/.gen/ui/chart.tsx") },
      { find: /^@\/components\/ui\/card$/, replacement: here("test/stubs/card.tsx") },
      { find: /^@\/components\/example$/, replacement: here("test/stubs/example.tsx") },
      { find: /^@\/lib\/utils$/, replacement: here("test/stubs/utils.ts") },
      ...(preact11 ? [{ find: /^preact(?=\/|$)/, replacement: "preact11" }] : []),
    ],
  },
  test: {
    environment: "happy-dom",
    globalSetup: ["test/global-setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    server: { deps: { inline: preact11 ? ["preact-render-to-string"] : [] } },
  },
})
