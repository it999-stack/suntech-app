import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { ParamListBase } from '@react-navigation/native';
import type { MaterialTopTabNavigationOptions } from '@react-navigation/material-top-tabs';
import { colors, typography } from '@theme/theme';

type TopTabItem = {
  name: string;
  title: string;
  component: React.ComponentType<any>;
  initialParams?: object;
};

type TopTabsProps = {
  tabs: TopTabItem[];
  initialRouteName?: string;
  screenOptions?: MaterialTopTabNavigationOptions;
};

const TopTab = createMaterialTopTabNavigator<ParamListBase>();

export default function TopTabs({ tabs, initialRouteName, screenOptions }: TopTabsProps) {
  return (
    <TopTab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        swipeEnabled: true,
        tabBarScrollEnabled: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIndicatorStyle: {
          backgroundColor: colors.accent,
          height: 3,
          borderRadius: 2,
        },
        tabBarLabelStyle: { ...typography.cardTitle, textTransform: 'none' },
        tabBarStyle: {
          backgroundColor: colors.transparent,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: { width: 'auto', paddingHorizontal: 16 },
        ...screenOptions,
      }}
    >
      {tabs.map((tab) => (
        <TopTab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{ title: tab.title }}
          initialParams={tab.initialParams}
        />
      ))}
    </TopTab.Navigator>
  );
}
