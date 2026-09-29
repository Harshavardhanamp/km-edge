import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Text } from 'react-native';
import CalendarStack from './CalendarStack';
import HomeStack from './HomeStack';
import RecordsStack from './RecordsStack';
import SettingsStack from './SettingsStack';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, string> = {
  HomeTab: '🏠',
  RecordsTab: '📋',
  CalendarTab: '📅',
  SettingsTab: '⚙️',
};

const TAB_LABELS: Record<string, string> = {
  HomeTab: 'Home',
  RecordsTab: 'Records',
  CalendarTab: 'Calendar',
  SettingsTab: 'Settings',
};

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: focused ? 22 : 18 }}>{TAB_ICONS[route.name]}</Text>
        ),
        tabBarLabel: TAB_LABELS[route.name],
        tabBarActiveTintColor: '#C17A3A',
        tabBarInactiveTintColor: '#A09080',
        tabBarStyle: { backgroundColor: '#FDF8F4', borderTopColor: '#E0D0C0' },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} />
      <Tab.Screen name="RecordsTab" component={RecordsStack} />
      <Tab.Screen name="CalendarTab" component={CalendarStack} />
      <Tab.Screen name="SettingsTab" component={SettingsStack} />
    </Tab.Navigator>
  );
}
