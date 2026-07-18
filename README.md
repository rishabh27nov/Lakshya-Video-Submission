# Lakshya — Student Video Submission Website

A simple website where students submit a video (with their name, course, class,
and consent) directly into a specific Google Drive folder — no login popup for
the student, no third-party storage, and no size limit issues.

Live site: https://lakshya-video-submission.vercel.app/

---

## 1. How it works (architecture)

The tricky part of this project is: **uploading large video files (up to
500MB) straight into one Google Drive folder, without asking every student to
sign in with their own Google account.**

To do that, the project does NOT use a normal "Sign in with Google" button.
Instead, it uses a technique called **chunked resumable upload**, driven by a
single admin's Google account (the account that owns the target Drive
folder), authorized once and reused forever via a refresh token.

### Step-by-step flow

1. Student fills the form and picks a video in the browser (`index.html` +
   `script.js`).
2. `script.js` calls **`/api/init-upload`** with just the file's name/type
   (a tiny request). This serverless function:
   - Exchanges the stored `GOOGLE_REFRESH_TOKEN` for a fresh, short-lived
     Google **access token** (no user interaction needed — this is the whole
     point of the refresh token).
   - Asks Google Drive to start a **resumable upload session** in the target
     folder (`DRIVE_FOLDER_ID`).
   - Returns the session URL to the browser.
2. The browser then splits the video into small chunks (2.5MB each) and
   sends each chunk to **`/api/upload-chunk`**, which forwards that chunk to
   Google's resumable session URL and relays Google's response back.
3. Once every chunk is uploaded, Google finalizes the file inside the target
   Drive folder, and the student sees "Upload complete!"

### Why chunked, and why not a simpler approach?

Three approaches were tried before landing on this one — worth knowing if
you're modifying this code:

- **Direct OAuth popup per student** — works, but forces every single student
  to sign in with their own Google account and be pre-approved as a "test
  user" in Google Cloud (since the app isn't Google-verified). Bad UX, not
  scalable.
- **Google Service Account** (a "robot" identity, no human sign-in) — avoids
  the popup, but Service Accounts have **zero personal storage quota** and
  cannot own files in a normal Gmail "My Drive" folder. They only work with
  paid Google Workspace "Shared Drives." Since this project targets a normal
  personal Gmail Drive folder, this approach fails with a
  `storageQuotaExceeded` error.
- **Direct browser-to-Google upload** (browser calls Google's API directly)
  — fails with a CORS error, because Google only allows cross-origin
  browser calls for tokens issued through a specific **OAuth Client** with
  registered "Authorized JavaScript origins" — not for tokens obtained via
  server-to-server flows.
- **Whole video through one serverless function** — fails because Vercel
  serverless/edge functions reject any request body over ~4.5MB
  (`FUNCTION_PAYLOAD_TOO_LARGE`), and videos are much bigger than that.

The final design (refresh token + small chunks proxied through our own
serverless functions) avoids all four problems at once.

---

## 2. File structure

```
index.html              Page markup (form, hero, etc.)
style.css               All styling
script.js               Form logic + the chunked upload flow (client side)
package.json            No runtime dependencies needed (plain fetch is used)

api/
  init-upload.js         Starts a Drive resumable upload session (uses refresh token)
  upload-chunk.js        Forwards one video chunk to Google's upload session
  admin-auth.js          One-time: redirects the admin to Google's consent screen
  admin-callback.js      One-time: exchanges the auth code for a refresh token
```

`admin-auth.js` and `admin-callback.js` are **not used by students** — they
exist purely so the site owner (admin) can (re-)generate a
`GOOGLE_REFRESH_TOKEN` when needed. See section 4.

---

## 3. Environment variables (set in Vercel → Settings → Environment Variables)

| Variable | What it is | Where to get it |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret | Same page as above (click "Add Secret" if you can't see it — Google only shows it once) |
| `GOOGLE_REFRESH_TOKEN` | Long-lived token tied to the admin's real Google account | Generated once by visiting `/api/admin-auth` (see section 4) |
| `DRIVE_FOLDER_ID` | The Drive folder where videos get uploaded | Open the folder in Drive, copy the ID from the URL: `drive.google.com/drive/folders/<THIS_PART>` |

The OAuth Client (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) must have:
- **Authorized JavaScript origin**: your site's URL (e.g.
  `https://lakshya-video-submission.vercel.app`)
- **Authorized redirect URI**: `https://<your-site>/api/admin-callback`
- **Scope**: `https://www.googleapis.com/auth/drive.file`
- Consent screen in "Testing" mode is fine — only the admin ever needs to
  authorize it, students never see this screen.

> Older variables `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` are
> leftovers from the (abandoned) Service Account approach — safe to delete,
> nothing references them anymore.

---

## 4. Generating / refreshing `GOOGLE_REFRESH_TOKEN`

You only need to do this once, or if the token ever gets revoked (e.g. if the
admin manually revokes app access in their Google Account settings).

1. Make sure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are already set in
   Vercel, and the redirect URI above is registered in Google Cloud.
2. As the **admin**, visit:
   ```
   https://<your-site>/api/admin-auth
   ```
3. Sign in with the Google account that owns the target Drive folder, and
   click "Continue" past the "Google hasn't verified this app" warning (this
   is expected — it's your own app).
4. Approve the requested Drive permission.
5. You'll land on a page showing a `GOOGLE_REFRESH_TOKEN` value in a text box
   — copy it.
6. Paste it into Vercel as the `GOOGLE_REFRESH_TOKEN` environment variable,
   then trigger a redeploy (Vercel doesn't auto-redeploy on env var changes
   alone — go to Deployments → latest → "..." → Redeploy).

---

## 5. Local development

There's no local `.env` file checked in (secrets should never be committed).
To run this locally, you'd need the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npm install -g vercel
vercel link       # connect this folder to the Vercel project
vercel env pull   # downloads a local .env file with the real secrets
vercel dev        # runs the site + /api functions locally
```

Opening `index.html` directly in a browser (without `vercel dev`) will NOT
work, since the `/api/*` serverless functions won't exist without a server
running them.

---

## 6. Common things to change

- **Course/Class options**: edit the two `toggle-group` button lists in
  `index.html` and the corresponding validation in `script.js`.
- **Chunk size**: `CHUNK_SIZE` constant in `script.js` (currently 2.5MB —
  don't raise this much past ~3MB or you risk hitting Vercel's request size
  limit again once base64-encoded).
- **Target Drive folder**: change `DRIVE_FOLDER_ID` in Vercel's environment
  variables (no code change needed).