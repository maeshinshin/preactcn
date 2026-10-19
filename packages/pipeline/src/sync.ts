// Usage: pnpm sync [shadcn@x.y.z]   (default: the npm `latest` of shadcn)
// Refreshes upstream/radix-nova/ from the built registry at ui.shadcn.com, records the release in upstream/RELEASE
// re-adds every item to reference/ so the React twin matches the snapshot, and regenerates packages/recharts (the recharts version
// chart.json pins may have changed: the converter follows it, rewrites version and dependencies, and the lockfile is re-locked).
// The built items are not committed at the release tags (apps/v4/public/r/styles/radix-nova/ does not exist there);
// the site serves main, so a change to the watched sources after the tag means the snapshot is ahead of the release.
// shortcut: that drift is only reported, and the compare API lists at most 300 files; build the tag with apps/v4/scripts/build-registry.mts to be exact.
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "../../..")
const upstreamDir = join(root, "packages/pipeline/upstream")
const SITE = "https://ui.shadcn.com/r/styles/radix-nova"
const TYPES = new Set(["registry:ui", "registry:example", "registry:lib", "registry:hook", "registry:component"])
const WATCHED = ["apps/v4/registry/bases/radix/", "apps/v4/registry/styles/style-nova.css", "apps/v4/registry/icons/"]

export function assertTag(tag: string): void {
  if (!/^shadcn@\d+\.\d+\.\d+$/.test(tag)) throw new Error(`not a shadcn release tag (shadcn@x.y.z): ${tag}`)
}

// items the pipeline converts: the site lists more (fonts, blocks, styles), and form has no files
export function wanted(items: { name: string; type: string; files?: unknown[] }[]): string[] {
  return items
    .filter((i) => TYPES.has(i.type) && i.files?.length)
    .map((i) => i.name)
    .sort()
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}

async function drift(tag: string): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN
  const res = await fetch(`https://api.github.com/repos/shadcn-ui/ui/compare/${encodeURIComponent(tag)}...main`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
  if (res.status === 404) throw new Error(`${tag} is not a tag of shadcn-ui/ui`)
  if (!res.ok) {
    console.warn(`warning: could not compare ${tag} with main (HTTP ${res.status}), drift unchecked`)
    return []
  }
  const { files } = (await res.json()) as { files: { filename: string }[] }
  return files.map((f) => f.filename).filter((p) => WATCHED.some((w) => p.startsWith(w)) && !p.includes("/blocks/"))
}

async function main(): Promise<void> {
  const tag = process.argv[2] ?? `shadcn@${((await (await get("https://registry.npmjs.org/shadcn/latest")).json()) as { version: string }).version}`
  assertTag(tag)
  const ahead = await drift(tag)
  const index = (await (await get(`${SITE}/registry.json`)).json()) as { items: Parameters<typeof wanted>[0] }
  const names = wanted(index.items)
  const texts = await Promise.all(names.map(async (name) => [name, await (await get(`${SITE}/${name}.json`)).text()] as const))

  const dir = join(upstreamDir, "radix-nova")
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const [name, text] of texts) writeFileSync(join(dir, `${name}.json`), text)
  writeFileSync(join(upstreamDir, "RELEASE"), `${tag}\n`)
  console.log(`${tag}: ${names.length} items in upstream/radix-nova`)
  if (ahead.length) console.warn(`warning: ui.shadcn.com serves main, which changed ${ahead.length} watched file(s) after ${tag}; the snapshot may include unreleased changes:\n  ${ahead.join("\n  ")}`)

  // pnpm dlx takes the tag as the package spec, and shadcn skips files that are already identical
  execFileSync("pnpm", ["dlx", tag, "add", ...names.filter((n) => n !== "utils"), "--overwrite", "--yes"], {
    cwd: join(root, "reference"),
    stdio: "inherit",
  })
  execFileSync("pnpm", ["recharts"], { cwd: join(root, "packages/pipeline"), stdio: "inherit" })
  // CI installs with --frozen-lockfile by default, which would refuse the new dependencies
  execFileSync("pnpm", ["install", "--no-frozen-lockfile"], { cwd: join(root, "packages/recharts"), stdio: "inherit" })
}

if (process.argv[1] === import.meta.filename) await main()
