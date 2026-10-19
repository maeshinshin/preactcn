import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["test/**/*.test.tsx"],
      // the first example pays the cold transform of the shared imports; 5s was too short on GitHub runners
      testTimeout: 30_000,
      server: { deps: { inline: true } },
    },
  })
);
