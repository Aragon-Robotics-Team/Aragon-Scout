import { useEffect, useRef, useState } from 'react'
import { formatPct } from '../lib/scoring'

export interface MatchBar {
  key: string
  label: string
  value: number
  tips: number
  accuracy: number | null
}

function niceMax(v: number): number {
  if (v <= 0) return 10
  const step = v <= 20 ? 5 : v <= 60 ? 10 : v <= 150 ? 25 : 50
  return Math.ceil(v / step) * step
}

/** Estimated robot points per match — single series, so no legend; title names it. */
export function PerMatchChart({ bars }: { bars: MatchBar[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = 150
  const padL = 28
  const padB = 20
  const plotH = H - padB - 6
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)))
  const plotW = Math.max(0, width - padL)
  const slot = bars.length ? plotW / bars.length : 0
  const barW = Math.max(4, Math.min(28, slot - 2))
  const y = (v: number) => 6 + plotH - (v / max) * plotH
  const ticks = [0, max / 2, max]
  const a = active != null ? bars[active] : null

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Estimated robot points per match">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--color-ink-3)" className="tnum">
                {t}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = padL + slot * i + slot / 2
            const top = y(b.value)
            const h = Math.max(0, y(0) - top)
            // Rounded data-end on top, square at the baseline.
            const r = Math.min(4, h, barW / 2)
            const x0 = cx - barW / 2
            const path =
              h === 0
                ? ''
                : `M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${y(0)} Z`
            return (
              <g key={b.key}>
                <path d={path} fill="var(--color-ink-2)" opacity={active != null && active !== i ? 0.45 : 1} />
                {(bars.length <= 12 || i % Math.ceil(bars.length / 12) === 0) && (
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)" className="tnum">
                    {b.label}
                  </text>
                )}
                <rect
                  x={padL + slot * i}
                  y={0}
                  width={slot}
                  height={H}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onClick={() => setActive(active === i ? null : i)}
                />
              </g>
            )
          })}
        </svg>
      )}
      {a && active != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(padL + slot * active + slot / 2, 70), width - 70) }}
        >
          <div className="font-medium">{a.label}</div>
          <div className="tnum text-ink-2">
            {a.value} pts · {a.tips} tips · {formatPct(a.accuracy)} acc.
          </div>
        </div>
      )}
    </div>
  )
}
