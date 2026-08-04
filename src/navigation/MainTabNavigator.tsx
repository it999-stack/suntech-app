// src/navigation/MainTabNavigator.tsx

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native';
import { MainTabParamList } from '@app-types/navigation';
import HomeStackNavigator from './Home/HomeStackNavigator';
import PilesStackNavigator from './Piles/PilesStackNavigator';
import SiteScreen from '@/screens/Site/SiteScreen';
import ProfileStackNavigator from './Profile/ProfileStackNavigator';
import {
  LayoutDashboard,
  Construction,
  Building2,
  CircleUserRound,
} from 'lucide-react-native';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Full-screen step wizards inside the Home stack render their own bottom
// action button flush with the screen edge — the tab bar must be hidden
// underneath them or the button ends up sandwiched above it.
const HIDE_TAB_BAR_FOR_ROUTES = ['GeneratePlan', 'EditPlan'];

function getHomeTabBarStyle(route: RouteProp<MainTabParamList, 'HomeTab'>) {
  const routeName = getFocusedRouteNameFromRoute(route) ?? 'HomeScreen';
  return HIDE_TAB_BAR_FOR_ROUTES.includes(routeName) ? { display: 'none' as const } : undefined;
}

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
            options={({ route }) => ({
                title: 'Home',
                tabBarIcon: ({ color, size }) => (
                <LayoutDashboard color={color} size={size} />
                ),
                tabBarStyle: getHomeTabBarStyle(route),
            })}
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
            component={SiteScreen}
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