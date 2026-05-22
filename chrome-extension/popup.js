// popup.js
// Reads the last result from chrome.storage.local (written by background.js)
// and renders the appropriate UI state in popup.html.

document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("content");

  chrome.storage.local.get(["status", "result", "imageUrl"], ({ status, result }) => {
    if (!status || status === "idle") return renderIdle(content);
    if (status === "loading")        return renderLoading(content);
    if (status === "error" || result?.error) return renderError(content, result?.error);
    if (result)                      return renderResult(content, result);
    renderIdle(content);
  });
});

function renderIdle(el) {
  el.innerHTML = `
    <div class="idle">
      <div>No image checked yet.</div>
      <div><strong>"Check if AI Generated"</strong></div>
      <div style="margin-top:4px;font-size:11px;color:#333;">on any image to get started</div>
    </div>`;
}

function renderLoading(el) {
  el.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div>Analyzing image…</div>
    </div>`;
}

function renderResult(el, data) {
  const label = (data.label || "UNKNOWN").toUpperCase();
  const conf  = data.confidence != null ? Math.round(data.confidence * 100) : null;
  const isReal = label === "REAL";
  const cls   = isReal ? "real" : "fake";
  const icon  = isReal ? "✅" : "🤖";

  el.innerHTML = `
    <div class="result-card ${cls}">
      <div class="result-label">${icon} ${label}</div>
      ${conf != null ? `
        <div class="bar-bg"><div class="bar" style="width:${conf}%"></div></div>
        <div class="conf-text">Confidence: <span>${conf}%</span></div>
      ` : ""}
    </div>`;
}

function renderError(el, message) {
  el.innerHTML = `
    <div class="error-card">
      <div class="error-icon">⚠️</div>
      <div class="error-title">Connection Error</div>
      <div class="error-msg">${message || "Could not reach http://localhost:8000"}</div>
    </div>`;
}
