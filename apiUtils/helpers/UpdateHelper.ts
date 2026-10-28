import moment from 'moment';

import { HashHelper } from './HashHelper';
import { ZipHelper } from './ZipHelper';
import { DatabaseFactory } from '../database/DatabaseFactory';

export class NoUpdateAvailableError extends Error {}
export class UpdateHelper {
  // Bundles are named by their UTC publish time (YYYYMMDDHHmmss.zip), and that name is what
  // decides which update devices receive. File creation times are unreliable (Linux volumes
  // often report 1970), so prefer this.
  static getPublishedAtFromFileName(fileName: string): string | null {
    const parsed = moment.utc(fileName.replace(/\.zip$/, ''), 'YYYYMMDDHHmmss', true);
    return parsed.isValid() ? parsed.toISOString() : null;
  }

  static async getLatestUpdateBundlePathForRuntimeVersionAsync(
    runtimeVersion: string
  ): Promise<string> {
    const release = await DatabaseFactory.getDatabase().getLatestReleaseRecordForRuntimeVersion(
      runtimeVersion
    );
    if (!release) throw new NoUpdateAvailableError();
    return release.path.replace(/\.zip$/, '');
  }

  static async getMetadataAsync({
    updateBundlePath,
    runtimeVersion,
  }: {
    updateBundlePath: string;
    runtimeVersion: string;
  }) {
    try {
      const zip = await ZipHelper.getZipFromStorage(updateBundlePath);
      const metadataBuffer = await ZipHelper.getFileFromZip(zip, 'metadata.json');
      const metadataJson = JSON.parse(metadataBuffer.toString('utf-8'));

      return {
        metadataJson,
        createdAt: new Date().toISOString(),
        id: HashHelper.createHash(metadataBuffer, 'sha256', 'hex'),
      };
    } catch (error) {
      throw new Error(`No metadata found with runtime version: ${runtimeVersion}. Error: ${error}`);
    }
  }

  static async createRollBackDirectiveAsync(updateBundlePath: string) {
    try {
      const zip = await ZipHelper.getZipFromStorage(updateBundlePath);
      const hasRollback = zip.getEntry('rollback') !== null;

      if (hasRollback) {
        return {
          type: 'rollBackToEmbedded',
          parameters: {
            commitTime: new Date().toISOString(),
          },
        };
      }
      throw new Error('No rollback file found');
    } catch (error) {
      throw new Error(`No rollback found. Error: ${error}`);
    }
  }

  static async createNoUpdateAvailableDirectiveAsync() {
    return {
      type: 'noUpdateAvailable',
    };
  }
}
