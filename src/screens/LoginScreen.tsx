import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { deriveVerifier, generateSalt, verifyPassword } from '../lib/auth';
import { healthCheck, login } from '../lib/gksClient';
import { KEYS, get, set } from '../lib/secureStore';
import { useAuth } from '../context/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation, route }: Props) {
  const { login: authLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    (route.params as { message?: string } | undefined)?.message ?? null
  );
  const [gksUrl, setGksUrl] = useState<string | null>(null);
  const [gksOnline, setGksOnline] = useState(false);
  const [hasOfflineVerifier, setHasOfflineVerifier] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    async function probe() {
      const url = await get(KEYS.GKS_SERVER_URL);
      const verifier = await get(KEYS.OFFLINE_VERIFIER);
      setGksUrl(url);
      setHasOfflineVerifier(!!verifier);
      if (url) {
        const state = await healthCheck(url);
        setGksOnline(state === 'online');
      }
    }
    probe();
  }, []);

  async function handleLogin() {
    if (!username.trim() || !password) {
      setError('Enter username and password');
      return;
    }
    if (!gksUrl) {
      setError('No GKS server configured');
      return;
    }
    setLoading(true);
    setError(null);

    const result = await login(gksUrl, username.trim(), password);
    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      return;
    }

    // Store credentials for silent re-auth and offline verifier
    await set(KEYS.GKS_USERNAME, username.trim());
    await set(KEYS.GKS_USER_ID, result.userId);
    await set(KEYS.GKS_PASSWORD_ENC, password);

    // Refresh offline verifier
    const salt = await generateSalt();
    const hash = await deriveVerifier(password, salt);
    await set(KEYS.OFFLINE_VERIFIER, hash);
    await set(KEYS.OFFLINE_VERIFIER_SALT, salt);
    await set(KEYS.OFFLINE_ATTEMPT_COUNT, '0');

    setLoading(false);
    authLogin({ userId: result.userId });
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
      const storedUsername = await get(KEYS.GKS_USERNAME);
      authLogin({ userId: storedUsername ?? '', offline: true });
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

  const showOfflineOption = !gksOnline && hasOfflineVerifier;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.appName}>KM-Edge</Text>
        <Text style={styles.tagline}>Your family knowledge</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="Username or email"
        placeholderTextColor="#A09080"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
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
          onSubmitEditing={gksOnline ? handleLogin : undefined}
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
        style={[styles.btn, (loading || !gksOnline) && styles.btnDisabled]}
        onPress={handleLogin}
        disabled={loading || !gksOnline}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.btnText}>Log in</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => gksUrl && Linking.openURL(`${gksUrl}/forgot-password`)}
        disabled={!gksUrl}
      >
        <Text style={styles.link}>Forgot password?</Text>
      </TouchableOpacity>

      {showOfflineOption && (
        <>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={handleOfflineLogin}
            disabled={loading}
          >
            <Text style={styles.btnSecondaryText}>Continue offline</Text>
          </TouchableOpacity>
        </>
      )}
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: '#7A6A5A', fontSize: 13 },
  btnSecondary: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondaryText: { color: colors.accent, fontWeight: '600', fontSize: 16 },
});
