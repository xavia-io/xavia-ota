import crypto, { BinaryToTextEncoding } from 'crypto';

export class HashHelper {
  static createHash(
    file: Buffer,
    hashingAlgorithm: string,
    encoding: BinaryToTextEncoding
  ): string {
    return crypto.createHash(hashingAlgorithm).update(file).digest(encoding);
  }

  static getBase64URLEncoding(base64EncodedString: string): string {
    return base64EncodedString.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  static convertSHA256HashToUUID(value: string): string {
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(
      16,
      20
    )}-${value.slice(20, 32)}`;
  }

  static signRSASHA256(data: string, privateKey: string): string {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data, 'utf8');
    sign.end();
    return sign.sign(privateKey, 'base64');
  }
}
