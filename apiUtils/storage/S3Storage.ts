import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { StorageInterface } from './StorageInterface';

export class S3Storage implements StorageInterface {
  private client: S3Client;
  private bucketName: string;

  constructor() {
    if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
      throw new Error('S3 credentials not configured');
    }
    if (!process.env.S3_BUCKET_NAME) {
      throw new Error('S3 bucket name not configured');
    }
    this.client = new S3Client({
      region: process.env.S3_REGION ?? 'auto',
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
    this.bucketName = process.env.S3_BUCKET_NAME;
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    const copyCommand = new CopyObjectCommand({
      Bucket: this.bucketName,
      CopySource: sourcePath,
      Key: destinationPath,
    });
    await this.client.send(copyCommand);
  }

  async downloadFile(path: string): Promise<Buffer> {
    const getCommand = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });
    const response = await this.client.send(getCommand);
    const body = await response.Body?.transformToByteArray();
    if (!body) {
      throw new Error('No body found in response');
    }
    return Buffer.from(body);
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const files = await this.listDirectories(path);
      if (files.length > 0) {
        return true;
      }
    } catch {}
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: path.split('/').shift(),
      });
      await this.client.send(headCommand);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(directory: string): Promise<
    {
      name: string;
      updated_at: string;
      created_at: string;
      metadata: { size: number; mimetype: string };
    }[]
  > {
    const prefix = `${directory}/`;
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });
    const response = await this.client.send(listCommand);
    return (
      response.Contents?.map((file) => ({
        name: file.Key!.replace(prefix, ''),
        updated_at: file.LastModified?.toISOString() ?? '',
        created_at: file.LastModified?.toISOString() ?? '',
        metadata: {
          size: file.Size ?? 0,
          mimetype: this.getMimeType(file.Key?.split('.').pop() ?? 'unknown'),
        },
      })) ?? []
    );
  }

  async listDirectories(directory: string): Promise<string[]> {
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: directory,
      Delimiter: '/',
    });
    const response = await this.client.send(listCommand);
    return (
      response.CommonPrefixes?.map((prefix) =>
        prefix.Prefix!.replace(directory, '').replace(/\/$/, '')
      ) ?? []
    );
  }

  async uploadFile(path: string, file: Buffer): Promise<string> {
    const uploadCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: path,
      Body: file,
    });
    await this.client.send(uploadCommand);
    return path;
  }

  private getMimeType(ext: string): string {
    const mimeTypes: { [key: string]: string } = {
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      zip: 'application/zip',
    };
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }
}
