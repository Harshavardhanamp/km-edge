import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { KEYS, set } from '../lib/secureStore';
import { normaliseUrl, parseConnectQr, probeServer, type DiscoveredServer } from '../lib/discovery';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'ServerDiscovery'>;

type Phase = 'choose' | 'manual' | 'qr' | 'probing' | 'confirm' | 'error';

export default function ServerDiscoveryScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [manualUrl, setManualUrl] = useState('');
  const [server, setServer] = useState<DiscoveredServer | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  async function probe(rawUrl: string) {
    setPhase('probing');
    const found = await probeServer(rawUrl);
    if (!found) {
      setErrorMsg(`Couldn't connect to ${normaliseUrl(rawUrl)}. Check the address and try again.`);
      setPhase('error');
      return;
    }
    setServer(found);
    setPhase('confirm');
  }

  async function confirmServer() {
    if (!server) return;
    await set(KEYS.GKS_SERVER_URL, server.url);
    navigation.replace('Login');
  }

  if (phase === 'probing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.hint}>Connecting…</Text>
      </View>
    );
  }

  if (phase === 'confirm' && server) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Connect to</Text>
        <Text style={styles.serverName}>{server.displayName}</Text>
        <Text style={styles.serverUrl}>{server.url}</Text>
        <TouchableOpacity style={styles.btn} onPress={confirmServer}>
          <Text style={styles.btnText}>Connect</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPhase('choose')}>
          <Text style={styles.link}>Try a different server</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn't connect</Text>
        <Text style={styles.hint}>{errorMsg}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => setPhase('choose')}>
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'manual') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Server address</Text>
        <Text style={styles.hint}>Enter the URL or Tailscale hostname, e.g. gks.tail1234.ts.net</Text>
        <TextInput
          style={styles.urlInput}
          value={manualUrl}
          onChangeText={setManualUrl}
          placeholder="gks.tail1234.ts.net"
          placeholderTextColor="#B0A090"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => manualUrl.trim() && probe(manualUrl.trim())}
        />
        <TouchableOpacity
          style={[styles.btn, !manualUrl.trim() && styles.btnDisabled]}
          disabled={!manualUrl.trim()}
          onPress={() => probe(manualUrl.trim())}
        >
          <Text style={styles.btnText}>Connect</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPhase('choose')}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'qr') {
    return (
      <View style={styles.flex}>
        <CameraView
          style={styles.flex}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            const parsed = parseConnectQr(data);
            if (parsed) probe(parsed.url);
          }}
        />
        <View style={styles.qrOverlay}>
          <Text style={styles.hint}>Scan the QR code from Kashyap's Knowledge → Settings → Devices</Text>
          <TouchableOpacity onPress={() => setPhase('choose')}>
            <Text style={[styles.link, { color: '#FFF' }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // phase === 'choose'
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Connect to Kashyap's Knowledge</Text>
      <Text style={styles.hint}>How would you like to find your server?</Text>

      <TouchableOpacity style={styles.btn} onPress={() => setPhase('manual')}>
        <Text style={styles.btnText}>Enter address</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.btnSecondary]}
        onPress={async () => {
          if (!permission?.granted) await requestPermission();
          setPhase('qr');
        }}
      >
        <Text style={[styles.btnText, { color: colors.accent }]}>Scan QR code</Text>
      </TouchableOpacity>
    </View>
  );
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  serverName: { fontSize: 24, fontWeight: '700', color: colors.accent, textAlign: 'center' },
  serverUrl: { fontSize: 13, color: '#7A6A5A', textAlign: 'center' },
  hint: { fontSize: 14, color: '#7A6A5A', textAlign: 'center' },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '100%',
  },
  btnDisabled: { opacity: 0.4 },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.accent },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  link: { color: colors.accent, fontSize: 14, marginTop: 4 },
  urlInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#FFF',
  },
  qrOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
});
