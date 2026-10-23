import type * as nodeFs from "node:fs"

// @types/tar-fs describes tar-fs 2.x. tar-fs 3.x also accepts a custom
// filesystem implementation for extraction.
declare module "tar-fs" {
  interface ExtractOptions {
    fs?: Partial<typeof nodeFs>
  }
}
