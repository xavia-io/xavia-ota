import formidable from 'formidable';
import { createMocks } from 'node-mocks-http';
import fs from 'fs';
import AdmZip from 'adm-zip';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';
import { ZipHelper } from '../apiUtils/helpers/ZipHelper';
import { HashHelper } from '../apiUtils/helpers/HashHelper';
import { BundlePatchCache } from '../apiUtils/helpers/BundlePatchCache';
import { ReleaseAssetCache } from '../apiUtils/helpers/ReleaseAssetCache';
import uploadHandler from '../pages/api/upload';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/storage/StorageFactory');
jest.mock('../apiUtils/helpers/ZipHelper');
jest.mock('../apiUtils/helpers/HashHelper');
jest.mock('../apiUtils/helpers/ReleaseAssetCache');
jest.mock('../apiUtils/helpers/BundlePatchCache');
jest.mock('formidable');
jest.mock('adm-zip');

describe('Upload API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (BundlePatchCache.prepareRelease as jest.Mock).mockResolvedValue({
      ready: 2,
      patchBytes: 300,
      fullBytes: 20000,
    });
  });

  it('should return 405 for non-POST requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await uploadHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should handle file upload successfully', async () => {
    // Mock form data
    const mockForm = {
      parse: jest.fn().mockResolvedValue([
        {
          uploadKey: [process.env.UPLOAD_KEY],
          runtimeVersion: ['1.0.0'],
          commitHash: ['abc123'],
          commitMessage: ['Test commit message'],
          repositoryUrl: ['git@github.com:acme/mobile-app.git'],
        },
        {
          file: [{ filepath: 'test.zip' }],
        },
      ]),
    };
    (formidable as unknown as jest.Mock).mockReturnValue(mockForm);

    // Mock file system
    const mockFileContent = Buffer.from('test file content');
    jest.spyOn(fs, 'readFileSync').mockReturnValue(mockFileContent);

    // Mock AdmZip
    const mockZipFolder = {} as AdmZip;
    (AdmZip as unknown as jest.Mock).mockImplementation(() => mockZipFolder);

    // Mock ZipHelper
    const mockMetadataContent = Buffer.from('{"version":"1.0.0"}');
    (ZipHelper.getFileFromZip as jest.Mock).mockResolvedValue(mockMetadataContent);

    // Mock HashHelper
    const mockHash = 'abcdef1234567890abcdef1234567890';
    const mockUpdateId = 'abcdef12-3456-7890-abcd-ef1234567890';
    (HashHelper.createHash as jest.Mock).mockReturnValue(mockHash);
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue(mockUpdateId);

    // Mock storage and database
    const mockStorage = {
      uploadFile: jest.fn().mockResolvedValue('updates/1.0.0/timestamp.zip'),
    };
    const mockDatabase = {
      getReleaseByUpdateId: jest.fn().mockResolvedValue(null),
      createRelease: jest
        .fn()
        .mockImplementation(async (release) => ({ id: 'release-id', ...release })),
      activateRelease: jest.fn().mockResolvedValue(undefined),
      failRelease: jest.fn(),
    };
    (StorageFactory.getStorage as jest.Mock).mockReturnValue(mockStorage);
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    // Execute test
    const { req, res } = createMocks({ method: 'POST' });
    await uploadHandler(req, res);

    // Verify results
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      success: true,
      path: expect.stringMatching(/^updates\/1\.0\.0\/[0-9a-f-]+\.zip$/),
      updateId: mockUpdateId,
      bundlePatches: { ready: 2, patchBytes: 300, fullBytes: 20000 },
    });

    // Verify all mocks were called correctly
    expect(mockStorage.uploadFile).toHaveBeenCalled();
    expect(mockDatabase.createRelease).toHaveBeenCalledWith({
      path: expect.stringMatching(/^updates\/1\.0\.0\/[0-9a-f-]+\.zip$/),
      runtimeVersion: '1.0.0',
      timestamp: expect.any(String),
      commitHash: 'abc123',
      commitMessage: 'Test commit message',
      updateId: mockUpdateId,
      repositoryUrl: 'https://github.com/acme/mobile-app',
      status: 'uploading',
    });
    expect(mockDatabase.activateRelease).toHaveBeenCalledWith('release-id');
    expect(ReleaseAssetCache.prepareFromZip).toHaveBeenCalledWith('release-id', mockZipFolder);
    expect(
      (ReleaseAssetCache.prepareFromZip as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan(mockStorage.uploadFile.mock.invocationCallOrder[0]);
    expect(BundlePatchCache.prepareRelease).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'release-id', runtimeVersion: '1.0.0' }),
      await (ReleaseAssetCache.prepareFromZip as jest.Mock).mock.results[0].value
    );
    expect(mockStorage.uploadFile.mock.invocationCallOrder[0]).toBeLessThan(
      (BundlePatchCache.prepareRelease as jest.Mock).mock.invocationCallOrder[0]
    );
    expect((BundlePatchCache.prepareRelease as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      mockDatabase.activateRelease.mock.invocationCallOrder[0]
    );
    expect(ZipHelper.getFileFromZip).toHaveBeenCalledWith(mockZipFolder, 'metadata.json');
    expect(HashHelper.createHash).toHaveBeenCalledWith(mockMetadataContent, 'sha256', 'hex');
    expect(HashHelper.convertSHA256HashToUUID).toHaveBeenCalledWith(mockHash);
  });

  it('should return 400 for missing required fields', async () => {
    const mockForm = {
      parse: jest.fn().mockResolvedValue([{}, {}]),
    };

    (formidable as unknown as jest.Mock).mockReturnValue(mockForm);

    const { req, res } = createMocks({ method: 'POST' });
    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('returns an existing release without uploading it again', async () => {
    (formidable as unknown as jest.Mock).mockReturnValue({
      parse: jest.fn().mockResolvedValue([
        {
          uploadKey: [process.env.UPLOAD_KEY],
          runtimeVersion: ['1.0.0'],
          commitHash: ['abc'],
          repositoryUrl: ['https://github.com/acme/app'],
        },
        { file: [{ filepath: 'test.zip' }] },
      ]),
    });
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('zip'));
    (AdmZip as unknown as jest.Mock).mockImplementation(() => ({}));
    (ZipHelper.getFileFromZip as jest.Mock).mockResolvedValue(Buffer.from('metadata'));
    (HashHelper.createHash as jest.Mock).mockReturnValue('hash');
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue('existing-id');
    const database = {
      getReleaseByUpdateId: jest
        .fn()
        .mockResolvedValue({ path: 'updates/1.0.0/existing.zip', status: 'active' }),
      createRelease: jest.fn(),
      activateRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);

    const { req, res } = createMocks({ method: 'POST' });
    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      success: true,
      path: 'updates/1.0.0/existing.zip',
      updateId: 'existing-id',
    });
    expect(database.createRelease).not.toHaveBeenCalled();
    expect(database.activateRelease).not.toHaveBeenCalled();
    expect(StorageFactory.getStorage).not.toHaveBeenCalled();
  });

  it('marks the release failed when storage upload fails', async () => {
    (formidable as unknown as jest.Mock).mockReturnValue({
      parse: jest.fn().mockResolvedValue([
        {
          uploadKey: [process.env.UPLOAD_KEY],
          runtimeVersion: ['1.0.0'],
          commitHash: ['abc'],
          repositoryUrl: ['https://github.com/acme/app'],
        },
        { file: [{ filepath: 'test.zip' }] },
      ]),
    });
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('zip'));
    (AdmZip as unknown as jest.Mock).mockImplementation(() => ({}));
    (ZipHelper.getFileFromZip as jest.Mock).mockResolvedValue(Buffer.from('metadata'));
    (HashHelper.createHash as jest.Mock).mockReturnValue('hash');
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue('new-id');
    const database = {
      getReleaseByUpdateId: jest.fn().mockResolvedValue(null),
      createRelease: jest
        .fn()
        .mockImplementation(async (release) => ({ id: 'new-release', ...release })),
      activateRelease: jest.fn(),
      failRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({
      uploadFile: jest.fn().mockRejectedValue(new Error('storage unavailable')),
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { req, res } = createMocks({ method: 'POST' });
    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(database.failRelease).toHaveBeenCalledWith('new-release');
    expect(database.activateRelease).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not activate a release when patch persistence fails', async () => {
    (formidable as unknown as jest.Mock).mockReturnValue({
      parse: jest
        .fn()
        .mockResolvedValue([
          {
            uploadKey: [process.env.UPLOAD_KEY],
            runtimeVersion: ['1.0.0'],
            commitHash: ['abc'],
            repositoryUrl: ['https://github.com/acme/app'],
          },
          { file: [{ filepath: 'test.zip' }] },
        ]),
    });
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('zip'));
    (AdmZip as unknown as jest.Mock).mockImplementation(() => ({}));
    (ZipHelper.getFileFromZip as jest.Mock).mockResolvedValue(Buffer.from('metadata'));
    (HashHelper.createHash as jest.Mock).mockReturnValue('hash');
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue('new-id');
    const database = {
      getReleaseByUpdateId: jest.fn().mockResolvedValue(null),
      createRelease: jest
        .fn()
        .mockImplementation(async (release) => ({ id: 'new-release', ...release })),
      activateRelease: jest.fn(),
      failRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({
      uploadFile: jest.fn().mockResolvedValue('zip'),
    });
    (BundlePatchCache.prepareRelease as jest.Mock).mockRejectedValue(
      new Error('patch storage unavailable')
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { req, res } = createMocks({ method: 'POST' });
    await uploadHandler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(database.failRelease).toHaveBeenCalledWith('new-release');
    expect(database.activateRelease).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('marks the release failed when phones could not use the bundle', async () => {
    (formidable as unknown as jest.Mock).mockReturnValue({
      parse: jest.fn().mockResolvedValue([
        {
          uploadKey: [process.env.UPLOAD_KEY],
          runtimeVersion: ['1.0.0'],
          commitHash: ['abc'],
          repositoryUrl: ['https://github.com/acme/app'],
        },
        { file: [{ filepath: 'test.zip' }] },
      ]),
    });
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('zip'));
    (AdmZip as unknown as jest.Mock).mockImplementation(() => ({}));
    (ZipHelper.getFileFromZip as jest.Mock).mockResolvedValue(Buffer.from('metadata'));
    (HashHelper.createHash as jest.Mock).mockReturnValue('hash');
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue('new-id');
    (ReleaseAssetCache.prepareFromZip as jest.Mock).mockRejectedValue(
      new Error('File not found in zip: expoconfig.json')
    );
    const database = {
      getReleaseByUpdateId: jest.fn().mockResolvedValue(null),
      createRelease: jest
        .fn()
        .mockImplementation(async (release) => ({ id: 'new-release', ...release })),
      activateRelease: jest.fn(),
      failRelease: jest.fn(),
    };
    const storage = { uploadFile: jest.fn() };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    (StorageFactory.getStorage as jest.Mock).mockReturnValue(storage);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { req, res } = createMocks({ method: 'POST' });
    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(database.failRelease).toHaveBeenCalledWith('new-release');
    expect(database.activateRelease).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it.each([undefined, 'not a url'])(
    'rejects an absent or invalid repository URL: %p',
    async (repositoryUrl) => {
      (formidable as unknown as jest.Mock).mockReturnValue({
        parse: jest.fn().mockResolvedValue([
          {
            uploadKey: [process.env.UPLOAD_KEY],
            runtimeVersion: ['1.2.0'],
            commitHash: ['abc123'],
            repositoryUrl: repositoryUrl ? [repositoryUrl] : undefined,
          },
          { file: [{ filepath: 'test.zip' }] },
        ]),
      });

      const { req, res } = createMocks({ method: 'POST' });
      await uploadHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({ error: 'Missing or invalid repository URL' });
      expect(StorageFactory.getStorage).not.toHaveBeenCalled();
      expect(DatabaseFactory.getDatabase).not.toHaveBeenCalled();
    }
  );
});
