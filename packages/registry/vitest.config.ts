import { defineConfig } from "vitest/config"

// PREACT=11 runs the suite on the preact11 alias dependency. Packages that import preact are inlined so the alias reaches them too.
const preact11 = process.env.PREACT === "11"

export default defineConfig({
  resolve: { alias: preact11 ? [{ find: /^preact(?=\/|$)/, replacement: "preact11" }] : [] },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    server: { deps: { inline: preact11 ? ["@testing-library/preact", "preact-render-to-string"] : [] } },
  },
})
