// src/navigation/SiteStackNavigator.tsx
//
// Site stack navigator: wraps the SiteScreen (top tabs) and handles the
// one drill-down screen that needs params and a full-screen push —
// ShiftWindows (shiftId).

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SiteStackParamList } from '@app-types/navigation';
import SiteScreen from '@/screens/Site/SiteScreen';
import ShiftWindowsScreen from '@/screens/Site/Tabs/ShiftWindowsScreen';

const Stack = createNativeStackNavigator<SiteStackParamList>();

export default function SiteStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SiteTabs" component={SiteScreen} />
      <Stack.Screen name="ShiftWindows" component={ShiftWindowsScreen} />
    </Stack.Navigator>
  );
}