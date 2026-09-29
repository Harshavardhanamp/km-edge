import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useAuth } from '../context/AuthContext';
import AppShell from './AppShell';
import AuthStack from './AuthStack';

const Root = createNativeStackNavigator();

export default function RootNavigator() {
  const { sessionValid } = useAuth();

  return (
    <NavigationContainer>
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
