// Usage: node scripts/pack.ts <registry URL> <directory>   (after `pnpm build`)
// Lays the package out the way an npm registry serves it, for a static file server: <directory>/<name>-<version>.tgz and the packument
// (the registry's answer to `GET /@scope%2fname`) at <directory>/@scope/name. Pointing `@preactcn:registry` at <registry URL> in an
// .npmrc then lets pnpm and Deno install the exact version a user gets from npm, without publishing; see scripts/verify.sh.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

export function pack(registry: string, directory: string): void {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const file = `${manifest.name.split("/").pop()}-${manifest.version}.tgz`
  mkdirSync(join(directory, dirname(manifest.name)), { recursive: true })
  execFileSync("pnpm", ["pack", "--out", join(directory, file)], { cwd: root, stdio: "ignore" })
  const integrity = `sha512-${createHash("sha512").update(readFileSync(join(directory, file))).digest("base64")}`
  const dist = { tarball: `${registry.replace(/\/$/, "")}/${file}`, integrity }
  const packument = { name: manifest.name, "dist-tags": { latest: manifest.version }, versions: { [manifest.version]: { ...manifest, dist } } }
  writeFileSync(join(directory, manifest.name), JSON.stringify(packument))
}

if (process.argv[1] === import.meta.filename) {
  const [registry, directory] = process.argv.slice(2)
  if (!registry || !directory) throw new Error("usage: node scripts/pack.ts <registry URL> <directory>")
  pack(registry, resolve(directory))
}
