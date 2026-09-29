import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import StatusDot from './StatusDot';

interface Props {
  title: string;
  rightElement?: React.ReactNode;
}

export default function AppHeader({ title, rightElement }: Props) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.right}>
        {rightElement ?? <StatusDot />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FDF8F4',
    borderBottomWidth: 1,
    borderColor: '#E0D0C0',
    position: 'relative',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#2D2016' },
  right: { position: 'absolute', right: 16 },
});
