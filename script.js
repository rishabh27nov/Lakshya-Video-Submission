/* =========================================================
   ADMIN CONFIG — FILL THIS SECTION IN
   =========================================================
   1. Go to Google Cloud Console (console.cloud.google.com) and
      create a new project.
   2. Enable the "Google Drive API" (APIs & Services > Library).
   3. Go to "APIs & Services > Credentials" and create an OAuth
      Client ID (Application type: Web application). Add your
      website's URL under "Authorized JavaScript origins".
   4. Paste that Client ID into CLIENT_ID below.
   5. Create a folder in Google Drive where videos should be
      stored, open it, and copy the FOLDER_ID from the URL
      (URL: drive.google.com/drive/folders/YOUR_FOLDER_ID_HERE)
      then paste it below.
   6. Publish the OAuth consent screen from "Testing" to
      "Production" so any student can sign in and upload.
   ========================================================= */
const CONFIG = {
  CLIENT_ID: "204456297254-tipjlivbaq9ki29pqsc3qff671dtevtn.apps.googleusercontent.com",
  FOLDER_ID: "1kbpHqZwlUMndOCiNW1KpqqG5iZNXMeGE"
};

const isConfigured = () =>
  CONFIG.CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com" &&
  CONFIG.FOLDER_ID !== "YOUR_DRIVE_FOLDER_ID";

/* ---------- Toggle groups (Course / Class) ---------- */
let selectedCourse = "";
let selectedClass = "";

function wireToggleGroup(groupId, onSelect) {
  const group = document.getElementById(groupId);
  group.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      group.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      onSelect(btn.dataset.value);
    });
  });
}
wireToggleGroup("courseGroup", (val) => { selectedCourse = val; });
wireToggleGroup("classGroup", (val) => { selectedClass = val; });

/* ---------- Dropzone / file handling ---------- */
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileChip = document.getElementById("fileChip");
const fileNameEl = document.getElementById("fileName");
const removeFileBtn = document.getElementById("removeFile");
let selectedFile = null;

dropzone.addEventListener("click", () => fileInput.click());
["dragover", "dragenter"].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("drag"); })
);
["dragleave", "drop"].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("drag"); })
);
dropzone.addEventListener("drop", e => {
  const f = e.dataTransfer.files[0];
  if (f) setFile(f);
});
fileInput.addEventListener("change", e => {
  const f = e.target.files[0];
  if (f) setFile(f);
});
removeFileBtn.addEventListener("click", () => {
  selectedFile = null;
  fileInput.value = "";
  fileChip.classList.remove("show");
});
function setFile(f) {
  selectedFile = f;
  fileNameEl.textContent = `${f.name} (${(f.size / (1024*1024)).toFixed(1)} MB)`;
  fileChip.classList.add("show");
}

/* ---------- Status / progress helpers ---------- */
const statusMsg = document.getElementById("statusMsg");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const progressLabel = document.getElementById("progressLabel");
const submitBtn = document.getElementById("submitBtn");

function showStatus(text, ok) {
  statusMsg.textContent = text;
  statusMsg.className = "status-msg show " + (ok ? "ok" : "err");
}
function setProgress(pct, label) {
  progressWrap.classList.add("show");
  progressBar.style.width = pct + "%";
  progressLabel.textContent = label;
}

/* ---------- Google OAuth token client ---------- */
let tokenClient = null;
let accessToken = null;

function ensureTokenClient() {
  if (tokenClient) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: "https://www.googleapis.com/auth/drive.file",
    callback: () => {} // overridden per-call below
  });
  return tokenClient;
}

function getAccessToken() {
  return new Promise((resolve, reject) => {
    const client = ensureTokenClient();
    client.callback = (resp) => {
      if (resp.error) { reject(resp); return; }
      accessToken = resp.access_token;
      resolve(accessToken);
    };
    client.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  });
}

/* ---------- Multipart upload to Google Drive ---------- */
async function uploadToDrive(file, metadataText, onProgress) {
  const token = await getAccessToken();

  const metadata = {
    name: file.name,
    parents: [CONFIG.FOLDER_ID],
    description: metadataText
  };

  const boundary = "lakshya_boundary_" + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metaPart =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata);

  const fileHeader =
    delimiter +
    `Content-Type: ${file.type || "video/mp4"}\r\n` +
    "Content-Transfer-Encoding: binary\r\n\r\n";

  const fileArrayBuffer = await file.arrayBuffer();

  const bodyBlob = new Blob([
    metaPart,
    fileHeader,
    fileArrayBuffer,
    closeDelim
  ]);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink");
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.setRequestHeader("Content-Type", `multipart/related; boundary=${boundary}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error("Upload failed: " + xhr.status + " " + xhr.responseText));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(bodyBlob);
  });
}

/* ---------- Form submit ---------- */
document.getElementById("videoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  statusMsg.classList.remove("show");

  if (!selectedFile) {
    showStatus("Please choose a video file first.", false);
    return;
  }
  if (!document.getElementById("consentCheck").checked) {
    showStatus("You need to check the consent box to continue.", false);
    return;
  }
  if (!selectedCourse) {
    showStatus("Please select a course (NEET or JEE).", false);
    return;
  }
  if (!selectedClass) {
    showStatus("Please select a class (11 or 12).", false);
    return;
  }
  if (!isConfigured()) {
    showStatus("The site is still being set up — please try again shortly. (Admin: add CLIENT_ID/FOLDER_ID in CONFIG)", false);
    return;
  }

  const name = document.getElementById("fname").value.trim();
  const email = document.getElementById("femail").value.trim();
  const phone = document.getElementById("fphone").value.trim();

  const metadataText =
    `Name: ${name} | Course: ${selectedCourse} | Class: ${selectedClass} | Email: ${email} | Phone: ${phone} | ` +
    `Consent: YES (agreed to Lakshya usage terms) | Submitted: ${new Date().toISOString()}`;

  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading…";
  setProgress(0, "Signing in with Google…");

  try {
    const result = await uploadToDrive(selectedFile, metadataText, (pct) => {
      setProgress(pct, `Uploading… ${pct}%`);
    });
    setProgress(100, "Upload complete!");
    showStatus(`Thank you ${name || "!"} — your video has been uploaded successfully.`, true);
    document.getElementById("videoForm").reset();
    selectedFile = null;
    fileChip.classList.remove("show");
    selectedCourse = "";
    selectedClass = "";
    document.querySelectorAll(".toggle-btn.active").forEach(b => b.classList.remove("active"));
  } catch (err) {
    console.error(err);
    showStatus("There was a problem with the upload. Please try again or contact the admin.", false);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Upload Video";
  }
});
