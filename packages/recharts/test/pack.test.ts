// @vitest-environment node
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { pack } from "../scripts/pack.ts"

const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"))
const directory = mkdtempSync(join(tmpdir(), "pack-"))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe("the local registry entry", () => {
  it("answers an npm client with the tarball and its integrity", () => {
    pack("http://localhost:8080/npm/", directory)
    const packument = JSON.parse(readFileSync(join(directory, "@preactcn/recharts"), "utf8"))
    const { dist } = packument.versions[manifest.version]
    const tarball = readFileSync(join(directory, `recharts-${manifest.version}.tgz`))
    expect(packument["dist-tags"].latest).toBe(manifest.version)
    expect(dist.tarball).toBe(`http://localhost:8080/npm/recharts-${manifest.version}.tgz`)
    expect(dist.integrity).toBe(`sha512-${createHash("sha512").update(tarball).digest("base64")}`)
    expect(packument.versions[manifest.version].dependencies).toEqual(manifest.dependencies)
  })
})
