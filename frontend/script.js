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

// ── Heatmap drawing ───────────────────────────────────────────────────────────
function drawHeatmap(canvas, heatmapData) {
  if (!heatmapData) return;
  const rows = heatmapData.length;
  const cols = heatmapData[0].length;

  // Match canvas resolution to its displayed size
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cellW = canvas.width  / cols;
  const cellH = canvas.height / rows;

  heatmapData.forEach((row, i) => {
    row.forEach((val, j) => {
      if (val < 0.08) return;
      const x = j * cellW;
      const y = i * cellH;

      // Yellow → orange → red gradient based on value
      const r = 255;
      const g = Math.round(220 * (1 - val));
      const b = 0;
      const a = Math.min(0.75, val * 0.85);

      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.fillRect(x, y, cellW, cellH);
    });
  });

  // Smooth blur effect using CSS filter on the canvas
  canvas.style.filter = "blur(6px)";
}

function attachHeatmapToggle(toggleBtn, canvas, heatmapData) {
  let active = true;
  toggleBtn.classList.add("active");
  drawHeatmap(canvas, heatmapData);
  canvas.classList.remove("hidden");

  toggleBtn.addEventListener("click", () => {
    active = !active;
    canvas.classList.toggle("hidden", !active);
    toggleBtn.classList.toggle("active", active);
  });
}

// ── URL tab ───────────────────────────────────────────────────────────────────
const urlInput      = document.getElementById("url-input");
const urlBtn        = document.getElementById("url-btn");
const urlPreview    = document.getElementById("url-preview");
const urlPrevWrap   = document.getElementById("url-preview-wrap");
const urlResult     = document.getElementById("url-result");
const urlHeatmap    = document.getElementById("url-heatmap");
const urlHmToggle   = document.getElementById("url-heatmap-toggle");

urlInput.addEventListener("input", () => {
  const val = urlInput.value.trim();
  if (val.startsWith("http")) {
    urlPreview.src     = val;
    urlPreview.onload  = () => urlPrevWrap.classList.remove("hidden");
    urlPreview.onerror = () => urlPrevWrap.classList.add("hidden");
  } else {
    urlPrevWrap.classList.add("hidden");
  }
  urlResult.className = "result hidden";
  urlHeatmap.classList.add("hidden");
  urlHmToggle.classList.add("hidden");
});

urlInput.addEventListener("keydown", e => { if (e.key === "Enter") analyzeUrl(); });
urlBtn.addEventListener("click", analyzeUrl);

async function analyzeUrl() {
  const url = urlInput.value.trim();
  if (!url) return;

  urlResult.className = "result loading";
  urlResult.innerHTML = `<div class="spinner"></div><span class="loading-msg">analyzing...</span>`;
  urlHeatmap.classList.add("hidden");
  urlHmToggle.classList.add("hidden");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: url })
    });
    if (!res.ok) throw new Error(`server error ${res.status}`);
    const data = await res.json();

    renderUrlResult(data);

    if (data.heatmap) {
      // Wait for image to be rendered before sizing canvas
      requestAnimationFrame(() => {
        attachHeatmapToggle(urlHmToggle, urlHeatmap, data.heatmap);
        urlHmToggle.classList.remove("hidden");
      });
    }
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
  thumbAdd.classList.toggle("disabled", n >= MAX_FILES);
  fileBtn.classList.toggle("hidden", n === 0);
  if (n > 0) fileCount.textContent = `${n} image${n > 1 ? "s" : ""}`;
  else fileCount.textContent = "";
}

// ── Results page ──────────────────────────────────────────────────────────────
function clearResultsPage() {
  document.getElementById("results-grid").innerHTML = "";
  document.getElementById("results-sub").textContent = "";
}

async function runFileScan() {
  if (!selectedFiles.length) return;

  const resultsGrid = document.getElementById("results-grid");
  const resultsSub  = document.getElementById("results-sub");
  resultsGrid.innerHTML = "";
  resultsSub.textContent = `${selectedFiles.length} image${selectedFiles.length > 1 ? "s" : ""} analyzed`;

  const dataUrls = await Promise.all(selectedFiles.map(readAsDataUrl));

  // Create loading cards
  const cards = dataUrls.map((src, i) => {
    const card = document.createElement("div");
    card.className = "result-card loading";
    card.style.animationDelay = `${i * 60}ms`;
    card.innerHTML = `
      <div class="rc-image-wrap">
        <img class="rc-image" src="${src}" alt="Image ${i + 1}" />
      </div>
      <div class="rc-loading">
        <div class="rc-spinner"></div>
        <span class="rc-loading-text">analyzing...</span>
      </div>`;
    resultsGrid.appendChild(card);
    return card;
  });

  showPage("page-results");

  for (let i = 0; i < selectedFiles.length; i++) {
    try {
      const form = new FormData();
      form.append("file", selectedFiles[i]);
      const res  = await fetch(API_UPLOAD, { method: "POST", body: form });
      if (!res.ok) throw new Error(`server error ${res.status}`);
      renderCard(cards[i], await res.json());
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

  // Image wrap with heatmap canvas
  const wrap = document.createElement("div");
  wrap.className = "rc-image-wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "heatmap-canvas hidden";
  const toggle = document.createElement("button");
  toggle.className = "heatmap-toggle hidden";
  toggle.textContent = "🔥 Heatmap";

  wrap.appendChild(img);
  wrap.appendChild(canvas);
  wrap.appendChild(toggle);
  card.appendChild(wrap);

  card.insertAdjacentHTML("beforeend", `
    <div class="rc-body">
      <div class="rc-label">${icon} ${label}</div>
      ${conf != null ? `
        <div class="rc-bar-bg"><div class="rc-bar" style="width:${conf}%"></div></div>
        <div class="rc-conf">confidence: <span>${conf}%</span></div>` : ""}
    </div>`);

  // Draw heatmap after card is in DOM
  if (data.heatmap) {
    requestAnimationFrame(() => {
      attachHeatmapToggle(toggle, canvas, data.heatmap);
      toggle.classList.remove("hidden");
    });
  }
}

function renderCardError(card, message) {
  const img = card.querySelector(".rc-image");
  card.className = "result-card";
  card.style.borderColor = "rgba(255,160,0,0.3)";
  card.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "rc-image-wrap";
  wrap.appendChild(img);
  card.appendChild(wrap);
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
