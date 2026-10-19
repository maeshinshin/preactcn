// Usage: pnpm build   (after `pnpm recharts` in packages/pipeline has written src/)
// Compiles src to dist (ES modules and .d.ts) and gives every relative specifier its extension.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

// tsc keeps recharts' extensionless specifiers, which a bundler resolves and Node, Deno and TypeScript's node16 resolution do not.
// It also emits the jsx runtime import as `<pragma>/jsx-runtime`, the same shape.
const RELATIVE = /((?:\bfrom|\bimport)\s*\(?\s*)(["'])(\.{1,2}\/[^"']*)\2/g

export function addExtensions(dist: string): number {
  let changed = 0
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(js|d\.ts)$/.test(entry)) {
        const text = readFileSync(path, "utf8")
        const next = text.replace(RELATIVE, (match, head: string, quote: string, specifier: string) => {
          const target = resolve(dirname(path), specifier)
          const has = (file: string) => existsSync(`${file}.js`) || existsSync(`${file}.d.ts`)
          const fixed = has(target) ? `${specifier}.js` : has(join(target, "index")) ? `${specifier.replace(/\/$/, "")}/index.js` : specifier
          return fixed === specifier ? match : `${head}${quote}${fixed}${quote}`
        })
        if (next !== text) (writeFileSync(path, next), changed++)
      }
    }
  }
  walk(dist)
  return changed
}

function main(): void {
  const dist = join(root, "dist")
  rmSync(dist, { recursive: true, force: true })
  const tsc = spawnSync(join(root, "node_modules/.bin/tsc"), ["-p", "tsconfig.build.json"], { cwd: root, encoding: "utf8" })
  if (tsc.error) throw tsc.error
  if (!existsSync(join(dist, "index.js"))) throw new Error(`tsc wrote nothing:\n${tsc.stdout}${tsc.stderr}`)
  // The upstream source type-checks against React's types, the converted one against the adapter's: the declarations are still
  // emitted, and the types of what the package exports are checked by `pnpm typecheck` on code that uses it.
  const errors = (tsc.stdout.match(/error TS\d+/g) ?? []).length
  console.log(`dist: ${addExtensions(dist)} files given extensions, ${errors} type errors in the converted source (declarations emitted)`)
}

if (process.argv[1] === import.meta.filename) main()
