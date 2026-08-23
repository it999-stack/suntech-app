// src/components/shared/ModalHost.tsx
//
// Exactly one real React Native <Modal> exists for the whole app, mounted
// once here (see App.tsx). Every AppModal.tsx instance registers its sheet
// content into this shared stack instead of rendering its own <Modal> —
// two "modals" open at once become two layers in one native window instead
// of two independent native windows.
//
// Why this exists: React Native's <Modal> is backed by its own native
// Dialog/window (Android) or presentation controller (iOS). Two nested
// AppModal instances (e.g. PileStepsModal opening MeasurementFieldsModal)
// used to mean two independent native windows stacked — a known-fragile RN
// pattern where tearing down the inner window can leave the outer one's
// backdrop rendered but its content unrepainted (the "closing one modal
// closes/breaks both" bug). With a single shared window, there's nothing
// for the native window stack to get confused about.

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

type StackEntry = {
  id: string;
  node: React.ReactNode;
  onRequestClose: () => void;
};

interface ModalHostContextValue {
  push: (id: string, node: React.ReactNode, onRequestClose: () => void) => void;
  remove: (id: string) => void;
}

const ModalHostContext = createContext<ModalHostContextValue | null>(null);

/** Used by AppModal.tsx — throws outside ModalHostProvider so a missing
 * provider (e.g. forgetting to wrap App.tsx) fails loudly instead of
 * silently doing nothing. */
export function useModalHost(): ModalHostContextValue {
  const ctx = useContext(ModalHostContext);
  if (!ctx) throw new Error('useModalHost must be used within ModalHostProvider');
  return ctx;
}

export function ModalHostProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<StackEntry[]>([]);

  // push replaces an existing entry with the same id (re-registered on every
  // relevant re-render by AppModal, so the host always shows current content/
  // closures) or appends a new one at the end (rendered on top).
  const push = useCallback((id: string, node: React.ReactNode, onRequestClose: () => void) => {
    setStack((prev) => {
      const existingIndex = prev.findIndex((e) => e.id === id);
      if (existingIndex === -1) return [...prev, { id, node, onRequestClose }];
      const next = [...prev];
      next[existingIndex] = { id, node, onRequestClose };
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setStack((prev) => (prev.some((e) => e.id === id) ? prev.filter((e) => e.id !== id) : prev));
  }, []);

  const value = useMemo(() => ({ push, remove }), [push, remove]);

  // Android hardware back button — routed to only the top-most (most
  // recently opened) entry, unlike today's per-instance onRequestClose
  // wiring where every nested Modal independently races for the same
  // back-press.
  const topEntry = stack[stack.length - 1];
  const handleRequestClose = useRef(() => {});
  handleRequestClose.current = () => topEntry?.onRequestClose();

  return (
    <ModalHostContext.Provider value={value}>
      {children}
      <Modal
        visible={stack.length > 0}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={() => handleRequestClose.current()}
      >
        <GestureHandlerRootView style={styles.flexContainer}>
          {stack.map((entry, i) => (
            <View key={entry.id} style={[StyleSheet.absoluteFill, { elevation: i }]} pointerEvents="box-none">
              {entry.node}
            </View>
          ))}
        </GestureHandlerRootView>
      </Modal>
    </ModalHostContext.Provider>
  );
}

const styles = StyleSheet.create({
  flexContainer: { flex: 1 },
});
