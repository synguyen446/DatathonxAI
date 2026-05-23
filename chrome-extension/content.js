// content.js
// Injected into every page.
// Handles: single-image toast, page scan with image highlighting.

// Persists results so highlights survive virtual-scroll DOM recycling
const scannedResults = new Map(); // url → { label, confidence }

// Re-applies highlights to any img whose src is in scannedResults
function reapplyHighlights(root = document) {
  root.querySelectorAll("img").forEach(img => {
    const src = img.currentSrc || img.src;
    if (src && scannedResults.has(src) && !img.dataset.aiChecked) {
      highlightImage(src, scannedResults.get(src));
    }
  });
}

// Watch for images added/changed by virtual scrolling
const observer = new MutationObserver(mutations => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === "IMG") reapplyHighlights(node.parentElement || document);
      else if (node.querySelectorAll) reapplyHighlights(node);
    }
    // Also catch src changes on existing img elements
    if (m.type === "attributes" && m.target.tagName === "IMG") {
      const img = m.target;
      const src = img.currentSrc || img.src;
      if (src && scannedResults.has(src)) {
        delete img.dataset.aiChecked;
        highlightImage(src, scannedResults.get(src));
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });

// ── Style injection ───────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById("ai-det-styles")) return;
  const s = document.createElement("style");
  s.id = "ai-det-styles";
  s.textContent = `
    @keyframes ai-det-slide-in {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    @keyframes ai-det-spin {
      to { transform: rotate(360deg); }
    }
    #ai-det-toast {
      position: fixed; top: 20px; right: 20px;
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
      position: absolute; top: 8px; right: 10px;
      background: none; border: none; color: #666;
      cursor: pointer; font-size: 18px; line-height: 1; padding: 0;
    }
    #ai-det-toast .close-btn:hover { color: #aaa; }
    #ai-det-toast .label { font-size: 20px; font-weight: 800; letter-spacing: 1.5px; color: var(--accent); }
    #ai-det-toast .sub   { font-size: 12px; color: #888; margin-top: 4px; }
    #ai-det-toast .sub span { color: #ddd; font-weight: 600; }
    #ai-det-toast .row   { display: flex; align-items: center; }
    #ai-det-toast .spinner {
      width: 20px; height: 20px;
      border: 3px solid #333; border-top-color: #7c8fff;
      border-radius: 50%;
      animation: ai-det-spin 0.8s linear infinite;
      margin-right: 10px; flex-shrink: 0;
    }
    #ai-det-toast .loading-text { color: #aaa; font-size: 14px; }
    #ai-det-toast .progress { font-size: 11px; color: #666; margin-top: 6px; }
    #ai-det-toast .progress-bar-bg {
      background: #2a2a3e; border-radius: 999px; height: 4px; margin-top: 4px; overflow: hidden;
    }
    #ai-det-toast .progress-bar {
      height: 100%; background: #a855f7; border-radius: 999px;
      transition: width 0.3s ease;
    }

    /* Highlight badges on images */
    .ai-det-badge {
      position: absolute;
      top: 4px; left: 4px;
      color: #fff;
      font-size: 11px; font-weight: 700;
      padding: 2px 7px;
      border-radius: 5px;
      pointer-events: none;
      z-index: 99998;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
  `;
  document.head.appendChild(s);
}

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  injectStyles();
  switch (msg.type) {
    case "SHOW_LOADING":   showToast("loading", null); break;
    case "SHOW_RESULT":    scannedResults.set(msg.imageUrl, msg.result); showToast("result", msg.result); highlightImage(msg.imageUrl, msg.result); break;
    case "SHOW_ERROR":     showToast("error", { error: msg.error }); break;
    case "START_SCAN":     scannedResults.clear(); startScan(); break;
    case "SCAN_PROGRESS":  updateScanToast(msg.done, msg.total); break;
    case "SCAN_RESULT":    scannedResults.set(msg.url, msg.result); highlightImage(msg.url, msg.result); break;
    case "SCAN_COMPLETE":  finishScanToast(msg.total); break;
  }
});

// ── Single-image toast ────────────────────────────────────────────────────────
function showToast(state, data) {
  const old = document.getElementById("ai-det-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.id = "ai-det-toast";

  let accent = "#7c8fff";
  let inner  = "";

  if (state === "loading") {
    inner = `<div class="row"><div class="spinner"></div><span class="loading-text">Analyzing image…</span></div>`;

  } else if (state === "result") {
    const label  = (data.label || "UNKNOWN").toUpperCase();
    const conf   = data.confidence != null ? Math.round(data.confidence * 100) : null;
    const isReal = label === "REAL";
    accent = isReal ? "#22c55e" : "#ef4444";
    inner  = `
      <div class="label">${isReal ? "✅" : "🤖"} ${label}</div>
      ${conf != null ? `<div class="sub">Confidence: <span>${conf}%</span></div>` : ""}`;

  } else if (state === "error") {
    accent = "#f59e0b";
    inner  = `<div class="label" style="font-size:14px;">⚠️ Error</div><div class="sub">${data.error || "Could not reach backend"}</div>`;
  }

  toast.innerHTML = `
    <div class="card" style="--accent:${accent}">
      <button class="close-btn" title="Dismiss">×</button>
      ${inner}
    </div>`;

  document.body.appendChild(toast);
  toast.querySelector(".close-btn").addEventListener("click", () => toast.remove());
  if (state !== "loading") setTimeout(() => toast?.remove(), 6000);
}

// ── Page scan ─────────────────────────────────────────────────────────────────
function startScan() {
  // Clear any previous highlights
  document.querySelectorAll(".ai-det-badge").forEach(b => b.remove());
  document.querySelectorAll(".ai-det-heatmap").forEach(h => h.remove());
  document.querySelectorAll("img[data-ai-checked]").forEach(img => {
    img.style.outline = "";
    img.style.outlineOffset = "";
    delete img.dataset.aiChecked;
  });

  // Collect unique, valid image URLs (skip tiny icons < 50px)
  const urls = [...new Set(
    [...document.querySelectorAll("img")]
      .filter(img => img.src && img.naturalWidth > 50 && img.naturalHeight > 50)
      .map(img => img.currentSrc || img.src)
      .filter(src => src.startsWith("http"))
  )];

  if (urls.length === 0) {
    showToast("error", { error: "No images found on this page." });
    return;
  }

  // Show scan progress toast
  showScanToast(0, urls.length);

  // Send URLs to background for processing
  chrome.runtime.sendMessage({ type: "SCAN_IMAGES", urls });
}

function showScanToast(done, total) {
  const old = document.getElementById("ai-det-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.id = "ai-det-toast";
  toast.innerHTML = `
    <div class="card" style="--accent:#a855f7">
      <button class="close-btn" title="Dismiss">×</button>
      <div class="row"><div class="spinner" style="border-top-color:#a855f7"></div><span class="loading-text">Scanning page…</span></div>
      <div class="progress" id="ai-det-prog-text">${done} / ${total} images checked</div>
      <div class="progress-bar-bg">
        <div class="progress-bar" id="ai-det-prog-bar" style="width:${total ? (done/total*100) : 0}%"></div>
      </div>
    </div>`;
  document.body.appendChild(toast);
  toast.querySelector(".close-btn").addEventListener("click", () => toast.remove());
}

function updateScanToast(done, total) {
  const bar  = document.getElementById("ai-det-prog-bar");
  const text = document.getElementById("ai-det-prog-text");
  if (bar)  bar.style.width  = `${Math.round(done / total * 100)}%`;
  if (text) text.textContent = `${done} / ${total} images checked`;
}

function finishScanToast(total) {
  const old = document.getElementById("ai-det-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.id = "ai-det-toast";
  toast.innerHTML = `
    <div class="card" style="--accent:#a855f7">
      <button class="close-btn" title="Dismiss">×</button>
      <div class="label" style="font-size:15px;">✅ Scan complete</div>
      <div class="sub">${total} images analyzed. Red = AI, Green = Real.</div>
    </div>`;
  document.body.appendChild(toast);
  toast.querySelector(".close-btn").addEventListener("click", () => toast.remove());
  setTimeout(() => toast?.remove(), 5000);
}

// ── Image highlight ───────────────────────────────────────────────────────────
function highlightImage(url, data) {
  const label  = (data.label || "UNKNOWN").toUpperCase();
  const conf   = data.confidence != null ? Math.round(data.confidence * 100) : null;
  const isReal = label === "REAL";
  const color  = isReal ? "#22c55e" : "#ef4444";

  document.querySelectorAll("img").forEach(img => {
    const src = img.currentSrc || img.src;
    if (src !== url) return;

    // Colored outline on the image
    img.style.outline      = `3px solid ${color}`;
    img.style.outlineOffset = "2px";
    img.dataset.aiChecked  = "true";

    // Badge overlay — needs a positioned parent
    const parent = img.parentElement;
    if (parent && getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    // Remove any existing badge for this image
    parent?.querySelectorAll(".ai-det-badge").forEach(b => {
      if (b.dataset.forSrc === url) b.remove();
    });
    parent?.querySelectorAll(".ai-det-heatmap").forEach(h => {
      if (h.dataset.forSrc === url) h.remove();
    });

    const badge = document.createElement("div");
    badge.className = "ai-det-badge";
    badge.dataset.forSrc = url;
    badge.style.background = color + "dd";
    badge.textContent = `${isReal ? "✅" : "🤖"} ${label}${conf != null ? ` ${conf}%` : ""}`;
    parent?.appendChild(badge);

    // Apply Heatmap Overlay over the image
    if (data.heatmap && data.heatmap.length) {
      const canvas = document.createElement("canvas");
      canvas.className = "ai-det-heatmap";
      canvas.dataset.forSrc = url;
      
      // Position exactly over the image
      canvas.style.position = "absolute";
      canvas.style.top = img.offsetTop + "px";
      canvas.style.left = img.offsetLeft + "px";
      canvas.style.width = img.offsetWidth + "px";
      canvas.style.height = img.offsetHeight + "px";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "99997"; // Sits just below the badge

      const rows = data.heatmap.length;
      const cols = data.heatmap[0].length;
      canvas.width = cols;
      canvas.height = rows;
      const ctx = canvas.getContext("2d");

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const val = data.heatmap[r][c];
          const alpha = val > 0.2 ? val * 0.7 : 0;
          ctx.fillStyle = isReal ? `rgba(34, 197, 94, ${alpha})` : `rgba(239, 68, 68, ${alpha})`;
          ctx.fillRect(c, r, 1, 1);
        }
      }
      parent?.appendChild(canvas);
    }
  });
}
