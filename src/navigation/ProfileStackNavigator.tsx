// src/navigation/ProfileStackNavigator.tsx

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ProfileStackParamList } from '@/types/navigation';
import ProfileScreen from '@screens/Profile/ProfileScreen';
import SiteSettingsScreen from '@screens/Profile/SiteSettingsScreen';
import ShiftsScreen from '@screens/Profile/site-settings/ShiftsScreen';
import ShiftWindowsScreen from '@screens/Profile/site-settings/ShiftWindowsScreen';
import TemplatesScreen from '@screens/Profile/site-settings/TemplatesScreen';
import MachinesScreen from '@screens/Profile/site-settings/MachinesScreen';
import PersonnelScreen from '@screens/Profile/site-settings/PersonnelScreen';
import StepsScreen from '@screens/Profile/site-settings/StepsScreen';
import StepDetailScreen from '@screens/Profile/site-settings/StepDetailScreen';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProfileScreen" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="SiteSettings" component={SiteSettingsScreen} options={{ title: 'Site Settings' }} />
      <Stack.Screen name="Shifts" component={ShiftsScreen} />
      <Stack.Screen name="ShiftWindows" component={ShiftWindowsScreen} />
      <Stack.Screen name="Templates" component={TemplatesScreen} />
      <Stack.Screen name="Machines" component={MachinesScreen} />
      <Stack.Screen name="Personnel" component={PersonnelScreen} options={{ title: 'Working Personnel' }} />
      <Stack.Screen name="Steps" component={StepsScreen} options={{ title: 'Steps' }} />
      <Stack.Screen name="StepDetail" component={StepDetailScreen} options={{ title: 'Step Templates' }} />
    </Stack.Navigator>
  );
}
