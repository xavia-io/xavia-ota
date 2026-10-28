import { PostgresDatabase } from './LocalDatabase';

export enum Tables {
  RELEASES = 'releases',
  RELEASES_TRACKING = 'releases_tracking',
  RELEASE_PUBLICATIONS = 'release_publications',
}

export class DatabaseFactory {
  private static instance: PostgresDatabase;

  // One instance per process: each one owns a connection pool, so creating one per call opened new
  // Postgres connections on every request and ran out of them under load.
  static getDatabase(): PostgresDatabase {
    if (process.env.DB_TYPE !== 'postgres') {
      throw new Error('Unsupported database type');
    }
    if (!DatabaseFactory.instance) {
      DatabaseFactory.instance = new PostgresDatabase();
    }
    return DatabaseFactory.instance;
  }
}
