module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { fileName, mimeType, metadata } = req.body;

    // Get a fresh access token using the stored refresh token (real Google account, has storage)
    const tokenParams = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      res.status(500).json({ error: 'Token refresh failed', details: t });
      return;
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

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
