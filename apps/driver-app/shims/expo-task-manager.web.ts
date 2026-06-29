// Web stub for expo-task-manager — background tasks don't exist on web.
export function defineTask(_taskName: string, _taskExecutor: (...args: any[]) => any): void {}
export async function isTaskRegisteredAsync(_taskName: string): Promise<boolean> { return false; }
export async function unregisterAllTasksAsync(): Promise<void> {}
export async function unregisterTaskAsync(_taskName: string): Promise<void> {}
export async function getRegisteredTasksAsync(): Promise<[]> { return []; }

export default {
  defineTask,
  isTaskRegisteredAsync,
  unregisterAllTasksAsync,
  unregisterTaskAsync,
  getRegisteredTasksAsync,
};
