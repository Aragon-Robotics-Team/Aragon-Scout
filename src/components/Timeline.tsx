import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AUTO_MS, FLOWER_UNLOCK_MS, MATCH_MS, TELEOP_START_MS, formatElapsed } from '../lib/timing'
import type { Alliance, EventType, MatchEvent } from '../lib/types'

const LANES = ['Nectar', 'Pollen', 'Tip'] as const
const LANE_H = 22
const PAD_X = 6
/** Vertical step between marks stacked in one burst of shots. */
const STACK_STEP = 8
/** Shots closer than this many px to the start of a burst join its stack. */
const STACK_GAP = 10

const LABELS: Record<EventType, string> = {
  nectar_score: 'Nectar scored',
  nectar_miss: 'Nectar missed',
  pollen_score: 'Pollen scored',
  pollen_miss: 'Pollen missed',
  tip: 'Hive tip',
  flower_nectar: 'Nectar in flower',
  flower_pollen: 'Pollen in flower',
}

function laneOf(type: EventType): number {
  if (type.startsWith('nectar') || type === 'flower_nectar') return 0
  if (type.startsWith('pollen') || type === 'flower_pollen') return 1
  return 2
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Events on a match-time axis, one lane per element type. Scored = filled dot,
 * missed = hollow ring, placed in a flower = diamond, hive tip = bar.
 */
export function Timeline({
  events,
  alliance,
  now,
  interactive = false,
}: {
  events: MatchEvent[]
  alliance: Alliance | null
  /** Elapsed ms for the live playhead; omit for a finished match. */
  now?: number
  interactive?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const nectar = alliance === 'blue' ? 'var(--color-blue)' : 'var(--color-red)'
  const colorOf = (type: EventType) => {
    const lane = laneOf(type)
    return lane === 0 ? nectar : lane === 1 ? 'var(--color-pollen)' : 'var(--color-ink)'
  }

  const plotW = Math.max(0, width - PAD_X * 2)
  const x = (t: number) => PAD_X + (Math.min(t, MATCH_MS) / MATCH_MS) * plotW

  // Consecutive shots in the same lane that would overlap on the axis stack
  // upward at the burst's first x instead of stepping sideways. Tips don't stack.
  const placed: { x: number; level: number; top: boolean }[] = []
  const lastInLane: (number | undefined)[] = []
  const depth = LANES.map(() => 1)
  events.forEach((e, i) => {
    const lane = laneOf(e.type)
    const prev = lastInLane[lane]
    const px = x(e.t)
    if (lane !== 2 && prev != null && px - placed[prev].x < STACK_GAP) {
      placed[prev].top = false
      placed[i] = { x: placed[prev].x, level: placed[prev].level + 1, top: true }
      depth[lane] = Math.max(depth[lane], placed[i].level + 1)
    } else {
      placed[i] = { x: px, level: 0, top: true }
    }
    lastInLane[lane] = i
  })
  const laneH = depth.map((d) => LANE_H + (d - 1) * STACK_STEP)
  // Each lane's guide line (and bottom of its stacks) sits LANE_H / 2 above the lane's bottom.
  const baseY = laneH.map((_, i) => laneH.slice(0, i + 1).reduce((a, b) => a + b, 0) - LANE_H / 2)
  const height = laneH.reduce((a, b) => a + b, 0)
  const activeEvent = active != null ? events[active] : null

  return (
    <div className="select-none">
      <div className="flex">
        <div className="w-14 shrink-0 text-[11px] text-ink-3">
          {LANES.map((l, i) => (
            <div key={l} style={{ height: laneH[i] }} className="flex items-end">
              <div style={{ height: LANE_H }} className="flex items-center">
                {l}
              </div>
            </div>
          ))}
        </div>
        <div ref={ref} className="relative min-w-0 flex-1">
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label={`Timeline of ${events.length} events`}>
              {/* auto + transition shading; teleop is plain */}
              <rect x={x(0)} y={0} width={x(AUTO_MS) - x(0)} height={height} fill="var(--color-surface-2)" rx={4} />
              <rect x={x(AUTO_MS)} y={0} width={x(TELEOP_START_MS) - x(AUTO_MS)} height={height} fill="var(--color-line)" opacity={0.5} />
              {LANES.map((_, i) => (
                <line key={i} x1={PAD_X} x2={PAD_X + plotW} y1={baseY[i]} y2={baseY[i]} stroke="var(--color-line)" strokeWidth={1} />
              ))}
              <line x1={x(FLOWER_UNLOCK_MS)} x2={x(FLOWER_UNLOCK_MS)} y1={0} y2={height} stroke="var(--color-ink-3)" strokeDasharray="2 3" strokeWidth={1} />
              {events.map((e, i) => {
                const { x: cx, level, top } = placed[i]
                const cy = baseY[laneOf(e.type)] - level * STACK_STEP
                const color = colorOf(e.type)
                const isActive = active === i
                let mark
                if (e.type === 'tip') {
                  mark = <rect x={cx - 2} y={cy - 8} width={4} height={16} rx={2} fill={color} stroke="var(--color-bg)" strokeWidth={1} />
                } else if (e.type.startsWith('flower')) {
                  mark = <rect x={cx - 4} y={cy - 4} width={8} height={8} transform={`rotate(45 ${cx} ${cy})`} fill={color} stroke="var(--color-bg)" strokeWidth={2} />
                } else if (e.type.endsWith('miss')) {
                  mark = <circle cx={cx} cy={cy} r={4} fill="var(--color-bg)" stroke={color} strokeWidth={1.75} />
                } else {
                  mark = <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="var(--color-bg)" strokeWidth={2} />
                }
                return (
                  <g key={i} opacity={active != null && !isActive ? 0.5 : 1}>
                    {mark}
                    {interactive && (
                      // Stacked marks split the stack's height so each one stays hoverable.
                      <rect
                        x={cx - 11}
                        y={cy - (top ? 11 : STACK_STEP / 2)}
                        width={22}
                        height={(top ? 11 : STACK_STEP / 2) + (level === 0 ? 11 : STACK_STEP / 2)}
                        fill="transparent"
                        onPointerEnter={() => setActive(i)}
                        onPointerLeave={() => setActive(null)}
                        onClick={() => setActive(isActive ? null : i)}
                      />
                    )}
                  </g>
                )
              })}
              {now != null && (
                <line x1={x(now)} x2={x(now)} y1={0} y2={height} stroke="var(--color-ink)" strokeWidth={2} strokeLinecap="round" />
              )}
            </svg>
          )}
          {activeEvent && (
            <div
              className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs shadow-lg"
              style={{ left: Math.min(Math.max(placed[active!].x, 60), width - 60) }}
            >
              <span className="text-ink">{LABELS[activeEvent.type]}</span>
              <span className="tnum text-ink-2"> · {formatElapsed(activeEvent.t)} · {activeEvent.phase === 'auto' ? 'Auto' : 'Teleop'}</span>
            </div>
          )}
          <div className="relative mt-1 h-4 text-[10px] text-ink-3">
            <span className="absolute" style={{ left: x(0) }}>Auto</span>
            <span className="absolute" style={{ left: x(TELEOP_START_MS) }}>Teleop</span>
            <span className="absolute -translate-x-1/2" style={{ left: x(FLOWER_UNLOCK_MS) }}>1:00</span>
          </div>
        </div>
      </div>
      {interactive && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
          <LegendItem label="Scored"><circle cx={5} cy={5} r={4} fill="var(--color-ink-2)" /></LegendItem>
          <LegendItem label="Missed"><circle cx={5} cy={5} r={3.5} fill="none" stroke="var(--color-ink-2)" strokeWidth={1.5} /></LegendItem>
          <LegendItem label="Into flower"><rect x={2} y={2} width={6} height={6} transform="rotate(45 5 5)" fill="var(--color-ink-2)" /></LegendItem>
          <LegendItem label="Hive tip"><rect x={3.5} y={0} width={3} height={10} rx={1.5} fill="var(--color-ink-2)" /></LegendItem>
        </div>
      )}
    </div>
  )
}

function LegendItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={10} height={10} aria-hidden>
        {children}
      </svg>
      {label}
    </span>
  )
}
