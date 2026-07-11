// src/components/shared/Accordion.tsx
//
// Reversible accordion shell. Renders a tappable header and conditionally
// shows children below. Chevron icon flips automatically.
// Optional `rightAction` renders a second, independent touch target in the
// header (e.g. an "Edit" button) that won't trigger the expand/collapse toggle.

import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import GlassCard from './GlassCard';
import { spacing } from '@theme/theme';

interface AccordionProps {
  /** Content rendered inside the tappable header row (before the chevron). */
  header: React.ReactNode;
  /** Optional secondary action rendered between the header and the chevron —
   *  its own touch target, independent of the expand/collapse toggle. */
  rightAction?: React.ReactNode;
  /** Content revealed when expanded. */
  children: React.ReactNode;
  /** Whether to start open. */
  defaultOpen?: boolean;
}

export default function Accordion({ header, rightAction, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable style={styles.headerTouchable} onPress={() => setOpen((v) => !v)}>
          <View style={styles.headerContent}>{header}</View>
        </Pressable>

        {rightAction ? <View style={styles.actionCol}>{rightAction}</View> : null}

        <Pressable
          style={styles.chevronCol}
          onPress={() => setOpen((v) => !v)}
          hitSlop={8}
        >
          {open ? (
            <ChevronUp size={18} color="#6B6B80" strokeWidth={2} />
          ) : (
            <ChevronDown size={18} color="#6B6B80" strokeWidth={2} />
          )}
        </Pressable>
      </View>
      {open && <View style={styles.body}>{children}</View>}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerTouchable: {
    flex: 1,
  },
  headerContent: { flex: 1 },
  actionCol: {
    marginLeft: spacing.xs,
  },
  chevronCol: {
    marginLeft: spacing.sm,
    justifyContent: 'center',
    padding: 4,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
    paddingTop: spacing.sm,
  },
});