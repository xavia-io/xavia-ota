export class ConfigHelper {
  static getPrivateKey(): string | null {
    const privateKey = Buffer.from(process.env.PRIVATE_KEY_BASE_64 ?? '', 'base64').toString(
      'utf8'
    );
    return privateKey ?? null;
  }
}
