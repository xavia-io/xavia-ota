import { LocalStorage } from './LocalStorage';
import { StorageInterface } from './StorageInterface';
import { SupabaseStorage } from './SupabaseStorage';

export class StorageFactory {
  private static instance: StorageInterface;

  static getStorage(): StorageInterface {
    if (!StorageFactory.instance) {
      const storageType = process.env.BLOB_STORAGE_TYPE;
      if (storageType === 'supabase') {
        StorageFactory.instance = new SupabaseStorage();
      } else if (storageType === 'local') {
        StorageFactory.instance = new LocalStorage();
      } else {
        throw new Error('Unsupported storage type');
      }
    }
    return StorageFactory.instance;
  }
}
