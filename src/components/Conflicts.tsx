import { useState } from 'react'
import { factMessage, needsFixing, type Fact } from '../lib/consensus'
import { formatNum } from '../lib/scoring'
import type { Resolution } from '../lib/types'
import { MiniFlowers } from './Flowers'
import { Button, Modal, NumberInput, cx } from './ui'

const fmt = (v: number | null) => (v == null ? '—' : Number.isInteger(v) ? String(v) : formatNum(v))

/** How a disagreement is being handled, in a few words. */
function standing(f: Fact): string {
  if (f.resolution && 'value' in f.resolution) return `set to ${fmt(f.resolution.value)}`
  if (f.resolution) return `kept as entered · using ${fmt(f.value)}`
  if (f.status === 'large') return 'needs fixing · left out of stats'
  return `using the average, ${fmt(f.value)}`
}

/**
 * Everything recordings of a match disagree on. Small differences only warn;
 * large ones get a Resolve button when `onResolve` is given.
 */
export function ConflictPanel({
  facts,
  lineupIssues,
  onResolve,
}: {
  facts: Fact[]
  lineupIssues: string[]
  onResolve?(f: Fact, r: Resolution | null): Promise<void>
}) {
  const [open, setOpen] = useState<Fact | null>(null)
  const shown = facts.filter((f) => f.status !== 'agreed')
  if (shown.length === 0 && lineupIssues.length === 0) return null
  const urgent = shown.some(needsFixing)
  return (
    <div className={cx('mb-4 rounded-xl border px-3 py-2 text-sm', urgent ? 'border-red/50 bg-red/10' : 'border-warn/40 bg-warn/10')}>
      <div className={cx('font-medium', urgent ? 'text-red' : 'text-warn')}>⚠ Recordings disagree{urgent && ' — needs fixing'}</div>
      <ul className="mt-1 space-y-1.5 text-ink-2">
        {lineupIssues.map((c) => (
          <li key={c}>{c}</li>
        ))}
        {shown.map((f) => {
          const fixed = !!f.resolution && 'value' in f.resolution
          return (
            <li key={f.key} className="flex items-start justify-between gap-3">
              <span className={cx(fixed && 'text-ink-3')}>
                {fixed ? `${f.label}: ${f.entries.map((e) => fmt(e.value)).join(' vs ')}` : factMessage(f)}
                <span className="block text-xs text-ink-3">{standing(f)}</span>
              </span>
              {onResolve && (f.status === 'large' || f.resolution) && (
                <Button variant={needsFixing(f) ? 'primary' : 'ghost'} className="h-8 shrink-0 px-3 text-xs" onClick={() => setOpen(f)}>
                  {needsFixing(f) ? 'Resolve' : 'Change'}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {onResolve && open && <ResolveDialog fact={open} onClose={() => setOpen(null)} onSave={(r) => onResolve(open, r)} />}
    </div>
  )
}

function ResolveDialog({ fact, onClose, onSave }: { fact: Fact; onClose(): void; onSave(r: Resolution | null): Promise<void> }) {
  const current = fact.resolution && 'value' in fact.resolution ? fact.resolution.value : null
  const [custom, setCustom] = useState<number | null>(current)
  const choices = [...new Map(fact.entries.map((e) => [e.value, fact.entries.filter((x) => x.value === e.value)])).entries()]
  const save = async (r: Resolution | null) => {
    await onSave(r)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Fix ${fact.label.toLowerCase()}`}>
      <p className="mb-3 text-sm text-ink-2">
        Pick the right value. Every recording stays as the scout entered it; this agreed value is what stats use.
        {fact.detail && <span className="mt-1 block text-ink-3">{fact.detail}.</span>}
      </p>
      <div className="space-y-2">
        {choices.map(([value, entries]) => (
          <button
            key={value}
            type="button"
            onClick={() => save({ value })}
            className={cx(
              'flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left hover:border-ink-3',
              current === value ? 'border-ink bg-surface-2' : 'border-line',
            )}
          >
            <span className="tnum text-lg font-semibold">{fmt(value)}</span>
            <span className="flex flex-col items-end gap-1 text-xs text-ink-3">
              recorded by {entries.map((e) => (e.scout ? `@${e.scout}` : e.teamNumber != null ? `${e.teamNumber}'s scout` : 'a scout')).join(', ')}
              {entries.map((e) => e.flowers && <MiniFlowers key={e.reportId} flowers={e.flowers} />)}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <NumberInput label="Or enter the right value" value={custom} onChange={setCustom} className="flex-1" />
        <Button variant="primary" disabled={custom == null} onClick={() => save({ value: custom! })}>
          Use
        </Button>
      </div>
      <div className="mt-4 flex justify-between border-t border-line pt-3">
        <Button variant="ghost" onClick={() => save(fact.resolution ? null : { keep: true })}>
          {fact.resolution ? 'Undo fix' : 'Keep as is'}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  )
}

