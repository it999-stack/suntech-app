// src/navigation/PilesStackNavigator.tsx

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PilesStackParamList } from '@app-types/navigation';
import PilesScreen from '@screens/Piles/PilesScreen';

const Stack = createNativeStackNavigator<PilesStackParamList>();

export default function PilesStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Transparent so App.tsx's single backdrop gradient shows through —
        // native-stack screens default to an opaque background, which would
        // paint over it.
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="PilesScreen" component={PilesScreen} />
    </Stack.Navigator>
  );
}