// src/components/shared/RequiredMark.tsx
//
// The single "*" marker appended after a mandatory field/designation's
// label — centralized so every screen's required-marker looks identical
// and a style tweak only has to happen in one place.

import { Text, StyleSheet } from 'react-native';
import { colors } from '@theme/theme';

export default function RequiredMark() {
  return <Text style={styles.mark}>*</Text>;
}

const styles = StyleSheet.create({
  mark: {
    color: colors.danger,
    fontSize: 18,
    top: -10,
  },
});
