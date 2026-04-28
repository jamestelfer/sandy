import type { ArgumentsCamelCase, CommandModule } from "yargs"
import { listEmbeddedResourceUris, readEmbeddedResource } from "../../resources"

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

const resourceCommand: CommandModule<Record<string, never>, ResourceArgs> = {
  command: "resource [url]",
  describe: "List embedded sandy:// resources, or print one when a URI is given",
  builder: (y) =>
    y
      .positional("url", {
        type: "string",
        describe: "sandy:// URI; omit to list all available URIs",
      })
      .example("$0 resource", "List all resource URIs")
      .example("$0 resource sandy://skills/cli/SKILL.md", "Print the CLI skill"),
  handler: async (argv: ArgumentsCamelCase<ResourceArgs>) => runResource(argv),
}

export default resourceCommand
