import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const scenarios = ["cold", "warm", "noop"]

export function summary(rows) {
  const median = (values) => {
    values.sort((a, b) => a - b)
    const mid = Math.floor(values.length / 2)
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2
  }
  const lines = [
    "| Scenario | pnpm median (s) | Aube median (s) | pnpm / Aube |",
    "| --- | ---: | ---: | ---: |",
  ]
  for (const scenario of scenarios) {
    const times = ["pnpm", "aube"].map((tool) =>
      rows
        .filter((row) => row.tool === tool && row.scenario === scenario)
        .map((row) => row.seconds),
    )
    if (times.some((values) => !values.length)) {
      continue
    }
    const [pnpm, aube] = times.map(median)
    lines.push(
      `| ${scenario} | ${pnpm.toFixed(3)} | ${aube.toFixed(3)} | ${(pnpm / aube).toFixed(2)}x |`,
    )
  }
  return `${lines.join("\n")}\n`
}

// Compare installed name/version sets, independent of .pnpm versus .aube layout.
// Do not follow symlinks, which would revisit packages or introduce cycles.
function installedPackages(directory) {
  const packages = new Set()
  function visit(dir) {
    const manifest = path.join(dir, "package.json")
    if (existsSync(manifest)) {
      const { name, version } = JSON.parse(readFileSync(manifest, "utf8"))
      if (name && version) {
        packages.add(`${name}@${version}`)
      }
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        visit(path.join(dir, entry.name))
      }
    }
  }
  visit(directory)
  return [...packages].sort()
}

function main() {
  const runs = Number(process.env.RUNS || 3)
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("RUNS must be a positive integer")
  }
  const output = process.env.OUTPUT || "/results"
  mkdirSync(output, { recursive: true })
  const commands = Object.fromEntries(
    ["pnpm", "aube"].map((tool) => [
      tool,
      [
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--reporter=append-only",
        ...(process.env[`${tool.toUpperCase()}_FLAGS`] || "").split(/\s+/).filter(Boolean),
      ],
    ]),
  )
  const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex")
  const lock = path.join(here, "pnpm-lock.yaml")
  const fixture = path.join(here, "fixture/package.json")
  const readOptional = (file) => (existsSync(file) ? readFileSync(file, "utf8").trim() : null)
  const result = {
    started: new Date().toISOString(),
    runs,
    environment: {
      kernel: execFileSync("uname", ["-a"], { encoding: "utf8" }).trim(),
      node: process.version,
      arch: process.arch,
      cpu: os.cpus()[0]?.model,
      cpus: os.cpus().length,
      availableParallelism: os.availableParallelism(),
      totalMemoryBytes: os.totalmem(),
      cgroupMemoryMax: readOptional("/sys/fs/cgroup/memory.max"),
      cgroupCpuMax: readOptional("/sys/fs/cgroup/cpu.max"),
      filesystemType: statfsSync(os.tmpdir()).type,
      pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
      aube: execFileSync("aube", ["--version"], { encoding: "utf8" }).trim(),
    },
    commands,
    isolation:
      "Fresh HOME and XDG directories per tool per repetition; stores remain on container filesystem",
    fixtureSha256: hash(fixture),
    lockfileSha256: hash(lock),
    samples: [],
  }
  const save = () =>
    writeFileSync(path.join(output, "results.json"), `${JSON.stringify(result, null, 2)}\n`)
  let expectedPackages
  save()
  try {
    for (let run = 1; run <= runs; run++) {
      // Alternate order to reduce systematic network and host-cache bias.
      const tools = run % 2 ? ["pnpm", "aube"] : ["aube", "pnpm"]
      for (const tool of tools) {
        const root = mkdtempSync(path.join(os.tmpdir(), `install-${tool}-`))
        try {
          const workspace = path.join(root, "workspace")
          mkdirSync(workspace)
          copyFileSync(fixture, path.join(workspace, "package.json"))
          copyFileSync(lock, path.join(workspace, "pnpm-lock.yaml"))
          const env = { ...process.env, HOME: path.join(root, "home"), CI: "true" }
          for (const kind of ["CACHE", "CONFIG", "DATA", "STATE"]) {
            env[`XDG_${kind}_HOME`] = path.join(root, kind.toLowerCase())
          }
          mkdirSync(env.HOME)
          for (const scenario of scenarios) {
            if (scenario === "warm") {
              rmSync(path.join(workspace, "node_modules"), { recursive: true, force: true })
            }
            const log = `${run}-${tool}-${scenario}.log`
            const fd = openSync(path.join(output, log), "w")
            let child
            let seconds
            try {
              const start = performance.now()
              child = spawnSync(tool, commands[tool], {
                cwd: workspace,
                env,
                stdio: ["ignore", fd, fd],
                timeout: 600_000,
              })
              seconds = (performance.now() - start) / 1000
            } finally {
              closeSync(fd)
            }
            if (child.error || child.status !== 0) {
              throw new Error(
                `${tool} ${scenario} failed: ${child.error || child.signal || child.status}; see ${log}`,
              )
            }
            if (hash(path.join(workspace, "pnpm-lock.yaml")) !== result.lockfileSha256) {
              throw new Error(`${tool} changed the shared frozen lockfile`)
            }
            const packages = installedPackages(path.join(workspace, "node_modules"))
            expectedPackages ||= packages
            if (JSON.stringify(packages) !== JSON.stringify(expectedPackages)) {
              writeFileSync(
                path.join(output, `${run}-${tool}-${scenario}-packages.json`),
                JSON.stringify(packages, null, 2),
              )
              throw new Error(`${tool} ${scenario} installed a different package/version set`)
            }
            // Exercise representative modules without contacting AWS. Outside the timed region.
            execFileSync(
              "node",
              [
                "--input-type=module",
                "-e",
                [
                  'import { S3Client } from "@aws-sdk/client-s3";',
                  'import { EC2Client } from "@aws-sdk/client-ec2";',
                  'import ts from "typescript";',
                  'import jmespath from "jmespath";',
                  'if (!S3Client || !EC2Client || !ts.version || jmespath.search({a: 1}, "a") !== 1) process.exit(1);',
                ].join("\n"),
              ],
              { cwd: workspace, env, stdio: "pipe", timeout: 30_000 },
            )
            result.samples.push({
              run,
              tool,
              scenario,
              seconds,
              log,
              packageCount: packages.length,
            })
            save()
            console.log(
              `${run}/${runs} ${tool.padEnd(4)} ${scenario.padEnd(4)} ${seconds.toFixed(3)}s`,
            )
          }
        } finally {
          rmSync(root, { recursive: true, force: true })
        }
      }
    }
    result.packages = expectedPackages
    result.completed = new Date().toISOString()
    const report = summary(result.samples)
    writeFileSync(path.join(output, "summary.md"), report)
    console.log(`\n${report}`)
  } catch (error) {
    result.error = error.message
    throw error
  } finally {
    save()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
