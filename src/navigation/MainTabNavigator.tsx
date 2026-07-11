// src/navigation/MainTabNavigator.tsx

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '@app-types/navigation';
import HomeStackNavigator from './HomeStackNavigator';
import PilesStackNavigator from './PilesStackNavigator';
import ProfileStackNavigator from './ProfileStackNavigator';
import { House, Hammer, UserRound } from 'lucide-react-native';
import {
  LayoutDashboard,
  Construction,
  CircleUserRound,
} from 'lucide-react-native';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
        screenOptions={{
            headerShown: false,
        }}
        >
        <Tab.Screen
            name="HomeTab"
            component={HomeStackNavigator}
            options={{
                title: 'Home',
                tabBarIcon: ({ color, size }) => (
                <LayoutDashboard color={color} size={size} />
                ),
            }}
            />

            <Tab.Screen
            name="PilesTab"
            component={PilesStackNavigator}
            options={{
                title: 'Piles',
                tabBarIcon: ({ color, size }) => (
                <Construction color={color} size={size} />
                ),
            }}
            />

            <Tab.Screen
            name="ProfileTab"
            component={ProfileStackNavigator}
            options={{
                title: 'Profile',
                tabBarIcon: ({ color, size }) => (
                <CircleUserRound color={color} size={size} />
                ),
            }}
            />
    </Tab.Navigator>
  );
}