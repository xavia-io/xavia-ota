import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { PostgresDatabase } from '../apiUtils/database/LocalDatabase';

jest.mock('../apiUtils/database/LocalDatabase');

describe('DatabaseFactory', () => {
  it('reuses one database and its connection pool across requests', () => {
    const first = DatabaseFactory.getDatabase();
    const second = DatabaseFactory.getDatabase();

    expect(second).toBe(first);
    expect(PostgresDatabase).toHaveBeenCalledTimes(1);
  });
});
