import { parseScheduleText, type ParsedSchedule } from './schedule'

export interface PositionedText {
  str: string
  x: number
  y: number
  height: number
}

/**
 * Rebuilds text lines from positioned PDF text: items on (nearly) the same
 * baseline form one line, left to right; lines go top to bottom.
 */
export function linesFromItems(items: PositionedText[]): string[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; tol: number; items: PositionedText[] }[] = []
  for (const item of sorted) {
    const tol = Math.max(2, (item.height || 10) * 0.45)
    const line = lines.find((l) => Math.abs(l.y - item.y) <= Math.max(l.tol, tol))
    if (line) line.items.push(item)
    else lines.push({ y: item.y, tol, items: [item] })
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) =>
      l.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .join(' '),
    )
}

/** Extracts a qualification schedule from an FTC Live / MatchMaker schedule PDF, entirely on the device. */
export async function parseSchedulePdf(data: ArrayBuffer): Promise<ParsedSchedule> {
  // Loaded on demand so the main app stays small; the files are precached for offline use.
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items: PositionedText[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      items.push({ str: item.str, x: item.transform[4], y: item.transform[5], height: item.height })
    }
    lines.push(...linesFromItems(items))
  }
  await task.destroy()
  const parsed = parseScheduleText(lines.join('\n'))
  if (parsed.matches.length === 0) {
    throw new Error(
      lines.length === 0
        ? 'This PDF has no readable text (it may be a scan). Enter the schedule manually instead.'
        : "Couldn't find any qualification matches in this PDF.",
    )
  }
  return parsed
}
