/* =========================================================
   ADMIN SETUP — see backend files (api/start-upload.js)
   =========================================================
   Uploads now go through a server-side function using a Google
   Service Account, so students never see a Google login popup.
   Configure the service account credentials and folder ID as
   environment variables in your Vercel project settings:
     GOOGLE_SERVICE_ACCOUNT_EMAIL
     GOOGLE_PRIVATE_KEY
     DRIVE_FOLDER_ID
   ========================================================= */

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

/* ---------- Chunked upload via our own server (no CORS, no popup, no size limit) ---------- */
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function uploadToDrive(file, metadataText, onProgress) {
  // Step 1: start a resumable session (tiny request)
  const initRes = await fetch("/api/init-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "video/mp4",
      metadata: metadataText
    })
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error("Could not start upload: " + t);
  }
  const { sessionUrl } = await initRes.json();
  if (!sessionUrl) throw new Error("No session URL returned from server");

  const CHUNK_SIZE = 2.5 * 1024 * 1024; // 2.5MB raw chunks (safely under Vercel's limit once base64-encoded)
  const total = file.size;
  let uploaded = 0;
  let finalResult = null;

  while (uploaded < total) {
    const end = Math.min(uploaded + CHUNK_SIZE, total);
    const chunk = file.slice(uploaded, end);
    const arrayBuffer = await chunk.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const contentRange = `bytes ${uploaded}-${end - 1}/${total}`;

    const chunkRes = await fetch("/api/upload-chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUrl,
        contentRange,
        mimeType: file.type || "video/mp4",
        chunkBase64: base64
      })
    });

    if (chunkRes.status === 308) {
      uploaded = end;
      onProgress(Math.round((uploaded / total) * 100));
      continue;
    }

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      finalResult = await chunkRes.json();
      uploaded = end;
      onProgress(100);
      break;
    }

    const errText = await chunkRes.text();
    throw new Error("Chunk upload failed: " + chunkRes.status + " " + errText);
  }

  return finalResult || {};
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
    showStatus("Upload problem: " + err.message, false);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Upload Video";
  }
});
