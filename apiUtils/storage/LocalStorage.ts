import fs from 'fs/promises';
import path from 'path';

import { StorageInterface } from './StorageInterface';

export class LocalStorage implements StorageInterface {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), 'local-releases');
    this.ensureBaseDir();
  }

  private async ensureBaseDir() {
    try {
      await fs.access(this.baseDir);
    } catch {
      await fs.mkdir(this.baseDir, { recursive: true });
    }
  }

  private async ensureDir(dirPath: string) {
    const fullPath = path.join(this.baseDir, dirPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  async uploadFile(filePath: string, content: Buffer): Promise<string> {
    const fullPath = path.join(this.baseDir, filePath);
    await this.ensureDir(path.dirname(filePath));
    await fs.writeFile(fullPath, content);
    return filePath;
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, filePath);
    return fs.readFile(fullPath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.baseDir, filePath));
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
    const fullPath = path.join(this.baseDir, directory);
    try {
      const files = await fs.readdir(fullPath);
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(fullPath, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            updated_at: stats.mtime.toISOString(),
            created_at: stats.birthtime.toISOString(),
            metadata: {
              size: stats.size,
              mimetype: this.getMimeType(path.extname(file)),
            },
          };
        })
      );
      return fileStats;
    } catch {
      return [];
    }
  }

  async listDirectories(directory: string): Promise<string[]> {
    const fullPath = path.join(this.baseDir, directory);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    const sourceFullPath = path.join(this.baseDir, sourcePath);
    const destFullPath = path.join(this.baseDir, destinationPath);
    await this.ensureDir(path.dirname(destinationPath));
    await fs.copyFile(sourceFullPath, destFullPath);
  }

  private getMimeType(ext: string): string {
    const mimeTypes: { [key: string]: string } = {
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.zip': 'application/zip',
    };
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }
}
