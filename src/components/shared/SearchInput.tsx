// src/components/shared/SearchInput.tsx

import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface SearchInputProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}

export default function SearchInput({ value, onChangeText, placeholder = 'Search by Pile ID, Area, Diameter…' }: SearchInputProps) {
  return (
    <View style={styles.wrap}>
      <Search size={16} color={colors.textSecondary} style={styles.icon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          style={styles.clearBtn}
          hitSlop={8}
          onPress={() => onChangeText('')}
          accessibilityLabel="Clear search"
        >
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', justifyContent: 'center' },
  icon: { position: 'absolute', left: spacing.md, zIndex: 1 },
  clearBtn: { position: 'absolute', right: spacing.md, zIndex: 1 },
  input: {
    ...typography.caption,
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.xl + spacing.sm,
    paddingRight: spacing.xl + spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    color: colors.textPrimary,
  },
});
