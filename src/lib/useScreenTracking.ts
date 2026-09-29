import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { telemetry } from './telemetry';

export function useScreenTracking(screenName: string) {
  useFocusEffect(
    useCallback(() => {
      telemetry.screenEnter(screenName);
      return () => telemetry.screenExit(screenName);
    }, [screenName])
  );
}
