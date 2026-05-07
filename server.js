const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const CONFIG_PATH = path.join(ROOT, "n8n-config.json");
const META_PATH = path.join(ROOT, "workflow-meta.json");
const IS_VERCEL = Boolean(process.env.VERCEL);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function readConfig() {
  const envConfig = {
    baseUrl: cleanBaseUrl(process.env.N8N_BASE_URL || ""),
    apiKey: process.env.N8N_API_KEY || ""
  };

  if (IS_VERCEL) return envConfig;
  if (!fs.existsSync(CONFIG_PATH)) return envConfig;

  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return {
      baseUrl: envConfig.baseUrl || cleanBaseUrl(saved.baseUrl || ""),
      apiKey: envConfig.apiKey || saved.apiKey || ""
    };
  } catch {
    return envConfig;
  }
}

function writeConfig(nextConfig) {
  const current = readConfig();
  const clean = {
    baseUrl: cleanBaseUrl(nextConfig.baseUrl || current.baseUrl || ""),
    apiKey: String(nextConfig.apiKey || current.apiKey || "")
  };
  if (IS_VERCEL) return clean;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(clean, null, 2));
  return clean;
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

function readMeta() {
  if (IS_VERCEL) return { workflows: {}, issues: {} };
  if (!fs.existsSync(META_PATH)) return { workflows: {}, issues: {} };
  try {
    const saved = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
    return {
      workflows: saved.workflows || {},
      issues: saved.issues || {}
    };
  } catch {
    return { workflows: {}, issues: {} };
  }
}

function writeMeta(nextMeta) {
  const clean = {
    workflows: nextMeta.workflows || {},
    issues: nextMeta.issues || {}
  };
  if (IS_VERCEL) return clean;
  fs.writeFileSync(META_PATH, JSON.stringify(clean, null, 2));
  return clean;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

async function n8nRequest(endpoint, search = "") {
  const config = readConfig();
  if (!config.baseUrl || !config.apiKey) {
    const error = new Error("n8n connection is not configured.");
    error.status = 400;
    throw error;
  }

  const url = `${config.baseUrl}/api/v1${endpoint}${search}`;
  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "ngrok-skip-browser-warning": "true",
      "X-N8N-API-KEY": config.apiKey
    }
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `n8n returned ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function maskKey(apiKey) {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "configured";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/config") {
      const config = readConfig();
      return sendJson(res, 200, {
        configured: Boolean(config.baseUrl && config.apiKey),
        baseUrl: config.baseUrl,
        apiKeyMasked: maskKey(config.apiKey)
      });
    }

    if (req.method === "POST" && url.pathname === "/api/config") {
      const body = await parseBody(req);
      const saved = writeConfig(body);
      return sendJson(res, 200, {
        configured: Boolean(saved.baseUrl && saved.apiKey),
        baseUrl: saved.baseUrl,
        apiKeyMasked: maskKey(saved.apiKey)
      });
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      const started = Date.now();
      const data = await n8nRequest("/workflows", "?limit=1");
      return sendJson(res, 200, {
        ok: true,
        latencyMs: Date.now() - started,
        reachable: true,
        sampleCount: Array.isArray(data.data) ? data.data.length : 0
      });
    }

    if (req.method === "GET" && url.pathname === "/api/workflows") {
      const data = await n8nRequest("/workflows", url.search || "");
      return sendJson(res, 200, data);
    }

    if (req.method === "GET" && url.pathname === "/api/executions") {
      const data = await n8nRequest("/executions", url.search || "");
      return sendJson(res, 200, data);
    }

    if (req.method === "GET" && url.pathname === "/api/meta") {
      return sendJson(res, 200, readMeta());
    }

    if (req.method === "POST" && url.pathname === "/api/meta/workflow") {
      const body = await parseBody(req);
      const workflowId = String(body.workflowId || "");
      if (!workflowId) return sendJson(res, 400, { error: "workflowId is required." });
      const meta = readMeta();
      meta.workflows[workflowId] = {
        ...(meta.workflows[workflowId] || {}),
        client: String(body.client || ""),
        project: String(body.project || ""),
        category: String(body.category || ""),
        priority: String(body.priority || "normal"),
        monthlyValue: String(body.monthlyValue || ""),
        owner: String(body.owner || ""),
        notes: String(body.notes || ""),
        updatedAt: new Date().toISOString()
      };
      return sendJson(res, 200, writeMeta(meta));
    }

    if (req.method === "POST" && url.pathname === "/api/meta/issue") {
      const body = await parseBody(req);
      const issueId = String(body.issueId || "");
      if (!issueId) return sendJson(res, 400, { error: "issueId is required." });
      const meta = readMeta();
      meta.issues[issueId] = {
        ...(meta.issues[issueId] || {}),
        status: String(body.status || "open"),
        note: String(body.note || ""),
        updatedAt: new Date().toISOString()
      };
      return sendJson(res, 200, writeMeta(meta));
    }

    if (req.method === "GET" && url.pathname === "/api/export/workflows.csv") {
      const workflows = await n8nRequest("/workflows", "?limit=250");
      const meta = readMeta();
      const rows = [["ID", "Name", "Active", "Client", "Project", "Category", "Priority", "Monthly Value", "Updated"]];
      for (const workflow of workflows.data || []) {
        const itemMeta = meta.workflows[String(workflow.id)] || {};
        rows.push([
          workflow.id,
          workflow.name,
          workflow.active ? "Active" : "Inactive",
          itemMeta.client || "",
          itemMeta.project || "",
          itemMeta.category || "",
          itemMeta.priority || "",
          itemMeta.monthlyValue || "",
          workflow.updatedAt || ""
        ]);
      }
      const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"n8n-workflows.csv\""
      });
      return res.end(csv);
    }

    return sendJson(res, 404, { error: "API route not found." });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: error.message,
      details: error.payload || null
    });
  }
}

function serveStatic(req, res, url) {
  let filePath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absolute = path.join(PUBLIC_DIR, filePath);

  if (!absolute.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(absolute, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(absolute);
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, res, url);
  }
  return serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`n8n Command Center running at http://localhost:${PORT}`);
});
