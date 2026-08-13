// src/components/shared/PileGridCard.tsx
//
// One cell of a 2-column pile grid: code, dia/depth, area, and a
// small "+" affordance. Purely presentational so it can be reused anywhere
// a pile needs picking (currently AddPileModal, droppable into
// PilesScreen.tsx later).

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';

interface PileGridCardProps {
  code: string;
  dia: number;
  depth: number;
  area: string | null;
  onPress: () => void;
  /** Trailing badge: 'add' (default) shows the "+" pick affordance (AddPileModal); 'none' hides it (PilesScreen, where tapping opens details, not "add"). */
  badge?: 'add' | 'none';
  /** Adds a green left-border accent, matching PileRow.tsx's existing completed-pile treatment. */
  completed?: boolean;
}

export default function PileGridCard({
  code,
  dia,
  depth,
  area,
  onPress,
  badge = 'add',
  completed = false,
}: PileGridCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, completed && styles.cardCompleted, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.headerRow}>
        <Text style={styles.code} numberOfLines={1}>{code}</Text>
        {badge === 'add' && (
          <View style={styles.badge}>
            <Plus size={14} color={colors.textInverse} />
          </View>
        )}
      </View>
      <Text style={styles.meta}>Ø{dia}mm · {depth}m</Text>
      <Text style={styles.area} numberOfLines={1}>{area || '—'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.soft,
  },
  cardPressed: { opacity: 0.7 },
  cardCompleted: { borderLeftWidth: 3, borderLeftColor: colors.success },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  code: { ...typography.body, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  badge: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  meta: { ...typography.caption, color: colors.textSecondary },
  area: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
