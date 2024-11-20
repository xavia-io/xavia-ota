import formidable from 'formidable';
import fs from 'fs';
import moment from 'moment';
import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function uploadHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const form = formidable({});

  try {
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];
    const runtimeVersion = fields.runtimeVersion?.[0];
    const commitHash = fields.commitHash?.[0];
    const commitMessage = fields.commitMessage?.[0] || 'No message provided';

    if (!file || !runtimeVersion || !commitHash) {
      res.status(400).json({ error: 'Missing file, runtime version, or commit hash' });
      return;
    }

    const storage = StorageFactory.getStorage();
    const timestamp = moment().utc().format('YYYYMMDDHHmmss');
    const updatePath = `updates/${runtimeVersion}`;

    // Store the zipped file as is
    const zipContent = fs.readFileSync(file.filepath);
    const path = await storage.uploadFile(`${updatePath}/${timestamp}.zip`, zipContent);

    await DatabaseFactory.getDatabase().createRelease({
      path,
      runtimeVersion,
      timestamp: moment().utc().toString(),
      commitHash,
      commitMessage,
    });

    res.status(200).json({ success: true, path });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
}
