import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import CalendarScreen from '../screens/CalendarScreen';
import RecordDetailScreen from '../screens/RecordDetailScreen';

const Stack = createNativeStackNavigator();

export default function CalendarStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Calendar" component={CalendarScreen} />
      <Stack.Screen name="RecordDetail" component={RecordDetailScreen} />
    </Stack.Navigator>
  );
}
