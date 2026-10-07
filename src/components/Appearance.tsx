import { useState } from 'react'
import { useAuth } from '../app/auth'
import { ACCENTS, BACKGROUNDS, CARDS, isDeviceOnly, loadTheme, saveTheme, setDeviceOnly, type Base, type Mode, type Swatch, type ThemeSettings } from '../lib/theme'
import { ToggleButton } from './ReportForms'
import { Card, Label, Segmented, cx } from './ui'

/** Light, dark, follow the phone, or a custom theme built from checked swatches. */
export function AppearanceCard() {
  const { account, saveAccountTheme, localMode } = useAuth()
  const [theme, setTheme] = useState<ThemeSettings>(loadTheme)
  const [deviceOnly, setDeviceOnlyState] = useState(isDeviceOnly)
  const update = (patch: Partial<ThemeSettings>) => {
    const next = { ...theme, ...patch }
    setTheme(next)
    saveTheme(next)
    // Offline, it still applies here and is saved to the account next time.
    if (!deviceOnly && account && !localMode) void saveAccountTheme(next).catch(() => {})
  }
  return (
    <Card className="mt-4 p-4">
      <h2 className="font-medium">Appearance</h2>
      <p className="mb-3 mt-1 text-sm text-ink-2">
        {deviceOnly || localMode ? 'Saved on this device.' : 'Saved to your account, so it follows you to every device.'} Red and blue always mean the alliances.
      </p>
      <Segmented<Mode>
        className="w-full [&>button]:flex-1"
        value={theme.mode}
        onChange={(mode) => update({ mode })}
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'system', label: 'Phone' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {theme.mode === 'custom' && (
        <div className="mt-4 space-y-4">
          <div>
            <Label>Base</Label>
            <Segmented<Base>
              value={theme.base}
              // Swatches belong to a base, so switching it starts from that base's defaults.
              onChange={(base) => update({ base, accent: 'default', background: 'default', card: 'default' })}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>
          <Swatches label="Accent" list={ACCENTS[theme.base]} value={theme.accent} onChange={(accent) => update({ accent })} />
          <Swatches label="Background" list={BACKGROUNDS[theme.base]} value={theme.background} onChange={(background) => update({ background })} />
          <Swatches label="Cards" list={CARDS[theme.base]} value={theme.card} onChange={(card) => update({ card })} />
        </div>
      )}
      {!localMode && (
        <ToggleButton
          className="mt-4 w-full"
          label="Different theme on this device"
          on={deviceOnly}
          onChange={(v) => {
            setDeviceOnly(v)
            setDeviceOnlyState(v)
            // Turning it off goes back to the account's theme.
            if (!v && account?.theme) {
              saveTheme(account.theme)
              setTheme(account.theme)
            }
          }}
        />
      )}
    </Card>
  )
}

function Swatches({ label, list, value, onChange }: { label: string; list: Swatch[]; value: string; onChange(id: string): void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={value === s.id}
            onClick={() => onChange(s.id)}
            className={cx(
              'flex h-10 items-center gap-2 rounded-full border pl-1.5 pr-3 text-xs',
              value === s.id ? 'border-ink text-ink' : 'border-line text-ink-2 hover:border-ink-3',
            )}
          >
            <span className="h-7 w-7 rounded-full border border-line" style={{ background: s.preview }} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
