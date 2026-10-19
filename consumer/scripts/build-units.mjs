import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vite";

const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = {};

for (const unit of manifest.units) {
  if (unit.error || unit.entries.length === 0) continue;
  const missing = unit.entries.filter((e) => !existsSync(e));
  if (missing.length) {
    out[unit.name] = { ok: false, error: `Missing file ${missing[0]}` };
    continue;
  }
  try {
    await build({
      logLevel: "silent",
      build: {
        write: false,
        rollupOptions: { input: unit.entries.map((e) => resolve(e)) },
      },
    });
    out[unit.name] = { ok: true };
  } catch (error) {
    out[unit.name] = { ok: false, error: String(error.message ?? error).replace(/\x1b\[[0-9;]*m/g, "").split("\n").slice(0, 3).join("\n") };
  }
}

const dir = `.verify/${process.env.PREACT ?? "10"}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/build.json`, JSON.stringify(out, null, 2));
