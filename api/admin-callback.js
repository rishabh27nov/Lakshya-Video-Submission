module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.status(400).send('Missing authorization code. Try visiting /api/admin-auth again.');
    return;
  }

  try {
    const params = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `https://${req.headers.host}/api/admin-callback`,
      grant_type: 'authorization_code'
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      res.status(500).json(data);
      return;
    }

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
          <h2>Setup complete ✅</h2>
          <p>Copy the text below and add it to Vercel as an environment variable named
          <b>GOOGLE_REFRESH_TOKEN</b>:</p>
          <textarea style="width:100%; height:100px; font-size:14px; padding:10px;">${
            data.refresh_token || 'NO REFRESH TOKEN RETURNED - go back to /api/admin-auth and try again'
          }</textarea>
          <p style="color:#555; font-size: 13px;">You can close this page after copying the token.</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
};
