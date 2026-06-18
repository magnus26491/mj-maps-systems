// Web stub for expo-sqlite using in-memory storage
const databases = new Map<string, Map<string, any[]>>();

export function openDatabaseSync(params: { name: string }): Database {
  const name = params.name || 'default';
  if (!databases.has(name)) {
    databases.set(name, new Map());
  }
  return new Database(name);
}

class Database {
  private name: string;
  private store: Map<string, any[]>;

  constructor(name: string) {
    this.name = name;
    this.store = databases.get(name)!;
  }

  runSync(sql: string, params?: any[]): { rowsAffected: number; insertId?: number } {
    // For savedRoutes.ts and podOutbox.ts, we just need basic SQL parsing
    // This is a simplified implementation for web
    return { rowsAffected: 0 };
  }

  async runAsync(sql: string, params?: any[]): Promise<{ rowsAffected: number; insertId?: number }> {
    return this.runSync(sql, params);
  }

  async execAsync(sql: string): Promise<void> {
    // Web stub - do nothing
  }

  async getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null> {
    return null;
  }

  async getAllAsync<T>(sql: string, params?: any[]): Promise<T[]> {
    return [];
  }

  closeSync(): void {}
  closeAsync(): void {}
}

export default { openDatabaseSync };
