// src/navigation/HomeStackNavigator.tsx

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import HomeScreen from '../screens/Home/HomeScreen';
import PlanHistoryScreen from '../screens/Home/PlanHistoryScreen';
import PlanDetailScreen from '../screens/Home/PlanDetailScreen';
import FillActualsScreen from '../screens/Home/FillActualScreen';
import GeneratePlanScreen from '../screens/Home/GeneratePlanScreen';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="HomeScreen" component={HomeScreen} options={{ title: 'Home' }} />
      <Stack.Screen name="PlanHistory" component={PlanHistoryScreen} options={{ title: 'Plan History' }} />
      <Stack.Screen name="PlanDetail" component={PlanDetailScreen} options={{ title: 'Plan Detail' }} />
      <Stack.Screen name="GeneratePlan" component={GeneratePlanScreen} />
      <Stack.Screen name="FillActuals" component={FillActualsScreen} />
    </Stack.Navigator>
  );
}