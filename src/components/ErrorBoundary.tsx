import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { telemetry } from '../lib/telemetry';

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    telemetry.error({
      error_code: 'RENDER_ERROR',
      message: error.message,
      is_crash: true,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>The app encountered an unexpected error.</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => this.setState({ hasError: false })}
        >
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDF8F4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  icon: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: '700', color: '#2D2016' },
  body: { fontSize: 14, color: '#7A6A5A', textAlign: 'center' },
  btn: {
    backgroundColor: '#C17A3A',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
});
