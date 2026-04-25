import * as fs from "node:fs/promises"
import * as path from "node:path"

type Snapshot = Map<string, number> // relPath → mtime ms

async function captureSnapshot(dir: string): Promise<Snapshot> {
  const snapshot: Snapshot = new Map()
  try {
    const entries = await fs.readdir(dir, { recursive: true })
    await Promise.all(
      entries.map(async (entry) => {
        const abs = path.join(dir, entry)
        try {
          const stat = await fs.stat(abs)
          if (stat.isFile()) {
            snapshot.set(entry, stat.mtimeMs)
          }
        } catch {
          // file disappeared between readdir and stat — skip
        }
      }),
    )
  } catch {
    // dir doesn't exist
  }
  return snapshot
}

export class OutputTracker {
  private constructor(
    private readonly dir: string,
    private readonly snapshot: Snapshot,
  ) {}

  static async create(dir: string): Promise<OutputTracker> {
    return new OutputTracker(dir, await captureSnapshot(dir))
  }

  async changed(): Promise<string[]> {
    const current = await captureSnapshot(this.dir)
    const result: string[] = []
    for (const [relPath, mtime] of current) {
      const prev = this.snapshot.get(relPath)
      if (prev === undefined || mtime > prev) {
        result.push(relPath)
      }
    }
    return result
  }
}
