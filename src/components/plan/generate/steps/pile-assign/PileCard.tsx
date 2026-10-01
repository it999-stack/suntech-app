// src/components/plan/generate/steps/pile-assign/PileCard.tsx
//
// One pile card: pile picture, code, location, dimensions, and a caller-supplied
// footer (machine badges, status pills…). Shared by PileGridTable (selectable)
// and ResumeConfirmStep's planned-piles grid (read-only, grouped by rig).

import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import Checkbox from '@components/shared/Checkbox';
import type { EligiblePile } from './types';

const SELECTED_CARD_BG = '#EAF3FC';

interface PileCardProps {
  pile: EligiblePile;
  /** Display name of the pile's location, or null when it has none. */
  location: string | null;
  /** Renders the checkbox above the picture; omit for read-only cards. */
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /** Full-width content under the pile details (badges, status pills…). */
  footer?: React.ReactNode;
  /** Sizing from the parent grid (e.g. width: '48.5%'). */
  style?: StyleProp<ViewStyle>;
  cardRef?: (el: View | null) => void;
}

export default function PileCard({
  pile, location, selectable = false, selected = false, disabled = false, onPress, footer, style, cardRef,
}: PileCardProps) {
  return (
    <Pressable
      ref={cardRef}
      style={[styles.card, selected && styles.cardSelected, disabled && styles.cardDisabled, style]}
      onPress={onPress}
      disabled={disabled || !onPress}
    >
      <View style={styles.topRow}>
        <View style={styles.leadColumn}>
          {selectable && <Checkbox checked={selected} />}
          <Image source={require('../../../../../../assets/pile-image.webp')} style={styles.pileImage} resizeMode="contain" />
        </View>
        <View style={styles.details}>
          <Text style={styles.code} numberOfLines={1}>{pile.code}</Text>
          <View style={[styles.chip, styles.locationChip]}>
            <MapPin size={13} color={colors.textPrimary} />
            <Text style={styles.chipText} numberOfLines={1}>{location ?? 'No location'}</Text>
          </View>
          <View style={[styles.chip, styles.dimensionChip]}>
            {/* One line always; shrinks a little rather than wrapping into an oval blob. */}
            <Text style={styles.chipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              Ø{pile.dia}mm x {pile.depth}m
            </Text>
          </View>
        </View>
      </View>
      {footer}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    padding: spacing.sm,
    gap: spacing.sm,
    ...shadow.soft,
  },
  // Opaque tint on purpose: a translucent background lets the Android elevation
  // shadow show through as a dark grey box.
  cardSelected: { borderColor: colors.accentBlue, backgroundColor: SELECTED_CARD_BG },
  cardDisabled: { opacity: 0.5 },
  topRow: { flexDirection: 'row', gap: spacing.sm },
  leadColumn: { alignItems: 'center', gap: spacing.xs },
  // multiply drops the image's white background so it sits cleanly on the selected tint.
  pileImage: { width: 44, height: 56, mixBlendMode: 'multiply' },
  details: { flex: 1, gap: 4 },
  code: { ...typography.cardTitle, color: colors.textPrimary },
  // Pill-backed meta lines (location / dimension); sized to their text, not full width.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    maxWidth: '100%',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 3,
  },
  locationChip: { backgroundColor: colors.accentBlueSoft },
  dimensionChip: { backgroundColor: 'rgba(28,28,46,0.06)' },
  chipText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
});
