import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import AppShell from './AppShell';
import AuthStack from './AuthStack';
import { KEYS, get } from '../lib/secureStore';
import { parseConnectQr } from '../lib/discovery';

const Root = createNativeStackNavigator();

const linking = {
  prefixes: ['kmedge://'],
  config: {
    screens: {
      AppShell: {
        screens: {
          // kmedge://record/<edge_id> handled inside AppShell (K5/V2-F5)
          record: 'record/:edgeId',
        },
      },
    },
  },
};

export default function RootNavigator() {
  const { sessionValid } = useAuth();
  const navRef = useRef<NavigationContainerRef<object>>(null);

  useEffect(() => {
    async function handleUrl(url: string) {
      if (!url.startsWith('kmedge://connect')) return;
      const parsed = parseConnectQr(url);
      if (!parsed) return;
      const existing = await get(KEYS.GKS_SERVER_URL);
      if (existing === parsed.url && sessionValid) return;
      navRef.current?.navigate('Auth' as never, {
        screen: 'ServerDiscovery',
        params: { prefillUrl: parsed.url },
      } as never);
    }

    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); });
    return () => sub.remove();
  }, [sessionValid]);

  return (
    <NavigationContainer ref={navRef} linking={linking}>
      <Root.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        {sessionValid ? (
          <Root.Screen name="AppShell" component={AppShell} />
        ) : (
          <Root.Screen name="Auth" component={AuthStack} />
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
