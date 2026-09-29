import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { healthCheck } from '../lib/gksClient';
import { KEYS, get } from '../lib/secureStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'Lockout'>;

export default function LockoutScreen({ navigation }: Props) {
  const [gksOnline, setGksOnline] = useState(false);

  useEffect(() => {
    let active = true;
    async function probe() {
      const url = await get(KEYS.GKS_SERVER_URL);
      if (!url) return;
      const state = await healthCheck(url);
      if (active) setGksOnline(state === 'online');
    }
    probe();
    const id = setInterval(probe, 15_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.title}>Offline access locked</Text>
      <Text style={styles.body}>Too many failed attempts.{'\n'}Connect to GKS to unlock.</Text>
      <TouchableOpacity
        style={[styles.btn, !gksOnline && styles.btnDisabled]}
        onPress={() => navigation.replace('Login')}
        disabled={!gksOnline}
      >
        <Text style={styles.btnText}>Try online login</Text>
      </TouchableOpacity>
      {!gksOnline && (
        <Text style={styles.hint}>Waiting for GKS connection…</Text>
      )}
    </View>
  );
}

const colors = {
  bg: '#FDF8F4',
  accent: '#C17A3A',
  text: '#2D2016',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  icon: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: '#7A6A5A', textAlign: 'center', lineHeight: 22 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  hint: { fontSize: 13, color: '#A09080' },
});
