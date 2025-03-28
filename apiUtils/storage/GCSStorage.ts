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
    // GCS returns file names as fully qualified paths
    const [files] = await this.storage.bucket(this.bucketName).getFiles({
      prefix: directory,
      delimiter: directory.charAt(directory.length - 1) === '/' ? '' : '/',
    });

    // remove directory path from the file name in result
    //only return the first folder name in resulting path
    const innerFolders = files.map((file: any) => {
      return file.name
        .replace(directory, '')
        .replace(/^\/+|\/+$/g, '')
        .split('/')[0];
    });

    return innerFolders.filter((value, index, array) => array.indexOf(value) === index);
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
      prefix: path,
    });

    const pathParts = path.split('/');
    const requestedFile = pathParts[pathParts.length - 1];

    return files.some((file: any) => file.name.includes(requestedFile));
  }

  async listFiles(directory: string): Promise<
    {
      name: string;
      updated_at: string;
      created_at: string;
      metadata: { size: number; mimetype: string };
    }[]
  > {
    // GCS returns file names as fully qualified paths
    const [files] = await this.storage.bucket(this.bucketName).getFiles({
      prefix: directory,
    });

    return files.map((file: any) => ({
      // remove directory path from the file name in result
      name: file.name.split('/').pop(),
      updated_at: file.metadata.updated,
      created_at: file.metadata.timeCreated,
      metadata: {
        size: file.metadata.size,
        mimetype: file.metadata.contentType,
      },
    }));
  }
}
