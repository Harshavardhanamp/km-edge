import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { runSync } from './syncEngine';
import { telemetry } from '../telemetry';

export const SYNC_TASK = 'km-edge-sync';

// Define task once at module load — safe to call multiple times (idempotent)
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const result = await runSync();
    telemetry.action('record_save', { sync_run: result });
    return result.synced > 0 || result.telemetryFlushed > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e: any) {
    telemetry.error({ error_code: 'SYNC_TASK_ERROR', message: e?.message ?? 'unknown' });
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerSyncTask(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied) {
    return; // background fetch not available on this device
  }
  const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(SYNC_TASK, {
      minimumInterval: 15 * 60, // 15 minutes
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}

export async function unregisterSyncTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(SYNC_TASK);
  }
}
