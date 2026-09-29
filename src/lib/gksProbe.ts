import * as Network from 'expo-network';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { healthCheck } from './gksClient';
import { KEYS, get } from './secureStore';

interface ProbeState {
  reachable: boolean;
  lastProbeAt: string | null;
}

// Module-level state — shared across all consumers
let state: ProbeState = { reachable: false, lastProbeAt: null };
const listeners = new Set<(s: ProbeState) => void>();

function notify() {
  listeners.forEach((l) => l({ ...state }));
}

async function probe() {
  const url = await get(KEYS.GKS_SERVER_URL);
  if (!url) return;

  const net = await Network.getNetworkStateAsync();
  if (!net.isConnected) {
    state = { reachable: false, lastProbeAt: new Date().toISOString() };
    notify();
    return;
  }

  const result = await healthCheck(url);
  state = { reachable: result === 'online', lastProbeAt: new Date().toISOString() };
  notify();
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startProbe() {
  probe();
  if (!intervalId) {
    intervalId = setInterval(probe, 60_000);
  }
}

export function stopProbe() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function useGksProbe(): ProbeState {
  const [s, setS] = useState<ProbeState>({ ...state });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const handler = (next: ProbeState) => { if (mounted.current) setS(next); };
    listeners.add(handler);

    // Start probe loop when foreground, stop when background
    const appStateSub = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') startProbe();
      else stopProbe();
    });

    startProbe();

    return () => {
      mounted.current = false;
      listeners.delete(handler);
      appStateSub.remove();
    };
  }, []);

  return s;
}
