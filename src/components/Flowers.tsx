import { useState } from 'react'
import { FIELD, FLOWERS } from '../lib/field'
import { FLOWER_NAMES, flowerResult } from '../lib/flowers'
import { DEFAULT_POINTS } from '../lib/scoring'
import type { Alliance, FlowerBall, PointValues } from '../lib/types'
import { FieldMap } from './StartPosition'
import { Button, Label, cx } from './ui'

const BALL_COLOR: Record<FlowerBall, string> = {
  pollen: 'var(--color-pollen)',
  red: 'var(--color-red)',
  blue: 'var(--color-blue)',
}
const allianceName = (a: Alliance) => (a === 'red' ? 'Red' : 'Blue')

/** Flower markers sit just inside the wall they're mounted on. */
function markerAt(i: number) {
  const f = FLOWERS[i]
  const inset = 13
  return {
    x: f.x === 0 ? inset : f.x === FIELD ? FIELD - inset : f.x,
    y: f.y === 0 ? inset : f.y === FIELD ? FIELD - inset : f.y,
  }
}

/** The four flowers on a field map, each showing its stack and owner. */
export function FlowerMap({ flowers, selected, onSelect }: { flowers: FlowerBall[][]; selected?: number; onSelect?(i: number): void }) {
  return (
    <svg viewBox={`-2 -2 ${FIELD + 4} ${FIELD + 4}`} className="w-full select-none" role="group" aria-label="Flowers on the field">
      <FieldMap alliance={null}>
        {flowers.map((stack, i) => {
          const { x, y } = markerAt(i)
          const { owner } = flowerResult(stack)
          const on = selected === i
          return (
            <g
              key={i}
              role={onSelect ? 'button' : undefined}
              aria-label={`${FLOWER_NAMES[i]} flower, ${stack.length} balls${owner ? `, owned by ${owner}` : ''}`}
              aria-pressed={onSelect ? on : undefined}
              onClick={onSelect && (() => onSelect(i))}
              className={onSelect ? 'cursor-pointer' : undefined}
            >
              <circle cx={x} cy={y} r={11} fill="var(--color-surface)" stroke={owner ? BALL_COLOR[owner] : 'var(--color-ink-3)'} strokeWidth={on ? 2.6 : 1.4} />
              {on && <circle cx={x} cy={y} r={14} fill="none" stroke="var(--color-ink)" strokeWidth={0.8} strokeDasharray="2 2" />}
              {/* Up to 5 balls, bottom → top, as a little column. */}
              {stack.slice(-5).map((b, j, shown) => (
                <circle key={j} cx={x} cy={y + ((shown.length - 1) / 2 - j) * 4} r={1.8} fill={BALL_COLOR[b]} />
              ))}
              {stack.length === 0 && (
                <text x={x} y={y + 1.5} textAnchor="middle" fontSize={5} fill="var(--color-ink-3)">
                  empty
                </text>
              )}
              {stack.length > 5 && (
                <text x={x + 13} y={y - 9} fontSize={5} fill="var(--color-ink-2)">
                  {stack.length}
                </text>
              )}
            </g>
          )
        })}
      </FieldMap>
    </svg>
  )
}

/** Owner, bonus and points for one flower, in a line. */
export function FlowerSummary({ stack, points = DEFAULT_POINTS }: { stack: FlowerBall[]; points?: PointValues }) {
  const r = flowerResult(stack)
  if (r.balls === 0) return <span className="text-ink-3">Empty</span>
  return (
    <span className="text-ink-2">
      {r.owner ? (
        <>
          <span className={r.owner === 'red' ? 'text-red' : 'text-blue'}>{allianceName(r.owner)}</span> owns · {r.balls} × {points.ownedFlowerBall} ={' '}
          {r.balls * points.ownedFlowerBall} pts
        </>
      ) : (
        'No nectar · nobody owns it'
      )}
      {r.bonus && (
        <>
          {' · '}
          <span className={r.bonus === 'red' ? 'text-red' : 'text-blue'}>{allianceName(r.bonus)}</span> bottom bonus +{points.bottomNectar}
        </>
      )}
    </span>
  )
}

/** Four tiny tubes in a row, for comparing scouts' flowers side by side. */
export function MiniFlowers({ flowers }: { flowers: FlowerBall[][] }) {
  return (
    <span className="inline-flex items-end gap-1.5" aria-label="Flowers, bottom to top">
      {flowers.map((stack, i) => (
        <span key={i} title={FLOWER_NAMES[i]} className="flex min-h-5 w-3 flex-col-reverse items-center gap-px rounded-b-md border border-ink-3 p-px">
          {stack.map((b, j) => (
            <span key={j} className="h-2 w-2 rounded-full" style={{ background: BALL_COLOR[b] }} />
          ))}
        </span>
      ))}
    </span>
  )
}

/** A flower drawn as a tube that fills bottom → top. */
function Tube({ stack }: { stack: FlowerBall[] }) {
  return (
    <div className="flex h-44 w-12 shrink-0 flex-col-reverse items-center gap-1 overflow-hidden rounded-b-2xl rounded-t-md border-2 border-ink-3 p-1">
      {stack.map((b, i) => (
        <span key={i} className="h-6 w-6 shrink-0 rounded-full" style={{ background: BALL_COLOR[b] }} />
      ))}
    </div>
  )
}

/**
 * Post-match flower entry: tap a flower on the map, then tap balls in the
 * order they sit in its scoring part, bottom → top.
 */
export function FlowerInput({
  value,
  onChange,
  points,
}: {
  value: FlowerBall[][]
  onChange(v: FlowerBall[][]): void
  points?: PointValues
}) {
  const [selected, setSelected] = useState(0)
  const stack = value[selected]
  const setStack = (next: FlowerBall[]) => onChange(value.map((s, i) => (i === selected ? next : s)))
  return (
    <div>
      <Label hint="tap a flower">Flowers</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl border border-line bg-surface p-3">
        <div className="col-span-2 sm:col-span-1">
          <FlowerMap flowers={value} selected={selected} onSelect={setSelected} />
        </div>
        <div className="col-span-2 flex gap-3 sm:col-span-1">
          <Tube stack={stack} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="text-sm font-medium">{FLOWER_NAMES[selected]} flower</div>
            <p className="text-xs text-ink-3">Balls in the scoring part, bottom first.</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(['pollen', 'red', 'blue'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setStack([...stack, b])}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 text-sm capitalize active:brightness-125"
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: BALL_COLOR[b] }} />
                  {b}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Button className="h-9 flex-1 text-xs" disabled={stack.length === 0} onClick={() => setStack(stack.slice(0, -1))}>
                ↶ Undo
              </Button>
              <Button variant="ghost" className="h-9 text-xs" disabled={stack.length === 0} onClick={() => setStack([])}>
                Clear
              </Button>
            </div>
            <div className="text-xs">
              <FlowerSummary stack={stack} points={points} />
            </div>
          </div>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-[11px]">
        {value.map((s, i) => (
          <li key={i} className={cx('flex items-baseline gap-2', i === selected && 'text-ink')}>
            <button type="button" onClick={() => setSelected(i)} className="min-w-0 truncate text-left">
              <span className="text-ink-3">{FLOWER_NAMES[i]}: </span>
              <FlowerSummary stack={s} points={points} />
            </button>
            {i === selected && <span className="ml-auto shrink-0 font-medium text-ink">editing flower</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
