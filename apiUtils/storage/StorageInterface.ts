export interface StorageInterface {
  uploadFile(path: string, file: Buffer): Promise<string>;
  downloadFile(path: string): Promise<Buffer>;
  fileExists(path: string): Promise<boolean>;
  listFiles(directory: string): Promise<
    {
      name: string;
      updated_at: string;
      created_at: string;
      metadata: { size: number; mimetype: string };
    }[]
  >;
  listDirectories(directory: string): Promise<string[]>;
  copyFile(sourcePath: string, destinationPath: string): Promise<void>;
}
