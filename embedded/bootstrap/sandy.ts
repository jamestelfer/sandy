export function progress(message: string): void {
  process.stdout.write(`[--> ${message}\n`)
}
