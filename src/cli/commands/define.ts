import type { CommandModule } from "yargs"

// Lets TypeScript infer handler argv from the builder's option chain.
// A bare `CommandModule` annotation widens argv to `{}`.
export function defineCommand<U>(command: CommandModule<object, U>): CommandModule<object, U> {
  return command
}
