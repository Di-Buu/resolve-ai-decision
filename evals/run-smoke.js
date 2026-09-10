const fs = require("node:fs/promises");
const path = require("node:path");

const BASE_URL = process.env.RESOLVE_BASE_URL || "http://127.0.0.1:4173";
const requestedLimit = Number(process.argv.find((item) => item.startsWith("--limit="))?.split("=")[1] || 10);
const requestedDataset = process.argv.find((item) => item.startsWith("--dataset="))?.split("=").slice(1).join("=") || "resolvebench_smoke.json";

function evaluate(analysis, expected) {
  const serialized = JSON.stringify(analysis).toLowerCase();
  const checks = {
    participants: analysis.participants.length >= expected.min_participants,
    conflicts: analysis.conflicts.length >= expected.min_conflicts,
    informationGaps: analysis.informationGaps.length >= expected.min_information_gaps,
    constraintTypes: expected.constraint_types_any.some((type) =>
      analysis.constraints.some((constraint) => constraint.type === type)),
    keywordGroups: expected.keyword_groups.every((group) =>
      group.some((keyword) => serialized.includes(keyword.toLowerCase()))),
    humanBoundary: /人|负责人|最终判断|最终决定/.test(analysis.boundaryNote),
  };

  if (expected.next_steps_any) {
    checks.nextStep = expected.next_steps_any.includes(analysis.recommendedNextStep);
  }

  return {
    checks,
    passed: Object.values(checks).every(Boolean),
    score: Object.values(checks).filter(Boolean).length / Object.keys(checks).length,
  };
}

async function main() {
  const healthResponse = await fetch(`${BASE_URL}/api/health`);
  if (!healthResponse.ok) throw new Error(`Resolve 服务不可用：${healthResponse.status}`);
  const health = await healthResponse.json();
  if (!health.aiConfigured) {
    const keyName = health.provider === "openai" ? "OPENAI_API_KEY" : "DASHSCOPE_API_KEY";
    throw new Error(`未配置 ${keyName}，已停止评测，避免把演示数据记录为模型结果。`);
  }

  const datasetPath = path.resolve(__dirname, requestedDataset);
  if (!datasetPath.startsWith(`${path.resolve(__dirname)}${path.sep}`)) {
    throw new Error("评测数据集必须位于 evals 目录内。");
  }
  const dataset = JSON.parse(await fs.readFile(datasetPath, "utf8"));
  const cases = dataset.cases.slice(0, Math.max(1, Math.min(requestedLimit, dataset.cases.length)));
  const results = [];

  for (const item of cases) {
    const startedAt = Date.now();
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem: item.input }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${item.id} 调用失败：${payload.message || response.status}`);

    const evaluation = evaluate(payload.analysis, item.expect);
    results.push({
      id: item.id,
      title: item.title,
      model: payload.model,
      responseId: payload.responseId,
      latencyMs: Date.now() - startedAt,
      usage: payload.usage,
      passed: evaluation.passed,
      score: Number(evaluation.score.toFixed(3)),
      checks: evaluation.checks,
      analysis: payload.analysis,
    });
    console.log(`${item.id} ${evaluation.passed ? "PASS" : "FAIL"} ${(evaluation.score * 100).toFixed(0)}%`);
  }

  const inputPrice = Number(process.env.RESOLVE_INPUT_PRICE_CNY_PER_MILLION || 0);
  const outputPrice = Number(process.env.RESOLVE_OUTPUT_PRICE_CNY_PER_MILLION || 0);
  const inputTokens = results.reduce((sum, item) => sum + Number(item.usage?.inputTokens || 0), 0);
  const outputTokens = results.reduce((sum, item) => sum + Number(item.usage?.outputTokens || 0), 0);
  const report = {
    datasetVersion: dataset.version,
    datasetFile: path.basename(datasetPath),
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    model: health.model,
    provider: health.provider,
    summary: {
      total: results.length,
      passed: results.filter((item) => item.passed).length,
      passRate: Number((results.filter((item) => item.passed).length / results.length).toFixed(3)),
      averageLatencyMs: Math.round(results.reduce((sum, item) => sum + item.latencyMs, 0) / results.length),
      inputTokens,
      outputTokens,
      estimatedCostCny: inputPrice || outputPrice ? Number(((inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000).toFixed(4)) : null,
    },
    results,
  };

  const resultsDirectory = path.join(__dirname, "results");
  await fs.mkdir(resultsDirectory, { recursive: true });
  const timestamp = report.generatedAt.replaceAll(":", "-");
  const reportPrefix = path.basename(datasetPath, path.extname(datasetPath)).replace(/^resolvebench_/, "");
  const outputPath = path.join(resultsDirectory, `${reportPrefix}-${timestamp}.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`报告已保存：${outputPath}`);
  console.log(`通过率：${(report.summary.passRate * 100).toFixed(0)}%`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
