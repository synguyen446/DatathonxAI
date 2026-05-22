// content.js
// Injected into every page.
// Handles single-image results, page scans, image badges, and heatmap overlays.

const scannedResults = new Map();
const heatmapOverlays = new Map();
let nextHeatmapId = 1;
let heatmapFrame = null;

function imageSrc(img) {
  return img.currentSrc || img.src;
}

function reapplyHighlights(root = document) {
  root.querySelectorAll("img").forEach(img => {
    const src = imageSrc(img);
    if (src && scannedResults.has(src) && !img.dataset.aiChecked) {
      highlightImage(src, scannedResults.get(src));
    }
  });
}

const observer = new MutationObserver(mutations => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === "IMG") reapplyHighlights(node.parentElement || document);
      else if (node.querySelectorAll) reapplyHighlights(node);
    }

    if (m.type === "attributes" && m.target.tagName === "IMG") {
      const img = m.target;
      const src = imageSrc(img);
      if (src && scannedResults.has(src)) {
        delete img.dataset.aiChecked;
        removeImageHeatmap(img);
        highlightImage(src, scannedResults.get(src));
      }
    }
  }
  scheduleHeatmapReposition();
});

function startObserver() {
  if (!document.body) return;
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"]
  });
}

if (document.body) startObserver();
else window.addEventListener("DOMContentLoaded", startObserver, { once: true });

window.addEventListener("scroll", scheduleHeatmapReposition, true);
window.addEventListener("resize", scheduleHeatmapReposition);

function injectStyles() {
  if (document.getElementById("ai-det-styles")) return;

  const s = document.createElement("style");
  s.id = "ai-det-styles";
  s.textContent = `
    @keyframes ai-det-slide-in {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }
    @keyframes ai-det-spin {
      to { transform: rotate(360deg); }
    }
    #ai-det-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      animation: ai-det-slide-in 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #ai-det-toast .card {
      background: #1e1e2e;
      border-radius: 12px;
      padding: 14px 18px 14px 16px;
      min-width: 240px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      border: 1px solid #333;
      border-left: 4px solid var(--accent);
      position: relative;
    }
    #ai-det-toast .close-btn {
      position: absolute;
      top: 8px;
      right: 10px;
      background: none;
      border: none;
      color: #777;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 0;
    }
    #ai-det-toast .close-btn:hover { color: #aaa; }
    #ai-det-toast .label {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: var(--accent);
    }
    #ai-det-toast .sub {
      font-size: 12px;
      color: #aaa;
      margin-top: 4px;
    }
    #ai-det-toast .sub span {
      color: #fff;
      font-weight: 600;
    }
    #ai-det-toast .row {
      display: flex;
      align-items: center;
    }
    #ai-det-toast .spinner {
      width: 20px;
      height: 20px;
      border: 3px solid #333;
      border-top-color: #7c8fff;
      border-radius: 50%;
      animation: ai-det-spin 0.8s linear infinite;
      margin-right: 10px;
      flex-shrink: 0;
    }
    #ai-det-toast .loading-text { color: #aaa; font-size: 14px; }
    #ai-det-toast .progress { font-size: 11px; color: #777; margin-top: 6px; }
    #ai-det-toast .progress-bar-bg {
      background: #2a2a3e;
      border-radius: 999px;
      height: 4px;
      margin-top: 4px;
      overflow: hidden;
    }
    #ai-det-toast .progress-bar {
      height: 100%;
      background: #a855f7;
      border-radius: 999px;
      transition: width 0.3s ease;
    }
    .ai-det-badge {
      position: absolute;
      top: 4px;
      left: 4px;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 5px;
      pointer-events: none;
      z-index: 99998;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .ai-det-heatmap {
      position: fixed;
      pointer-events: none;
      z-index: 99997;
      opacity: 0.58;
      filter: blur(6px);
      mix-blend-mode: multiply;
      border-radius: 4px;
    }
  `;
  document.head.appendChild(s);
}

chrome.runtime.onMessage.addListener((msg) => {
  injectStyles();

  switch (msg.type) {
    case "SHOW_LOADING":
      showToast("loading", null);
      break;

    case "SHOW_RESULT":
      scannedResults.set(msg.imageUrl, msg.result);
      highlightImage(msg.imageUrl, msg.result);
      showToast("result", msg.result);
      break;

    case "SHOW_ERROR":
      showToast("error", { error: msg.error });
      break;

    case "START_SCAN":
      scannedResults.clear();
      startScan();
      break;

    case "SCAN_PROGRESS":
      updateScanToast(msg.done, msg.total);
      break;

    case "SCAN_RESULT":
      scannedResults.set(msg.url, msg.result);
      highlightImage(msg.url, msg.result);
      updateScanToast(msg.done, msg.total);
      break;

    case "SCAN_COMPLETE":
      finishScanToast(msg.total);
      break;
  }
});

function showToast(state, data) {
  const old = document.getElementById("ai-det-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.id = "ai-det-toast";

  let accent = "#7c8fff";
  let inner = "";

  if (state === "loading") {
    inner = `<div class="row"><div class="spinner"></div><span class="loading-text">Analyzing image...</span></div>`;
  } else if (state === "result") {
    const label = (data.label || "UNKNOWN").toUpperCase();
    const conf = data.confidence != null ? Math.round(data.confidence * 100) : null;
    const fakeProb = data.fake_probability != null ? Math.round(data.fake_probability * 100) : null;
    const isReal = label === "REAL";
    accent = isReal ? "#22c55e" : "#ef4444";
    inner = `
      <div class="label">${label}</div>
      ${conf != null ? `<div class="sub">Confidence: <span>${conf}%</span></div>` : ""}
      ${fakeProb != null ? `<div class="sub">AI probability: <span>${fakeProb}%</span></div>` : ""}
      ${data.heatmap ? `<div class="sub">Heatmap overlay shown on image.</div>` : ""}`;
  } else if (state === "error") {
    accent = "#f59e0b";
    inner = `<div class="label" style="font-size:14px;">Error</div><div class="sub">${data.error || "Could not reach backend"}</div>`;
  }

  toast.innerHTML = `
    <div class="card" style="--accent:${accent}">
      <button class="close-btn" title="Dismiss">x</button>
      ${inner}
    </div>`;

  document.body.appendChild(toast);
  toast.querySelector(".close-btn").addEventListener("click", () => toast.remove());
  if (state !== "loading") setTimeout(() => toast?.remove(), 6000);
}

function startScan() {
  clearHighlights();

  const urls = [...new Set(
    [...document.querySelectorAll("img")]
      .filter(img => imageSrc(img) && img.naturalWidth > 50 && img.naturalHeight > 50)
      .map(img => imageSrc(img))
      .filter(src => src.startsWith("http"))
  )];

  if (urls.length === 0) {
    showToast("error", { error: "No images found on this page." });
    return;
  }

  showScanToast(0, urls.length);
  chrome.runtime.sendMessage({ type: "SCAN_IMAGES", urls });
}

function clearHighlights() {
  document.querySelectorAll(".ai-det-badge").forEach(badge => badge.remove());
  clearHeatmapOverlays();

  document.querySelectorAll("img[data-ai-checked]").forEach(img => {
    img.style.outline = "";
    img.style.outlineOffset = "";
    delete img.dataset.aiChecked;
    delete img.dataset.aiHeatmapId;
  });
}

function showScanToast(done, total) {
  const old = document.getElementById("ai-det-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.id = "ai-det-toast";
  toast.innerHTML = `
    <div class="card" style="--accent:#a855f7">
      <button class="close-btn" title="Dismiss">x</button>
      <div class="row"><div class="spinner" style="border-top-color:#a855f7"></div><span class="loading-text">Scanning page...</span></div>
      <div class="progress" id="ai-det-prog-text">${done} / ${total} images checked</div>
      <div class="progress-bar-bg">
        <div class="progress-bar" id="ai-det-prog-bar" style="width:${total ? (done / total * 100) : 0}%"></div>
      </div>
    </div>`;
  document.body.appendChild(toast);
  toast.querySelector(".close-btn").addEventListener("click", () => toast.remove());
}

function updateScanToast(done, total) {
  const bar = document.getElementById("ai-det-prog-bar");
  const text = document.getElementById("ai-det-prog-text");
  if (bar) bar.style.width = `${Math.round(done / total * 100)}%`;
  if (text) text.textContent = `${done} / ${total} images checked`;
}

function finishScanToast(total) {
  const old = document.getElementById("ai-det-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.id = "ai-det-toast";
  toast.innerHTML = `
    <div class="card" style="--accent:#a855f7">
      <button class="close-btn" title="Dismiss">x</button>
      <div class="label" style="font-size:15px;">Scan complete</div>
      <div class="sub">${total} images analyzed. Heatmaps are shown on checked images.</div>
    </div>`;
  document.body.appendChild(toast);
  toast.querySelector(".close-btn").addEventListener("click", () => toast.remove());
  setTimeout(() => toast?.remove(), 5000);
}

function highlightImage(url, data) {
  if (!url) return;

  const label = (data.label || "UNKNOWN").toUpperCase();
  const conf = data.confidence != null ? Math.round(data.confidence * 100) : null;
  const isReal = label === "REAL";
  const color = isReal ? "#22c55e" : "#ef4444";

  document.querySelectorAll("img").forEach(img => {
    const src = imageSrc(img);
    if (src !== url) return;

    img.style.outline = `3px solid ${color}`;
    img.style.outlineOffset = "2px";
    img.dataset.aiChecked = "true";

    const parent = img.parentElement;
    if (parent && getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    parent?.querySelectorAll(".ai-det-badge").forEach(badge => {
      if (badge.dataset.forSrc === url) badge.remove();
    });

    const badge = document.createElement("div");
    badge.className = "ai-det-badge";
    badge.dataset.forSrc = url;
    badge.style.background = color + "dd";
    badge.textContent = `${label}${conf != null ? ` ${conf}%` : ""}`;
    parent?.appendChild(badge);

    drawImageHeatmap(img, data.heatmap);
  });
}

function clearHeatmapOverlays() {
  heatmapOverlays.forEach(({ canvas }) => canvas.remove());
  heatmapOverlays.clear();
}

function removeImageHeatmap(img) {
  const id = img.dataset.aiHeatmapId;
  if (!id) return;

  const overlay = heatmapOverlays.get(id);
  if (overlay) {
    overlay.canvas.remove();
    heatmapOverlays.delete(id);
  }
  delete img.dataset.aiHeatmapId;
}

function drawImageHeatmap(img, heatmapData) {
  removeImageHeatmap(img);
  if (!heatmapData || !heatmapData.length || !heatmapData[0]?.length) return;

  const id = `ai-det-heatmap-${nextHeatmapId++}`;
  const canvas = document.createElement("canvas");
  canvas.className = "ai-det-heatmap";
  canvas.dataset.heatmapId = id;
  document.body.appendChild(canvas);

  img.dataset.aiHeatmapId = id;
  heatmapOverlays.set(id, { img, canvas, heatmapData, width: 0, height: 0 });
  positionHeatmap(id);
}

function scheduleHeatmapReposition() {
  if (heatmapFrame) return;
  heatmapFrame = requestAnimationFrame(() => {
    heatmapFrame = null;
    heatmapOverlays.forEach((_overlay, id) => positionHeatmap(id));
  });
}

function positionHeatmap(id) {
  const overlay = heatmapOverlays.get(id);
  if (!overlay) return;

  const { img, canvas, heatmapData } = overlay;
  if (!document.documentElement.contains(img)) {
    canvas.remove();
    heatmapOverlays.delete(id);
    return;
  }

  const rect = img.getBoundingClientRect();
  const offscreen =
    rect.width < 20 ||
    rect.height < 20 ||
    rect.bottom < 0 ||
    rect.right < 0 ||
    rect.top > innerHeight ||
    rect.left > innerWidth;

  if (offscreen) {
    canvas.style.display = "none";
    return;
  }

  canvas.style.display = "block";
  canvas.style.left = `${rect.left}px`;
  canvas.style.top = `${rect.top}px`;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (overlay.width === width && overlay.height === height) return;

  overlay.width = width;
  overlay.height = height;
  canvas.width = width;
  canvas.height = height;
  paintHeatmap(canvas, heatmapData);
}

function paintHeatmap(canvas, heatmapData) {
  const rows = heatmapData.length;
  const cols = heatmapData[0].length;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;

  heatmapData.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (value < 0.08) return;

      const x = colIndex * cellW;
      const y = rowIndex * cellH;
      const red = 255;
      const green = Math.round(220 * (1 - value));
      const alpha = Math.min(0.72, value * 0.82);

      ctx.fillStyle = `rgba(${red},${green},0,${alpha})`;
      ctx.fillRect(x, y, cellW, cellH);
    });
  });
}
