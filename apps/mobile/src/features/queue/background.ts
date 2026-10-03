import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getServices } from '../../services';

/**
 * Background upload: Android WorkManager wakes the app (≥ 15 min, only with network) and drains
 * the queue even if the technician never reopens the app. Must be defined at module load.
 */
export const UPLOAD_TASK = 'acceptance-upload-queue';

TaskManager.defineTask(UPLOAD_TASK, async () => {
  try {
    const services = await getServices();
    const summary = await services.engine.run();
    await services.refreshCounts();
    return summary.stoppedBecause === 'auth' ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundUpload(): Promise<void> {
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(UPLOAD_TASK))) {
      await BackgroundTask.registerTaskAsync(UPLOAD_TASK, { minimumInterval: 15 });
    }
  } catch (err) {
    console.warn('[sync] background task not available', err);
  }
}
