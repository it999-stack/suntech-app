// src/navigation/MainTabNavigator.tsx

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '@app-types/navigation';
import HomeStackNavigator from './Home/HomeStackNavigator';
import PilesStackNavigator from './Piles/PilesStackNavigator';
import SiteStackNavigator from './Site/SiteStackNavigator';
import ProfileStackNavigator from './Profile/ProfileStackNavigator';
import {
  LayoutDashboard,
  Construction,
  Building2,
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
            name="SiteTab"
            component={SiteStackNavigator}
            options={{
                title: 'Site',
                tabBarIcon: ({ color, size }) => (
                <Building2 color={color} size={size} />
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