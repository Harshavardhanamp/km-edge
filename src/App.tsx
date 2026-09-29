import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { telemetry, init as telemetryInit } from './lib/telemetry';
import RootNavigator from './navigation/RootNavigator';

function AppInner() {
  const { userId, tenantId, sessionValid } = useAuth();

  useEffect(() => {
    if (!sessionValid) return;
    telemetryInit(userId, tenantId);
    telemetry.sessionStart();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        telemetry.sessionEnd();
      } else if (state === 'active') {
        telemetry.sessionStart();
      }
    });

    return () => {
      telemetry.sessionEnd();
      sub.remove();
    };
  }, [sessionValid, userId, tenantId]);

  return <RootNavigator />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <StatusBar style="auto" />
        <AppInner />
      </AuthProvider>
    </ErrorBoundary>
  );
}
