import { Storage } from '@google-cloud/storage';

import { StorageInterface } from './StorageInterface';

export class GCSStorage implements StorageInterface {
  private storage;
  private bucketName;

  constructor() {
    if (!process.env.GCP_BUCKET_NAME) {
      throw new Error('GCS bucket name not configured');
    }

    this.storage = new Storage();
    this.bucketName = process.env.GCP_BUCKET_NAME;
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    console.log('Copying file from', sourcePath, 'to', destinationPath);

    const copyDestination = this.storage.bucket(this.bucketName).file(destinationPath);
    await this.storage.bucket(this.bucketName).file(sourcePath).copy(copyDestination);
    console.log(
      `gs://${this.bucketName}/${sourcePath} copied to gs://${this.bucketName}/${destinationPath}`
    );
  }

  async listDirectories(directory: string): Promise<string[]> {
    const [files] = await this.storage.bucket(this.bucketName).getFiles({
      prefix: directory,
      delimiter: '/',
    });

    return files.map((file: any) => file.name.split('/').slice(0, -1).join('/'));
  }

  async uploadFile(path: string, file: Buffer): Promise<string> {
    const fileObject = this.storage.bucket(this.bucketName).file(path);
    await fileObject.save(file);
    console.log(`gs://${this.bucketName}/${path} uploaded`);
    return path;
  }

  async downloadFile(path: string): Promise<Buffer> {
    const [file] = await this.storage.bucket(this.bucketName).file(path).download();
    return file;
  }

  async fileExists(path: string): Promise<boolean> {
    const [files] = await this.storage.bucket(this.bucketName).getFiles({
      prefix: path.split('/').slice(0, -1).join('/'),
    });

    return files.some((file: any) => file.name.split('/').pop() === path.split('/').pop());
  }

  async listFiles(directory: string): Promise<
    {
      name: string;
      updated_at: string;
      created_at: string;
      metadata: { size: number; mimetype: string };
    }[]
  > {
    const [files] = await this.storage.bucket(this.bucketName).getFiles({
      prefix: directory,
    });

    return files.map((file: any) => ({
      name: file.name,
      updated_at: file.metadata.updated,
      created_at: file.metadata.timeCreated,
      metadata: {
        size: file.metadata.size,
        mimetype: file.metadata.contentType,
      },
    }));
  }
}
