import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AUTO_MS, FLOWER_UNLOCK_MS, MATCH_MS, TELEOP_START_MS, formatElapsed } from '../lib/timing'
import type { Alliance, EventType, MatchEvent } from '../lib/types'
import { cx } from './ui'

const FULL_LANE_H = 22
/** Lane height for the half-height live timeline. */
const COMPACT_LANE_H = 12
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

const allianceColor = (a: Alliance | null) => (a === 'blue' ? 'var(--color-blue)' : 'var(--color-red)')

/** One mark on a lane. */
export interface LaneEvent extends MatchEvent {
  color: string
}

export interface Lane {
  key: string
  label: ReactNode
  events: LaneEvent[]
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
  compact = false,
}: {
  events: MatchEvent[]
  alliance: Alliance | null
  /** Elapsed ms for the live playhead; omit for a finished match. */
  now?: number
  interactive?: boolean
  /** Half-height lanes, for the live screen. */
  compact?: boolean
}) {
  const nectar = allianceColor(alliance)
  const lane = (key: string, label: string, test: (t: EventType) => boolean, color: string): Lane => ({
    key,
    label,
    events: events.filter((e) => test(e.type)).map((e) => ({ ...e, color })),
  })
  const lanes = [
    lane('nectar', 'Nectar', (t) => t.startsWith('nectar') || t === 'flower_nectar', nectar),
    lane('pollen', 'Pollen', (t) => t.startsWith('pollen') || t === 'flower_pollen', 'var(--color-pollen)'),
    lane('tip', 'Tip', (t) => t === 'tip', 'var(--color-ink)'),
  ]
  return <LaneTimeline lanes={lanes} now={now} interactive={interactive} compact={compact} legend={interactive} />
}

/**
 * The shared match-time axis with any set of lanes. Shots in a lane that
 * would overlap stack upward at the burst's first x; tips never stack.
 */
export function LaneTimeline({
  lanes,
  now,
  interactive = false,
  compact = false,
  legend = false,
  labelWidth,
}: {
  lanes: Lane[]
  now?: number
  interactive?: boolean
  compact?: boolean
  legend?: boolean
  /** Width of the label column, for longer labels like team numbers. */
  labelWidth?: string
}) {
  const LANE_H = compact ? COMPACT_LANE_H : FULL_LANE_H
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<{ lane: number; i: number } | null>(null)

  const plotW = Math.max(0, width - PAD_X * 2)
  const x = (t: number) => PAD_X + (Math.min(t, MATCH_MS) / MATCH_MS) * plotW

  const placed = lanes.map((l) => {
    const out: { x: number; level: number; top: boolean }[] = []
    l.events.forEach((e, i) => {
      const px = x(e.t)
      const prev = out[i - 1]
      if (e.type !== 'tip' && i > 0 && l.events[i - 1].type !== 'tip' && px - prev.x < STACK_GAP) {
        prev.top = false
        out.push({ x: prev.x, level: prev.level + 1, top: true })
      } else {
        out.push({ x: px, level: 0, top: true })
      }
    })
    return out
  })
  const laneH = placed.map((p) => LANE_H + Math.max(0, ...p.map((m) => m.level)) * STACK_STEP)
  // Each lane's guide line (and bottom of its stacks) sits LANE_H / 2 above the lane's bottom.
  const baseY = laneH.map((_, i) => laneH.slice(0, i + 1).reduce((a, b) => a + b, 0) - LANE_H / 2)
  const height = laneH.reduce((a, b) => a + b, 0)
  const activeEvent = active ? lanes[active.lane].events[active.i] : null
  const total = lanes.reduce((n, l) => n + l.events.length, 0)

  return (
    <div className="select-none">
      <div className="flex">
        <div className={cx('shrink-0 text-ink-3', labelWidth ?? (compact ? 'w-12' : 'w-14'), compact ? 'text-[10px]' : 'text-[11px]')}>
          {lanes.map((l, i) => (
            <div key={l.key} style={{ height: laneH[i] }} className="flex items-end">
              <div style={{ height: LANE_H }} className="flex items-center truncate">
                {l.label}
              </div>
            </div>
          ))}
        </div>
        <div ref={ref} className="relative min-w-0 flex-1">
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label={`Timeline of ${total} events`}>
              {/* auto + transition shading; teleop is plain */}
              <rect x={x(0)} y={0} width={x(AUTO_MS) - x(0)} height={height} fill="var(--color-surface-2)" rx={4} />
              <rect x={x(AUTO_MS)} y={0} width={x(TELEOP_START_MS) - x(AUTO_MS)} height={height} fill="var(--color-line)" opacity={0.5} />
              {lanes.map((l, i) => (
                <line key={l.key} x1={PAD_X} x2={PAD_X + plotW} y1={baseY[i]} y2={baseY[i]} stroke="var(--color-line)" strokeWidth={1} />
              ))}
              <line x1={x(FLOWER_UNLOCK_MS)} x2={x(FLOWER_UNLOCK_MS)} y1={0} y2={height} stroke="var(--color-ink-3)" strokeDasharray="2 3" strokeWidth={1} />
              {lanes.map((l, li) =>
                l.events.map((e, i) => {
                  const { x: cx, level, top } = placed[li][i]
                  const cy = baseY[li] - level * STACK_STEP
                  const isActive = active?.lane === li && active.i === i
                  return (
                    <g key={`${l.key}-${i}`} opacity={active != null && !isActive ? 0.5 : 1}>
                      <Mark type={e.type} x={cx} y={cy} color={e.color} laneH={LANE_H} />
                      {interactive && (
                        // Stacked marks split the stack's height so each one stays hoverable.
                        <rect
                          x={cx - 11}
                          y={cy - (top ? 11 : STACK_STEP / 2)}
                          width={22}
                          height={(top ? 11 : STACK_STEP / 2) + (level === 0 ? 11 : STACK_STEP / 2)}
                          fill="transparent"
                          onPointerEnter={() => setActive({ lane: li, i })}
                          onPointerLeave={() => setActive(null)}
                          onClick={() => setActive(isActive ? null : { lane: li, i })}
                        />
                      )}
                    </g>
                  )
                }),
              )}
              {now != null && (
                <line x1={x(now)} x2={x(now)} y1={0} y2={height} stroke="var(--color-ink)" strokeWidth={2} strokeLinecap="round" />
              )}
            </svg>
          )}
          {activeEvent && active && (
            <div
              className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs shadow-lg"
              style={{ left: Math.min(Math.max(placed[active.lane][active.i].x, 60), width - 60) }}
            >
              <span className="text-ink">{LABELS[activeEvent.type]}</span>
              <span className="tnum text-ink-2"> · {formatElapsed(activeEvent.t)} · {activeEvent.phase === 'auto' ? 'Auto' : 'Teleop'}</span>
            </div>
          )}
          <div className={cx('relative text-[10px] text-ink-3', compact ? 'h-3.5' : 'mt-1 h-4')}>
            <span className="absolute" style={{ left: x(0) }}>Auto</span>
            <span className="absolute" style={{ left: x(TELEOP_START_MS) }}>Teleop</span>
            <span className="absolute -translate-x-1/2" style={{ left: x(FLOWER_UNLOCK_MS) }}>1:00</span>
          </div>
        </div>
      </div>
      {legend && (
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

function Mark({ type, x, y, color, laneH }: { type: EventType; x: number; y: number; color: string; laneH: number }) {
  if (type === 'tip') return <rect x={x - 2} y={y - laneH / 2 + 1} width={4} height={laneH - 2} rx={2} fill={color} stroke="var(--color-bg)" strokeWidth={1} />
  if (type.startsWith('flower')) {
    return <rect x={x - 4} y={y - 4} width={8} height={8} transform={`rotate(45 ${x} ${y})`} fill={color} stroke="var(--color-bg)" strokeWidth={2} />
  }
  if (type.endsWith('miss')) return <circle cx={x} cy={y} r={4} fill="var(--color-bg)" stroke={color} strokeWidth={1.75} />
  return <circle cx={x} cy={y} r={4.5} fill={color} stroke="var(--color-bg)" strokeWidth={2} />
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
