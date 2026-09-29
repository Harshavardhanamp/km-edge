import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useGksProbe } from '../lib/gksProbe';

export default function StatusDot() {
  const navigation = useNavigation<any>();
  const { reachable } = useGksProbe();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => navigation.navigate('StatusDetail')}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.text}>{reachable ? '🟢' : '🔴'} GKS</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 8 },
  text: { fontSize: 12, color: '#2D2016' },
});
