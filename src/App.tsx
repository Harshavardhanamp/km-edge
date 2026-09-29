import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { init as telemetryInit } from './lib/telemetry';
import RootNavigator from './navigation/RootNavigator';

function AppInner() {
  const { userId, tenantId, sessionValid } = useAuth();

  useEffect(() => {
    if (sessionValid) {
      telemetryInit(userId, tenantId);
    }
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
