const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { createDatabase } = require("../db/database");
const { createServer } = require("../server");

const requestedLimit = Number(process.argv.find((item) => item.startsWith("--limit="))?.split("=")[1] || 3);
const requestedCaseIds = new Set(
  (process.argv.find((item) => item.startsWith("--cases="))?.split("=")[1] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `接口返回 ${response.status}`);
  return payload;
}

async function post(baseUrl, pathname, body) {
  return request(baseUrl, pathname, { method: "POST", body: JSON.stringify(body) });
}

function latestArtifact(decision, type) {
  return [...decision.artifacts].reverse().find((item) => item.type === type)?.payload || null;
}

function evaluate(item, analysis, diagnosis, proposals, validation, finalDecision) {
  const serialized = JSON.stringify({ analysis, diagnosis, proposals, validation }).toLowerCase();
  const proposalTitles = proposals.proposals.map((proposal) => proposal.title.trim()).filter(Boolean);
  const checks = {
    completed: finalDecision.status === "complete" && finalDecision.currentStage === "final",
    participants: analysis.participants.length >= 2,
    conflictsAndQuestions: diagnosis.conflicts.length >= 1 && diagnosis.questions.length >= 1 && diagnosis.questions.length <= 3,
    proposalCount: proposals.proposals.length >= 2 && proposals.proposals.length <= 3,
    distinctProposals: new Set(proposalTitles).size === proposalTitles.length,
    selectableProposal: validation.results.some((result) => ["pass", "human_tradeoff"].includes(result.status)),
    keywordGroups: item.keyword_groups.every((group) => group.some((keyword) => serialized.includes(keyword.toLowerCase()))),
    humanBoundary: /人|负责人|最终判断|最终决定/.test(analysis.boundaryNote),
    finalRecord: Boolean(latestArtifact(finalDecision, "final_record")?.humanDecisionNote),
  };
  return { checks, passed: Object.values(checks).every(Boolean), score: Object.values(checks).filter(Boolean).length / Object.keys(checks).length };
}

async function runCase(baseUrl, item) {
  const startedAt = Date.now();
  const usages = [];
  const analyze = await post(baseUrl, "/api/analyze", { problem: item.input });
  usages.push(analyze.usage);
  let decision = (await post(baseUrl, "/api/decisions", {
    sourceText: item.input,
    ownerName: "产品负责人",
    analysis: analyze.analysis,
    participants: analyze.analysis.participants,
  })).decision;

  for (const participant of decision.participants) {
    decision = (await post(baseUrl, `/api/decisions/${decision.id}/events`, {
      type: "participant_confirmed",
      actor: participant.name,
      payload: { participantId: participant.id, text: `${participant.name}确认：${item.confirmed_facts || item.clarification}` },
    })).decision;
  }

  const diagnose = await post(baseUrl, `/api/decisions/${decision.id}/ai/diagnose`, {});
  usages.push(diagnose.usage);
  decision = diagnose.decision;
  decision = (await post(baseUrl, `/api/decisions/${decision.id}/events`, {
    type: "triage_decided",
    actor: decision.ownerName,
    payload: { outcome: "proceed", note: "继续比较可执行方案。" },
  })).decision;

  const questions = latestArtifact(decision, "diagnosis").questions;
  decision = (await post(baseUrl, `/api/decisions/${decision.id}/events`, {
    type: "clarification_answered",
    actor: decision.ownerName,
    payload: { answers: questions.map((question) => ({ questionId: question.id, answer: item.clarification })) },
  })).decision;

  let propose = await post(baseUrl, `/api/decisions/${decision.id}/ai/propose`, {});
  usages.push(propose.usage);
  decision = propose.decision;
  let validate = await post(baseUrl, `/api/decisions/${decision.id}/ai/validate`, {});
  usages.push(validate.usage);
  decision = validate.decision;

  let validation = latestArtifact(decision, "validation");
  let selectedResult = validation.results.find((result) => result.status === "pass")
    || validation.results.find((result) => result.status === "human_tradeoff");
  if (!selectedResult && item.recheck_clarification) {
    decision = (await post(baseUrl, `/api/decisions/${decision.id}/events`, {
      type: "stage_changed",
      actor: "Resolve",
      payload: { stage: "conflict" },
    })).decision;
    decision = (await post(baseUrl, `/api/decisions/${decision.id}/events`, {
      type: "clarification_answered",
      actor: decision.ownerName,
      payload: { answers: questions.map((question) => ({ questionId: question.id, answer: item.recheck_clarification })) },
    })).decision;
    propose = await post(baseUrl, `/api/decisions/${decision.id}/ai/propose`, {});
    usages.push(propose.usage);
    decision = propose.decision;
    validate = await post(baseUrl, `/api/decisions/${decision.id}/ai/validate`, {});
    usages.push(validate.usage);
    decision = validate.decision;
    validation = latestArtifact(decision, "validation");
    selectedResult = validation.results.find((result) => result.status === "pass")
      || validation.results.find((result) => result.status === "human_tradeoff");
  }
  if (!selectedResult) {
    const inputTokens = usages.reduce((sum, usage) => sum + Number(usage?.inputTokens || 0), 0);
    const outputTokens = usages.reduce((sum, usage) => sum + Number(usage?.outputTokens || 0), 0);
    return {
      id: item.id,
      title: item.title,
      latencyMs: Date.now() - startedAt,
      usage: { inputTokens, outputTokens },
      passed: false,
      score: 0,
      stoppedAt: "validation",
      stopReason: "没有方案通过独立检查，流程按产品规则停止。",
      validation: validation.results,
    };
  }
  decision = (await post(baseUrl, `/api/decisions/${decision.id}/events`, {
    type: "proposal_selected",
    actor: decision.ownerName,
    payload: { proposalId: selectedResult.proposalId },
  })).decision;

  for (const participant of decision.participants) {
    decision = (await post(baseUrl, `/api/decisions/${decision.id}/events`, {
      type: "review_submitted",
      actor: participant.name,
      payload: { participantId: participant.id, status: "accept", note: "已阅读方案及剩余风险。" },
    })).decision;
  }

  const proposals = latestArtifact(decision, "proposals");
  const selected = proposals.proposals.find((proposal) => proposal.id === selectedResult.proposalId);
  const rejected = proposals.proposals.filter((proposal) => proposal.id !== selectedResult.proposalId);
  const analysisConstraints = analyze.analysis.constraints.map((constraint) => constraint.statement);
  const record = {
    decision: selected.title,
    why: selected.summary,
    satisfied: analysisConstraints.length ? analysisConstraints : [analyze.analysis.goal],
    evidence: [latestArtifact(decision, "diagnosis").demandAssessment.evidenceStatus],
    sacrificed: selected.tradeoff,
    rejectedOptions: rejected.map((proposal) => `${proposal.title}：${proposal.tradeoff}`),
    risks: selected.risk,
    unresolvedObjections: [],
    acceptedRisks: [selected.risk],
    responsibilities: [`${decision.ownerName}：跟进执行和风险复核`],
    assumptions: selected.assumptions || [],
    reopen: "关键约束、证据或执行条件发生变化时",
    humanDecisionNote: "AI 提供结构化分析和方案检查，最终选择由决策负责人确认。",
  };
  decision = (await post(baseUrl, `/api/decisions/${decision.id}/events`, {
    type: "final_confirmed",
    actor: decision.ownerName,
    payload: { record, riskAcknowledged: true, humanAcknowledged: true },
  })).decision;

  const evaluation = evaluate(item, analyze.analysis, diagnose.result, propose.result, validate.result, decision);
  return {
    id: item.id,
    title: item.title,
    latencyMs: Date.now() - startedAt,
    usage: {
      inputTokens: usages.reduce((sum, usage) => sum + Number(usage?.inputTokens || 0), 0),
      outputTokens: usages.reduce((sum, usage) => sum + Number(usage?.outputTokens || 0), 0),
    },
    passed: evaluation.passed,
    score: Number(evaluation.score.toFixed(3)),
    checks: evaluation.checks,
    selectedProposalId: selectedResult.proposalId,
  };
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-flow-"));
  const database = createDatabase({ dbPath: path.join(tempRoot, "flow.sqlite") });
  const server = createServer({ database });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const health = await request(baseUrl, "/api/health");
    if (!health.aiConfigured) throw new Error("未配置模型密钥，已停止全流程评测。");
    const dataset = JSON.parse(await fs.readFile(path.join(__dirname, "resolvebench_flow.json"), "utf8"));
    const selectedCases = requestedCaseIds.size
      ? dataset.cases.filter((item) => requestedCaseIds.has(item.id))
      : dataset.cases.slice(0, Math.max(1, Math.min(requestedLimit, dataset.cases.length)));
    if (!selectedCases.length) throw new Error("没有找到指定的纵向评测案例。");
    const missingCaseIds = [...requestedCaseIds].filter((id) => !selectedCases.some((item) => item.id === id));
    if (missingCaseIds.length) throw new Error(`没有找到案例：${missingCaseIds.join("、")}`);
    const results = [];
    for (const item of selectedCases) {
      try {
        const result = await runCase(baseUrl, item);
        const suffix = result.stopReason ? ` · ${result.stopReason}` : "";
        process.stdout.write(`${item.id} ${result.passed ? "PASS" : "FAIL"} ${(result.score * 100).toFixed(0)}%${suffix}\n`);
        results.push(result);
      } catch (error) {
        process.stderr.write(`${item.id} ERROR ${error.message}\n`);
        results.push({ id: item.id, title: item.title, passed: false, score: 0, error: error.message });
      }
    }

    const inputPrice = Number(process.env.RESOLVE_INPUT_PRICE_CNY_PER_MILLION || 0);
    const outputPrice = Number(process.env.RESOLVE_OUTPUT_PRICE_CNY_PER_MILLION || 0);
    const inputTokens = results.reduce((sum, item) => sum + Number(item.usage?.inputTokens || 0), 0);
    const outputTokens = results.reduce((sum, item) => sum + Number(item.usage?.outputTokens || 0), 0);
    const report = {
      datasetVersion: dataset.version,
      generatedAt: new Date().toISOString(),
      provider: health.provider,
      model: health.model,
      summary: {
        total: results.length,
        passed: results.filter((item) => item.passed).length,
        passRate: Number((results.filter((item) => item.passed).length / results.length).toFixed(3)),
        averageLatencyMs: Math.round(results.reduce((sum, item) => sum + Number(item.latencyMs || 0), 0) / results.length),
        inputTokens,
        outputTokens,
        estimatedCostCny: inputPrice || outputPrice ? Number(((inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000).toFixed(4)) : null,
      },
      results,
    };
    const resultsDirectory = path.join(__dirname, "results");
    await fs.mkdir(resultsDirectory, { recursive: true });
    const outputPath = path.join(resultsDirectory, `flow-${report.generatedAt.replaceAll(":", "-")}.json`);
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`报告已保存：${outputPath}\n通过率：${(report.summary.passRate * 100).toFixed(0)}%\n`);
    if (report.summary.passed !== report.summary.total) process.exitCode = 1;
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    database.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
