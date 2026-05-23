// popup.js

document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("content");
  const dot = document.getElementById("status-dot");

  chrome.storage.local.get(["status", "result", "imageUrl"], ({ status, result }) => {
    if (!status || status === "idle") return renderIdle(content, dot);
    if (status === "loading")        return renderLoading(content, dot);
    if (status === "error" || result?.error) return renderError(content, dot, result?.error);
    if (result)                      return renderResult(content, dot, result);
    renderIdle(content, dot);
  });
});

function renderIdle(el, dot) {
  dot.className = "status-dot";
  el.innerHTML = `
    <div class="idle">
      <div class="hint-big">🔍</div>
      <div class="idle-main">Right-click any image and select<br><strong>"Check if AI Generated"</strong></div>
    </div>`;
}

function renderLoading(el, dot) {
  dot.className = "status-dot loading";
  el.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div>Analyzing image…</div>
    </div>`;
}

function renderResult(el, dot, data) {
  const label  = (data.label || "UNKNOWN").toUpperCase();
  const conf   = data.confidence != null ? Math.round(data.confidence * 100) : null;
  const isReal = label === "REAL";
  const cls    = isReal ? "real" : "fake";
  const icon   = isReal ? "✅" : "🤖";
  const badge  = isReal ? "Human" : "AI Generated";

  dot.className = `status-dot active`;

  el.innerHTML = `
    <div class="result-card ${cls}">
      <div class="result-top">
        <div class="result-label">${icon} ${label}</div>
        <div class="result-badge">${badge}</div>
      </div>
      ${conf != null ? `
        <div class="bar-bg"><div class="bar" style="width:${conf}%"></div></div>
        <div class="conf-text">
          <span>Confidence</span>
          <span>${conf}%</span>
        </div>` : ""}
    </div>`;
}

function renderError(el, dot, message) {
  dot.className = "status-dot error";
  el.innerHTML = `
    <div class="error-card">
      <div class="error-icon">⚠️</div>
      <div class="error-title">Could not analyze image</div>
      <div class="error-msg">${message || "Make sure the backend server is running on port 8001."}</div>
    </div>`;
}
