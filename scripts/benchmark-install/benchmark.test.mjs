import assert from "node:assert/strict"
import { test } from "node:test"
import { summary } from "./benchmark.mjs"

test("reports medians and pnpm/aube ratios without mixing scenarios", () => {
  const rows = []
  for (const [tool, scenario, times] of [
    ["pnpm", "cold", [10, 30, 20]],
    ["aube", "cold", [8, 4, 6]],
    ["pnpm", "warm", [2, 4]],
    ["aube", "warm", [1, 2]],
  ]) {
    for (const seconds of times) {
      rows.push({ tool, scenario, seconds })
    }
  }
  assert.match(summary(rows), /cold \| 20\.000 \| 6\.000 \| 3\.33x/)
  assert.match(summary(rows), /warm \| 3\.000 \| 1\.500 \| 2\.00x/)
  assert.doesNotMatch(summary(rows), /NaN|Infinity/)
})
