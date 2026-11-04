import { useEffect, useRef, useState } from 'react'
import { matchLabel, matchTypeOf } from '../lib/matches'
import { AUTO_MS, MATCH_MS, TELEOP_START_MS, clockElapsed, formatClock, matchRemaining, phaseAt, remainingInStage, stageAt, type Clock } from '../lib/timing'
import type { EventType, Report } from '../lib/types'
import { Timeline } from './Timeline'
import { ToggleButton } from './ReportForms'
import { StartPositionButton } from './StartPosition'
import { Button, cx } from './ui'

/** How long before the end of auto and of teleop Park lights up. */
const PARK_HINT_MS = 15_000

/** A ball type's − takes back its last entry, make or miss. */
const NECTAR: EventType[] = ['nectar_score', 'nectar_miss']
const POLLEN: EventType[] = ['pollen_score', 'pollen_miss']

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
  clock,
  tournamentName,
  onChange,
  onClock,
  onBack,
  onDone,
}: {
  report: Report
  clock: Clock
  tournamentName?: string
  onChange(r: Report): void
  onClock(c: Clock): void
  /** Back to the pre-match form; only offered before Start. */
  onBack(): void
  /** The match ended, either on time or early; `elapsed` is where the clock stopped. */
  onDone(elapsed: number): void
}) {
  const [now, setNow] = useState(() => Date.now())
  useWakeLock()
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [])

  const started = clock.startedAt != null
  const running = started && clock.pausedAt == null
  const elapsed = clockElapsed(clock, now)
  const stage = stageAt(elapsed)
  const doneRef = useRef(false)
  useEffect(() => {
    if (stage === 'done' && !doneRef.current) {
      doneRef.current = true
      onDone(MATCH_MS)
    }
  }, [stage, onDone])

  const start = () => onClock({ startedAt: Date.now(), pausedAt: null, pausedMs: 0 })
  const stop = () => {
    onClock({ ...clock, pausedAt: Date.now() })
    if (!report.paused) onChange({ ...report, paused: true })
  }
  const resume = () => onClock({ ...clock, pausedAt: null, pausedMs: clock.pausedMs + (Date.now() - clock.pausedAt!) })
  // Nudging lines the clock up with the field's, so unlike stopping it doesn't mark the recording paused.
  // Moving startedAt shifts elapsed time without touching taps already recorded.
  const shift = (ms: number) => {
    const by = Math.max(ms, -clockElapsed(clock, Date.now()))
    onClock({ ...clock, startedAt: clock.startedAt! - by })
  }
  const skip = () => shift(TELEOP_START_MS - clockElapsed(clock, Date.now()))
  const end = () => {
    if (!confirm('End the recording now? It will be saved as incomplete.')) return
    doneRef.current = true
    onDone(clockElapsed(clock, Date.now()))
  }

  // Taps still land while paused (at the stopped time) so a scout can catch up or fix mistakes.
  const tap = (type: EventType) => {
    if (!started) return
    const t = clockElapsed(clock, Date.now())
    navigator.vibrate?.(8)
    onChange({ ...report, events: [...report.events, { t, type, phase: phaseAt(t) }] })
  }
  /** Removes the most recently entered of these event types; a double buzz tells it apart from a tap. */
  const remove = (types: EventType[]) => {
    const i = report.events.findLastIndex((e) => types.includes(e.type))
    if (i < 0) return
    navigator.vibrate?.([6, 50, 6])
    onChange({ ...report, events: report.events.toSpliced(i, 1) })
  }
  const count = (type: EventType) => report.events.filter((e) => e.type === type).length
  const has = (types: EventType[]) => report.events.some((e) => types.includes(e.type))

  const nectar = report.pre.alliance === 'blue' ? 'var(--color-blue)' : 'var(--color-red)'
  const pollen = 'var(--color-pollen)'
  const isAuto = stage === 'auto' || stage === 'transition'
  // Robots park at the end of each period, so Park lights up for its last stretch.
  const parkSoon = running && ((elapsed >= AUTO_MS - PARK_HINT_MS && elapsed < AUTO_MS) || elapsed >= MATCH_MS - PARK_HINT_MS)
  const { toggles } = report
  const setToggle = (k: keyof typeof toggles, v: boolean) => onChange({ ...report, toggles: { ...toggles, [k]: v } })

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-2">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <div className={cx('text-[11px] font-medium uppercase tracking-[0.12em]', stage === 'transition' || (started && !running) ? 'text-warn' : 'text-ink-2')}>
            {!started ? 'Ready' : !running ? `Paused · ${STAGE_LABEL[stage]}` : STAGE_LABEL[stage]}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="tnum text-4xl font-semibold leading-none tracking-tight">{formatClock(remainingInStage(elapsed))}</span>
            <span className="tnum text-lg text-ink-3" title="Match time left">
              {formatClock(matchRemaining(elapsed))}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-right text-sm text-ink-2">
          {report.pre.start && <StartPositionButton value={report.pre.start} alliance={report.pre.alliance} compact />}
          <div className="min-w-0">
            {tournamentName && <div className="max-w-[10rem] truncate text-[11px] text-ink-3">{tournamentName}</div>}
            <div className="tnum">
              {matchLabel(matchTypeOf(report.pre), report.pre.matchNumber)} ·{' '}
              <span className="font-medium" style={{ color: nectar }}>
                {report.pre.teamNumber}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-2 flex gap-2">
        {!started ? (
          <>
            <Button variant="ghost" onClick={onBack}>
              ← Back
            </Button>
            <Button variant="primary" className="h-12 flex-1 text-base" onClick={start}>
              Start
            </Button>
          </>
        ) : (
          <>
            <div className="flex h-11 min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface-2 text-sm font-medium">
              <button type="button" onClick={() => shift(-1000)} aria-label="Back 1 second" className="flex-[2] border-r border-line active:bg-line">
                ⏪ 1s
              </button>
              <button
                type="button"
                onClick={running ? stop : resume}
                className={cx('flex-[3] border-r border-line', running ? 'active:bg-line' : 'bg-accent text-on-accent')}
              >
                {running ? '❚❚ Pause' : '▶ Play'}
              </button>
              <button type="button" onClick={() => shift(1000)} aria-label="Forward 1 second" className="flex-[4] active:bg-line">
                1s ⏩
              </button>
            </div>
            {stage === 'teleop' ? (
              <Button variant="ghost" className="px-3" onClick={end}>
                End match
              </Button>
            ) : (
              <Button variant="ghost" className="px-3" onClick={skip}>
                Skip period
              </Button>
            )}
          </>
        )}
      </div>

      {/* Leave and park aren't timed, so they stay usable while stopped. */}
      <div className={cx('mb-2 grid gap-2', isAuto ? 'grid-cols-2' : 'grid-cols-1', !started && 'pointer-events-none opacity-40')}>
        {isAuto && <ToggleButton label="Leave" on={toggles.leave} onChange={(v) => setToggle('leave', v)} className="h-11" />}
        <ParkButton
          on={isAuto ? toggles.autoPark : toggles.teleopPark}
          onChange={(v) => setToggle(isAuto ? 'autoPark' : 'teleopPark', v)}
          label={isAuto ? 'Auto park' : 'Park'}
          highlight={parkSoon}
        />
      </div>

      <div className="mb-2 rounded-2xl border border-line bg-surface px-3 pb-1.5 pt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-ink-3">
            {!started ? 'Press Start when the match starts' : !running ? 'Paused — taps still count, at this time' : stage === 'transition' ? 'Taps still count as auto' : 'Live timeline'}
          </span>
        </div>
        <Timeline events={report.events} alliance={report.pre.alliance} now={elapsed} compact />
      </div>

      <div className={cx('transition-opacity', !started && 'pointer-events-none opacity-40')} aria-disabled={!started}>
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">Nectar</div>
          <div className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">Pollen</div>
          <ScoreButton color={nectar} count={count('nectar_score')} canRemove={has(NECTAR)} onScore={() => tap('nectar_score')} onRemove={() => remove(NECTAR)} />
          <ScoreButton color={pollen} count={count('pollen_score')} canRemove={has(POLLEN)} onScore={() => tap('pollen_score')} onRemove={() => remove(POLLEN)} />
          <TapButton color={nectar} label="Miss" count={count('nectar_miss')} onTap={() => tap('nectar_miss')} />
          <TapButton color={pollen} label="Miss" count={count('pollen_miss')} onTap={() => tap('pollen_miss')} />
        </div>

        <div className="mt-2 flex h-14 overflow-hidden rounded-2xl border border-line bg-surface-2 text-lg font-medium">
          <MinusButton onClick={() => remove(['tip'])} disabled={!has(['tip'])} label="Remove last hive tip" />
          <button type="button" onClick={() => tap('tip')} className="flex flex-1 items-center justify-between px-5 active:bg-line">
            <span>+ Hive tip</span>
            <span className="tnum text-ink-2">{count('tip')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/** Park, ringed and labeled while it's time to park. */
function ParkButton({ on, onChange, label, highlight }: { on: boolean; onChange(v: boolean): void; label: string; highlight: boolean }) {
  return (
    <div className="relative">
      <ToggleButton label={highlight && !on ? `${label} now` : label} on={on} onChange={onChange} className={cx('h-11 w-full', highlight && !on && 'border-warn text-warn')} />
      {highlight && !on && <span aria-hidden className="pointer-events-none absolute inset-0 animate-pulse rounded-xl ring-2 ring-warn" />}
    </div>
  )
}

/** Score with a − beside it. */
function ScoreButton({ color, count, canRemove, onScore, onRemove }: { color: string; count: number; canRemove: boolean; onScore(): void; onRemove(): void }) {
  return (
    <div
      className="flex h-28 overflow-hidden rounded-2xl border"
      style={{ background: `color-mix(in srgb, ${color} 24%, var(--color-surface))`, borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}
    >
      <MinusButton onClick={onRemove} disabled={!canRemove} label="Remove last entry" />
      <button type="button" onClick={onScore} className="flex flex-1 flex-col items-center justify-center transition-transform active:scale-[0.97] active:brightness-125">
        <span className="text-xl font-medium">+ Score</span>
        <span className="tnum mt-0.5 text-sm text-ink-2">{count}</span>
      </button>
    </div>
  )
}

/** The thumb-sized, muted left half of a split button. */
function MinusButton({ onClick, disabled, label }: { onClick(): void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-16 shrink-0 border-r border-line bg-surface text-2xl font-medium text-ink-2 active:bg-line disabled:opacity-30"
    >
      −
    </button>
  )
}

function TapButton({ color, label, count, onTap }: { color: string; label: string; count: number; onTap(): void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{ background: 'var(--color-surface)', borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
      className="relative flex h-20 flex-col items-center justify-center rounded-2xl border transition-transform active:scale-[0.97] active:brightness-125"
    >
      <span className="text-xl font-medium">{label}</span>
      <span className="tnum mt-0.5 text-sm text-ink-2">{count}</span>
    </button>
  )
}
