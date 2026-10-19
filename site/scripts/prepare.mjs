// Makes site/ another consumer of the registry: shadcn add of every ui item (REGISTRY_URL, default the local server on :8080),
// then the converted examples and the app-only stand-ins from ../consumer/src (written by packages/pipeline/scripts/verify.sh, like the Fresh app's copy).
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const sh = (cmd) => spawnSync(cmd, { shell: true, stdio: "inherit" }).status;
const root = "..";
const shadcn = readFileSync(`${root}/packages/pipeline/upstream/RELEASE`, "utf8").trim();
const all = JSON.parse(readFileSync(`${root}/packages/registry/registry.json`, "utf8")).items;
const names = all.filter((i) => i.type === "registry:ui").map((i) => i.name);
// an example may import a shim that no ui item depends on (calendar-example and react-day-picker/locale)
const install = [...names, ...all.filter((i) => i.name.startsWith("shim-")).map((i) => i.name)];

if (!existsSync(`${root}/consumer/src/examples`)) throw new Error("consumer/src/examples is missing: run packages/pipeline/scripts/verify.sh first");
for (const dir of ["components", "hooks", "lib", "examples", "shims", "app", "islands"]) rmSync(`src/${dir}`, { recursive: true, force: true });
rmSync("src/sections.json", { force: true });

if (process.env.REGISTRY_URL) {
  const config = JSON.parse(readFileSync("components.json", "utf8"));
  config.registries["@preactcn"] = process.env.REGISTRY_URL;
  writeFileSync("components.json", JSON.stringify(config, null, 2) + "\n");
}
// the @preactcn/recharts tarball is rebuilt on every verify run, so its pin (version, integrity) is forgotten first as in verify.sh
sh("pnpm remove @preactcn/recharts >/dev/null 2>&1");
if (sh("pnpm install --frozen-lockfile") !== 0) throw new Error("pnpm install failed");
// sections.mjs imports typescript, which only the install above provides: a static import would fail on a fresh checkout
const { analyze } = await import("./sections.mjs");
if (sh(`pnpm dlx ${shadcn} add ${install.map((n) => `@preactcn/${n}`).join(" ")} --overwrite --yes`) !== 0) throw new Error("shadcn add failed");

for (const path of ["examples", "components/example.tsx", "components/message-parts.ts", "lib/ai.ts", "shims", "app"])
  cpSync(`${root}/consumer/src/${path}`, `src/${path}`, { recursive: true });

// sections of every example (see sections.mjs): the page renders one island per section, an example that does not split stays one whole
const withExample = names.filter((n) => existsSync(`src/examples/${n}-example.tsx`));
const sections = {};
const unsplit = {};
for (const name of withExample) {
  const file = `src/examples/${name}-example.tsx`;
  const full = readFileSync(file, "utf8");
  const { sections: found, reason } = analyze(full);
  if (found) appendFileSync(file, `\nexport { ${found.filter((s) => !s.exported).map((s) => s.fn).join(", ")} };\n`); // the islands import them
  else unsplit[name] = reason;
  sections[name] = { full, sections: found?.map(({ fn, id, title, code }) => ({ fn, id, title, code })) ?? [{ fn: "default", id: "example", title: "", code: full }] };
}
writeFileSync("src/sections.json", JSON.stringify(sections));

// one island module per example, rendering the section it is given: it carries the TooltipProvider the docs app wraps examples in, and a shared chunk per example.
// Astro only hydrates a component it sees imported by name, so Islands.astro imports and switches over all of them
const id = (n) => `I_${n.replaceAll("-", "_")}`;
mkdirSync("src/islands", { recursive: true });
for (const name of withExample)
  writeFileSync(`src/islands/${name}.tsx`, `import { demo } from "../demo";\nimport * as example from "../examples/${name}-example";\nexport default demo(example);\n`);
writeFileSync(
  "src/islands/Islands.astro",
  `---\n${withExample.map((n) => `import ${id(n)} from "./${n}";`).join("\n")}\nconst { name, section } = Astro.props;\n---\n` +
    withExample.map((n) => `{name === "${n}" && <${id(n)} client:load section={section} />}`).join("\n") + "\n",
);
console.log(`prepared ${names.length} items, ${withExample.length} examples, ${Object.values(sections).reduce((n, e) => n + e.sections.length, 0)} sections`);
for (const [name, reason] of Object.entries(unsplit)) console.log(`  whole example: ${name} (${reason})`);
