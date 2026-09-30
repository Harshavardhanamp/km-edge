let _connected = true;

export function __setConnected(v: boolean) {
  _connected = v;
}

export async function getNetworkStateAsync() {
  return { isConnected: _connected, isInternetReachable: _connected };
}
