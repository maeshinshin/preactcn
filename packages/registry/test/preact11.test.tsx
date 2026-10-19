import * as preact from "preact"
import { expect, test } from "vitest"

// The tests do not load @types/node, and adding it would change the global types of the shims
declare const process: { env: { PREACT?: string } }

// Preact 11 has createPortal in core, Preact 10 only in preact/compat. Fails when the alias in vitest.config.ts stops reaching
// preact, which would make test:preact11 silently run on Preact 10.
test("the suite runs on the Preact version it was asked to", () => {
  expect("createPortal" in preact).toBe(process.env.PREACT === "11")
})
