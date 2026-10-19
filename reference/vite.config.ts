import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: src("./src") },
      { find: "next/image", replacement: src("./src/shims/next-image.tsx") },
      { find: "next/link", replacement: src("./src/shims/next-link.tsx") },
      { find: "@ai-sdk/react", replacement: src("./src/shims/ai-sdk-react.ts") },
      { find: /^ai$/, replacement: src("./src/shims/ai.ts") },
      { find: "streamdown", replacement: src("./src/shims/streamdown.tsx") },
    ],
  },
  server: { port: 15173 },
});
