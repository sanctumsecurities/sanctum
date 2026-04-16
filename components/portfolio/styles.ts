import type { CSSProperties } from 'react'

export const COLORS = {
  bg: '#0a0a0a',
  panel: '#0d0d0d',
  border: '#1a1a1a',
  borderStrong: '#2a2a2a',
  text: '#fff',
  textDim: '#a8a8a8',
  textMuted: '#8a8a8a',
  textFaint: '#6a6a6a',
  divider: '#111',
  pos: '#22c55e',
  neg: '#ef4444',
  warn: '#f59e0b',
} as const

export const PIE_PALETTE = [
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#f59e0b',
  '#64748b',
  '#ec4899',
  '#14b8a6',
  '#eab308',
] as const

export const MONO = "'JetBrains Mono', monospace"

export const panelStyle: CSSProperties = {
  background: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  padding: '14px 16px',
}

export const sectionLabel: CSSProperties = {
  fontSize: 10,
  color: COLORS.textMuted,
  fontFamily: MONO,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
}

export const sectionHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: 10,
  marginBottom: 12,
  borderBottom: `1px solid ${COLORS.border}`,
}

export function signColor(n: number | null | undefined): string {
  if (n == null || n === 0) return COLORS.textDim
  return n > 0 ? COLORS.pos : COLORS.neg
}

export function fmtUsd(n: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = opts.signed && n > 0 ? '+' : ''
  const abs = Math.abs(n)
  const str = abs >= 1000
    ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : sign}$${str}`
}

export function fmtPct(n: number | null | undefined, opts: { signed?: boolean; digits?: number } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const digits = opts.digits ?? 2
  const v = n * 100
  const sign = opts.signed && v > 0 ? '+' : ''
  return `${sign}${v.toFixed(digits)}%`
}

export function fmtNumber(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}
