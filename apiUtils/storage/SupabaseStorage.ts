import { createClient } from '@supabase/supabase-js';

import { StorageInterface } from './StorageInterface';

export class SupabaseStorage implements StorageInterface {
  private supabase;
  private bucketName = process.env.SUPABASE_BUCKET_NAME ?? 'expo-updates';

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }
  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    console.log('Copying file from', sourcePath, 'to', destinationPath);

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .copy(sourcePath, destinationPath);

    if (error) throw error;
  }

  async listDirectories(directory: string): Promise<string[]> {
    const { data, error } = await this.supabase.storage.from(this.bucketName).list(directory);

    if (error) throw error;
    return data.map((file) => file.name);
  }

  async uploadFile(path: string, file: Buffer): Promise<string> {
    const { error } = await this.supabase.storage.from(this.bucketName).upload(path, file);

    if (error) throw error;
    return path;
  }

  async downloadFile(path: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage.from(this.bucketName).download(path);

    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  async fileExists(path: string): Promise<boolean> {
    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list(path.split('/').slice(0, -1).join('/'));

    if (error) throw error;
    return data.some((file) => file.name === path.split('/').pop());
  }

  async listFiles(directory: string): Promise<
    {
      name: string;
      updated_at: string;
      created_at: string;
      metadata: { size: number; mimetype: string };
    }[]
  > {
    const { data, error } = await this.supabase.storage.from(this.bucketName).list(directory);

    if (error) throw error;
    return data.map((file) => ({
      name: file.name,
      updated_at: file.updated_at,
      created_at: file.created_at,
      metadata: file.metadata as { size: number; mimetype: string },
    }));
  }
}
