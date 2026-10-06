import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import SettingsScreen from '../screens/SettingsScreen';
import HowSyncingScreen from '../screens/HowSyncingScreen';

const Stack = createNativeStackNavigator();

export default function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="HowSyncing" component={HowSyncingScreen} />
    </Stack.Navigator>
  );
}
