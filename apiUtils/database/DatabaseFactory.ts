import { DatabaseInterface } from './DatabaseInterface';
import { PostgresDatabase } from './LocalDatabase';
import { SupabaseDatabase } from './SupabaseDatabase';

export enum Tables {
  RELEASES = 'releases',
  RELEASES_TRACKING = 'releases_tracking',
}

export class DatabaseFactory {
  private static instance: DatabaseInterface;

  static getDatabase(): DatabaseInterface {
    if (process.env.DB_TYPE === 'supabase') {
      DatabaseFactory.instance = new SupabaseDatabase();
    } else if (process.env.DB_TYPE === 'postgres') {
      DatabaseFactory.instance = new PostgresDatabase();
    } else {
      throw new Error('Unsupported database type');
    }
    return DatabaseFactory.instance;
  }
}
