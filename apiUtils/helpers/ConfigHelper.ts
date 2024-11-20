import { ZipHelper } from './ZipHelper';

export class ConfigHelper {
  static async getExpoConfigAsync({
    updateBundlePath,
    runtimeVersion,
  }: {
    updateBundlePath: string;
    runtimeVersion: string;
  }): Promise<any> {
    try {
      const zip = await ZipHelper.getZipFromStorage(updateBundlePath);
      const configBuffer = await ZipHelper.getFileFromZip(zip, 'expoconfig.json');
      return JSON.parse(configBuffer.toString('utf-8'));
    } catch (error) {
      throw new Error(
        `No expo config json found with runtime version: ${runtimeVersion}. Error: ${error}`
      );
    }
  }

  static getPrivateKey(): string | null {
    const privateKey = Buffer.from(process.env.PRIVATE_KEY_BASE_64 ?? '', 'base64').toString(
      'utf8'
    );
    return privateKey ?? null;
  }
}
