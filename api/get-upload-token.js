const { google } = require('googleapis');

module.exports = async (req, res) => {
  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/drive.file']
    );
    await auth.authorize();

    res.status(200).json({
      accessToken: auth.credentials.access_token,
      folderId: process.env.DRIVE_FOLDER_ID
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
