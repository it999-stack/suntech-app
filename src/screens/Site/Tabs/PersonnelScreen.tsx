// src/screens/Profile/site-settings/PersonnelScreen.tsx
// Displays the list of working personnel synced for the current site.

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Phone } from 'lucide-react-native';

import { colors, spacing, radius, typography } from '@theme/theme';
import GlassCard from '@components/shared/GlassCard';
import Avatar from '@components/shared/Avatar';
import SearchInput from '@components/shared/SearchInput';
import FilterMenuButton, { type FilterMenuOption } from '@components/shared/FilterMenuButton';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { useAuthStore } from '@store/authStore';
import type { PilingSitePersonnel } from '@db/schema';
import { formatDesignation } from '@/utils/personnelRoles';

const ALL_DESIGNATIONS = 'ALL';

function PersonnelCard({ person }: { person: PilingSitePersonnel }) {
  const isActive = person.isActive;

  return (
    <GlassCard style={styles.cardAccent} innerStyle={styles.card} radius={radius.lg}>
      <Avatar name={person.name} size={42} backgroundColor={colors.accentSoft} textColor={colors.accent} borderColor={colors.info} />

      {/* Right: details */}
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Text style={styles.personName} numberOfLines={1}>
            {person.name}
          </Text>
          <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
            <Text style={styles.badgeText}>{formatDesignation(person.designation)}</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isActive ? styles.dotActive : styles.dotInactive]} />
          <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextInactive]}>
            {isActive ? 'Active' : 'Inactive'}
          </Text>
          {person.phone ? (
            <>
              <View style={styles.statusDivider} />
              <Phone size={12} color={colors.textSecondary} />
              <Text style={styles.phoneText} numberOfLines={1}>
                {person.phone}
              </Text>
            </>
          ) : <>
              <View style={styles.statusDivider} />
              <Phone size={12} color={colors.textSecondary} />
              <Text style={styles.phoneText} numberOfLines={1}>
                Not provided
              </Text>
            </>}
        </View>
      </View>
    </GlassCard>
  );
}

export default function PersonnelScreen() {
  const siteId = useAuthStore((s) => s.user?.siteId);
  const [personnel, setPersonnel] = useState<PilingSitePersonnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [designationFilter, setDesignationFilter] = useState(ALL_DESIGNATIONS);

  useEffect(() => {
    if (!siteId) { setLoading(false); return; }
    getPersonnelBySite(siteId)
      .then(setPersonnel)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  const designationOptions = useMemo<FilterMenuOption[]>(() => {
    const raw = Array.from(new Set(personnel.map((p) => p.designation)));
    return [
      { label: 'All', value: ALL_DESIGNATIONS },
      ...raw.map((d) => ({ label: formatDesignation(d), value: d })),
    ];
  }, [personnel]);

  const filteredPersonnel = useMemo(() => {
    const query = search.trim().toLowerCase();
    return personnel.filter((p) => {
      if (designationFilter !== ALL_DESIGNATIONS && p.designation !== designationFilter) return false;
      if (!query) return true;
      return p.name.toLowerCase().includes(query) || (p.phone ?? '').toLowerCase().includes(query);
    });
  }, [personnel, search, designationFilter]);

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        <View style={styles.headerArea}>
          <Text style={styles.pageTitle}>Working Personnel</Text>
          <Text style={styles.pageSubtitle}>
            {personnel.length} person{personnel.length === 1 ? '' : 's'} on site
          </Text>

          <View style={styles.searchRow}>
            <View style={styles.searchFlex}>
              <SearchInput value={search} onChangeText={setSearch} placeholder="Search name or phone number…" />
            </View>
            <FilterMenuButton
              options={designationOptions}
              value={designationFilter}
              onChange={setDesignationFilter}
              title="Filter by designation"
            />
          </View>
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.accent}
            size="large"
            style={{ marginTop: spacing.xxxl }}
          />
        ) : personnel.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No personnel synced yet.</Text>
            <Text style={styles.emptyHint}>Pull a fresh sync from the home screen.</Text>
          </View>
        ) : filteredPersonnel.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No matches found.</Text>
            <Text style={styles.emptyHint}>Try a different search or filter.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredPersonnel}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => <PersonnelCard person={item} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  pageSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // SearchInput sizes to its own content, so it needs an explicit flex parent
  // to take the width the filter button doesn't.
  searchFlex: { flex: 1 },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  cardAccent: {
    borderLeftWidth: 4,
    borderLeftColor: colors.info,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    width: '100%',
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  personName: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 16,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: { backgroundColor: '#4ade80' },
  dotInactive: { backgroundColor: '#f87171' },
  statusText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextActive: { color: '#4ade80' },
  statusTextInactive: { color: '#f87171' },
  statusDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(28,28,46,0.12)',
  },
  phoneText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    opacity: 0.6,
  },
});
