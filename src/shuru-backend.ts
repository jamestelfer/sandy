import type { Backend } from "./backend"
import type { RunOptions, RunResult } from "./types"

export type ShellExecutor = (
  cmd: string[],
  opts?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>

export type SandboxFactory = (opts: object) => Promise<unknown>

const CHECKPOINT_NAME = "sandy"

export class ShuruBackend implements Backend {
  constructor(
    private executor: ShellExecutor = async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    private sandboxFactory: SandboxFactory = async () => ({}),
  ) {}

  async imageExists(): Promise<boolean> {
    const { stdout } = await this.executor(["shuru", "checkpoint", "list"])
    return stdout
      .split("\n")
      .some((line) => line === CHECKPOINT_NAME || line.startsWith(`${CHECKPOINT_NAME} `))
  }

  async imageDelete(): Promise<void> {
    throw new Error("not implemented")
  }

  async imageCreate(): Promise<void> {
    throw new Error("not implemented")
  }

  async run(_opts: RunOptions, _onProgress: (message: string) => void): Promise<RunResult> {
    throw new Error("not implemented")
  }
}
