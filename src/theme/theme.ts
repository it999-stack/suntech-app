// src/theme/theme.ts
// Design tokens for the liquid-glass visual system.
// Backdrop: soft indigo/lavender gradient. Surfaces: frosted glass cards.
// Accent: calm indigo — deliberately not construction-site orange/yellow,
// so the app reads as a considered tool rather than a hazard sign.

export const colors = {
  // Backdrop gradient stops (used with expo-linear-gradient)
  backdropStart: '#EEF2FF',
  backdropMid: '#E0E7FF',
  backdropEnd: '#F5F3FF',

  // Glass surfaces
  glassFill: 'rgba(255,255,255,0.55)',
  glassFillStrong: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(255,255,255,0.8)',
  glassShadow: 'rgba(91,95,239,0.15)',

  // Text
  textPrimary: '#1C1C2E',
  textSecondary: '#6B6B80',
  textInverse: '#FFFFFF',

  // Accent
  accent: '#5B5FEF',
  accentSoft: 'rgba(91,95,239,0.12)',

  // Status
  success: '#34C759',
  successSoft: 'rgba(52,199,89,0.14)',
  warning: '#FF9500',
  warningSoft: 'rgba(255,149,0,0.14)',
  danger: '#FF3B30',
  dangerSoft: 'rgba(255,59,48,0.14)',

  // Base
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  greeting: { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0.2 },
  h1: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.2 },
  pageTitle: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  label: { fontSize: 13, fontWeight: '500' as const, letterSpacing: 0.2 },
  cardTitle: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  statNumber: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.5 },
  buttonLabel: { fontSize: 16, fontWeight: '600' as const },
} as const;

export const shadow = {
  glass: {
    shadowColor: colors.glassShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 6,
  },
  soft: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

const theme = { colors, spacing, radius, typography, shadow };
export default theme;