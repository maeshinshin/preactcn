// Opens every built component page (dist/ served statically, so build it with the default BASE_PATH) in headless Firefox: every section island must hydrate (body[data-mounted] counts them, one per [data-section] frame),
// the first trigger must click without an uncaught error or console.error (collected by public/collect-errors.js). Exit 1 on any failure.
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { clickTrigger, sleep, startBrowser } from "../../consumer/scripts/webdriver.mjs";

const port = 4399;
const preview = spawn("python3", ["-m", "http.server", String(port), "-d", "dist"], { stdio: "ignore", detached: true });
const names = readdirSync("dist/components");
let b;
let ok = 0;
let total = 0;
try {
  for (const end = Date.now() + 30_000; Date.now() < end && !(await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok, () => false)); ) await sleep(200);
  b = await startBrowser();
  for (const name of names) {
    const sections = (readFileSync(`dist/components/${name}/index.html`, "utf8").match(/ data-section[ >=]/g) ?? []).length;
    sections && (total += sections);
    const hasExample = sections > 0;
    const mounted = () => b.exec("return Number(document.body.dataset.mounted ?? 0)");
    await b.wd("POST", "/actions", { actions: [{ type: "pointer", id: "mouse", actions: [{ type: "pointerMove", x: 0, y: 0 }] }] });
    await b.wd("POST", "/url", { url: `http://127.0.0.1:${port}/components/${name}/` });
    for (const end = Date.now() + 10_000; hasExample && Date.now() < end && (await mounted()) < sections; ) await sleep(50);
    await sleep(300);
    const problems = [];
    if (hasExample && (await mounted()) !== sections) problems.push(`${await mounted()} of ${sections} section islands hydrated within 10s`);
    if (hasExample) await clickTrigger(b, "document.querySelector('[data-example]')").catch((e) => problems.push(`click: ${e.message}`));
    await sleep(300);
    problems.push(...(await b.exec("return window.__errors")));
    if (problems.length) console.log(`FAIL ${name}: ${problems[0].split("\n")[0]}`);
    else ok++;
  }
} finally {
  await b?.close();
  process.kill(-preview.pid);
}
console.log(`${ok}/${names.length} pages ok, ${total} sections`);
process.exitCode = ok === names.length ? 0 : 1;
