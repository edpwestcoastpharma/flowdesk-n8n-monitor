const state = {
  workflows: [],
  executions: [],
  meta: { workflows: {}, issues: {} },
  config: null,
  health: null,
  selectedFailureId: null,
  refreshTimer: null
};

const els = {
  notice: document.querySelector("#notice"),
  connectionPill: document.querySelector("#connectionPill"),
  refreshBtn: document.querySelector("#refreshBtn"),
  themeToggle: document.querySelector("#themeToggle"),
  autoRefresh: document.querySelector("#autoRefresh"),
  totalWorkflows: document.querySelector("#totalWorkflows"),
  activeWorkflows: document.querySelector("#activeWorkflows"),
  failedExecutions: document.querySelector("#failedExecutions"),
  avgHealth: document.querySelector("#avgHealth"),
  loadedExecutions: document.querySelector("#loadedExecutions"),
  latencyText: document.querySelector("#latencyText"),
  lastRefreshText: document.querySelector("#lastRefreshText"),
  baseUrlText: document.querySelector("#baseUrlText"),
  healthList: document.querySelector("#healthList"),
  attentionList: document.querySelector("#attentionList"),
  workflowTable: document.querySelector("#workflowTable"),
  failureList: document.querySelector("#failureList"),
  failureDetail: document.querySelector("#failureDetail"),
  selectedFailureTitle: document.querySelector("#selectedFailureTitle"),
  clientList: document.querySelector("#clientList"),
  reportSummary: document.querySelector("#reportSummary"),
  workflowSearch: document.querySelector("#workflowSearch"),
  statusFilter: document.querySelector("#statusFilter"),
  priorityFilter: document.querySelector("#priorityFilter"),
  configForm: document.querySelector("#configForm"),
  baseUrl: document.querySelector("#baseUrl"),
  apiKey: document.querySelector("#apiKey"),
  testBtn: document.querySelector("#testBtn"),
  metaForm: document.querySelector("#metaForm"),
  metaWorkflowId: document.querySelector("#metaWorkflowId"),
  metaWorkflowTitle: document.querySelector("#metaWorkflowTitle"),
  metaClient: document.querySelector("#metaClient"),
  metaProject: document.querySelector("#metaProject"),
  metaCategory: document.querySelector("#metaCategory"),
  metaPriority: document.querySelector("#metaPriority"),
  metaValue: document.querySelector("#metaValue"),
  metaOwner: document.querySelector("#metaOwner"),
  metaNotes: document.querySelector("#metaNotes"),
  copyReportBtn: document.querySelector("#copyReportBtn")
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("flowdesk-theme", theme);
  els.themeToggle.textContent = theme === "night" ? "Day" : "Night";
  els.themeToggle.title = theme === "night" ? "Switch to day mode" : "Switch to night mode";
}

function cleanBaseUrl(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  try {
    const parsed = new URL(input);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return input.replace(/\/(home|workflow|workflows|api).*$/i, "").replace(/\/+$/, "");
  }
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showNotice(message) {
  els.notice.textContent = message;
  els.notice.classList.toggle("hidden", !message);
}

function setConnection(status, text) {
  els.connectionPill.className = `pill ${status}`;
  els.connectionPill.textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function minutesBetween(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(0, Math.round((endDate - startDate) / 60000));
}

function executionStatus(execution) {
  if (execution.status) return execution.status;
  if (execution.error) return "failed";
  if (execution.finished === false) return "running";
  if (execution.stoppedAt) return "success";
  return "unknown";
}

function metaFor(workflowId) {
  return state.meta.workflows[String(workflowId)] || {};
}

function executionsFor(workflowId) {
  return state.executions.filter(execution => String(execution.workflowId) === String(workflowId));
}

function workflowNameById(id) {
  const workflow = state.workflows.find(item => String(item.id) === String(id));
  return workflow ? workflow.name : `Workflow ${id || "-"}`;
}

function workflowUrl(workflowId) {
  if (!state.config?.baseUrl) return "#";
  return `${state.config.baseUrl}/workflow/${workflowId}`;
}

function scoreWorkflow(workflow) {
  const runs = executionsFor(workflow.id);
  const failed = runs.filter(run => executionStatus(run) === "failed").length;
  const running = runs.filter(run => ["running", "waiting"].includes(executionStatus(run))).length;
  let score = 100;
  if (!workflow.active) score -= 30;
  score -= Math.min(50, failed * 12);
  score -= Math.min(10, running * 3);
  if (!runs.length) score -= 8;
  const lastRun = runs[0];
  const ageHours = lastRun ? (Date.now() - new Date(lastRun.startedAt || lastRun.createdAt).getTime()) / 3600000 : 999;
  if (ageHours > 168) score -= 7;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreClass(score) {
  if (score >= 80) return "good";
  if (score >= 55) return "warn";
  return "bad";
}

function getFailureAdvice(execution) {
  const message = `${execution.error?.message || ""} ${execution.error?.description || ""}`.toLowerCase();
  if (message.includes("401") || message.includes("unauthorized")) {
    return "Likely expired or wrong API credential. Check the credential attached to the failed HTTP/API node.";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "Likely slow third-party API or network issue. Add retry logic and check API response time.";
  }
  if (message.includes("429") || message.includes("rate")) {
    return "Likely rate limit. Add delay, batching, or queue protection before calling that service.";
  }
  if (message.includes("not found") || message.includes("404")) {
    return "Likely wrong endpoint, missing record, or changed external ID. Verify URL and mapped fields.";
  }
  if (message.includes("json") || message.includes("parse")) {
    return "Likely malformed payload. Inspect the previous node output and validate the JSON shape.";
  }
  return "Open the execution in n8n, inspect the failed node input/output, then add error handling or retry logic.";
}

function renderMetrics() {
  const active = state.workflows.filter(workflow => workflow.active).length;
  const failed = state.executions.filter(execution => executionStatus(execution) === "failed").length;
  const scores = state.workflows.map(scoreWorkflow);
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  els.totalWorkflows.textContent = state.workflows.length;
  els.activeWorkflows.textContent = active;
  els.failedExecutions.textContent = failed;
  els.avgHealth.textContent = `${average}%`;
  els.loadedExecutions.textContent = state.executions.length;
  els.baseUrlText.textContent = state.config?.baseUrl || "-";
  els.lastRefreshText.textContent = state.health?.lastRefresh ? formatDate(state.health.lastRefresh) : "-";
}

function renderHealth() {
  const sorted = [...state.workflows].sort((a, b) => scoreWorkflow(a) - scoreWorkflow(b)).slice(0, 10);
  els.healthList.innerHTML = sorted.length ? sorted.map(workflow => {
    const score = scoreWorkflow(workflow);
    const meta = metaFor(workflow.id);
    return `
      <article class="item workflow-action" data-workflow-id="${safe(workflow.id)}">
        <div>
          <strong>${safe(workflow.name)}</strong>
          <small>${safe(meta.client || "No client")} / ${safe(meta.category || "Uncategorized")}</small>
        </div>
        <span class="health ${scoreClass(score)}">${score}%</span>
      </article>
    `;
  }).join("") : empty("No workflows loaded yet.");
}

function renderAttention() {
  const failed = state.executions.filter(execution => executionStatus(execution) === "failed").slice(0, 5);
  const weak = state.workflows.filter(workflow => scoreWorkflow(workflow) < 70).slice(0, 5);
  const items = [
    ...failed.map(execution => ({
      title: workflowNameById(execution.workflowId),
      meta: `Failed ${formatDate(execution.startedAt || execution.createdAt)}`,
      status: "failed"
    })),
    ...weak.map(workflow => ({
      title: workflow.name,
      meta: `Health score ${scoreWorkflow(workflow)}%`,
      status: workflow.active ? "warning" : "inactive"
    }))
  ];
  els.attentionList.innerHTML = items.length ? items.map(item => `
    <article class="item">
      <div><strong>${safe(item.title)}</strong><small>${safe(item.meta)}</small></div>
      <span class="status ${safe(item.status)}">${safe(item.status)}</span>
    </article>
  `).join("") : empty("No urgent issues found.");
}

function renderWorkflows() {
  const query = els.workflowSearch.value.trim().toLowerCase();
  const status = els.statusFilter.value;
  const priority = els.priorityFilter.value;
  const failedWorkflowIds = new Set(state.executions.filter(run => executionStatus(run) === "failed").map(run => String(run.workflowId)));
  const filtered = state.workflows.filter(workflow => {
    const meta = metaFor(workflow.id);
    const blob = `${workflow.name} ${meta.client || ""} ${meta.category || ""} ${meta.project || ""}`.toLowerCase();
    if (query && !blob.includes(query)) return false;
    if (status === "active" && !workflow.active) return false;
    if (status === "inactive" && workflow.active) return false;
    if (status === "failed" && !failedWorkflowIds.has(String(workflow.id))) return false;
    if (priority !== "all" && (meta.priority || "normal") !== priority) return false;
    return true;
  });

  els.workflowTable.innerHTML = filtered.length ? filtered.map(workflow => {
    const meta = metaFor(workflow.id);
    const runs = executionsFor(workflow.id);
    const lastRun = runs[0];
    const score = scoreWorkflow(workflow);
    const failures = runs.filter(run => executionStatus(run) === "failed").length;
    return `
      <article class="row rich-row workflow-action" data-workflow-id="${safe(workflow.id)}">
        <div><strong>${safe(workflow.name)}</strong><small>${safe(meta.client || "No client assigned")}</small></div>
        <span class="status ${workflow.active ? "active" : "inactive"}">${workflow.active ? "active" : "inactive"}</span>
        <span class="health ${scoreClass(score)}">${score}%</span>
        <small>${safe(meta.category || "Uncategorized")}</small>
        <small>${lastRun ? formatDate(lastRun.startedAt || lastRun.createdAt) : "No loaded run"}</small>
        <small>${failures} failures</small>
        <a href="${safe(workflowUrl(workflow.id))}" target="_blank" class="mini-link">Open</a>
      </article>
    `;
  }).join("") : empty("No workflows match the filters.");
}

function renderFailures() {
  const failed = state.executions.filter(execution => executionStatus(execution) === "failed");
  els.failureList.innerHTML = failed.length ? failed.map(execution => {
    const issue = state.meta.issues[String(execution.id)] || {};
    return `
      <article class="item failure-action" data-execution-id="${safe(execution.id)}">
        <div>
          <strong>${safe(workflowNameById(execution.workflowId))}</strong>
          <small>${safe(execution.error?.message || "Execution failed")} / ${formatDate(execution.startedAt || execution.createdAt)}</small>
        </div>
        <span class="status ${issue.status === "resolved" ? "active" : "failed"}">${safe(issue.status || "open")}</span>
      </article>
    `;
  }).join("") : empty("No failed executions in the loaded results.");
  renderFailureDetail();
}

function renderFailureDetail() {
  const execution = state.executions.find(item => String(item.id) === String(state.selectedFailureId))
    || state.executions.find(item => executionStatus(item) === "failed");
  if (!execution || executionStatus(execution) !== "failed") {
    els.selectedFailureTitle.textContent = "None selected";
    els.failureDetail.innerHTML = empty("Select a failed execution.");
    return;
  }
  state.selectedFailureId = execution.id;
  const issue = state.meta.issues[String(execution.id)] || {};
  els.selectedFailureTitle.textContent = `Execution ${execution.id}`;
  els.failureDetail.innerHTML = `
    <div class="detail-block"><span>Workflow</span><strong>${safe(workflowNameById(execution.workflowId))}</strong></div>
    <div class="detail-block"><span>Error</span><p>${safe(execution.error?.message || "Execution failed")}</p></div>
    <div class="detail-block"><span>AI-style suggestion</span><p>${safe(getFailureAdvice(execution))}</p></div>
    <div class="detail-grid">
      <div><span>Started</span><strong>${formatDate(execution.startedAt || execution.createdAt)}</strong></div>
      <div><span>Status</span><strong>${safe(issue.status || "open")}</strong></div>
      <div><span>Duration</span><strong>${minutesBetween(execution.startedAt, execution.stoppedAt) ?? "-"} min</strong></div>
      <div><span>ID</span><strong>${safe(execution.id)}</strong></div>
    </div>
    <form class="issue-form" data-issue-id="${safe(execution.id)}">
      <label>Issue note <textarea name="note" placeholder="What was checked or fixed?">${safe(issue.note || "")}</textarea></label>
      <label>Status
        <select name="status">
          <option value="open" ${issue.status !== "resolved" ? "selected" : ""}>Open</option>
          <option value="resolved" ${issue.status === "resolved" ? "selected" : ""}>Resolved</option>
        </select>
      </label>
      <button type="submit">Save Issue</button>
    </form>
  `;
}

function renderClients() {
  const groups = new Map();
  for (const workflow of state.workflows) {
    const meta = metaFor(workflow.id);
    const client = meta.client || "Unassigned";
    if (!groups.has(client)) groups.set(client, []);
    groups.get(client).push(workflow);
  }
  els.clientList.innerHTML = groups.size ? [...groups.entries()].map(([client, workflows]) => {
    const active = workflows.filter(workflow => workflow.active).length;
    const avg = Math.round(workflows.reduce((sum, workflow) => sum + scoreWorkflow(workflow), 0) / workflows.length);
    return `
      <article class="client-card">
        <div><strong>${safe(client)}</strong><small>${workflows.length} workflows / ${active} active / ${avg}% health</small></div>
        <div class="client-workflows">
          ${workflows.map(workflow => `<button type="button" class="chip workflow-action" data-workflow-id="${safe(workflow.id)}">${safe(workflow.name)}</button>`).join("")}
        </div>
      </article>
    `;
  }).join("") : empty("No clients found.");
}

function renderReport() {
  const failed = state.executions.filter(execution => executionStatus(execution) === "failed").length;
  const active = state.workflows.filter(workflow => workflow.active).length;
  const inactive = state.workflows.length - active;
  const clients = new Set(state.workflows.map(workflow => metaFor(workflow.id).client).filter(Boolean));
  const risky = state.workflows.filter(workflow => scoreWorkflow(workflow) < 70).length;
  els.reportSummary.innerHTML = `
    <p><strong>Loaded workflows:</strong> ${state.workflows.length}</p>
    <p><strong>Active/inactive:</strong> ${active} active, ${inactive} inactive</p>
    <p><strong>Loaded executions:</strong> ${state.executions.length}</p>
    <p><strong>Failures in loaded data:</strong> ${failed}</p>
    <p><strong>Mapped clients:</strong> ${clients.size}</p>
    <p><strong>Risky workflows:</strong> ${risky}</p>
    <p><strong>Recommendation:</strong> ${risky || failed ? "Review failure center, add retry logic, and document high priority workflows." : "Current loaded data looks healthy. Keep monitoring with auto-refresh on."}</p>
  `;
}

function empty(message) {
  return `<div class="item"><div><strong>${safe(message)}</strong><small>Refresh after connecting n8n.</small></div></div>`;
}

function renderAll() {
  renderMetrics();
  renderHealth();
  renderAttention();
  renderWorkflows();
  renderFailures();
  renderClients();
  renderReport();
}

async function loadConfig() {
  state.config = await api("/api/config");
  els.baseUrl.value = state.config.baseUrl || "";
  if (state.config.configured) {
    setConnection("neutral", "Configured");
  } else {
    setConnection("bad", "Setup needed");
    showNotice("Open Connection, add your n8n URL and API key, then press Save Connection.");
  }
}

async function testConnection() {
  setConnection("neutral", "Testing");
  const health = await api("/api/health");
  state.health = { ...health, lastRefresh: new Date().toISOString() };
  els.latencyText.textContent = `${health.latencyMs} ms`;
  setConnection("good", "Connected");
  showNotice("");
  renderMetrics();
}

async function refreshData() {
  try {
    setConnection("neutral", "Loading");
    showNotice("");
    const [health, workflows, executions, meta] = await Promise.all([
      api("/api/health"),
      api("/api/workflows?limit=250"),
      api("/api/executions?limit=100"),
      api("/api/meta")
    ]);
    state.health = { ...health, lastRefresh: new Date().toISOString() };
    state.workflows = workflows.data || [];
    state.executions = executions.data || [];
    state.meta = meta || { workflows: {}, issues: {} };
    els.latencyText.textContent = `${health.latencyMs} ms`;
    setConnection("good", "Connected");
    renderAll();
  } catch (error) {
    setConnection("bad", "Offline");
    showNotice(error.message);
    renderAll();
  }
}

function selectWorkflow(workflowId) {
  const workflow = state.workflows.find(item => String(item.id) === String(workflowId));
  if (!workflow) return;
  const meta = metaFor(workflow.id);
  els.metaWorkflowTitle.textContent = workflow.name;
  els.metaWorkflowId.value = workflow.id;
  els.metaClient.value = meta.client || "";
  els.metaProject.value = meta.project || "";
  els.metaCategory.value = meta.category || "";
  els.metaPriority.value = meta.priority || "normal";
  els.metaValue.value = meta.monthlyValue || "";
  els.metaOwner.value = meta.owner || "";
  els.metaNotes.value = meta.notes || "";
  switchView("clients");
}

function switchView(viewId) {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === viewId));
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === viewId));
}

function setupAutoRefresh() {
  clearInterval(state.refreshTimer);
  if (els.autoRefresh.checked) {
    state.refreshTimer = setInterval(refreshData, 30000);
  }
}

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.body.addEventListener("click", event => {
  const workflowButton = event.target.closest(".workflow-action");
  if (workflowButton && !event.target.closest("a")) selectWorkflow(workflowButton.dataset.workflowId);
  const failureButton = event.target.closest(".failure-action");
  if (failureButton) {
    state.selectedFailureId = failureButton.dataset.executionId;
    renderFailureDetail();
  }
});

document.body.addEventListener("submit", async event => {
  const issueForm = event.target.closest(".issue-form");
  if (!issueForm) return;
  event.preventDefault();
  await api("/api/meta/issue", {
    method: "POST",
    body: JSON.stringify({
      issueId: issueForm.dataset.issueId,
      status: issueForm.elements.status.value,
      note: issueForm.elements.note.value
    })
  });
  state.meta = await api("/api/meta");
  renderAll();
});

els.metaForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!els.metaWorkflowId.value) return showNotice("Select a workflow first.");
  await api("/api/meta/workflow", {
    method: "POST",
    body: JSON.stringify({
      workflowId: els.metaWorkflowId.value,
      client: els.metaClient.value,
      project: els.metaProject.value,
      category: els.metaCategory.value,
      priority: els.metaPriority.value,
      monthlyValue: els.metaValue.value,
      owner: els.metaOwner.value,
      notes: els.metaNotes.value
    })
  });
  state.meta = await api("/api/meta");
  showNotice("");
  renderAll();
});

els.configForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await api("/api/config", {
      method: "POST",
      body: JSON.stringify({ baseUrl: cleanBaseUrl(els.baseUrl.value), apiKey: els.apiKey.value })
    });
    els.apiKey.value = "";
    await loadConfig();
    await refreshData();
  } catch (error) {
    showNotice(error.message);
  }
});

els.copyReportBtn.addEventListener("click", async () => {
  const text = els.reportSummary.textContent.replace(/\s+/g, " ").trim();
  await navigator.clipboard.writeText(text);
  showNotice("Report summary copied.");
});

els.refreshBtn.addEventListener("click", refreshData);
els.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme || "day";
  applyTheme(current === "night" ? "day" : "night");
});
els.autoRefresh.addEventListener("change", setupAutoRefresh);
els.testBtn.addEventListener("click", async () => {
  try {
    await testConnection();
  } catch (error) {
    setConnection("bad", "Offline");
    showNotice(error.message);
  }
});
els.workflowSearch.addEventListener("input", renderWorkflows);
els.statusFilter.addEventListener("change", renderWorkflows);
els.priorityFilter.addEventListener("change", renderWorkflows);

applyTheme(localStorage.getItem("flowdesk-theme") || "day");

loadConfig()
  .then(refreshData)
  .then(setupAutoRefresh)
  .catch(error => {
    setConnection("bad", "Setup needed");
    showNotice(error.message);
  });
