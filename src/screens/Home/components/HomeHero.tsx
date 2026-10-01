// src/screens/Home/components/HomeHero.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sparkles, ArrowRight } from 'lucide-react-native';
import Button from '@components/shared/Button';
import { colors, spacing, typography } from '@theme/theme';

interface HomeHeroProps {
  onGenerate: () => void;
}

/** "No plan yet" call to action; sits directly on the app-wide backdrop image. */
export default function HomeHero({ onGenerate }: HomeHeroProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.rule} />
      <Text style={styles.eyebrow}>Let’s build</Text>
      <Text style={styles.title}>Today’s Plan</Text>
      <Text style={styles.subtitle}>Plan, track and manage your piling work in a simpler way.</Text>
      <View style={styles.cta}>
        <Button label="Generate today’s plan" icon={Sparkles} onPress={onGenerate} />
        <ArrowRight size={18} color={colors.white} style={styles.arrow} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.xl, paddingBottom: spacing.lg, alignItems: 'flex-start' },
  rule: { width: 40, height: 2, backgroundColor: colors.textPrimary, marginBottom: spacing.md },
  eyebrow: { ...typography.h2, fontWeight: '400', color: colors.textPrimary },
  title: { fontSize: 32, fontWeight: '800', color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textPrimary, marginTop: spacing.xs, marginBottom: spacing.lg, maxWidth: 260 },
  cta: { alignSelf: 'stretch', justifyContent: 'center' },
  arrow: { position: 'absolute', right: spacing.lg },
});
