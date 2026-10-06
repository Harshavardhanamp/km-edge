import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ErrorUtils } from 'react-native';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { telemetry } from './lib/telemetry';
import RootNavigator from './navigation/RootNavigator';

// Catch unhandled async/runtime errors that bypass ErrorBoundary
// Category only: the message and stack never leave the device (REQ-0013 ES9.1).
ErrorUtils.setGlobalHandler(() => {
  telemetry.error('other');
});

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </AuthProvider>
    </ErrorBoundary>
  );
}
