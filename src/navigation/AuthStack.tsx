import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import LockoutScreen from '../screens/LockoutScreen';
import LoginScreen from '../screens/LoginScreen';
import ServerDiscoveryScreen from '../screens/ServerDiscoveryScreen';

export type AuthStackParamList = {
  ServerDiscovery: undefined;
  Login: { message?: string } | undefined;
  Lockout: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ServerDiscovery" component={ServerDiscoveryScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Lockout" component={LockoutScreen} />
    </Stack.Navigator>
  );
}
