import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import CaptureScreen from '../screens/CaptureScreen';
import RecordDetailScreen from '../screens/RecordDetailScreen';
import RecordsScreen from '../screens/RecordsScreen';

const Stack = createNativeStackNavigator();

export default function RecordsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Records" component={RecordsScreen} />
      <Stack.Screen name="RecordDetail" component={RecordDetailScreen} />
      <Stack.Screen name="Capture" component={CaptureScreen} />
    </Stack.Navigator>
  );
}
