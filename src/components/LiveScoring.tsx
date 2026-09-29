import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { FLOWER_UNLOCK_MS, formatClock, phaseAt, remainingInStage, stageAt } from '../lib/timing'
import type { EventType, Report } from '../lib/types'
import { Timeline } from './Timeline'
import { ToggleButton } from './ReportForms'
import { cx } from './ui'

const STAGE_LABEL = { auto: 'Auto', transition: 'Transition', teleop: 'Teleop', done: 'Done' } as const

/** Keeps the screen awake while a match is being recorded (where supported). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const request = () => {
      navigator.wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => {})
    }
    request()
    const onVisible = () => document.visibilityState === 'visible' && request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [])
}

export function LiveScoring({
  report,
  startedAt,
  tournamentName,
  onChange,
  onDone,
}: {
  report: Report
  startedAt: number
  tournamentName?: string
  onChange(r: Report): void
  onDone(): void
}) {
  const [now, setNow] = useState(() => Date.now())
  useWakeLock()
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [])

  const elapsed = now - startedAt
  const stage = stageAt(elapsed)
  const doneRef = useRef(false)
  useEffect(() => {
    if (stage === 'done' && !doneRef.current) {
      doneRef.current = true
      onDone()
    }
  }, [stage, onDone])

  const tap = (type: EventType) => {
    const t = Date.now() - startedAt
    navigator.vibrate?.(8)
    onChange({ ...report, events: [...report.events, { t, type, phase: phaseAt(t) }] })
  }
  const undo = () => onChange({ ...report, events: report.events.slice(0, -1) })
  const count = (type: EventType) => report.events.filter((e) => e.type === type).length

  const nectar = report.pre.alliance === 'blue' ? 'var(--color-blue)' : 'var(--color-red)'
  const pollen = 'var(--color-pollen)'
  const isAuto = stage === 'auto' || stage === 'transition'
  const flowersOpen = elapsed >= FLOWER_UNLOCK_MS
  const { toggles } = report

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-3">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className={cx('text-xs font-medium uppercase tracking-[0.12em]', stage === 'transition' ? 'text-warn' : 'text-ink-2')}>
            {STAGE_LABEL[stage]}
          </div>
          <div className="tnum text-5xl font-semibold leading-none tracking-tight">{formatClock(remainingInStage(elapsed))}</div>
        </div>
        <div className="min-w-0 text-right text-sm text-ink-2">
          {tournamentName && <div className="max-w-[12rem] truncate text-xs text-ink-3">{tournamentName}</div>}
          <div className="tnum">Match {report.pre.matchNumber}</div>
          <div className="tnum font-medium" style={{ color: nectar }}>
            {report.pre.teamNumber}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-surface px-3 pb-2 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-ink-3">{stage === 'transition' ? 'Taps still count as auto' : 'Live timeline'}</span>
          <button
            type="button"
            onClick={undo}
            disabled={report.events.length === 0}
            className="rounded-md px-2 py-0.5 text-xs text-ink-2 hover:text-ink disabled:opacity-30"
          >
            ↶ Undo
          </button>
        </div>
        <Timeline events={report.events} alliance={report.pre.alliance} now={elapsed} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-ink-2">Nectar</div>
        <div className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-ink-2">Pollen</div>
        <TapButton color={nectar} label="Score" count={count('nectar_score')} onTap={() => tap('nectar_score')} solid />
        <TapButton color={pollen} label="Score" count={count('pollen_score')} onTap={() => tap('pollen_score')} solid />
        <TapButton color={nectar} label="Miss" count={count('nectar_miss')} onTap={() => tap('nectar_miss')} />
        <TapButton color={pollen} label="Miss" count={count('pollen_miss')} onTap={() => tap('pollen_miss')} />
      </div>

      <button
        type="button"
        onClick={() => tap('tip')}
        className="mt-3 flex h-16 w-full items-center justify-between rounded-2xl border border-line bg-surface-2 px-5 text-lg font-medium active:scale-[0.99] active:bg-line"
      >
        <span>Hive tip</span>
        <span className="tnum text-ink-2">{count('tip')}</span>
      </button>

      {/* Space is reserved all match so nothing below shifts when flowers unlock at 1:00. */}
      <div className={cx('mt-3 flex items-center gap-2', !flowersOpen && 'invisible')} aria-hidden={!flowersOpen}>
        <span className="w-20 shrink-0 text-xs text-ink-3">Into flower</span>
        <SmallTap color={nectar} label="Nectar" count={count('flower_nectar')} onTap={() => tap('flower_nectar')} />
        <SmallTap color={pollen} label="Pollen" count={count('flower_pollen')} onTap={() => tap('flower_pollen')} />
      </div>

      <div className={cx('mt-3 grid gap-3', isAuto ? 'grid-cols-2' : 'grid-cols-1')}>
        {isAuto ? (
          <>
            <ToggleButton label="Leave" on={toggles.leave} onChange={(v) => onChange({ ...report, toggles: { ...toggles, leave: v } })} />
            <ToggleButton label="Park" on={toggles.autoPark} onChange={(v) => onChange({ ...report, toggles: { ...toggles, autoPark: v } })} />
          </>
        ) : (
          <ToggleButton label="Park" on={toggles.teleopPark} onChange={(v) => onChange({ ...report, toggles: { ...toggles, teleopPark: v } })} />
        )}
      </div>
    </div>
  )
}

function TapButton({ color, label, count, onTap, solid }: { color: string; label: string; count: number; onTap(): void; solid?: boolean }) {
  const style: CSSProperties = solid
    ? { background: `color-mix(in srgb, ${color} 24%, var(--color-surface))`, borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }
    : { background: 'var(--color-surface)', borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }
  return (
    <button
      type="button"
      onClick={onTap}
      style={style}
      className={cx(
        'relative flex flex-col items-center justify-center rounded-2xl border transition-transform active:scale-[0.97] active:brightness-125',
        solid ? 'h-28' : 'h-20',
      )}
    >
      <span className="text-xl font-medium">{label}</span>
      <span className="tnum mt-0.5 text-sm text-ink-2">{count}</span>
    </button>
  )
}

function SmallTap({ color, label, count, onTap }: { color: string; label: string; count: number; onTap(): void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
      className="flex h-10 flex-1 items-center justify-between rounded-xl border bg-surface px-3 text-sm active:brightness-125"
    >
      <span>{label}</span>
      <span className="tnum text-ink-2">{count}</span>
    </button>
  )
}
