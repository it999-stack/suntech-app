// src/screens/Piles/components/DataList.tsx

import React, { useEffect } from 'react';
import { FlatList, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { colors, spacing, typography } from '@theme/theme';
import EmptyState from '@components/shared/EmptyState';
import type { PileWithStatus } from '@repositories/pilesRepository';
import DataListItem from './DataListItem';

interface DataListProps {
  items: PileWithStatus[];
  error: string | null;
  totalPilesSynced: number;
  onPressItem: (pile: PileWithStatus) => void;
  /** True while a new page/filter's results are being fetched — shows a
   * spinner in place of the (now stale) list, then fades the freshly loaded
   * list in once it lands, instead of silently swapping content. */
  loading?: boolean;
}

export default function DataList({ items, error, totalPilesSynced, onPressItem, loading = false }: DataListProps) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (loading) return;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 220 });
  }, [loading, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.list, animatedStyle]}>
      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <DataListItem pile={item} onPress={() => onPressItem(item)} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={error ? <Text style={styles.errorText}>⚠ {error}</Text> : null}
        ListEmptyComponent={
          !error ? (
            <EmptyState
              icon={totalPilesSynced === 0 ? 'download' : 'search'}
              title={totalPilesSynced === 0 ? 'No piles synced' : 'No matches'}
              message={
                totalPilesSynced === 0
                  ? 'No piles synced yet. Pull data from the Profile tab.'
                  : 'No piles match your search or filters.'
              }
            />
          ) : null
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
