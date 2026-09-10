const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createDatabase } = require("./db/database");
const { analyzeProblem, runDecisionTask, getAiHealth } = require("./ai");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const PROTOTYPE_ROOT = path.resolve(__dirname, "prototype");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("请求内容过长。");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    const error = new Error("请求格式不正确。");
    error.statusCode = 400;
    throw error;
  }
}

async function serveStatic(request, response, url) {
  const requestedPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(PROTOTYPE_ROOT, requestedPath);
  if (!filePath.startsWith(`${PROTOTYPE_ROOT}${path.sep}`) && filePath !== path.join(PROTOTYPE_ROOT, "index.html")) {
    response.writeHead(403);
    return response.end("Forbidden");
  }
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-cache" });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500);
    response.end(error.code === "ENOENT" ? "Not found" : "Server error");
  }
}

function createServer(options = {}) {
  const database = options.database || createDatabase();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        const ai = getAiHealth();
        return sendJson(response, 200, { status: "ok", database: "sqlite", aiConfigured: ai.configured, provider: ai.provider, model: ai.model });
      }

      if (request.method === "POST" && url.pathname === "/api/analyze") {
        const body = await readJson(request);
        const problem = typeof body.problem === "string" ? body.problem.trim() : "";
        if (problem.length < 10 || problem.length > 5000) {
          return sendJson(response, 400, { code: "INVALID_PROBLEM", message: "请用 10 到 5000 个字描述问题。" });
        }
        const startedAt = Date.now();
        const health = getAiHealth();
        try {
          const result = await analyzeProblem(problem);
          database.logAiRun(null, "analyze", { provider: result.provider, model: result.model, status: "success", durationMs: Date.now() - startedAt });
          return sendJson(response, 200, { provider: result.provider, model: result.model, analysis: result.result, responseId: result.responseId, usage: result.usage });
        } catch (error) {
          database.logAiRun(null, "analyze", { provider: health.provider, model: health.model, status: "failed", durationMs: Date.now() - startedAt, errorCode: error.code || "AI_REQUEST_FAILED" });
          console.error("AI analyze failed:", error.message);
          const status = error.code === "AI_NOT_CONFIGURED" ? 503 : 502;
          return sendJson(response, status, { code: error.code || "AI_REQUEST_FAILED", message: "AI 暂时不可用，请稍后重试。" });
        }
      }

      if (request.method === "GET" && url.pathname === "/api/decisions") {
        return sendJson(response, 200, { decisions: database.listDecisions() });
      }

      if (request.method === "POST" && url.pathname === "/api/decisions") {
        const body = await readJson(request);
        return sendJson(response, 201, { decision: database.createDecision(body) });
      }

      const decisionMatch = url.pathname.match(/^\/api\/decisions\/([^/]+)$/);
      if (request.method === "GET" && decisionMatch) {
        const decision = database.getDecision(decodeURIComponent(decisionMatch[1]));
        if (!decision) return sendJson(response, 404, { code: "NOT_FOUND", message: "没有找到这个决策。" });
        return sendJson(response, 200, { decision });
      }

      const eventMatch = url.pathname.match(/^\/api\/decisions\/([^/]+)\/events$/);
      if (request.method === "POST" && eventMatch) {
        const body = await readJson(request);
        const decision = database.addEvent(decodeURIComponent(eventMatch[1]), body);
        if (!decision) return sendJson(response, 404, { code: "NOT_FOUND", message: "没有找到这个决策。" });
        return sendJson(response, 200, { decision });
      }

      const aiTaskMatch = url.pathname.match(/^\/api\/decisions\/([^/]+)\/ai\/(diagnose|propose|validate|objection)$/);
      if (request.method === "POST" && aiTaskMatch) {
        const decisionId = decodeURIComponent(aiTaskMatch[1]);
        const task = aiTaskMatch[2];
        const snapshot = database.getDecision(decisionId);
        if (!snapshot) return sendJson(response, 404, { code: "NOT_FOUND", message: "没有找到这个决策。" });
        const allowedStages = {
          diagnose: ["collect"],
          propose: ["conflict", "clarify", "proposals"],
          validate: ["proposals"],
          objection: ["review"],
        };
        if (!allowedStages[task].includes(snapshot.currentStage)) {
          return sendJson(response, 409, { code: "STAGE_NOT_READY", message: "当前进度还不能进行这项 AI 分析。" });
        }
        if (task === "diagnose" && snapshot.participants.some((item) => item.submissionStatus !== "confirmed")) {
          return sendJson(response, 409, { code: "PARTICIPANTS_PENDING", message: "还有参与者尚未确认观点。" });
        }
        if (task === "propose" && !snapshot.artifacts.some((item) => item.type === "diagnosis")) {
          return sendJson(response, 409, { code: "DIAGNOSIS_REQUIRED", message: "请先完成需求和分歧梳理。" });
        }
        if (task === "validate" && !snapshot.artifacts.some((item) => item.type === "proposals")) {
          return sendJson(response, 409, { code: "PROPOSALS_REQUIRED", message: "请先生成候选方案。" });
        }
        if (task === "objection" && !snapshot.artifacts.some((item) => item.type === "objection")) {
          return sendJson(response, 409, { code: "OBJECTION_REQUIRED", message: "请先提交需要处理的异议。" });
        }
        const health = getAiHealth();
        const startedAt = Date.now();
        try {
          const result = await runDecisionTask(task, snapshot);
          const artifactType = task === "diagnose" ? "diagnosis" : task === "propose" ? "proposals" : task === "validate" ? "validation" : "objection_analysis";
          database.saveArtifact(decisionId, artifactType, result.result, "draft");
          const stage = task === "diagnose" ? "triage" : task === "propose" || task === "validate" ? "proposals" : "review";
          database.addEvent(decisionId, { type: "stage_changed", actor: "Resolve", payload: { stage } });
          database.logAiRun(decisionId, task, { provider: result.provider, model: result.model, status: "success", durationMs: Date.now() - startedAt });
          return sendJson(response, 200, { result: result.result, decision: database.getDecision(decisionId), usage: result.usage });
        } catch (error) {
          database.logAiRun(decisionId, task, { provider: health.provider, model: health.model, status: "failed", durationMs: Date.now() - startedAt, errorCode: error.code || "AI_REQUEST_FAILED" });
          console.error(`AI ${task} failed:`, error.message);
          const status = error.code === "AI_NOT_CONFIGURED" ? 503 : 502;
          return sendJson(response, status, { code: error.code || "AI_REQUEST_FAILED", message: "AI 暂时不可用，你的内容已经保存。" });
        }
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD, POST" });
        return response.end("Method not allowed");
      }
      return serveStatic(request, response, url);
    } catch (error) {
      const expected = ["请先", "请选择", "请说明", "当前进度", "还有参与者", "还有一条异议", "没有找到", "不支持", "未知的", "这个方案", "所选方案", "新的异议", "最终决定", "只有"].some((prefix) => error.message.startsWith(prefix));
      if (!expected) console.error("Request failed:", error.message);
      return sendJson(response, error.statusCode || (expected ? 409 : 500), { code: "REQUEST_FAILED", message: error.statusCode === 400 || expected ? error.message : "暂时无法完成操作，请稍后重试。" });
    }
  });
  server.database = database;
  return server;
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    const ai = getAiHealth();
    console.log(`Resolve running at http://${HOST}:${PORT}`);
    console.log(`Storage: SQLite (${server.database.path})`);
    console.log(`AI: ${ai.configured ? `${ai.provider}/${ai.model}` : "not configured"}`);
  });
}

module.exports = { createServer };
