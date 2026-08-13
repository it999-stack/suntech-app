// src/components/shared/SearchToggleField.tsx
//
// Reusable search toolbar row: a flex slot (a TextInput, or arbitrary
// collapsed content such as filter pills) plus a trailing icon button.
// Purely presentational — the caller decides what the icon means (open a
// search field, clear it, close it) via `icon`/`onIconPress`, and whether
// the input or `collapsedContent` renders via `showField`. Extracted from
// PilesScreen.tsx's inline search bar so both screens share the same look.

import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface SearchToggleFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Which icon the trailing button shows. */
  icon: 'search' | 'x';
  onIconPress: () => void;
  /** Renders the TextInput when true; `collapsedContent` (if any) otherwise. */
  showField: boolean;
  collapsedContent?: React.ReactNode;
  autoFocus?: boolean;
}

export default function SearchToggleField({
  value,
  onChangeText,
  placeholder,
  icon,
  onIconPress,
  showField,
  collapsedContent = null,
  autoFocus,
}: SearchToggleFieldProps) {
  return (
    <View style={styles.toolbarRow}>
      <View style={styles.flexSlot}>
        {showField ? (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoFocus={autoFocus}
            returnKeyType="search"
          />
        ) : (
          collapsedContent
        )}
      </View>

      <Pressable style={styles.iconBtn} onPress={onIconPress} hitSlop={spacing.sm}>
        {icon === 'x' ? (
          <X size={16} color={colors.textSecondary} />
        ) : (
          <Search size={16} color={colors.textSecondary} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexSlot: { flex: 1, minWidth: 0, justifyContent: 'center' },
  input: {
    ...typography.caption,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  iconBtn: {
    padding: spacing.sm,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
