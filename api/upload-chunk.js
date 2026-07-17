module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { sessionUrl, contentRange, mimeType, chunkBase64 } = req.body;
    const buffer = Buffer.from(chunkBase64, 'base64');

    const googleRes = await fetch(sessionUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': contentRange,
        'Content-Type': mimeType || 'video/mp4'
      },
      body: buffer
    });

    const text = await googleRes.text();
    res.status(googleRes.status).send(text || '{}');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
