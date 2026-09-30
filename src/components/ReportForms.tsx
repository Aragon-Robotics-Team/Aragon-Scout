import { matchTypeOf } from '../lib/matches'
import { findScheduledMatch, scheduleOf, slotFill } from '../lib/schedule'
import { winnerOf } from '../lib/scoring'
import { teamsOf } from '../lib/teams'
import type { Alliance, MatchType, PostMatch, PreMatch, ScheduledMatch, Toggles, Tournament } from '../lib/types'
import { TeamCombobox } from './TeamCombobox'
import { AlliancePicker, Label, NumberInput, Segmented, Stepper, TextArea, TextInput, cx } from './ui'

export function PreMatchForm({
  value,
  onChange,
  knownNames,
  tournament,
}: {
  value: PreMatch
  onChange(v: PreMatch): void
  /** team number → team name (official list first), for auto-fill */
  knownNames?: Map<number, string>
  /** Supplies the team list and qualification schedule, when set up. */
  tournament?: Tournament
}) {
  const set = <K extends keyof PreMatch>(k: K, v: PreMatch[K]) => onChange({ ...value, [k]: v })
  const other = value.alliance === 'red' ? 'Blue' : value.alliance === 'blue' ? 'Red' : 'Opposing'
  const own = value.alliance === 'red' ? 'Red' : value.alliance === 'blue' ? 'Blue' : 'Same'
  const type = matchTypeOf(value)
  const scheduled = type === 'qual' ? findScheduledMatch(tournament, value.matchNumber) : undefined
  const teams = teamsOf(tournament)
  const nameOf = (n: number | null) => (n != null ? knownNames?.get(n) : undefined)

  // Swap in the known name for a new team number, unless the scout typed a custom one.
  const withTeamNumber = (v: PreMatch, n: number | null): PreMatch => {
    const keepTyped = v.teamName.trim() && v.teamName !== (nameOf(v.teamNumber) ?? '')
    return { ...v, teamNumber: n, teamName: keepTyped ? v.teamName : (nameOf(n) ?? '') }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Match type</Label>
          <Segmented<MatchType>
            className="h-11 w-full [&>button]:h-full [&>button]:flex-1"
            value={type}
            onChange={(t) => set('matchType', t)}
            options={[
              { value: 'qual', label: 'Qual' },
              { value: 'playoff', label: 'Playoff' },
            ]}
          />
        </div>
        <NumberInput label="Match #" value={value.matchNumber} onChange={(v) => set('matchNumber', v)} />
      </div>

      {scheduled && (
        <RobotPicker
          match={scheduled}
          selected={value.teamNumber}
          nameOf={nameOf}
          onPick={(alliance, index) => {
            const fill = slotFill(scheduled, alliance, index)
            const next = withTeamNumber({ ...value, teamName: '' }, fill.teamNumber)
            onChange({ ...next, alliance: fill.alliance, partnerTeam: fill.partnerTeam, opponentTeams: fill.opponentTeams })
          }}
        />
      )}
      {type === 'qual' && !scheduled && value.matchNumber != null && scheduleOf(tournament).length > 0 && (
        <p className="-mt-2 text-xs text-ink-3">Match {value.matchNumber} isn't in the schedule — fill in the teams below.</p>
      )}

      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <NumberInput label="Team #" value={value.teamNumber} onChange={(v) => onChange(withTeamNumber(value, v))} />
        <TeamCombobox
          label="Team name"
          value={value.teamName}
          teams={teams}
          onChange={(name) => set('teamName', name)}
          onPick={(t) => onChange({ ...value, teamNumber: t.number, teamName: t.name })}
        />
      </div>
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

/** The four robots of a scheduled match; one tap fills the pre-match form. */
function RobotPicker({
  match,
  selected,
  nameOf,
  onPick,
}: {
  match: ScheduledMatch
  selected: number | null
  nameOf(n: number): string | undefined
  onPick(alliance: Alliance, index: 0 | 1): void
}) {
  return (
    <div>
      <Label>Which robot are you scouting?</Label>
      <div className="grid grid-cols-2 gap-2">
        {(['red', 'blue'] as const).map((alliance) => (
          <div key={alliance} className="space-y-2">
            {([0, 1] as const).map((i) => {
              const n = (alliance === 'red' ? match.red : match.blue)[i]
              const on = selected === n
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(alliance, i)}
                  className={cx(
                    'flex w-full flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors',
                    on
                      ? alliance === 'red'
                        ? 'border-red bg-red/15'
                        : 'border-blue bg-blue/15'
                      : alliance === 'red'
                        ? 'border-red/30 bg-surface'
                        : 'border-blue/30 bg-surface',
                  )}
                >
                  <span className={cx('text-[10px] font-medium uppercase tracking-wider', alliance === 'red' ? 'text-red' : 'text-blue')}>
                    {alliance} {i + 1}
                  </span>
                  <span className="tnum text-lg font-semibold leading-tight">{n}</span>
                  <span className="w-full truncate text-xs text-ink-2">{nameOf(n) || '\u00a0'}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
