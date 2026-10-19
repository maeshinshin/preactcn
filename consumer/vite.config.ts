import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// PREACT=11 swaps every preact import, including those inside dependencies, for the preact11 alias dependency
const preact11 = process.env.PREACT === "11";

export default defineConfig({
  plugins: [preact({ reactAliasesEnabled: false }), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: src("./src") },
      { find: "next/image", replacement: src("./src/shims/next-image.tsx") },
      { find: "next/link", replacement: src("./src/shims/next-link.tsx") },
      { find: "@ai-sdk/react", replacement: src("./src/shims/ai-sdk-react.ts") },
      { find: /^ai$/, replacement: src("./src/shims/ai.ts") },
      { find: "streamdown", replacement: src("./src/shims/streamdown.tsx") },
      ...(preact11
        ? [
            { find: /^preact(?=\/|$)/, replacement: "preact11" },
          ]
        : []),
    ],
  },
});
