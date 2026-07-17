export const config = {
  runtime: 'edge'
};

import { SignJWT, importPKCS8 } from 'jose';

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyPem = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const key = await importPKCS8(privateKeyPem, 'RS256');
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/drive.file'
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setIssuer(email)
    .setSubject(email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setExpirationTime(now + 3600)
    .sign(key);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error('Token exchange failed: ' + t);
  }
  const data = await tokenRes.json();
  return data.access_token;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const fileName = decodeURIComponent(req.headers.get('x-file-name') || 'upload.mp4');
    const mimeType = req.headers.get('x-file-type') || 'video/mp4';
    const metadata = decodeURIComponent(req.headers.get('x-file-metadata') || '');
    const folderId = process.env.DRIVE_FOLDER_ID;

    const accessToken = await getAccessToken();

    // Step 1: start a resumable session with Google (server-to-server, no CORS involved)
    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType
        },
        body: JSON.stringify({
          name: fileName,
          parents: [folderId],
          description: metadata
        })
      }
    );

    if (!initRes.ok) {
      const t = await initRes.text();
      return new Response(JSON.stringify({ error: 'Could not start session', details: t }), { status: 500 });
    }

    const sessionUrl = initRes.headers.get('location');

    // Step 2: stream the incoming video body straight through to Google (no buffering, no size cap)
    const uploadRes = await fetch(sessionUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: req.body,
      duplex: 'half'
    });

    const resultText = await uploadRes.text();

    if (!uploadRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Upload failed', status: uploadRes.status, details: resultText }),
        { status: 500 }
      );
    }

    return new Response(resultText, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
