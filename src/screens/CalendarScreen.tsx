import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

export default function CalendarScreen() {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={s.label}>Calendar</Text>
        <Text style={s.sub}>Device calendar integration — coming next</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  label:  { fontSize: 20, fontWeight: '700' },
  sub:    { fontSize: 13, color: '#888' },
});
