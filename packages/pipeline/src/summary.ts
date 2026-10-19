export type Status = "pass" | "fail" | "blocked" | "n/a"

export const stageKeys = (v: string) => [`tsc${v}`, `build${v}`, `ssr${v}`, `browser${v}`]

// The columns one summary line counts. The diff compares the React original with a single Preact version (`diffed`), so only that line owns dom and pixels.
export function summaryKeys(line: string, diffed: string | undefined): string[] {
  if (line === "fresh") return ["generate", "add", "fresh"]
  return ["generate", "add", ...stageKeys(line), ...(line === diffed ? ["dom", "pixels"] : [])]
}

export function tally(rows: { name: string; stages: Record<string, Status> }[], keys: string[]) {
  const has = (r: (typeof rows)[number], status: Status) => keys.some((k) => r.stages[k] === status)
  const failing = rows.filter((r) => has(r, "fail"))
  const waiting = rows.filter((r) => !has(r, "fail") && has(r, "blocked"))
  return {
    passing: rows.length - failing.length - waiting.length,
    blocked: waiting.map((r) => r.name),
    failing: failing.map((r) => r.name),
  }
}

// Lines of a diff that only moved: the same line (indentation included) is removed in one place and added in another, as when
// siblings come in another order. Each removed line pairs with one added line.
export function movedLines(lines: string[]): Set<number> {
  const seen = new Map<string, { "-": number[]; "+": number[] }>()
  lines.forEach((line, i) => {
    const m = /^([-+]) (.*)$/s.exec(line)
    if (!m) return
    const entry = seen.get(m[2]!) ?? { "-": [], "+": [] }
    entry[m[1] as "-" | "+"].push(i)
    seen.set(m[2]!, entry)
  })
  const moved = new Set<number>()
  for (const e of seen.values()) for (let k = 0; k < Math.min(e["-"].length, e["+"].length); k++) moved.add(e["-"][k]!).add(e["+"][k]!)
  return moved
}
