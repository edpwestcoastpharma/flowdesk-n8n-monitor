const config = {
  baseUrl: cleanBaseUrl(process.env.N8N_BASE_URL || ""),
  apiKey: process.env.N8N_API_KEY || ""
};

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

function maskKey(apiKey) {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "configured";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function sendJson(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(data));
}

async function n8nRequest(endpoint, query = "") {
  if (!config.baseUrl || !config.apiKey) {
    const error = new Error("N8N_BASE_URL and N8N_API_KEY are not configured in Vercel.");
    error.status = 400;
    throw error;
  }

  const response = await fetch(`${config.baseUrl}/api/v1${endpoint}${query}`, {
    headers: {
      accept: "application/json",
      "ngrok-skip-browser-warning": "true",
      "X-N8N-API-KEY": config.apiKey
    }
  });

  const text = await response.text();
  let payload = {};
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

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function resolveRoute(req, parsedUrl) {
  const queryRoute = req.query?.route;
  if (Array.isArray(queryRoute) && queryRoute.length) {
    return queryRoute.join("/").replace(/^\/+|\/+$/g, "");
  }
  if (typeof queryRoute === "string" && queryRoute) {
    return queryRoute.replace(/^\/+|\/+$/g, "");
  }

  const urlRoute = parsedUrl.pathname.replace(/^\/api\/?/, "").replace(/^\/+|\/+$/g, "");
  if (urlRoute && urlRoute !== "[...route]") return urlRoute;

  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  const apiIndex = pathParts.indexOf("api");
  if (apiIndex >= 0 && pathParts.length > apiIndex + 1) {
    return pathParts.slice(apiIndex + 1).join("/");
  }

  return "";
}

export default async function handler(req, res) {
  const parsedUrl = new URL(req.url, `https://${req.headers.host || "flowdesk.local"}`);
  const route = resolveRoute(req, parsedUrl);
  const searchParams = parsedUrl.searchParams;
  searchParams.delete("route");
  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";

  try {
    if (req.method === "GET" && route === "config") {
      return sendJson(res, 200, {
        configured: Boolean(config.baseUrl && config.apiKey),
        baseUrl: config.baseUrl,
        apiKeyMasked: maskKey(config.apiKey)
      });
    }

    if (req.method === "POST" && route === "config") {
      return sendJson(res, 200, {
        configured: Boolean(config.baseUrl && config.apiKey),
        baseUrl: config.baseUrl,
        apiKeyMasked: maskKey(config.apiKey),
        message: "On Vercel, update N8N_BASE_URL and N8N_API_KEY in Environment Variables."
      });
    }

    if (req.method === "GET" && route === "health") {
      const started = Date.now();
      const data = await n8nRequest("/workflows", "?limit=1");
      return sendJson(res, 200, {
        ok: true,
        latencyMs: Date.now() - started,
        reachable: true,
        sampleCount: Array.isArray(data.data) ? data.data.length : 0
      });
    }

    if (req.method === "GET" && route === "workflows") {
      return sendJson(res, 200, await n8nRequest("/workflows", query));
    }

    if (req.method === "GET" && route === "executions") {
      return sendJson(res, 200, await n8nRequest("/executions", query));
    }

    if (req.method === "GET" && route === "meta") {
      return sendJson(res, 200, { workflows: {}, issues: {} });
    }

    if (req.method === "POST" && (route === "meta/workflow" || route === "meta/issue")) {
      return sendJson(res, 200, {
        workflows: {},
        issues: {},
        message: "Metadata persistence needs a database on Vercel, such as Supabase."
      });
    }

    if (req.method === "GET" && route === "export/workflows.csv") {
      const workflows = await n8nRequest("/workflows", "?limit=250");
      const rows = [["ID", "Name", "Active", "Updated"]];
      for (const workflow of workflows.data || []) {
        rows.push([workflow.id, workflow.name, workflow.active ? "Active" : "Inactive", workflow.updatedAt || ""]);
      }
      const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
      res.status(200);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="n8n-workflows.csv"');
      return res.send(csv);
    }

    return sendJson(res, 404, {
      error: "API route not found.",
      route,
      path: parsedUrl.pathname
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: error.message,
      details: error.payload || null
    });
  }
}
