import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ErrorUtils } from 'react-native';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { telemetry, init as telemetryInit } from './lib/telemetry';
import RootNavigator from './navigation/RootNavigator';

// Catch unhandled async/runtime errors that bypass ErrorBoundary
ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
  telemetry.error({ error_code: 'RUNTIME_ERROR', message: error.message, is_crash: isFatal ?? false });
});

function AppInner() {
  const { userId, sessionValid } = useAuth();

  useEffect(() => {
    if (sessionValid) {
      telemetryInit(userId);
    }
  }, [sessionValid, userId]);

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
