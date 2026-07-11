// src/components/shared/KeyboardAwareScreen.tsx

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

export default function KeyboardAwareScreen({
  children,
  style,
  keyboardVerticalOffset = 0,
}: Props) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          {children}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}