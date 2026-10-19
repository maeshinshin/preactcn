// Differential test: every example rendered by the React original (reference/) and by this Preact port, in two headless Firefox sessions.
// Per example and state (mounted, after clicking the first "-trigger", or the first button when there is none): a normalized DOM snapshot of document.body and a screenshot.
// usage: node scripts/diff.mjs <reference-dist> <consumer-dist>   (consumer-dist holds browser.html, see browser.mjs)
// Writes .verify/diff/<name>.{ref,pre,diff}.<state>.png, <name>.dom.txt (the differences; the whole snapshots as <name>.{ref,pre}.<state>.dom.txt
// when they differ) and .verify/diff/diff.json (read by pipeline/src/report.ts).
// ONLY=a,b limits the examples.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { preview } from "vite";
import { clickTrigger, ELEMENT, mount, sleep, startBrowser } from "./webdriver.mjs";

const [refDist, preDist] = process.argv.slice(2).map((p) => resolve(p));
const out = resolve(".verify/diff");
const names = readdirSync("src/examples")
  .map((f) => f.replace(/\.tsx$/, ""))
  .filter((n) => !process.env.ONLY || process.env.ONLY.split(",").includes(n));
mkdirSync(out, { recursive: true });

// Firefox renders both sides alike, so a changed pixel means a changed layout or paint; this is only a cut-off for channel noise
const CHANNEL = 16;

// The three functions below run in the page: they are sent to Firefox as source text, so they must not use anything from this file.

// animations are off so a state is the settled one
function freeze() {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
  document.head.append(style);
  return document.fonts.ready.then(() => true);
}

// one line per element (tag, sorted class tokens as .name, other attributes sorted but style) and per text node, indented by depth.
// Generated ids (React's and Preact's useId, recharts' clip path ids from a global counter) become #<order of definition>.
function snapshot() {
  const ids = new Map();
  const generated = /(?:radix-)?(?:_r_[0-9a-z]+_|:r[0-9a-z]+:|\u00abr[0-9a-z]+\u00bb|\bP[0-9a-z]+-[0-9]+\b)|\brecharts\d+-clip\b/g;
  const normalize = (s) => s.replace(generated, (m) => "#" + (ids.has(m) ? ids : ids.set(m, ids.size)).get(m));
  // defined ids are numbered in document order first, so a reference that only one side renders cannot shift the numbers
  for (const el of document.querySelectorAll("[id]")) normalize(el.id);
  const lines = [];
  const walk = (node, depth) => {
    const pad = "  ".repeat(depth);
    if (node.nodeType === 3) {
      const text = node.data.replace(/\s+/g, " ").trim();
      if (text) lines.push(pad + JSON.stringify(normalize(text)));
    } else if (node.nodeType === 1 && !["SCRIPT", "STYLE", "LINK", "NOSCRIPT"].includes(node.tagName)) {
      const classes = [...node.classList].sort().map((c) => "." + c);
      // React mirrors value, checked and selected into attributes and Preact does not, so form state is read from the properties
      const field = ["input", "textarea", "select"].includes(node.localName);
      const mirrored = (name) => (field && (name === "value" || name === "checked")) || (node.localName === "option" && name === "selected");
      const attrs = [...node.attributes]
        .filter((a) => a.name !== "style" && a.name !== "class" && !mirrored(a.name))
        .map((a) => a.name + "=" + JSON.stringify(normalize(a.value)));
      if (field && node.value) attrs.push("value=" + JSON.stringify(normalize(node.value)));
      if (node.checked || node.selected) attrs.push(node.checked ? "checked" : "selected");
      attrs.sort();
      lines.push(pad + [node.localName, ...classes, ...attrs].join(" "));
      // React also renders a textarea's value as its text; the value property above covers it
      if (node.localName !== "textarea") for (const child of node.childNodes) walk(child, depth + 1);
    }
  };
  walk(document.body, 0);
  return lines;
}

// decodes two PNGs on a canvas and returns the share of differing pixels (over the larger of the two sizes; the part one image
// lacks is transparent, so it differs) plus a diff PNG when there is a difference
function compare(a, b, channel) {
  const load = (b64) =>
    new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => fail(new Error("bad png"));
      img.src = "data:image/png;base64," + b64;
    });
  return Promise.all([load(a), load(b)]).then(([x, y]) => {
    const w = Math.max(x.width, y.width), h = Math.max(x.height, y.height);
    const canvas = () => Object.assign(document.createElement("canvas"), { width: w, height: h });
    const pixels = (img) => {
      const g = canvas().getContext("2d");
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, w, h).data;
    };
    const [p, q] = [pixels(x), pixels(y)];
    const [p32, q32] = [new Uint32Array(p.buffer), new Uint32Array(q.buffer)];
    const differs = (k) => p32[k] !== q32[k] && [0, 1, 2, 3].some((c) => Math.abs(p[4 * k + c] - q[4 * k + c]) > channel);
    let count = 0;
    for (let k = 0; k < p32.length; k++) if (differs(k)) count++;
    const size = [x.width, x.height, y.width, y.height];
    if (!count) return { size, ratio: 0, diff: null };
    const out = canvas();
    const g = out.getContext("2d");
    const image = g.createImageData(w, h);
    const d32 = new Uint32Array(image.data.buffer);
    for (let k = 0; k < d32.length; k++) d32[k] = differs(k) ? 0xff0000ff : (p32[k] & 0x00ffffff) | 0x28000000;
    g.putImageData(image, 0, 0);
    return { size, ratio: count / (w * h), diff: out.toDataURL("image/png").slice(22) };
  });
}

const tokens = (line) => line.trim().match(/[^\s"]+="(?:[^"\\]|\\.)*"|\S+/g) ?? [];
const cut = (line) => (line.length > 160 ? `${line.slice(0, 160)}...` : line);

// minimal line diff: common head and tail trimmed, longest common subsequence of the rest; a removed and an added line
// that share indentation and tag are folded into one "~" line naming only the tokens that differ
function lineDiff(a, b) {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a.at(-1 - tail) === b.at(-1 - tail)) tail++;
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  // shortcut: a pair of snapshots too different for the table below is reported whole; raise the cap if real diffs ever hit it
  if (x.length * y.length > 5e7) return [...x.map((l) => `- ${cut(l)}`), ...y.map((l) => `+ ${cut(l)}`)];
  const lcs = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const removed = [], added = [], lines = [];
  const flush = () => {
    for (const r of removed.splice(0)) {
      const k = added.findIndex((l) => l.search(/\S/) === r.search(/\S/) && tokens(l)[0] === tokens(r)[0]);
      if (k < 0) lines.push(`- ${cut(r)}`);
      else {
        const [l] = added.splice(k, 1);
        const [from, to] = [tokens(r), tokens(l)];
        const only = (m, n) => m.filter((t) => !n.includes(t)).join(" ");
        lines.push(`~ ${" ".repeat(r.search(/\S/))}${from[0]}: - ${only(from, to)}  + ${only(to, from)}`);
      }
    }
    lines.push(...added.splice(0).map((l) => `+ ${cut(l)}`));
  };
  for (let i = 0, j = 0; i < x.length || j < y.length; ) {
    if (i < x.length && j < y.length && x[i] === y[j]) (flush(), i++, j++);
    else if (j < y.length && (i === x.length || lcs[i][j + 1] >= lcs[i + 1][j])) added.push(y[j++]);
    else removed.push(x[i++]);
  }
  flush();
  return lines;
}

// Timers (a navigation menu opens 200ms after the pointer arrives) and Preact's effects change the markup late, so a fixed wait
// races: wait until the markup has not changed for 300ms
async function settle(b) {
  let last, calm = 0;
  for (let i = 0; i < 40 && calm < 3; i++) {
    const html = await b.exec("return document.body.innerHTML");
    calm = html === last ? calm + 1 : 0;
    last = html;
    await sleep(100);
  }
}

async function capture(b, url) {
  const errors = await mount(b, url);
  if (errors.length) return { errors };
  await b.exec(`return (${freeze})()`);
  await settle(b);
  const app = await b.exec(`return document.getElementById("app")`);
  const state = async (png) => ({ dom: await b.exec(`return (${snapshot})()`), png: await b.wd("GET", png) });
  const initial = await state(`/element/${app[ELEMENT]}/screenshot`);
  const clicked = await clickTrigger(b);
  let click;
  if (clicked) {
    await settle(b);
    click = await state("/screenshot");
  }
  return { errors: await b.exec("return window.__errors"), initial, click };
}

const servers = await Promise.all([refDist, preDist].map((outDir) => preview({ configFile: false, logLevel: "silent", build: { outDir }, preview: { host: "127.0.0.1", port: 0 } })));
const urls = [`${servers[0].resolvedUrls.local[0]}?example=`, `${servers[1].resolvedUrls.local[0]}browser.html?example=`];
const results = {};
const queue = [...names];

// one worker owns a React and a Preact browser and takes examples from the queue
async function work([ref, pre]) {
  for (let name; (name = queue.shift()); ) {
    const [r, p] = await Promise.all([capture(ref, urls[0] + name), capture(pre, urls[1] + name)]);
    const result = (results[name] = { errors: { reference: r.errors, preact: p.errors }, clicked: Boolean(r.click) || Boolean(p.click), dom: {}, pixels: {} });
    if (!r.initial || !p.initial) continue;
    if (Boolean(r.click) !== Boolean(p.click)) result.dom.click = ["trigger clickable on one side only"];
    const dump = [];
    for (const state of ["initial", "click"]) {
      if (!r[state] || !p[state]) continue;
      const lines = lineDiff(r[state].dom, p[state].dom);
      result.dom[state] = lines;
      dump.push(`# ${state}: - React, + Preact`, ...lines);
      if (lines.length) for (const [side, dom] of [["ref", r[state].dom], ["pre", p[state].dom]]) writeFileSync(`${out}/${name}.${side}.${state}.dom.txt`, dom.join("\n") + "\n");
      const png = (side, shot) => writeFileSync(`${out}/${name}.${side}.${state}.png`, shot, "base64");
      png("ref", r[state].png);
      png("pre", p[state].png);
      const { size, ratio, diff } = await ref.exec(`return (${compare}).apply(null, arguments)`, [r[state].png, p[state].png, CHANNEL]);
      result.pixels[state] = { ratio, size };
      if (diff) png("diff", diff);
    }
    // the one example that raises a toast on the click rule: without this the toast silently drops out of the comparison again
    if (name === "sonner-example" && !p.click?.dom.some((l) => l.includes("data-sonner-toast"))) {
      (result.dom.click ??= []).push("no toast after the click");
      dump.push("# no toast after the click");
    }
    if (dump.length) writeFileSync(`${out}/${name}.dom.txt`, dump.join("\n") + "\n");
  }
}

const browsers = [];
try {
  // two workers: the examples are independent, and a pair alone leaves the machine mostly idle between WebDriver calls
  for (let i = 0; i < 2; i++) browsers.push(await Promise.all([startBrowser(), startBrowser()]));
  await Promise.all(browsers.map(work));
} finally {
  await Promise.all([...browsers.flat().map((b) => b.close()), ...servers.map((s) => s.close())]);
}

writeFileSync(`${out}/diff.json`, JSON.stringify(Object.fromEntries(names.map((n) => [n, results[n]])), null, 2));
console.log(`${names.length} examples compared`);
