// src/components/shared/ErrorBoundary.tsx
//
// App-wide crash guard: without this, one uncaught render error anywhere in
// the tree crashes the whole app for a field user with no recovery path
// short of force-closing.

import { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Button from '@components/shared/Button';
import { colors, spacing, typography } from '@theme/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <LinearGradient
          colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
          style={styles.container}
        >
          <View style={styles.content}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              Please try again. If this keeps happening, restart the app.
            </Text>
            <Button label="Try again" onPress={this.resetError} style={styles.retryBtn} />
          </View>
        </LinearGradient>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  message: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: { marginTop: spacing.sm },
});
