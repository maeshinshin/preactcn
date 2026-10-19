import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const src = (path) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

// SITE_URL and BASE_PATH come from the Pages deploy (the repository's Pages origin and path); local dev serves from /
export default defineConfig({
  site: process.env.SITE_URL,
  base: process.env.BASE_PATH ?? "/",
  markdown: { shikiConfig: { themes: { light: "github-light", dark: "github-dark" }, defaultColor: false } },
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: [
        { find: "@", replacement: src("") },
        // stand-ins for the docs app imports of the upstream examples, the same as consumer/vite.config.ts
        { find: "next/image", replacement: src("shims/next-image.tsx") },
        { find: "next/link", replacement: src("shims/next-link.tsx") },
        { find: "@ai-sdk/react", replacement: src("shims/ai-sdk-react.ts") },
        { find: /^ai$/, replacement: src("shims/ai.ts") },
        { find: "streamdown", replacement: src("shims/streamdown.tsx") },
      ],
    },
  },
});
