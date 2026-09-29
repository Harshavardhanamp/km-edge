import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import StatusDetailScreen from '../screens/StatusDetailScreen';
import { startProbe, stopProbe } from '../lib/gksProbe';
import { telemetry } from '../lib/telemetry';
import MainTabs from './MainTabs';

const Shell = createNativeStackNavigator();

export default function AppShell() {
  useEffect(() => {
    telemetry.sessionStart();
    startProbe();
    return () => {
      telemetry.sessionEnd();
      stopProbe();
    };
  }, []);

  return (
    <Shell.Navigator screenOptions={{ headerShown: false }}>
      <Shell.Screen name="MainTabs" component={MainTabs} />
      <Shell.Screen
        name="StatusDetail"
        component={StatusDetailScreen}
        options={{ presentation: 'modal' }}
      />
    </Shell.Navigator>
  );
}
