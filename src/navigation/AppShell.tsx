import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import CaptureScreen from '../screens/CaptureScreen';
import StatusDetailScreen from '../screens/StatusDetailScreen';
import { startProbe, stopProbe } from '../lib/gksProbe';
import { telemetry } from '../lib/telemetry';
import { resetInFlightToPending } from '../lib/db/deltaStore';
import { cleanStagingDirectory } from '../lib/db/attachmentStore';
import { registerSyncTask, unregisterSyncTask } from '../lib/sync/syncTask';
import MainTabs from './MainTabs';

const Shell = createNativeStackNavigator();

export default function AppShell() {
  useEffect(() => {
    telemetry.sessionStart();
    startProbe();
    resetInFlightToPending();
    cleanStagingDirectory(); // fire-and-forget, errors are non-fatal
    registerSyncTask().catch(() => {});
    return () => {
      telemetry.sessionEnd();
      stopProbe();
      unregisterSyncTask().catch(() => {});
    };
  }, []);

  return (
    <Shell.Navigator screenOptions={{ headerShown: false }}>
      <Shell.Screen name="MainTabs" component={MainTabs} />
      {/* Full-screen modal — tab bar hidden automatically */}
      <Shell.Screen
        name="Capture"
        component={CaptureScreen}
        options={{ presentation: 'fullScreenModal' }}
      />
      <Shell.Screen
        name="StatusDetail"
        component={StatusDetailScreen}
        options={{ presentation: 'modal' }}
      />
    </Shell.Navigator>
  );
}
