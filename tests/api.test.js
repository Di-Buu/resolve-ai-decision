const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { createDatabase } = require("../db/database");
const { createServer } = require("../server");

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function structuredViewpoint(text) {
  return {
    goal: text,
    position: "支持在已确认条件内继续推进。",
    underlyingNeed: "希望在价值、时间和风险之间做出可解释的取舍。",
    nonNegotiables: [],
    negotiables: ["具体实现范围可以讨论。"],
    evidence: [],
    assumptions: [],
    openQuestions: [],
  };
}

test("SQLite API supports creation, guardrails, events, and restart recovery", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-api-"));
  const dbPath = path.join(tempRoot, "resolve-test.sqlite");
  const database = createDatabase({ dbPath });
  const server = createServer({ database });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(() => {
    if (server.listening) server.close();
    try { database.close(); } catch {}
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const health = await request(baseUrl, "/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.payload.database, "sqlite");

  const list = await request(baseUrl, "/api/decisions");
  assert.equal(list.response.status, 200);
  assert.equal(list.payload.decisions[0].id, "sample-ai-refund");

  const sample = await request(baseUrl, "/api/decisions/sample-ai-refund");
  assert.equal(sample.response.status, 200);
  assert.ok(sample.payload.decision.artifacts.length >= 8);
  assert.equal(sample.payload.decision.participants.filter((item) => item.submissionStatus === "pending").length, 1);

  const prematureFinal = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "final_confirmed", payload: { record: { decision: "不能提前确认" } } }),
  });
  assert.equal(prematureFinal.response.status, 409);

  const ownerCannotMoveStage = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "stage_changed", actor: "产品负责人", payload: { stage: "triage" } }),
  });
  assert.equal(ownerCannotMoveStage.response.status, 409);

  const cannotSkipStages = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "stage_changed", actor: "Resolve", payload: { stage: "proposals" } }),
  });
  assert.equal(cannotSkipStages.response.status, 409);

  const productId = sample.payload.decision.participants.find((item) => item.name === "产品负责人").id;
  const engineeringId = sample.payload.decision.participants.find((item) => item.name === "研发负责人").id;
  const rawProductView = "希望活动前上线一版能减少客服压力的能力，但不能突破风险底线。";
  const missingStructuredView = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({
      type: "participant_confirmed",
      actor: "产品负责人",
      payload: { participantId: productId, originalText: rawProductView },
    }),
  });
  assert.equal(missingStructuredView.response.status, 409);

  const confirmed = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({
      type: "participant_confirmed",
      actor: "产品负责人",
      payload: { participantId: productId, originalText: rawProductView, structured: structuredViewpoint(rawProductView) },
    }),
  });
  assert.equal(confirmed.response.status, 200);
  assert.ok(confirmed.payload.decision.artifacts.some((item) => item.type === `viewpoint:${productId}`));
  assert.equal(confirmed.payload.decision.artifacts.findLast((item) => item.type === `viewpoint:${productId}`).payload.underlyingNeed, "希望在价值、时间和风险之间做出可解释的取舍。");

  const diagnoseWithoutBrief = await request(baseUrl, "/api/decisions/sample-ai-refund/ai/diagnose", {
    method: "POST",
    body: "{}",
  });
  assert.equal(diagnoseWithoutBrief.response.status, 409);
  assert.equal(diagnoseWithoutBrief.payload.code, "BRIEF_REQUIRED");

  const briefDraft = confirmed.payload.decision.artifacts.findLast((item) => item.type === "decision_brief").payload;
  const briefConfirmed = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "brief_confirmed", actor: "产品负责人", payload: { brief: briefDraft } }),
  });
  assert.equal(briefConfirmed.response.status, 200);
  assert.equal(briefConfirmed.payload.decision.artifacts.findLast((item) => item.type === "decision_brief").status, "confirmed");

  const triageStage = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "stage_changed", actor: "Resolve", payload: { stage: "triage" } }),
  });
  assert.equal(triageStage.response.status, 200);

  const needsEvidence = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "triage_decided", actor: "产品负责人", payload: { outcome: "need_evidence" } }),
  });
  assert.equal(needsEvidence.response.status, 200);
  assert.equal(needsEvidence.payload.decision.status, "needs_evidence");
  assert.equal(needsEvidence.payload.decision.currentStage, "conflict");

  const bypassEvidence = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "stage_changed", actor: "Resolve", payload: { stage: "proposals" } }),
  });
  assert.equal(bypassEvidence.response.status, 409);

  const deferWithoutReason = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "triage_decided", actor: "产品负责人", payload: { outcome: "defer" } }),
  });
  assert.equal(deferWithoutReason.response.status, 409);

  const deferred = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "triage_decided", actor: "产品负责人", payload: { outcome: "defer", note: "等待下周拿到完整数据。" } }),
  });
  assert.equal(deferred.response.status, 200);
  assert.equal(deferred.payload.decision.status, "deferred");
  assert.equal(deferred.payload.decision.currentStage, "triage");

  const resumed = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "triage_decided", actor: "产品负责人", payload: { outcome: "proceed" } }),
  });
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.payload.decision.status, "active");
  assert.equal(resumed.payload.decision.currentStage, "conflict");

  const proposalStage = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "stage_changed", actor: "Resolve", payload: { stage: "proposals" } }),
  });
  assert.equal(proposalStage.response.status, 200);

  const invalidSelection = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "proposal_selected", actor: "产品负责人", payload: { proposalId: "missing" } }),
  });
  assert.equal(invalidSelection.response.status, 409);

  const validSelection = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "proposal_selected", actor: "产品负责人", payload: { proposalId: "C" } }),
  });
  assert.equal(validSelection.response.status, 200);
  assert.equal(validSelection.payload.decision.currentStage, "review");

  const impersonatedReview = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({
      type: "review_submitted",
      actor: "产品负责人",
      payload: { participantId: engineeringId, status: "oppose", note: "研发评估的工期发生了变化。" },
    }),
  });
  assert.equal(impersonatedReview.response.status, 409);

  const reviewed = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({
      type: "review_submitted",
      actor: "研发负责人",
      payload: { participantId: engineeringId, status: "oppose", note: "风险分类工期发生了变化。" },
    }),
  });
  assert.equal(reviewed.response.status, 200);

  const objection = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "objection_submitted", actor: "研发负责人", payload: { text: "风险分类工期发生了变化。" } }),
  });
  assert.equal(objection.response.status, 200);

  const unresolvedFinal = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "final_confirmed", payload: { record: { decision: "低风险分阶段上线" } } }),
  });
  assert.equal(unresolvedFinal.response.status, 409);

  const processed = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({
      type: "objection_processed",
      actor: "Resolve",
      payload: { analysis: { summary: "只影响方案 B", affectedProposalIds: ["B"] } },
    }),
  });
  assert.equal(processed.response.status, 200);

  const objectionEvidence = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({
      type: "clarification_answered",
      actor: "研发负责人",
      payload: { answers: [{ questionId: "objection-evidence", answer: "研发拆分任务后确认至少需要三周。" }] },
    }),
  });
  assert.equal(objectionEvidence.response.status, 200);
  assert.equal(objectionEvidence.payload.decision.currentStage, "clarify");

  const returnToProposals = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "stage_changed", actor: "Resolve", payload: { stage: "proposals" } }),
  });
  assert.equal(returnToProposals.response.status, 200);

  const invalidatedSelection = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "proposal_selected", actor: "产品负责人", payload: { proposalId: "B" } }),
  });
  assert.equal(invalidatedSelection.response.status, 409);
  assert.equal(invalidatedSelection.payload.message, "新的信息已经让这个方案失效，请选择其他方案。");

  const keepSelection = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "proposal_selected", actor: "产品负责人", payload: { proposalId: "C" } }),
  });
  assert.equal(keepSelection.response.status, 200);
  assert.equal(keepSelection.payload.decision.currentStage, "review");

  const finalRecord = {
    decision: "低风险分阶段上线",
    why: "满足已确认的风险边界和上线目标。",
    satisfied: ["保留活动前上线目标"],
    evidence: ["500 元以上退款必须人工审核"],
    sacrificed: "首期不追求全自动",
    rejectedOptions: ["完整能力优先：无法按期上线"],
    risks: "需要保留人工回退",
    unresolvedObjections: ["研发工期顾虑已记录"],
    acceptedRisks: ["低风险分类仍需持续验证"],
    responsibilities: ["产品负责人：跟进执行"],
    assumptions: ["低金额退款占比较高"],
    reopen: "关键工期或风险规则变化时",
    humanDecisionNote: "AI 提供分析，产品负责人作出最终选择。",
  };

  const incompleteRecord = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({
      type: "final_confirmed",
      actor: "产品负责人",
      payload: { record: { ...finalRecord, responsibilities: [] }, riskAcknowledged: true, humanAcknowledged: true },
    }),
  });
  assert.equal(incompleteRecord.response.status, 409);
  assert.equal(incompleteRecord.payload.message, "最终决定记录不完整。");

  const completed = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({
      type: "final_confirmed",
      actor: "产品负责人",
      payload: { record: finalRecord, riskAcknowledged: true, humanAcknowledged: true },
    }),
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.payload.decision.status, "complete");
  assert.equal(completed.payload.decision.currentStage, "final");

  const resetSample = await request(baseUrl, "/api/decisions/sample-ai-refund/reset", {
    method: "POST",
    body: "{}",
  });
  assert.equal(resetSample.response.status, 200);
  assert.equal(resetSample.payload.decision.status, "active");
  assert.equal(resetSample.payload.decision.currentStage, "collect");
  assert.equal(resetSample.payload.decision.participants.filter((item) => item.submissionStatus === "pending").length, 1);
  assert.equal(resetSample.payload.decision.participants.find((item) => item.submissionStatus === "pending").name, "产品负责人");
  assert.equal(resetSample.payload.decision.artifacts.some((item) => item.type === "selection"), false);

  const created = await request(baseUrl, "/api/decisions", {
    method: "POST",
    body: JSON.stringify({
      sourceText: "我们需要在成本、回答质量和响应速度之间确定默认模型。",
      ownerName: "产品负责人",
      analysis: {
        title: "默认模型选择",
        goal: "确定上线版本的默认模型",
        participants: ["产品负责人", "研发负责人"],
        constraints: [],
        informationGaps: [],
      },
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.decision.title, "默认模型选择");
  assert.equal(created.payload.decision.participants.filter((item) => item.submissionStatus === "confirmed").length, 0);

  await new Promise((resolve) => server.close(resolve));
  database.close();
  const reopened = createDatabase({ dbPath });
  assert.equal(reopened.getDecision("sample-ai-refund").status, "active");
  assert.equal(reopened.getDecision("sample-ai-refund").currentStage, "collect");
  assert.equal(reopened.getDecision(created.payload.decision.id).title, "默认模型选择");
  reopened.close();
});
