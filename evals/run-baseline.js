const fs = require("node:fs/promises");
const path = require("node:path");
const { analyzeProblem, getAiHealth } = require("../ai");

const requestedLimit = Number(process.argv.find((item) => item.startsWith("--limit="))?.split("=")[1] || 5);
const requestedCaseIds = new Set(
  (process.argv.find((item) => item.startsWith("--cases="))?.split("=")[1] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const provider = (process.env.AI_PROVIDER || "dashscope").toLowerCase();
const apiKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.DASHSCOPE_API_KEY;
const baseUrl = provider === "openai"
  ? process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
  : process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const model = provider === "openai"
  ? process.env.OPENAI_MODEL || "gpt-5.6-terra"
  : process.env.DASHSCOPE_MODEL || "qwen3.7-plus-2026-05-26";

const directSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    recommendation: { type: "string" },
    participants: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
    conflicts: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
    constraints: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          statement: { type: "string" },
          type: { type: "string", enum: ["hard", "soft", "assumption"] },
          evidence_needed: { type: "boolean" },
        },
        required: ["statement", "type", "evidence_needed"],
      },
    },
    information_gaps: { type: "array", maxItems: 4, items: { type: "string" } },
    next_step: { type: "string", enum: ["act_on_recommendation", "collect_evidence", "reframe_decision"] },
  },
  required: ["summary", "recommendation", "participants", "conflicts", "constraints", "information_gaps", "next_step"],
};

function extractText(payload) {
  if (provider !== "openai") return payload?.choices?.[0]?.message?.content || "";
  for (const item of payload.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) if (content.type === "output_text") return content.text;
  }
  return "";
}

async function callDirect(input) {
  if (!apiKey) throw new Error("未配置模型密钥，已停止基线评测。");
  const endpoint = provider === "openai"
    ? `${baseUrl.replace(/\/$/, "")}/responses`
    : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const instructions = [
    "你是一个通用 AI 助手。用户希望你根据当前描述，一次性给出最合适的行动建议。",
    "不要要求进入专门工作流；在一条回复中完成理解和建议。",
    "同时如实列出你注意到的参与者、冲突、限制和信息缺口，不要编造输入中没有的数据。",
  ].join("\n");
  const body = provider === "openai"
    ? {
        model,
        store: false,
        reasoning: { effort: "low" },
        instructions,
        input,
        max_output_tokens: 2400,
        text: { format: { type: "json_schema", name: "direct_recommendation", strict: true, schema: directSchema } },
      }
    : {
        model,
        messages: [{ role: "system", content: instructions }, { role: "user", content: input }],
        response_format: { type: "json_schema", json_schema: { name: "direct_recommendation", strict: true, schema: directSchema } },
        enable_thinking: false,
        temperature: 0.15,
        max_tokens: 2400,
      };
  const startedAt = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `模型服务返回 ${response.status}`);
  const result = JSON.parse(extractText(payload));
  const usage = payload.usage || {};
  return {
    result,
    latencyMs: Date.now() - startedAt,
    usage: {
      inputTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
      outputTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
    },
  };
}

function includesKeywordGroup(serialized, group) {
  return group.some((keyword) => serialized.includes(keyword.toLowerCase()));
}

function evaluate(item, result, group) {
  const expect = item.expect;
  const serialized = JSON.stringify(result).toLowerCase();
  const constraints = result.constraints || [];
  const nextStep = group === "direct" ? result.next_step : result.recommendedNextStep;
  const boundaryText = group === "direct"
    ? `${result.summary || ""} ${result.recommendation || ""}`
    : result.boundaryNote || "";
  const checks = {
    participants: (result.participants || []).length >= expect.min_participants,
    conflicts: (result.conflicts || []).length >= expect.min_conflicts,
    informationGaps: (result.information_gaps || result.informationGaps || []).length >= expect.min_information_gaps,
    constraintTypes: expect.constraint_types_any.every((type) => constraints.some((constraint) => constraint.type === type)),
    keywordGroups: expect.keyword_groups.every((keywords) => includesKeywordGroup(serialized, keywords)),
    nextStep: !expect.next_steps_any || expect.next_steps_any.includes(nextStep),
    humanBoundary: /人工|人类|负责人|最终决定|最终判断|确认/.test(boundaryText),
  };
  const passedCount = Object.values(checks).filter(Boolean).length;
  return { checks, score: Number((passedCount / Object.keys(checks).length).toFixed(3)) };
}

function summarize(results, group) {
  const rows = results.map((item) => item[group]).filter(Boolean);
  const inputTokens = rows.reduce((sum, row) => sum + row.usage.inputTokens, 0);
  const outputTokens = rows.reduce((sum, row) => sum + row.usage.outputTokens, 0);
  const inputPrice = Number(process.env.RESOLVE_INPUT_PRICE_CNY_PER_MILLION || 0);
  const outputPrice = Number(process.env.RESOLVE_OUTPUT_PRICE_CNY_PER_MILLION || 0);
  return {
    cases: rows.length,
    averageScore: Number((rows.reduce((sum, row) => sum + row.evaluation.score, 0) / Math.max(rows.length, 1)).toFixed(3)),
    averageLatencyMs: Math.round(rows.reduce((sum, row) => sum + row.latencyMs, 0) / Math.max(rows.length, 1)),
    inputTokens,
    outputTokens,
    estimatedCostCny: inputPrice || outputPrice
      ? Number(((inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000).toFixed(4))
      : null,
  };
}

async function main() {
  const health = getAiHealth();
  if (!health.configured) throw new Error("未配置模型密钥，已停止基线评测。");
  const dataset = JSON.parse(await fs.readFile(path.join(__dirname, "resolvebench_smoke.json"), "utf8"));
  const cases = requestedCaseIds.size
    ? dataset.cases.filter((item) => requestedCaseIds.has(item.id))
    : dataset.cases.slice(0, Math.max(1, Math.min(requestedLimit, dataset.cases.length)));
  if (!cases.length) throw new Error("没有找到指定的基线评测案例。");
  const missingCaseIds = [...requestedCaseIds].filter((id) => !cases.some((item) => item.id === id));
  if (missingCaseIds.length) throw new Error(`没有找到案例：${missingCaseIds.join("、")}`);
  const results = [];
  for (const item of cases) {
    try {
      const direct = await callDirect(item.input);
      const resolveStartedAt = Date.now();
      const resolveResponse = await analyzeProblem(item.input);
      const resolveRun = {
        result: resolveResponse.result,
        latencyMs: Date.now() - resolveStartedAt,
        usage: resolveResponse.usage,
      };
      const row = {
        id: item.id,
        title: item.title,
        direct: { ...direct, evaluation: evaluate(item, direct.result, "direct") },
        resolve: { ...resolveRun, evaluation: evaluate(item, resolveRun.result, "resolve") },
      };
      results.push(row);
      process.stdout.write(`${item.id} 一次性 ${(row.direct.evaluation.score * 100).toFixed(0)}% · Resolve ${(row.resolve.evaluation.score * 100).toFixed(0)}%\n`);
    } catch (error) {
      process.stderr.write(`${item.id} ERROR ${error.message}\n`);
      results.push({ id: item.id, title: item.title, error: error.message });
    }
  }
  const report = {
    datasetVersion: dataset.version,
    generatedAt: new Date().toISOString(),
    provider: health.provider,
    model: health.model,
    scope: "一次性建议与 Resolve 结构化入口的早期切片对照，不代表完整工作流因果实验。",
    summary: { direct: summarize(results, "direct"), resolve: summarize(results, "resolve") },
    results,
  };
  const resultsDirectory = path.join(__dirname, "results");
  await fs.mkdir(resultsDirectory, { recursive: true });
  const outputPath = path.join(resultsDirectory, `baseline-${report.generatedAt.replaceAll(":", "-")}.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`报告已保存：${outputPath}\n一次性平均 ${(report.summary.direct.averageScore * 100).toFixed(0)}% · Resolve 平均 ${(report.summary.resolve.averageScore * 100).toFixed(0)}%\n`);
  if (results.some((item) => item.error)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
