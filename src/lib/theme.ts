import { readJson, writeJson } from './storage'

// Themes swap the color tokens from index.css. Red and blue never change:
// they mean the alliances. Every option here was picked to keep text readable
// on its base, so any combination works.

export type Base = 'dark' | 'light'
export type Mode = Base | 'system' | 'custom'

export interface ThemeSettings {
  mode: Mode
  /** The rest only applies to the custom theme. */
  base: Base
  accent: string
  background: string
  card: string
}

export const DEFAULT_THEME: ThemeSettings = { mode: 'dark', base: 'dark', accent: 'default', background: 'default', card: 'default' }

export interface Swatch {
  id: string
  label: string
  /** CSS variables this choice sets, without the `--color-` prefix. */
  vars: Record<string, string>
  /** What the swatch button shows. */
  preview: string
}

/** Accents color primary buttons and switched-on toggles. Red, blue and amber are taken by the game. */
export const ACCENTS: Record<Base, Swatch[]> = {
  dark: [
    { id: 'default', label: 'White', preview: '#ededef', vars: { accent: '#ededef', 'on-accent': '#0e0e10' } },
    { id: 'violet', label: 'Violet', preview: '#a78bfa', vars: { accent: '#a78bfa', 'on-accent': '#140d24' } },
    { id: 'teal', label: 'Teal', preview: '#2dd4bf', vars: { accent: '#2dd4bf', 'on-accent': '#04201c' } },
    { id: 'green', label: 'Green', preview: '#4ade80', vars: { accent: '#4ade80', 'on-accent': '#05200e' } },
    { id: 'pink', label: 'Pink', preview: '#f472b6', vars: { accent: '#f472b6', 'on-accent': '#2a0717' } },
    { id: 'orange', label: 'Orange', preview: '#fb923c', vars: { accent: '#fb923c', 'on-accent': '#2a1203' } },
  ],
  light: [
    { id: 'default', label: 'Black', preview: '#16161a', vars: { accent: '#16161a', 'on-accent': '#ffffff' } },
    { id: 'violet', label: 'Violet', preview: '#6d28d9', vars: { accent: '#6d28d9', 'on-accent': '#ffffff' } },
    { id: 'teal', label: 'Teal', preview: '#0f766e', vars: { accent: '#0f766e', 'on-accent': '#ffffff' } },
    { id: 'green', label: 'Green', preview: '#15803d', vars: { accent: '#15803d', 'on-accent': '#ffffff' } },
    { id: 'pink', label: 'Pink', preview: '#be185d', vars: { accent: '#be185d', 'on-accent': '#ffffff' } },
    { id: 'orange', label: 'Orange', preview: '#c2410c', vars: { accent: '#c2410c', 'on-accent': '#ffffff' } },
  ],
}

export const BACKGROUNDS: Record<Base, Swatch[]> = {
  dark: [
    { id: 'default', label: 'Charcoal', preview: '#0e0e10', vars: { bg: '#0e0e10' } },
    { id: 'navy', label: 'Navy', preview: '#0a0f1e', vars: { bg: '#0a0f1e' } },
    { id: 'forest', label: 'Forest', preview: '#08120d', vars: { bg: '#08120d' } },
    { id: 'plum', label: 'Plum', preview: '#130b16', vars: { bg: '#130b16' } },
    { id: 'black', label: 'Black', preview: '#000000', vars: { bg: '#000000' } },
  ],
  light: [
    { id: 'default', label: 'Paper', preview: '#f6f6f7', vars: { bg: '#f6f6f7' } },
    { id: 'warm', label: 'Warm', preview: '#f7f3ea', vars: { bg: '#f7f3ea' } },
    { id: 'cool', label: 'Cool', preview: '#eef3f9', vars: { bg: '#eef3f9' } },
    { id: 'mint', label: 'Mint', preview: '#edf6f1', vars: { bg: '#edf6f1' } },
    { id: 'white', label: 'White', preview: '#ffffff', vars: { bg: '#ffffff' } },
  ],
}

export const CARDS: Record<Base, Swatch[]> = {
  dark: [
    { id: 'default', label: 'Graphite', preview: '#16161a', vars: { surface: '#16161a', 'surface-2': '#1e1e23', line: '#2a2a30' } },
    { id: 'slate', label: 'Slate', preview: '#141a26', vars: { surface: '#141a26', 'surface-2': '#1b2333', line: '#273246' } },
    { id: 'moss', label: 'Moss', preview: '#121b16', vars: { surface: '#121b16', 'surface-2': '#18241d', line: '#24352b' } },
    { id: 'mauve', label: 'Mauve', preview: '#1c1420', vars: { surface: '#1c1420', 'surface-2': '#251a2b', line: '#35263d' } },
  ],
  light: [
    { id: 'default', label: 'White', preview: '#ffffff', vars: { surface: '#ffffff', 'surface-2': '#f0f0f2', line: '#dedee3' } },
    { id: 'cream', label: 'Cream', preview: '#fffdf7', vars: { surface: '#fffdf7', 'surface-2': '#f4efe3', line: '#e3dccb' } },
    { id: 'frost', label: 'Frost', preview: '#f9fbfe', vars: { surface: '#f9fbfe', 'surface-2': '#e9eff7', line: '#d5dfec' } },
    { id: 'sage', label: 'Sage', preview: '#fafdfb', vars: { surface: '#fafdfb', 'surface-2': '#e7f1eb', line: '#d1e2d8' } },
  ],
}

const KEY = 'as.theme'
/** What the inline script in index.html applies before the app loads, so there's no flash. */
const APPLIED_KEY = 'as.theme-applied'

export function loadTheme(): ThemeSettings {
  return { ...DEFAULT_THEME, ...readJson<Partial<ThemeSettings>>(KEY) }
}

export function saveTheme(t: ThemeSettings): void {
  writeJson(KEY, t)
  applyTheme(t)
}

const DEVICE_ONLY_KEY = 'as.theme-device-only'

/** True when this device keeps its own theme instead of following the account's. */
export function isDeviceOnly(): boolean {
  return readJson<boolean>(DEVICE_ONLY_KEY) === true
}

export function setDeviceOnly(v: boolean): void {
  writeJson(DEVICE_ONLY_KEY, v)
}

const pick = (list: Swatch[], id: string) => list.find((s) => s.id === id) ?? list[0]

/** The base and the variable overrides a setting resolves to. */
export function resolveTheme(t: ThemeSettings, prefersLight: boolean): { base: Base; vars: Record<string, string> } {
  if (t.mode === 'custom') {
    return {
      base: t.base,
      vars: { ...pick(ACCENTS[t.base], t.accent).vars, ...pick(BACKGROUNDS[t.base], t.background).vars, ...pick(CARDS[t.base], t.card).vars },
    }
  }
  const base: Base = t.mode === 'system' ? (prefersLight ? 'light' : 'dark') : t.mode
  return { base, vars: {} }
}

const VAR_NAMES = ['accent', 'on-accent', 'bg', 'surface', 'surface-2', 'line']

export function applyTheme(t: ThemeSettings): void {
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false
  const { base, vars } = resolveTheme(t, prefersLight)
  const root = document.documentElement
  root.dataset.theme = base
  for (const name of VAR_NAMES) root.style.removeProperty(`--color-${name}`)
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(`--color-${name}`, value)
  const bg = vars.bg ?? getComputedStyle(root).getPropertyValue('--color-bg').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  writeJson(APPLIED_KEY, { mode: t.mode, base, vars })
}
