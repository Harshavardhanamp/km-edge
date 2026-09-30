import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { deriveVerifier, generateSalt, verifyPassword } from '../lib/auth';
import { login as gksLogin } from '../lib/gksClient';
import { KEYS, ensureDeviceId, get, set } from '../lib/secureStore';
import { useAuth } from '../context/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation, route }: Props) {
  const { login: authLogin } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    (route.params as { message?: string } | undefined)?.message ?? null
  );
  const [gksUrl, setGksUrl] = useState<string | null>(null);
  const [hasOfflineVerifier, setHasOfflineVerifier] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    async function init() {
      const url = await get(KEYS.GKS_SERVER_URL);
      setGksUrl(url);
      const verifier = await get(KEYS.OFFLINE_VERIFIER);
      setHasOfflineVerifier(!!verifier);
      const stored = await get(KEYS.DEVICE_NAME);
      setDeviceName(stored ?? (Constants.deviceName ?? `${Platform.OS} device`));
      await ensureDeviceId();
    }
    init();
  }, []);

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      setError('Enter your username and password');
      return;
    }
    if (!gksUrl) {
      setError('No GKS server configured');
      return;
    }
    setLoading(true);
    setError(null);

    const appVersion = (Constants.expoConfig?.version ?? '2.0.0') as string;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const name = deviceName.trim() || `${platform} device`;

    const result = await gksLogin({
      baseUrl: gksUrl,
      identifier: identifier.trim(),
      password,
      deviceName: name,
      platform,
      appVersion,
    });

    if (!result.ok) {
      setLoading(false);
      if ('network' in result) {
        setError('Network error — check your connection');
      } else {
        setError(result.error.message || 'Login failed');
      }
      return;
    }

    const { token, expires_at, user } = result.body;

    // Store token and session info; never store password
    await set(KEYS.EDGE_TOKEN, token);
    await set(KEYS.EDGE_TOKEN_EXPIRES_AT, expires_at);
    await set(KEYS.GKS_USERNAME, user.username);
    await set(KEYS.GKS_USER_ID, user.user_id);
    await set(KEYS.DEVICE_NAME, name);

    // Refresh offline verifier
    const salt = await generateSalt();
    const hash = await deriveVerifier(password, salt);
    await set(KEYS.OFFLINE_VERIFIER, hash);
    await set(KEYS.OFFLINE_VERIFIER_SALT, salt);
    await set(KEYS.OFFLINE_ATTEMPT_COUNT, '0');

    setLoading(false);
    authLogin({ userId: user.user_id, displayName: user.display_name });
  }

  async function handleOfflineLogin() {
    if (!password) {
      setError('Enter your password');
      return;
    }
    setLoading(true);
    setError(null);

    const storedHash = await get(KEYS.OFFLINE_VERIFIER);
    const salt = await get(KEYS.OFFLINE_VERIFIER_SALT);
    const attemptsStr = await get(KEYS.OFFLINE_ATTEMPT_COUNT);
    const attempts = parseInt(attemptsStr ?? '0', 10);

    if (!storedHash || !salt) {
      setLoading(false);
      setError('No offline credentials stored');
      return;
    }

    const ok = await verifyPassword(password, storedHash, salt);
    setLoading(false);

    if (ok) {
      await set(KEYS.OFFLINE_ATTEMPT_COUNT, '0');
      const storedUserId = await get(KEYS.GKS_USER_ID) ?? '';
      authLogin({ userId: storedUserId, offline: true });
    } else {
      const next = attempts + 1;
      await set(KEYS.OFFLINE_ATTEMPT_COUNT, String(next));
      if (next >= 3) {
        navigation.replace('Lockout');
      } else {
        setError(`Incorrect password (${3 - next} attempt${3 - next === 1 ? '' : 's'} left)`);
      }
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.appName}>KM-Edge</Text>
        <Text style={styles.tagline}>Your family knowledge</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {!showOffline ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Username or email"
            placeholderTextColor="#A09080"
            autoCapitalize="none"
            autoCorrect={false}
            value={identifier}
            onChangeText={setIdentifier}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor="#A09080"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.btnText}>Log in</Text>
            )}
          </TouchableOpacity>

          {hasOfflineVerifier && (
            <TouchableOpacity onPress={() => { setShowOffline(true); setError(null); }}>
              <Text style={styles.link}>Continue offline instead</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          <Text style={styles.offlineNote}>Enter your password to unlock offline access.</Text>

          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor="#A09080"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              returnKeyType="done"
              onSubmitEditing={handleOfflineLogin}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleOfflineLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Continue offline</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setShowOffline(false); setError(null); }}>
            <Text style={styles.link}>Back to sign in</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 32,
    justifyContent: 'center',
    gap: 12,
  },
  header: { alignItems: 'center', marginBottom: 24 },
  appName: { fontSize: 32, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  tagline: { fontSize: 16, color: '#7A6A5A', marginTop: 4 },
  error: {
    backgroundColor: '#FDE8D8',
    color: '#8B3A00',
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  offlineNote: { fontSize: 14, color: '#7A6A5A', textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FFF',
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 44 },
  eyeBtn: { position: 'absolute', right: 12, top: 12 },
  eyeIcon: { fontSize: 18 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  link: { color: colors.accent, textAlign: 'center', fontSize: 14 },
});
