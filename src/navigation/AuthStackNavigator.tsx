// src/navigation/AuthStackNavigator.tsx

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@app-types/navigation';
import LoginScreen from '@screens/Profile/LoginScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}