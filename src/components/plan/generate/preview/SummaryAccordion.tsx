// src/components/plan/generate/preview/SummaryAccordion.tsx
//
// Accordion-based summary section for the preview step.
// Header shows icon, title, and a one-line summary.
// An optional "Edit" pill jumps back to the relevant wizard step —
// independent of the expand/collapse toggle.
// Body shows detailed content when expanded.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Pencil } from 'lucide-react-native';
import Accordion from '@components/shared/Accordion';
import { colors, spacing, radius, typography } from '@/theme/theme';

interface SummaryAccordionProps {
  icon: React.ReactNode;
  title: string;
  summary: string;
  tone?: 'default' | 'warning';
  /** If provided, shows an "Edit" pill that jumps back to that wizard step. */
  onEdit?: () => void;
  children: React.ReactNode;
}

export default function SummaryAccordion({
  icon,
  title,
  summary,
  tone = 'default',
  onEdit,
  children,
}: SummaryAccordionProps) {
  return (
    <Accordion
      header={
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>{icon}</View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={[styles.headerSummary, tone === 'warning' && styles.headerSummaryWarning]}>
              {summary}
            </Text>
          </View>
        </View>
      }
      rightAction={
        onEdit ? (
          <Pressable
            style={styles.editBtn}
            onPress={onEdit}
            hitSlop={8}
            accessibilityLabel={`Edit ${title.toLowerCase()}`}
          >
            <Pencil size={13} color={colors.accent} />
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        ) : undefined
      }
    >
      <View style={styles.body}>{children}</View>
    </Accordion>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIcon: { width: 24, alignItems: 'center' },
  headerInfo: { flex: 1 },
  headerTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  headerSummary: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerSummaryWarning: { color: colors.warning },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  editBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    fontSize: 11,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
});