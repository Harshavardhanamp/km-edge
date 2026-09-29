import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useGksProbe } from '../lib/gksProbe';

export type GksState = 'online' | 'offline' | 'syncing' | 'rejected';

interface Props {
  gksState?: GksState;
}

export default function StatusDot({ gksState }: Props) {
  const navigation = useNavigation<any>();
  const { reachable } = useGksProbe();

  // Resolve effective state: prop wins if provided, otherwise derive from probe
  const state: GksState = gksState ?? (reachable ? 'online' : 'offline');

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'syncing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [state]);

  const dotColor =
    state === 'offline' ? '#E53E3E' :
    state === 'rejected' ? '#D97706' :
    '#38A169'; // green for online and syncing

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => navigation.navigate('StatusDetail')}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View style={[styles.dot, { backgroundColor: dotColor, opacity: pulseAnim }]} />
      <Text style={styles.text}>GKS</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12, color: '#2D2016' },
});
