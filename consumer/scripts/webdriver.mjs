// Headless Firefox through geckodriver's WebDriver HTTP API, shared by browser.mjs (mount smoke) and diff.mjs (React vs Preact).
import { spawn } from "node:child_process";

export const ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// No images: the examples load avatars and photos from the network, and when they arrive (not a markup change) decides whether two browsers
// screenshot the same pixels, so the diff stage failed at random. Blocked, an avatar shows its fallback in both.
export async function startBrowser() {
  const gecko = spawn("geckodriver", ["--port", "0"], { stdio: ["ignore", "pipe", "ignore"] });
  const ready = new Promise((done, fail) => {
    gecko.once("error", fail);
    gecko.stdout.on("data", (d) => {
      const port = /Listening on 127\.0\.0\.1:(\d+)/.exec(d)?.[1];
      if (port) done(`http://127.0.0.1:${port}`);
    });
  });
  const call = async (method, path, body) => {
    const response = await fetch((await ready) + path, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
    const { value } = await response.json();
    if (value?.error) throw new Error(`${value.error}: ${value.message}`);
    return value;
  };
  const created = await call("POST", "/session", { capabilities: { alwaysMatch: { browserName: "firefox", "moz:firefoxOptions": { args: ["-headless"], prefs: { "permissions.default.image": 2 } } } } }).catch((e) => {
    gecko.kill();
    throw e;
  });
  const session = created.sessionId;
  const wd = (method, path, body) => call(method, `/session/${session}${path}`, body);
  await wd("POST", "/window/rect", { width: 1000, height: 720 });
  return {
    wd,
    exec: (script, args = []) => wd("POST", "/execute/sync", { script, args }),
    async close() {
      await call("DELETE", `/session/${session}`).catch(() => {});
      gecko.kill();
    },
  };
}

// opens url and waits for the page to set body[data-mounted] (or collect an error); returns the collected errors
export async function mount(b, url) {
  // the pointer rests where the previous click left it, and whatever is under it on the next page gets hovered (a navigation menu then toggles shut on click)
  await b.wd("POST", "/actions", { actions: [{ type: "pointer", id: "mouse", actions: [{ type: "pointerMove", x: 0, y: 0 }] }] });
  await b.wd("POST", "/url", { url });
  const end = Date.now() + 10_000;
  while (Date.now() < end && !(await b.exec("return document.body.dataset.mounted !== undefined || window.__errors.length > 0"))) await sleep(50);
  await sleep(300); // effects and rAF callbacks run after the first paint
  const found = await b.exec("return window.__errors");
  return !found.length && !(await b.exec("return document.body.dataset.mounted !== undefined")) ? ["not mounted within 10s"] : found;
}

// clicks the first "-trigger", or the first button of an example without one (sonner-example raises its toast that way); false when
// there is neither or WebDriver cannot click it, throws on any other click failure
// shortcut: a trigger WebDriver cannot click (hidden, covered) is skipped, not failed; list them if that hides real gaps
// `scope` is a JS expression for the root to search in (the site scopes it to its preview frame, away from its own header and tabs)
export async function clickTrigger(b, scope = "document") {
  const trigger = await b.exec(`const root = ${scope}; return root.querySelector('[data-slot$="-trigger"]') ?? root.querySelector('[data-slot="button"]')`);
  if (!trigger) return false;
  const main = await b.wd("GET", "/window");
  try {
    await b.wd("POST", `/element/${trigger[ELEMENT]}/click`, {});
    return true;
  } catch (e) {
    if (/not interactable|intercepted/.test(e.message)) return false;
    throw e;
  } finally {
    // a link trigger opens a new tab, which would leave the driven one in the background for good: hidden, no animation frames, throttled timers
    for (const handle of await b.wd("GET", "/window/handles")) {
      if (handle === main) continue;
      await b.wd("POST", "/window", { handle });
      await b.wd("DELETE", "/window");
    }
    await b.wd("POST", "/window", { handle: main });
  }
}
