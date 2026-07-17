const { google } = require('googleapis');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { fileName, mimeType, metadata } = req.body;

    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/drive.file']
    );
    await auth.authorize();
    const accessToken = auth.credentials.access_token;

    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType || 'video/mp4'
        },
        body: JSON.stringify({
          name: fileName,
          parents: [process.env.DRIVE_FOLDER_ID],
          description: metadata || ''
        })
      }
    );

    if (!initRes.ok) {
      const t = await initRes.text();
      res.status(500).json({ error: 'Init failed', details: t });
      return;
    }

    const sessionUrl = initRes.headers.get('location');
    res.status(200).json({ sessionUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
