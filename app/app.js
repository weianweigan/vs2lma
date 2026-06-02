// Tauri v2 IPC bridge — uses window.__TAURI_INTERNALS__ directly
const __TAURI = window.__TAURI_INTERNALS__;

function invoke(cmd, args) {
  if (!__TAURI) return Promise.reject(new Error("Tauri unavailable"));
  return __TAURI.invoke(cmd, args);
}

// ── DOM refs ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const statusDot = $("#status-dot");
const statusText = $("#status-text");
const statusAddr = $("#status-addr");
const uptimeEl = $("#uptime");
const reqCountEl = $("#req-count");
const modelCountEl = $("#model-count");
const logBody = $("#log-body");
const footerMsg = $("#footer-msg");
const btnToggle = $("#btn-toggle-server");
const btnClear = $("#btn-clear-logs");
const btnTest = $("#btn-test");
const btnToggleKey = $("#btn-toggle-key");
const testResult = $("#test-result");
const configForm = $("#config-form");
const tabButtons = $$(".tab");
const alertTitle = $("#alert-title");
const langSwitch = $("#lang-switch");

// ── Alert dialog ──
const alertOverlay = $("#alert-overlay");
const alertBody = $("#alert-body");
const alertCopyBtn = $("#alert-copy");
const alertCloseBtn = $("#alert-close");
const alertDismissBtn = $("#alert-dismiss");

function showAlert(msg) {
  alertBody.textContent = String(msg);
  alertTitle.textContent = t("error");
  alertOverlay.classList.remove("hidden");
}
function hideAlert() { alertOverlay.classList.add("hidden"); }

alertCloseBtn.addEventListener("click", hideAlert);
alertDismissBtn.addEventListener("click", hideAlert);
alertCopyBtn.addEventListener("click", () => {
  const text = alertBody.textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      alertCopyBtn.textContent = t("copied");
      setTimeout(() => { alertCopyBtn.textContent = t("copy"); }, 1500);
    });
  }
});
alertOverlay.addEventListener("click", (e) => {
  if (e.target === alertOverlay) hideAlert();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !alertOverlay.classList.contains("hidden")) hideAlert();
});

// ── Language switch ──
langSwitch.value = lang;
langSwitch.addEventListener("change", () => {
  setLang(langSwitch.value);
  refreshAllStrings();
});

// ── Footer flash message ──
let footerTimer = null;
function showFooter(msg) {
  footerMsg.textContent = msg;
  clearTimeout(footerTimer);
  footerTimer = setTimeout(() => { footerMsg.textContent = ""; }, 3000);
}

// ── State ──
let serverRunning = false;
let startedAt = null;
let uptimeTimer = null;
let tauriAvailable = !!__TAURI;

// ── Init ──
document.addEventListener("DOMContentLoaded", async () => {
  refreshAllStrings();

  if (!tauriAvailable) {
    footerMsg.textContent = t("tauriUnavailable");
    return;
  }

  await loadConfig();
  await refreshStatus();
  setupTabs();
  setupEvents();
  startLogPolling();
  startStatusPolling();
});

// ── Refresh all translatable strings ──
function refreshAllStrings() {
  $$(".tab[data-tab='dashboard']").forEach(el => el.textContent = t("dashboard"));
  $$(".tab[data-tab='config']").forEach(el => el.textContent = t("configuration"));
  $$(".log-header span").forEach(el => el.textContent = t("requestLog"));
  btnClear.textContent = t("clear");
  btnToggleKey.title = lang === "zh" ? "显示/隐藏" : "Show/hide";

  // Dashboard labels
  if (uptimeEl.closest(".stat-card").querySelector(".stat-label"))
    uptimeEl.closest(".stat-card").querySelector(".stat-label").textContent = t("uptime");
  if (modelCountEl.closest(".stat-card").querySelector(".stat-label"))
    modelCountEl.closest(".stat-card").querySelector(".stat-label").textContent = t("models");

  // Config form labels
  const labels = {
    "#tab-dashboard .stats-row .stat-card:nth-child(1) .stat-label": "uptime",
    "#tab-dashboard .stats-row .stat-card:nth-child(2) .stat-label": "requests",
    "#tab-dashboard .stats-row .stat-card:nth-child(3) .stat-label": "models",
  };

  // Update all stat labels
  $$(".stat-label")[0] && ($$(".stat-label")[0].textContent = t("uptime"));
  $$(".stat-label")[1] && ($$(".stat-label")[1].textContent = t("requests"));
  $$(".stat-label")[2] && ($$(".stat-label")[2].textContent = t("models"));

  // Config tab
  $("label[for='base-url']") && ($("label[for='base-url']").textContent = t("baseUrl"));
  $("label[for='api-key']") && ($("label[for='api-key']").textContent = t("apiKey"));
  $("label[for='host']") && ($("label[for='host']").textContent = t("host"));
  $("label[for='port']") && ($("label[for='port']").textContent = t("port"));

  // Checkbox labels
  $$("#tab-config .checkbox-label span")[0] && ($$("#tab-config .checkbox-label span")[0].textContent = t("toolsCap"));
  $$("#tab-config .checkbox-label span")[1] && ($$("#tab-config .checkbox-label span")[1].textContent = t("thinkingCap"));
  $$("#tab-config .checkbox-label span")[2] && ($$("#tab-config .checkbox-label span")[2].textContent = t("autoStart"));
  $$("#tab-config .checkbox-label span")[3] && ($$("#tab-config .checkbox-label span")[3].textContent = t("minimizeTray"));

  btnTest.textContent = t("testConnection");
  configForm.querySelector("button[type='submit']").textContent = t("saveConfig");

  // Alert buttons
  alertCopyBtn.textContent = t("copy");
  alertDismissBtn.textContent = t("close");

  // Log table headers
  const ths = $$(".log-table th");
  ths[0] && (ths[0].textContent = "Time");
  ths[1] && (ths[1].textContent = "Method");
  ths[2] && (ths[2].textContent = "Path");
  ths[3] && (ths[3].textContent = "Status");
  ths[4] && (ths[4].textContent = "Duration");

  // Update button and status
  updateButtonLabel();
}

function updateButtonLabel() {
  btnToggle.textContent = serverRunning ? t("stopServer") : t("startServer");
}

// ── Tabs ──
function setupTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tabId = btn.dataset.tab;
      $$(".tab-content").forEach((c) => c.classList.remove("active"));
      $(`#tab-${tabId}`).classList.add("active");
    });
  });
}

// ── Events ──
async function setupEvents() {
  configForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveConfig();
  });

  btnToggle.addEventListener("click", async () => {
    if (serverRunning) {
      await stopServer();
    } else {
      await startServer();
    }
  });

  btnTest.addEventListener("click", testConnection);
  btnClear.addEventListener("click", clearLogs);

  btnToggleKey.addEventListener("click", () => {
    const input = $("#api-key");
    input.type = input.type === "password" ? "text" : "password";
  });
}

// ── Status polling ──
function startStatusPolling() {
  setInterval(async () => {
    if (!tauriAvailable) return;
    try {
      const status = await invoke("get_server_status");
      updateStatusUI(status);
    } catch { /* ignore */ }
  }, 2000);
}

// ── Config ──
async function loadConfig() {
  try {
    const config = await invoke("get_config");
    $("#base-url").value = config.base_url || "";
    $("#api-key").value = config.api_key || "";
    $("#host").value = config.host || "localhost";
    $("#port").value = config.port || 11434;
    $("#cap-tools").checked = config.capabilities?.tools ?? true;
    $("#cap-thinking").checked = config.capabilities?.thinking ?? false;
    $("#auto-start").checked = config.auto_start_server ?? false;
    $("#minimize-tray").checked = config.minimize_to_tray ?? true;
  } catch (e) {
    showAlert(`${t("failedLoadConfig")}: ${e}`);
  }
}

async function saveConfig() {
  clearErrors();
  try {
    await invoke("save_config", {
      config: {
        base_url: $("#base-url").value.trim(),
        api_key: $("#api-key").value.trim(),
        host: $("#host").value.trim() || "localhost",
        port: parseInt($("#port").value) || 11434,
        capabilities: {
          tools: $("#cap-tools").checked,
          thinking: $("#cap-thinking").checked,
        },
        auto_start_server: $("#auto-start").checked,
        minimize_to_tray: $("#minimize-tray").checked,
      },
    });
    showFooter(t("configSaved"));
  } catch (e) {
    showAlert(String(e));
  }
}

// ── Server control ──
async function startServer() {
  btnToggle.disabled = true;
  btnToggle.textContent = t("starting");
  try {
    const status = await invoke("start_server");
    updateStatusUI(status);
  } catch (e) {
    showAlert(`${t("failedStartServer")}:\n${e}`);
  } finally {
    btnToggle.disabled = false;
  }
}

async function stopServer() {
  btnToggle.disabled = true;
  btnToggle.textContent = t("stopping");
  try {
    await invoke("stop_server");
  } catch (e) {
    showAlert(`${t("failedStopServer")}:\n${e}`);
  } finally {
    btnToggle.disabled = false;
  }
}

async function refreshStatus() {
  try {
    const status = await invoke("get_server_status");
    updateStatusUI(status);
  } catch { /* ignore */ }
}

function updateStatusUI(status) {
  serverRunning = status.running;
  startedAt = status.started_at;

  if (status.running) {
    statusDot.className = "status-dot running";
    statusText.textContent = t("running");
    statusAddr.textContent = t("serverStatus", status.host, status.port);
    btnToggle.textContent = t("stopServer");
    btnToggle.className = "btn btn-secondary";
    startUptimeTimer();
  } else {
    statusDot.className = "status-dot stopped";
    statusText.textContent = t("stopped");
    statusAddr.textContent = "";
    btnToggle.textContent = t("startServer");
    btnToggle.className = "btn btn-primary";
    stopUptimeTimer();
    uptimeEl.textContent = "--";
    reqCountEl.textContent = "0";
  }
}

// ── Connection test ──
async function testConnection() {
  testResult.classList.add("hidden");
  testResult.className = "test-result hidden";
  btnTest.disabled = true;
  btnTest.textContent = t("testing");

  try {
    const result = await invoke("test_connection", {
      url: $("#base-url").value.trim(),
      apiKey: $("#api-key").value.trim(),
    });

    if (result.success) {
      const count = result.models?.length ?? 0;
      testResult.textContent = `${t("connectionSuccess")}\n\n${count} ${t("modelsAvail")}:\n${result.models?.map((m) => `  - ${m.name}`).join("\n") ?? ""}`;
      testResult.className = "test-result success";
      modelCountEl.textContent = count;
    } else {
      testResult.textContent = `${t("connectionFailed")}:\n${result.error ?? t("unknownError")}`;
      testResult.className = "test-result error";
    }
  } catch (e) {
    testResult.textContent = `${t("error")}: ${e}`;
    testResult.className = "test-result error";
  } finally {
    btnTest.disabled = false;
    btnTest.textContent = t("testConnection");
  }
}

// ── Logs ──
async function fetchLogs() {
  try {
    const logs = await invoke("fetch_logs");
    renderLogs(logs);
  } catch { /* ignore */ }

  try {
    const status = await invoke("fetch_proxy_status");
    reqCountEl.textContent = status.requestCount ?? 0;
  } catch { /* ignore */ }
}

function renderLogs(logs) {
  if (!logs || logs.length === 0) {
    logBody.innerHTML = `<tr><td colspan="5" class="log-empty">${t("noRequests")}</td></tr>`;
    return;
  }

  logBody.innerHTML = logs
    .slice()
    .reverse()
    .map(
      (l) => `
    <tr>
      <td>${new Date(l.timestamp).toLocaleTimeString()}</td>
      <td>${l.method}</td>
      <td>${l.path}</td>
      <td><span class="status-code ${l.statusCode < 400 ? "ok" : "err"}">${l.statusCode || "--"}</span></td>
      <td>${l.durationMs > 0 ? l.durationMs + "ms" : "--"}</td>
    </tr>`
    )
    .join("");
}

function startLogPolling() {
  setInterval(fetchLogs, 2000);
}

async function clearLogs() {
  try { await invoke("clear_proxy_logs"); } catch { /* ignore */ }
  logBody.innerHTML = `<tr><td colspan="5" class="log-empty">${t("noRequests")}</td></tr>`;
}

// ── Uptime ──
function startUptimeTimer() {
  stopUptimeTimer();
  uptimeTimer = setInterval(() => {
    if (!startedAt) return;
    const elapsed = Math.floor((Date.now() / 1000) - startedAt);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    uptimeEl.textContent =
      h > 0
        ? `${h}h ${m.toString().padStart(2, "0")}m`
        : `${m}m ${s.toString().padStart(2, "0")}s`;
  }, 1000);
}

function stopUptimeTimer() {
  if (uptimeTimer) { clearInterval(uptimeTimer); uptimeTimer = null; }
}

// ── Helpers ──
function clearErrors() {
  $$(".field-error").forEach((el) => (el.textContent = ""));
  $$(".input-error").forEach((el) => el.classList.remove("input-error"));
}

function showError(field, message) {
  const el = $(`.field-error[data-field="${field}"]`);
  if (el) el.textContent = message;
  const input = document.getElementById(
    field === "apiKey" ? "api-key" : field === "baseUrl" ? "base-url" : field
  );
  if (input) input.classList.add("input-error");
}
