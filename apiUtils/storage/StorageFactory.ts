import { LocalStorage } from './LocalStorage';
import { StorageInterface } from './StorageInterface';
import { SupabaseStorage } from './SupabaseStorage';
import { GCSStorage } from './GCSStorage';
import { getLogger } from '../logger';

const logger = getLogger('StorageFactory');

export class StorageFactory {
  private static instance: StorageInterface;

  static getStorage(): StorageInterface {
    if (!StorageFactory.instance) {
      const storageType = process.env.BLOB_STORAGE_TYPE;
      if (storageType === 'supabase') {
        StorageFactory.instance = new SupabaseStorage();
      } else if (storageType === 'local') {
        StorageFactory.instance = new LocalStorage();
      } else if (storageType === 'gcs') {
        StorageFactory.instance = new GCSStorage();
      } else {
        logger.error('Unsupported storage type', { storageType });
        throw new Error('Unsupported storage type');
      }
    }
    return StorageFactory.instance;
  }
}
