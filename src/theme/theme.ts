// src/theme/theme.ts
//
// Design tokens for the light glassmorphism visual system.
// Backdrop: soft cream / blush / lavender wash (no strong hue dominates).
// Surfaces: frosted white cards over that wash, bold near-black text
// carrying the hierarchy instead of color. Indigo stays the primary accent
// for actions; pink is a secondary accent reserved for small badges.

// Backdrop gradient stops — declared standalone so backdropGradient below can
// bundle them into a reusable array without duplicating the hex values.
const backdropStart = '#dae5f3';
const backdropMid = '#eaecf8';
const backdropEnd = '#EBD8D6';

export const colors = {
  // Backdrop gradient stops (used with expo-linear-gradient)
  backdropStart,
  backdropMid,
  backdropEnd,

  // border / divider / muted text
  border: 'rgba(20,20,31,0.08)',

  // Glass surfaces — lighter and less tinted than before, so cards read as
  // frosted-over-light rather than frosted-over-color
  glassFill: 'rgba(255,255,255,0.65)',
  glassFillStrong: 'rgba(255,255,255,0.85)',
  glassBorder: 'rgba(255,255,255,0.85)',
  glassShadow: 'rgba(20,20,31,0.08)',

  // Text — near-black instead of navy, for the bold-headline look
  textPrimary: '#14141F',
  textSecondary: '#8A8A94',
  textInverse: '#FFFFFF',

  // Accent — indigo for primary actions, pink as a secondary badge accent
  accent: '#14141F',
  accentPink: '#E8467C',
  accentBlue: '#66b5da',
  accentSoft: 'rgba(91,95,239,0.10)',
  accentPinkSoft: 'rgba(232,70,124,0.10)',

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
  transparent: 'transparent',

  // Decorative gradient blob (used behind gradient-tile quick actions)
  blobStops: ['#FBD9C4', '#F3B7A6', '#D9C9F0'] as [string, string, string],

  // GradientTile backgrounds (src/components/shared/GradientTile.tsx) — the
  // app's own screen-backdrop wash, reusable as a tile/card background, and a
  // lighter cream-only alternative for a second tile sitting next to it.
  backdropGradient: [backdropStart, backdropMid, backdropEnd] as [string, string, string],
  creamGradient: ['#FFFFFF', '#FDF6F3'] as [string, string],

  // Machine visualizations (timelines, charts, chips) — unchanged
  machine: {
    rigColors: ['#EA580C', '#F97316', '#FB923C', '#FDBA74'],
    craneColors: ['#0369A1', '#0284C7', '#38BDF8', '#7DD3FC'],
    compressorColors: ['#6D28D9', '#7C3AED', '#A78BFA', '#C4B5FD'],
    break: '#fbbf24',
    idle: '#c7c7d6',
    unused: '#e4e4e7',
  },

  machines: {
    rig: {
      color: '#EA580C',
      soft: 'rgba(234,88,12,0.12)',
    },
    crane: {
      color: '#0284C7',
      soft: 'rgba(2,132,199,0.12)',
    },
    compressor: {
      color: '#7C3AED',
      soft: 'rgba(124,58,237,0.12)',
    },

    break: '#fbbf24',
    idle: '#c7c7d6',
    unused: '#e4e4e7',
  },
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  greeting: { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0.2 },
  h1: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
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
    shadowRadius: 20,
    elevation: 4,
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