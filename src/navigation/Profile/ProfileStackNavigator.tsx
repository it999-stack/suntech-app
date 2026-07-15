// src/navigation/ProfileStackNavigator.tsx

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ProfileStackParamList } from '@/types/navigation';
import ProfileScreen from '@screens/Profile/ProfileScreen';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProfileScreen" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  );
}