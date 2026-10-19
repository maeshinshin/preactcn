// Mounts every consumer/src/examples/*.tsx in headless Firefox (via geckodriver's WebDriver HTTP API), clicks the first
// "-trigger" and records uncaught errors, unhandled rejections and console.error. Writes .verify/<PREACT>/browser.json.
// TARGET_URL=<prefix> mounts <prefix><name> of a running server instead (the Fresh app, whose pages set body[data-mounted]
// and load collect-errors.js) and writes .verify/fresh/browser.json.
// DEV=1 mounts from a `vite dev` server instead of a production build, which differs (unbundled modules, dependencies optimized by esbuild,
// Prefresh, NODE_ENV "development"), writes .verify/<PREACT>/dev.json and exits 1 if an example fails; ONLY=a,b limits the examples.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build, createServer, preview } from "vite";
import { clickTrigger, mount, sleep, startBrowser } from "./webdriver.mjs";

const target = process.env.TARGET_URL;
const dir = `.verify/${target ? "fresh" : (process.env.PREACT ?? "10")}`;
const outDir = resolve(dir, "browser-dist");
const dev = process.env.DEV === "1";
const names = readdirSync("src/examples")
  .map((f) => f.replace(/\.tsx$/, ""))
  .filter((n) => !process.env.ONLY || process.env.ONLY.split(",").includes(n));

let server;
if (dev) {
  server = await createServer({ logLevel: "silent", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
} else if (!target) {
  await build({ logLevel: "silent", build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve("browser.html") } } });
  server = await preview({ logLevel: "silent", build: { outDir }, preview: { host: "127.0.0.1", port: 0 } });
}
const out = {};
let b;

// Tailwind skips git-ignored files, so a missing @source in the stylesheet leaves every component unstyled and still mounting.
// A button and an example's content box must not keep the display the browser gives them without CSS.
const unstyled = `return [["button", "inline-block"], ["example-content", "block"]].flatMap(([slot, ua]) => {
  const el = document.querySelector('[data-slot="' + slot + '"]');
  return el && getComputedStyle(el).display === ua ? ["no utility CSS: " + slot + " has display " + ua] : [];
})`;

try {
  b = await startBrowser();
  const url = target ?? `${server.resolvedUrls.local[0]}browser.html?example=`;

  for (const name of names) {
    let found = await mount(b, url + name);
    if (!found.length) found = await b.exec(unstyled);
    if (!found.length) {
      await clickTrigger(b).catch((e) => found.push(`click: ${e.message}`));
      await sleep(300);
      found = [...found, ...(await b.exec("return window.__errors"))];
    }
    out[name] = found.length ? { ok: false, error: found[0].split("\n")[0] } : { ok: true };
  }
} finally {
  await b?.close();
  await server?.close();
}

mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/${dev ? "dev" : "browser"}.json`, JSON.stringify(out, null, 2));
const ok = Object.values(out).filter((r) => r.ok).length;
const failed = Object.entries(out).find(([, r]) => !r.ok);
if (dev && failed) (console.log(`${failed[0]}: ${failed[1].error}`), (process.exitCode = 1));
console.log(`${ok}/${names.length} examples ok${dev ? " (vite dev)" : ""}`);
