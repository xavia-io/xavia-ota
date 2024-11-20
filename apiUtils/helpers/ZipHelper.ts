import AdmZip from 'adm-zip';

import { StorageFactory } from '../storage/StorageFactory';

interface CachedZip {
  zip: AdmZip;
  timestamp: number;
}

export class ZipHelper {
  private static zipCache: Map<string, CachedZip> = new Map();
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static async getZipFromStorage(updateBundlePath: string): Promise<AdmZip> {
    const storage = StorageFactory.getStorage();
    const cached = this.zipCache.get(updateBundlePath);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.zip;
    }

    const zipBuffer = await storage.downloadFile(`${updateBundlePath}.zip`);
    const zip = new AdmZip(zipBuffer);
    this.zipCache.set(updateBundlePath, { zip, timestamp: Date.now() });
    return zip;
  }

  static async getFileFromZip(zip: AdmZip, filePath: string): Promise<Buffer> {
    const entries = zip.getEntries();
    const entry = entries.find((entry) => entry.entryName === filePath);
    if (!entry) throw new Error(`File not found in zip: ${filePath}`);
    return entry.getData();
  }
}
