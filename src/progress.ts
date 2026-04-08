export type ProgressLine = { isProgress: true; message: string }
export type NormalLine = { isProgress: false }
export type ParsedLine = ProgressLine | NormalLine

export function parseProgressLine(line: string): ParsedLine {
  if (line.startsWith("[-->")) {
    return { isProgress: true, message: line.slice(4).trim() }
  }
  return { isProgress: false }
}
