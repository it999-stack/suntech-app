// src/navigation/PilesStackNavigator.tsx

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PilesStackParamList } from '../types/navigation';
import PilesScreen from '../screens/Piles/PilesScreen';

const Stack = createNativeStackNavigator<PilesStackParamList>();

export default function PilesStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="PilesScreen" component={PilesScreen} options={{ title: 'Piles' }} />
    </Stack.Navigator>
  );
}