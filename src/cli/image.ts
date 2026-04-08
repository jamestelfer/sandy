import type { Backend } from "../backend"

export async function runImage(
  args: string[],
  backend: Backend,
  print: (line: string) => void = console.log,
  printErr: (line: string) => void = console.error,
): Promise<number> {
  const subcommand = args[0]
  if (subcommand === "create") {
    await backend.imageCreate()
    print("image created")
    return 0
  }
  if (subcommand === "delete") {
    await backend.imageDelete()
    print("image deleted")
    return 0
  }
  printErr(`sandy image: unknown subcommand: ${subcommand ?? "(none)"}`)
  printErr("Usage: sandy image create|delete")
  return 1
}
