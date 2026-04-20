import { search } from "jmespath"
import { Table } from "console-table-printer"
import { format } from "@fast-csv/format"
import { plot } from "simple-ascii-chart"
import { writeFileSync } from "node:fs"
import { Writable } from "node:stream"
import { progress } from "../sandy.js"

progress("Image baseline checks starting...")

const outputDir = process.env.SANDY_OUTPUT
if (!outputDir) {
  console.error("SANDY_OUTPUT not set")
  process.exit(1)
}

progress("Checking packaged utility libraries...\n")

// Verify jmespath works
const testData = {
  packages: [
    { name: "jmespath", status: "ok" },
    { name: "console-table-printer", status: "ok" },
    { name: "@fast-csv/format", status: "ok" },
  ],
}

const names: string[] = search(testData, "packages[].name")

console.log("JMESPath filter:", names)

// Verify console-table-printer works
const table = new Table({
  title: "Sandy Baseline Check",
  columns: [
    { name: "package", alignment: "left" },
    { name: "status", alignment: "left" },
  ],
})

for (const pkg of testData.packages) {
  table.addRow({ package: pkg.name, status: pkg.status })
}

table.printTable()

// Verify fast-csv works
const rows: string[] = []
const stream = format({ headers: true })
stream.pipe(
  new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      rows.push(chunk.toString())
      callback()
    },
  }),
)
stream.write({ package: "fast-csv", status: "ok" })
stream.end()

progress("Verifying output directory write...")

// Verify output directory write
const result = {
  timestamp: new Date().toISOString(),
  packages: names,
  status: "pass",
}

const outputPath = `${outputDir}/baseline.json`
writeFileSync(outputPath, JSON.stringify(result, null, 2))
console.log(`Output written to: ${outputPath}`)

// Verify simple-ascii-chart works
const chartOutput = plot(
  [
    [1, 1],
    [2, 4],
    [3, 9],
    [4, 16],
  ],
  { title: "Baseline chart check" },
)
console.log(chartOutput)

progress("Baseline checks complete.")
