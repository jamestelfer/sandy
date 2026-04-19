import type { CommandModule } from "yargs"
import { listEmbeddedResourceUris, readEmbeddedResource } from "../embedded-fs"

export interface ResourceArgs {
  url?: string
}

export async function runResource(
  argv: ResourceArgs,
  print: (line: string) => void = console.log,
): Promise<void> {
  if (!argv.url) {
    const uris = await listEmbeddedResourceUris()
    print(JSON.stringify(uris))
    return
  }

  const content = await readEmbeddedResource(argv.url)
  print(content)
}

const resourceCommand: CommandModule = {
  command: "resource [url]",
  describe: "List or read embedded Sandy resources",
  builder: (y) => y.positional("url", { type: "string" }),
  handler: async (argv) => runResource(argv as ResourceArgs),
}

export default resourceCommand
