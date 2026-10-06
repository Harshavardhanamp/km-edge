import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { HOW_SYNCING_PARAGRAPHS, HOW_SYNCING_TITLE } from '../lib/help/howSyncing';

export default function HowSyncingScreen({ navigation }: any) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{HOW_SYNCING_TITLE}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.close}>Done</Text>
        </TouchableOpacity>
      </View>
      {HOW_SYNCING_PARAGRAPHS.map((p) => (
        <Text key={p} style={styles.paragraph}>{p}</Text>
      ))}
    </ScrollView>
  );
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, color: colors.accent },
  paragraph: { fontSize: 15, lineHeight: 22, color: colors.text, marginBottom: 14 },
});
