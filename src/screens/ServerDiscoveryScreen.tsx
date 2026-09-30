import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Network from 'expo-network';
import { healthCheck } from '../lib/gksClient';
import { KEYS, set } from '../lib/secureStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'ServerDiscovery'>;

type ProbeResult = { url: string; hostname: string };

const TAILSCALE_SUBNET = '100.';
const GKS_PORT = 8000;

async function probeSubnet(): Promise<ProbeResult[]> {
  // Tailscale assigns 100.x.x.x addresses. We probe the device's own Tailscale
  // IP to derive the /16 prefix, then scan .1–.254 of that range.
  // ponytail: sequential probe is slow on large subnets; parallel with Promise.allSettled
  // is fine for typical Tailscale mesh of <20 peers.
  const ipInfo = await Network.getIpAddressAsync();
  const parts = ipInfo.split('.');
  const prefix = parts[0] === '100' ? `${parts[0]}.${parts[1]}` : TAILSCALE_SUBNET;

  const candidates: string[] = [];
  for (let third = 0; third < 256; third++) {
    for (let fourth = 1; fourth < 255; fourth++) {
      candidates.push(`http://${prefix}.${third}.${fourth}:${GKS_PORT}`);
    }
  }

  // ponytail: scanning 65k IPs sequentially is impractical. Real Tailscale devices
  // are enumerable via the Tailscale local API (100.100.100.100:41112). Doing a
  // targeted probe of the local Tailscale peer list is the correct approach in V2.
  // For V1: scan /24 of the device's own Tailscale IP only.
  const localPrefix = parts[0] === '100'
    ? `${parts[0]}.${parts[1]}.${parts[2]}`
    : '100.64.0';

  const localCandidates: string[] = [];
  for (let i = 1; i < 255; i++) {
    localCandidates.push(`http://${localPrefix}.${i}:${GKS_PORT}`);
  }

  const results = await Promise.allSettled(
    localCandidates.map(async (url) => {
      const state = await healthCheck(url);
      if (state === 'online') {
        const hostname = new URL(url).hostname;
        return { url, hostname };
      }
      return null;
    })
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<ProbeResult> =>
        r.status === 'fulfilled' && r.value !== null
    )
    .map((r) => r.value!);
}

export default function ServerDiscoveryScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<'scanning' | 'results' | 'qr' | 'manual' | 'error'>('scanning');
  const [servers, setServers] = useState<ProbeResult[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  const scan = useCallback(async () => {
    setPhase('scanning');
    const found = await probeSubnet();
    if (found.length === 0) {
      setPhase('error');
    } else if (found.length === 1) {
      await confirmServer(found[0]);
    } else {
      setServers(found);
      setPhase('results');
    }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  async function confirmServer(server: ProbeResult) {
    await set(KEYS.GKS_SERVER_URL, server.url);
    navigation.replace('Login');
  }

  if (phase === 'scanning') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.hint}>Scanning for GKS server…</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No GKS server found</Text>
        <Text style={styles.hint}>Make sure Tailscale is connected and GKS is running.</Text>
        <TouchableOpacity style={styles.btn} onPress={scan}>
          <Text style={styles.btnText}>Scan again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={async () => {
            if (!permission?.granted) await requestPermission();
            setPhase('qr');
          }}
        >
          <Text style={[styles.btnText, styles.btnTextSecondary]}>Scan QR code instead</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPhase('manual')}>
          <Text style={[styles.hint, { color: colors.accent, marginTop: 8 }]}>Enter URL manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'manual') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>GKS Server URL</Text>
        <Text style={styles.hint}>Enter the full URL including port, e.g. http://100.x.x.x:8000</Text>
        <TextInput
          style={styles.urlInput}
          value={manualUrl}
          onChangeText={setManualUrl}
          placeholder="http://100.x.x.x:8000"
          placeholderTextColor="#B0A090"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TouchableOpacity
          style={styles.btn}
          onPress={async () => {
            const url = manualUrl.trim();
            if (!url) return;
            const state = await healthCheck(url);
            if (state === 'online') {
              await confirmServer({ url, hostname: new URL(url).hostname });
            } else {
              Alert.alert('Cannot reach server', 'Check the URL and make sure Tailscale is connected.');
            }
          }}
        >
          <Text style={styles.btnText}>Connect</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPhase('error')}>
          <Text style={[styles.hint, { color: colors.accent, marginTop: 8 }]}>Cancel</Text>
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
          onBarcodeScanned={async ({ data }) => {
            const state = await healthCheck(data);
            if (state === 'online') {
              await confirmServer({ url: data, hostname: new URL(data).hostname });
            }
          }}
        />
        <View style={styles.qrHint}>
          <Text style={styles.hint}>Point camera at GKS QR code</Text>
          <TouchableOpacity onPress={() => setPhase('error')}>
            <Text style={[styles.hint, { color: colors.accent }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // results — multiple servers found
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select your GKS server</Text>
      <FlatList
        data={servers}
        keyExtractor={(s) => s.url}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.serverRow} onPress={() => confirmServer(item)}>
            <Text style={styles.serverHost}>{item.hostname}</Text>
            <Text style={styles.serverUrl}>{item.url}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const colors = {
  bg: '#FDF8F4',
  accent: '#C17A3A',
  text: '#2D2016',
  border: '#E0D0C0',
};

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
  container: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 8 },
  hint: { fontSize: 14, color: '#7A6A5A', textAlign: 'center' },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.accent },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  btnTextSecondary: { color: colors.accent },
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
  serverRow: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  serverHost: { fontSize: 16, fontWeight: '600', color: colors.text },
  serverUrl: { fontSize: 12, color: '#7A6A5A', marginTop: 2 },
  qrHint: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
  },
});
