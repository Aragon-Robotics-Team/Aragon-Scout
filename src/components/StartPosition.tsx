import { useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  FIELD,
  FLOWERS,
  FLOWER_R,
  GARDENS,
  LOADING_ZONES,
  ROBOT,
  TILE,
  halfExtent,
  headingToward,
  snapHeading,
  snapStart,
} from '../lib/field'
import type { Alliance, StartPose } from '../lib/types'
import { Button, Label, Modal, cx } from './ui'

const allianceColor = (a: Alliance | null) => (a === 'blue' ? 'var(--color-blue)' : 'var(--color-red)')

/** Corners of a hexagon around (x, y). */
function hexagon(x: number, y: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i
    return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`
  }).join(' ')
}

/** Top-down BIOBUZZ field, red on the left, with an optional robot at its start. */
export function FieldMap({
  pose,
  alliance,
  showLegal,
  detailed = true,
  children,
}: {
  pose?: StartPose | null
  alliance: Alliance | null
  /** Shade the strip where this alliance may legally start. */
  showLegal?: boolean
  /** Small previews skip the grid and scoring elements. */
  detailed?: boolean
  /** Drawn on top, in field inches. */
  children?: ReactNode
}) {
  const clip = useId()
  const color = allianceColor(alliance)
  const hiveCell = (x: number, y: number, a: Alliance) => (
    <rect x={x} y={y} width={21.5} height={17} rx={2} fill={allianceColor(a)} fillOpacity={0.18} stroke={allianceColor(a)} strokeWidth={0.9} />
  )
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <rect width={FIELD} height={FIELD} rx={3} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={FIELD} height={FIELD} fill="var(--color-surface-2)" />
        {detailed &&
          Array.from({ length: FIELD / TILE - 1 }, (_, i) => (i + 1) * TILE).map((v) => (
            <g key={v} stroke="var(--color-line)" strokeWidth={0.5}>
              <line x1={v} x2={v} y1={0} y2={FIELD} />
              <line y1={v} y2={v} x1={0} x2={FIELD} />
            </g>
          ))}
        {showLegal && alliance && (
          <g fill={color} fillOpacity={0.14}>
            <rect x={alliance === 'red' ? 0 : FIELD - ROBOT} y={0} width={ROBOT} height={FIELD} />
            <rect x={alliance === 'red' ? ROBOT : FIELD / 2} y={0} width={FIELD / 2 - ROBOT} height={ROBOT} />
            <rect x={alliance === 'red' ? ROBOT : FIELD / 2} y={FIELD - ROBOT} width={FIELD / 2 - ROBOT} height={ROBOT} />
          </g>
        )}
        {detailed && <line x1={FIELD / 2} x2={FIELD / 2} y1={0} y2={FIELD} stroke="var(--color-ink-3)" strokeWidth={0.4} strokeDasharray="2 3" />}
        {(['red', 'blue'] as const).map((a) => {
          const z = LOADING_ZONES[a]
          const inner = a === 'red' ? z.x + z.w : z.x
          const wall = a === 'red' ? 0 : FIELD
          const g = GARDENS[a]
          return (
            <g key={a}>
              <polyline
                points={`${wall},${z.y} ${inner},${z.y} ${inner},${z.y + z.h} ${wall},${z.y + z.h}`}
                fill="none"
                stroke={allianceColor(a)}
                strokeWidth={1.4}
              />
              <rect x={g.x} y={g.y} width={g.w} height={g.h} fill={allianceColor(a)} />
              {detailed &&
                [0, 1, 2, 3].map((i) => (
                  <circle key={i} cx={(a === 'red' ? g.x + 3 : g.x + g.w - 3) + (a === 'red' ? i : -i) * 4} cy={a === 'red' ? g.y - 2 : g.y + g.h + 2} r={1.8} fill="var(--color-pollen)" />
                ))}
            </g>
          )
        })}
        {FLOWERS.map((f) => (
          <polygon key={`${f.x},${f.y}`} points={hexagon(f.x, f.y, FLOWER_R)} fill="var(--color-pollen)" stroke="var(--color-bg)" strokeWidth={0.6} />
        ))}
        {/* HIVES: two cells per alliance on a shared pivot frame. */}
        <rect x={46.5} y={47} width={51} height={50} rx={1.5} fill="none" stroke="var(--color-ink-3)" strokeWidth={0.8} />
        <rect x={58} y={69} width={28} height={6} rx={1} fill="var(--color-pollen)" fillOpacity={0.55} />
        {hiveCell(48, 47.5, 'red')}
        {hiveCell(48, 75, 'red')}
        {hiveCell(74.5, 52, 'blue')}
        {hiveCell(74.5, 79, 'blue')}
        {pose && <Robot pose={pose} color={color} />}
        {children}
      </g>
      <rect width={FIELD} height={FIELD} rx={3} fill="none" stroke="var(--color-ink-3)" strokeWidth={1} />
    </>
  )
}

export function Robot({ pose, color }: { pose: StartPose; color: string }) {
  const r = ROBOT / 2
  return (
    <g transform={`translate(${pose.x} ${pose.y}) rotate(${pose.heading})`}>
      <rect x={-r} y={-r} width={ROBOT} height={ROBOT} rx={1.5} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={1.2} />
      {/* Front edge and an arrow showing which way the robot faces. */}
      <line x1={-r} x2={r} y1={-r} y2={-r} stroke="var(--color-ink)" strokeWidth={2} strokeLinecap="round" />
      <line x1={0} x2={0} y1={4} y2={-r - 5} stroke="var(--color-ink)" strokeWidth={1.4} strokeLinecap="round" />
      <polyline points={`-3,${-r - 2} 0,${-r - 5.5} 3,${-r - 2}`} fill="none" stroke="var(--color-ink)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

/** Tap to place the robot (snapped to a legal start), keep dragging to turn it. */
function StartPicker({ value, alliance, onChange }: { value: StartPose | null; alliance: Alliance; onChange(v: StartPose): void }) {
  const svg = useRef<SVGSVGElement>(null)
  // The spot the scout tapped; turning re-snaps from here so the robot stays against its wall.
  const anchor = useRef<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)

  const toField = (e: PointerEvent) => {
    const box = svg.current!.getBoundingClientRect()
    return { x: ((e.clientX - box.left) / box.width) * FIELD, y: ((e.clientY - box.top) / box.height) * FIELD }
  }

  const down = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    const p = toField(e)
    const onRobot = value && Math.abs(p.x - value.x) <= halfExtent(value.heading) + 2 && Math.abs(p.y - value.y) <= halfExtent(value.heading) + 2
    if (onRobot) {
      anchor.current = anchor.current ?? { x: value.x, y: value.y }
      return
    }
    anchor.current = p
    const placed = snapStart(p.x, p.y, value?.heading ?? 0, alliance)
    // A first placement faces away from its wall; later taps keep the chosen heading.
    const heading = value ? value.heading : placed.facing
    const pose = snapStart(p.x, p.y, heading, alliance)
    onChange({ x: pose.x, y: pose.y, heading })
  }

  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !value || !anchor.current) return
    const p = toField(e)
    if (Math.hypot(p.x - value.x, p.y - value.y) < ROBOT / 2 + 2) return
    const heading = snapHeading(headingToward(value.x, value.y, p.x, p.y))
    if (heading === value.heading) return
    const pose = snapStart(anchor.current.x, anchor.current.y, heading, alliance)
    onChange({ x: pose.x, y: pose.y, heading })
  }

  return (
    <svg
      ref={svg}
      viewBox={`-2 -2 ${FIELD + 4} ${FIELD + 4}`}
      className="w-full touch-none select-none"
      role="img"
      aria-label="Field map: tap where the robot starts, then drag to turn it"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <FieldMap pose={value} alliance={alliance} showLegal />
    </svg>
  )
}

/**
 * Starting position as a small map preview that opens a full-size popup.
 * With `onChange` the popup is a picker; without it, a read-only view.
 */
export function StartPositionButton({
  value,
  alliance,
  onChange,
  compact,
}: {
  value: StartPose | null | undefined
  alliance: Alliance | null
  onChange?(v: StartPose | null): void
  /** Just the thumbnail, for tight headers. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const editable = !!onChange
  const thumb = (
    <svg viewBox={`-2 -2 ${FIELD + 4} ${FIELD + 4}`} className={compact ? 'h-7 w-7' : 'h-11 w-11 shrink-0'} aria-hidden>
      <FieldMap pose={value} alliance={alliance} detailed={false} />
    </svg>
  )
  return (
    <>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} aria-label="Show starting position" className="rounded-md hover:opacity-80">
          {thumb}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={editable && !alliance}
          className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2 pr-3 text-left text-sm hover:border-ink-3 disabled:opacity-40"
        >
          {thumb}
          <span className={cx('truncate', value ? 'text-ink' : 'text-ink-3')}>
            {value ? (editable ? 'Change' : 'Show') : editable ? (alliance ? 'Set on map' : 'Pick alliance first') : 'Not set'}
          </span>
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Starting position">
        {editable && alliance ? (
          <>
            <StartPicker value={value ?? null} alliance={alliance} onChange={onChange} />
            <p className="mt-2 text-xs text-ink-3">
              Tap where the robot starts; it snaps to a legal spot against the wall. Keep dragging, or drag the robot, to turn it.
            </p>
            <div className="mt-3 flex justify-between">
              <Button variant="ghost" onClick={() => onChange(null)} disabled={!value}>
                Clear
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <svg viewBox={`-2 -2 ${FIELD + 4} ${FIELD + 4}`} className="w-full" role="img" aria-label="Field map with the robot's starting position">
            <FieldMap pose={value} alliance={alliance} />
          </svg>
        )}
      </Modal>
    </>
  )
}

/** The starting-position field for the pre-recording form. */
export function StartPositionField({
  value,
  legacy,
  alliance,
  onChange,
}: {
  value: StartPose | null | undefined
  /** Typed description from recordings made before the map existed. */
  legacy: string
  alliance: Alliance | null
  onChange(v: StartPose | null): void
}) {
  return (
    <div>
      <Label hint={!value && legacy ? `was “${legacy}”` : undefined}>Starting position</Label>
      <StartPositionButton value={value} alliance={alliance} onChange={onChange} />
    </div>
  )
}
