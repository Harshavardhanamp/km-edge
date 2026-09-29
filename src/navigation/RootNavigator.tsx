import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useAuth } from '../context/AuthContext';
import AuthStack from './AuthStack';

// Authenticated screens are placeholder until Sprint 8 (navigation integration)
import { Text, View } from 'react-native';

function AppShellPlaceholder() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Home — Sprint 6</Text>
    </View>
  );
}

const Root = createNativeStackNavigator();

export default function RootNavigator() {
  const { sessionValid } = useAuth();

  return (
    <NavigationContainer>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        {sessionValid ? (
          <Root.Screen name="AppShell" component={AppShellPlaceholder} />
        ) : (
          <Root.Screen name="Auth" component={AuthStack} />
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
