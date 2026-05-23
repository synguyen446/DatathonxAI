// background.js
// Service worker: context menus, API calls, dynamic icon, page scan.

const API_URL = "http://localhost:8001/predict";
const API_UPLOAD = "http://localhost:8001/predict-upload";

// ── Icon ─────────────────────────────────────────────────────────────────────
// Draws the toolbar icon on an OffscreenCanvas — no PNG files needed.
function createIcon(size, bgColor = "#1e1e2e", textColor = "#7c8fff") {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Rounded square background
  const r = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(size - r, 0);
  ctx.arcTo(size, 0, size, r, r);
  ctx.lineTo(size, size - r);
  ctx.arcTo(size, size, size - r, size, r);
  ctx.lineTo(r, size);
  ctx.arcTo(0, size, 0, size - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fillStyle = bgColor;
  ctx.fill();

  // "TL" text
  ctx.fillStyle = textColor;
  ctx.font = `bold ${Math.round(size * 0.42)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("TL", size / 2, size / 2 + size * 0.03);

  return ctx.getImageData(0, 0, size, size);
}

function setIcon(state = "default") {
  const colors = {
    default: { bg: "#1e1e2e", text: "#7c8fff" },
    real:    { bg: "#0a2318", text: "#22c55e" },
    fake:    { bg: "#2a0d0d", text: "#ef4444" },
    loading: { bg: "#1a1a2e", text: "#888888" },
    scan:    { bg: "#1a1025", text: "#a855f7" }
  };
  const { bg, text } = colors[state] || colors.default;
  chrome.action.setIcon({
    imageData: {
      16:  createIcon(16,  bg, text),
      32:  createIcon(32,  bg, text),
      48:  createIcon(48,  bg, text),
      128: createIcon(128, bg, text)
    }
  });
}

// Safely send to a tab — swallows the error if content.js isn't loaded yet
function tell(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

async function predictImage(imageUrl) {
  try {
    const imageRes = await fetch(imageUrl, {
      credentials: "include",
      cache: "force-cache"
    });
    if (!imageRes.ok) throw new Error(`Image fetch failed with ${imageRes.status}`);

    const blob = await imageRes.blob();
    if (!blob.type.startsWith("image/")) {
      throw new Error(`URL did not return an image (${blob.type || "unknown type"})`);
    }

    const form = new FormData();
    form.append("file", blob, "checked-image");

    const res = await fetch(API_UPLOAD, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    return await res.json();
  } catch (uploadErr) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl })
    });
    if (!res.ok) {
      throw new Error(`${uploadErr.message}; URL fallback responded with ${res.status}`);
    }
    return await res.json();
  }
}

// ── Context menus ─────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "checkAI",
    title: "Check if AI Generated",
    contexts: ["image"]
  });
  chrome.contextMenus.create({
    id: "scanPage",
    title: "Scan All Images on Page",
    contexts: ["page", "image"]
  });
  setIcon("default");
});

// ── Single image check ────────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "checkAI") {
    const imageUrl = info.srcUrl;
    await chrome.storage.local.set({ status: "loading", result: null, imageUrl });
    setIcon("loading");
    tell(tab.id,{ type: "SHOW_LOADING", imageUrl });

    try {
      const data = await predictImage(imageUrl);
      await chrome.storage.local.set({ status: "done", result: data, imageUrl });
      const state = (data.label || "").toUpperCase() === "REAL" ? "real" : "fake";
      setIcon(state);
      tell(tab.id, { type: "SHOW_RESULT", imageUrl, result: data });
    } catch (err) {
      await chrome.storage.local.set({ status: "error", result: { error: err.message }, imageUrl });
      setIcon("default");
      tell(tab.id,{ type: "SHOW_ERROR", error: err.message });
    }
  }

  if (info.menuItemId === "scanPage") {
    setIcon("scan");
    tell(tab.id,{ type: "START_SCAN" });
  }
});

// ── Page scan (called by content.js with a list of image URLs) ────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "SCAN_IMAGES") {
    scanImages(msg.urls, sender.tab.id);
  }
});

async function scanImages(urls, tabId) {
  tell(tabId,{ type: "SCAN_PROGRESS", done: 0, total: urls.length });

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    let sentResult = false;
    try {
      const data = await predictImage(url);
      sentResult = true;
      tell(tabId,{
        type: "SCAN_RESULT",
        url,
        result: data,
        done: i + 1,
        total: urls.length
      });
    } catch (_) { /* skip unreachable images */ }

    if (!sentResult && i < urls.length - 1) {
      tell(tabId,{ type: "SCAN_PROGRESS", done: i + 1, total: urls.length });
    }

    await new Promise(r => setTimeout(r, 150)); // avoid hammering the server
  }

  tell(tabId,{ type: "SCAN_COMPLETE", total: urls.length });
  setIcon("default");
}
