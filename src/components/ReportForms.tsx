import { winnerOf } from '../lib/scoring'
import type { PostMatch, PreMatch, Toggles } from '../lib/types'
import { AlliancePicker, Label, NumberInput, Stepper, TextArea, TextInput, cx } from './ui'

export function PreMatchForm({
  value,
  onChange,
  knownNames,
}: {
  value: PreMatch
  onChange(v: PreMatch): void
  /** team number → last known team name, for auto-fill */
  knownNames?: Map<number, string>
}) {
  const set = <K extends keyof PreMatch>(k: K, v: PreMatch[K]) => onChange({ ...value, [k]: v })
  const other = value.alliance === 'red' ? 'Blue' : value.alliance === 'blue' ? 'Red' : 'Opposing'
  const own = value.alliance === 'red' ? 'Red' : value.alliance === 'blue' ? 'Blue' : 'Same'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Match #" value={value.matchNumber} onChange={(v) => set('matchNumber', v)} />
        <NumberInput
          label="Team #"
          value={value.teamNumber}
          onChange={(v) => {
            const known = v != null ? knownNames?.get(v) : undefined
            onChange({ ...value, teamNumber: v, teamName: value.teamName.trim() ? value.teamName : (known ?? '') })
          }}
        />
      </div>
      <TextInput label="Team name" value={value.teamName} onChange={(e) => set('teamName', e.target.value)} autoComplete="off" />
      <div className="grid grid-cols-2 gap-3">
        <AlliancePicker label="Alliance" value={value.alliance} onChange={(v) => set('alliance', v)} />
        <TextInput
          label="Starting position"
          value={value.startingPosition}
          onChange={(e) => set('startingPosition', e.target.value)}
          placeholder="e.g. near hive"
          autoComplete="off"
        />
      </div>
      <div>
        <Label hint="optional">Other teams in this match</Label>
        <div className="grid grid-cols-3 gap-2">
          <NumberInput label={`${own} partner`} value={value.partnerTeam} onChange={(v) => set('partnerTeam', v)} placeholder="#" />
          <NumberInput
            label={`${other} 1`}
            value={value.opponentTeams[0]}
            onChange={(v) => set('opponentTeams', [v, value.opponentTeams[1]])}
            placeholder="#"
          />
          <NumberInput
            label={`${other} 2`}
            value={value.opponentTeams[1]}
            onChange={(v) => set('opponentTeams', [value.opponentTeams[0], v])}
            placeholder="#"
          />
        </div>
      </div>
      <TextArea label="Notes" value={value.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
    </div>
  )
}

export function PostMatchForm({
  value,
  onChange,
  alliance,
}: {
  value: PostMatch
  onChange(v: PostMatch): void
  alliance: PreMatch['alliance']
}) {
  const set = <K extends keyof PostMatch>(k: K, v: PostMatch[K]) => onChange({ ...value, [k]: v })
  const winner = winnerOf(value.redScore, value.blueScore)
  const allianceName = alliance === 'red' ? 'Red' : alliance === 'blue' ? 'Blue' : 'Your'

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-3 text-xs text-ink-3">{allianceName} alliance totals at the end of the match</p>
        <div className="grid grid-cols-2 gap-3">
          <Stepper
            label="Bottom nectar flowers"
            hint="0–4"
            max={4}
            value={value.bottomNectarFlowers}
            onChange={(v) => set('bottomNectarFlowers', v)}
          />
          <Stepper label="Balls in owned flowers" value={value.ownedFlowerBalls} onChange={(v) => set('ownedFlowerBalls', v)} />
          <Stepper label="Balls in garden" value={value.gardenBalls} onChange={(v) => set('gardenBalls', v)} />
          <Stepper label="Balls left in cell" value={value.cellBalls} onChange={(v) => set('cellBalls', v)} />
        </div>
      </div>
      <div>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Red final score" value={value.redScore} onChange={(v) => set('redScore', v)} />
          <NumberInput label="Blue final score" value={value.blueScore} onChange={(v) => set('blueScore', v)} />
        </div>
        <p className="mt-2 h-4 text-xs text-ink-2">
          {winner === 'tie' && 'Tie'}
          {winner === 'red' && <span className="text-red">Red wins</span>}
          {winner === 'blue' && <span className="text-blue">Blue wins</span>}
        </p>
      </div>
      <TextArea label="Notes about strategy" value={value.strategyNotes} onChange={(e) => set('strategyNotes', e.target.value)} />
    </div>
  )
}

export function ToggleButton({
  label,
  on,
  onChange,
  className,
}: {
  label: string
  on: boolean
  onChange(v: boolean): void
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx(
        'flex h-12 items-center justify-center gap-2 rounded-xl border text-[15px] font-medium transition-colors',
        on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2',
        className,
      )}
    >
      <span
        aria-hidden
        className={cx('flex h-4 w-4 items-center justify-center rounded-full border text-[10px]', on ? 'border-bg' : 'border-ink-3')}
      >
        {on ? '✓' : ''}
      </span>
      {label}
    </button>
  )
}

export function TogglesForm({ value, onChange }: { value: Toggles; onChange(v: Toggles): void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <ToggleButton label="Leave" on={value.leave} onChange={(v) => onChange({ ...value, leave: v })} />
      <ToggleButton label="Auto park" on={value.autoPark} onChange={(v) => onChange({ ...value, autoPark: v })} />
      <ToggleButton label="Teleop park" on={value.teleopPark} onChange={(v) => onChange({ ...value, teleopPark: v })} />
    </div>
  )
}
