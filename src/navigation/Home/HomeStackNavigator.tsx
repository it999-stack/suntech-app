// src/navigation/HomeStackNavigator.tsx

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeStackParamList } from '@app-types/navigation';
import HomeScreen from '@screens/Home/HomeScreen';
import PlanHistoryScreen from '@screens/Home/PlanHistoryScreen';
import PlanDetailScreen from '@screens/Home/PlanDetailScreen';
import FillActualsScreen from '@screens/Home/FillActualScreen';
import GeneratePlanScreen from '@screens/Home/GeneratePlanScreen';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeScreen" component={HomeScreen} />
      <Stack.Screen name="PlanHistory" component={PlanHistoryScreen} />
      <Stack.Screen name="PlanDetail" component={PlanDetailScreen} />
      <Stack.Screen name="GeneratePlan" component={GeneratePlanScreen} />
      <Stack.Screen name="FillActuals" component={FillActualsScreen} />
    </Stack.Navigator>
  );
}