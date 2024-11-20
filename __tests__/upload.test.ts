import formidable from 'formidable';
import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';
import uploadHandler from '../pages/api/upload';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/storage/StorageFactory');
jest.mock('formidable');
jest.mock('fs');

describe('Upload API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-POST requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await uploadHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should handle file upload successfully', async () => {
    const mockForm = {
      parse: jest.fn().mockResolvedValue([
        {
          runtimeVersion: ['1.0.0'],
          commitHash: ['abc123'],
        },
        {
          file: [{ filepath: 'test.zip' }],
        },
      ]),
    };

    (formidable as unknown as jest.Mock).mockReturnValue(mockForm);

    const mockStorage = {
      uploadFile: jest.fn().mockResolvedValue('updates/1.0.0/timestamp.zip'),
    };

    const mockDatabase = {
      createRelease: jest.fn().mockResolvedValue(true),
    };

    (StorageFactory.getStorage as jest.Mock).mockReturnValue(mockStorage);
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'POST' });
    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
    expect(mockStorage.uploadFile).toHaveBeenCalled();
    expect(mockDatabase.createRelease).toHaveBeenCalled();
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
});
