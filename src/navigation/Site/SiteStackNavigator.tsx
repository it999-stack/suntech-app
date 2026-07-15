// src/navigation/SiteStackNavigator.tsx
//
// Site stack navigator: wraps the SiteScreen (top tabs) and handles the
// two drill-down screens that need params and a full-screen push —
// ShiftWindows (shiftId) and StepDetail (stepId).

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SiteStackParamList } from '@app-types/navigation';
import SiteScreen from '@/screens/Site/SiteScreen';
import ShiftWindowsScreen from '@/screens/Site/Tabs/ShiftWindowsScreen';
import StepDetailScreen from '@/screens/Site/Tabs/StepDetailScreen';

const Stack = createNativeStackNavigator<SiteStackParamList>();

export default function SiteStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="SiteTabs"
        component={SiteScreen}
        options={{ headerShown: false, title: 'Site' }}
      />
      <Stack.Screen
        name="ShiftWindows"
        component={ShiftWindowsScreen}
        options={{ title: 'Windows' }}
      />
      <Stack.Screen
        name="StepDetail"
        component={StepDetailScreen}
        options={{ title: 'Step Templates' }}
      />
    </Stack.Navigator>
  );
}