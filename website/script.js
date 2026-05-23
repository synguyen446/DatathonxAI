// script.js

const API_URL    = "http://localhost:8000/predict";
const API_UPLOAD = "http://localhost:8000/predict-upload";
const MAX_FILES  = 5;

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.remove("hidden");
  });
});

// ── Page transitions ──────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  const page = document.getElementById(id);
  page.classList.remove("hidden");
  page.classList.add("slide-in");
  page.addEventListener("animationend", () => page.classList.remove("slide-in"), { once: true });
}

document.getElementById("back-btn").addEventListener("click", () => {
  clearSelectedFiles();
  clearResultsPage();
  showPage("page-upload");
});

// ── URL tab ───────────────────────────────────────────────────────────────────
const urlInput    = document.getElementById("url-input");
const urlBtn      = document.getElementById("url-btn");
const urlPreview  = document.getElementById("url-preview");
const urlPrevWrap = document.getElementById("url-preview-wrap");
const urlResult   = document.getElementById("url-result");

urlInput.addEventListener("input", () => {
  const val = urlInput.value.trim();
  if (val.startsWith("http")) {
    urlPreview.src    = val;
    urlPreview.onload  = () => urlPrevWrap.classList.remove("hidden");
    urlPreview.onerror = () => urlPrevWrap.classList.add("hidden");
  } else {
    urlPrevWrap.classList.add("hidden");
  }
  urlResult.className = "result hidden";
});

urlInput.addEventListener("keydown", e => { if (e.key === "Enter") analyzeUrl(); });
urlBtn.addEventListener("click", analyzeUrl);

async function analyzeUrl() {
  const url = urlInput.value.trim();
  if (!url) return;
  urlResult.className = "result loading";
  urlResult.innerHTML = `<div class="spinner"></div><span class="loading-msg">analyzing...</span>`;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: url })
    });
    if (!res.ok) throw new Error(`server error ${res.status}`);
    renderUrlResult(await res.json());
  } catch (err) {
    urlResult.className = "result error";
    urlResult.innerHTML = `<div class="result-label" style="font-size:18px;color:#f59e0b;">⚠️ error</div><div class="result-sub">${err.message}</div>`;
  }
}

function renderUrlResult(data) {
  const label  = (data.label || "UNKNOWN").toUpperCase();
  const conf   = data.confidence != null ? Math.round(data.confidence * 100) : null;
  const isReal = label === "REAL";
  urlResult.className = `result ${isReal ? "real" : "fake"}`;
  urlResult.innerHTML = `
    <div class="result-label">${isReal ? "✅" : "🤖"} ${label}</div>
    ${conf != null ? `
      <div class="bar-bg"><div class="bar" style="width:${conf}%"></div></div>
      <div class="result-sub">confidence: <span>${conf}%</span></div>` : ""}`;
}

// ── File upload tab ───────────────────────────────────────────────────────────
const thumbAdd  = document.getElementById("thumb-add");
const fileInput = document.getElementById("file-input");
const thumbGrid = document.getElementById("thumb-grid");
const fileBtn   = document.getElementById("file-btn");
const fileCount = document.getElementById("file-count");
const dropLimit = document.getElementById("drop-limit");

let selectedFiles = [];

fileInput.addEventListener("change", () => {
  addFiles([...fileInput.files]);
  fileInput.value = "";
});
fileBtn.addEventListener("click", runFileScan);

function addFiles(newFiles) {
  const images = newFiles.filter(f => f.type.startsWith("image/"));
  const slots  = MAX_FILES - selectedFiles.length;
  images.slice(0, slots).forEach(f => {
    selectedFiles.push(f);
    addThumb(f, selectedFiles.length - 1);
  });
  updateFileUI();
}

function addThumb(file, idx) {
  const reader = new FileReader();
  reader.onload = e => {
    const item = document.createElement("div");
    item.className = "thumb-item";
    item.dataset.idx = idx;
    item.innerHTML = `
      <img src="${e.target.result}" alt="${file.name}" />
      <button class="thumb-remove" title="Remove">✕</button>`;
    item.querySelector(".thumb-remove").addEventListener("click", ev => {
      ev.stopPropagation();
      removeFile(parseInt(item.dataset.idx));
    });
    thumbGrid.insertBefore(item, thumbAdd);
  };
  reader.readAsDataURL(file);
}

function removeFile(idx) {
  selectedFiles.splice(idx, 1);
  rebuildThumbs();
  updateFileUI();
}

function rebuildThumbs() {
  // Remove all thumb items but keep the add tile
  thumbGrid.querySelectorAll(".thumb-item").forEach(el => el.remove());
  selectedFiles.forEach((f, i) => addThumb(f, i));
}

function clearSelectedFiles() {
  selectedFiles = [];
  fileInput.value = "";
  rebuildThumbs();
  updateFileUI();
}

function updateFileUI() {
  const n = selectedFiles.length;
  dropLimit.textContent = `${n} / ${MAX_FILES}`;
  if (n >= MAX_FILES) {
    thumbAdd.classList.add("disabled");
  } else {
    thumbAdd.classList.remove("disabled");
  }
  if (n > 0) {
    fileBtn.classList.remove("hidden");
    fileCount.textContent = `${n} image${n > 1 ? "s" : ""}`;
  } else {
    fileBtn.classList.add("hidden");
    fileCount.textContent = "";
  }
}

// ── Run scan → results page ───────────────────────────────────────────────────
function clearResultsPage() {
  document.getElementById("results-grid").innerHTML = "";
  document.getElementById("results-sub").textContent = "";
}

async function runFileScan() {
  if (!selectedFiles.length) return;

  // Build results page cards (one per file, loading state)
  const resultsGrid = document.getElementById("results-grid");
  const resultsSub  = document.getElementById("results-sub");
  resultsGrid.innerHTML = "";
  resultsSub.textContent = `${selectedFiles.length} image${selectedFiles.length > 1 ? "s" : ""} analyzed`;

  // Read all files as data URLs first (for display)
  const dataUrls = await Promise.all(selectedFiles.map(readAsDataUrl));

  // Create a card per image in loading state
  const cards = dataUrls.map((src, i) => {
    const card = document.createElement("div");
    card.className = "result-card loading";
    card.style.animationDelay = `${i * 60}ms`;
    card.innerHTML = `
      <img class="rc-image" src="${src}" alt="Image ${i + 1}" />
      <div class="rc-loading">
        <div class="rc-spinner"></div>
        <span class="rc-loading-text">analyzing...</span>
      </div>`;
    resultsGrid.appendChild(card);
    return card;
  });

  // Navigate to results page immediately
  showPage("page-results");

  // Analyze each image and update its card as results come in
  for (let i = 0; i < selectedFiles.length; i++) {
    try {
      const form = new FormData();
      form.append("file", selectedFiles[i]);
      const res  = await fetch(API_UPLOAD, { method: "POST", body: form });
      if (!res.ok) throw new Error(`server error ${res.status}`);
      const data = await res.json();
      renderCard(cards[i], data);
    } catch (err) {
      renderCardError(cards[i], err.message);
    }
  }
}

function renderCard(card, data) {
  const label  = (data.label || "UNKNOWN").toUpperCase();
  const conf   = data.confidence != null ? Math.round(data.confidence * 100) : null;
  const isReal = label === "REAL";
  const cls    = isReal ? "real" : "fake";
  const icon   = isReal ? "✅" : "🤖";

  const img = card.querySelector(".rc-image");
  card.className = `result-card ${cls}`;
  card.innerHTML = "";
  card.appendChild(img);
  card.insertAdjacentHTML("beforeend", `
    <div class="rc-body">
      <div class="rc-label">${icon} ${label}</div>
      ${conf != null ? `
        <div class="rc-bar-bg"><div class="rc-bar" style="width:${conf}%"></div></div>
        <div class="rc-conf">confidence: <span>${conf}%</span></div>` : ""}
    </div>`);
}

function renderCardError(card, message) {
  const img = card.querySelector(".rc-image");
  card.className = "result-card";
  card.style.borderColor = "rgba(255,160,0,0.3)";
  card.innerHTML = "";
  card.appendChild(img);
  card.insertAdjacentHTML("beforeend", `
    <div class="rc-body">
      <div class="rc-label" style="font-size:16px;color:#f59e0b;">⚠️ error</div>
      <div class="rc-conf">${message}</div>
    </div>`);
}

function readAsDataUrl(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}
