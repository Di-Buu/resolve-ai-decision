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

  const engineeringId = sample.payload.decision.participants.find((item) => item.name === "研发负责人").id;
  const confirmed = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({
      type: "participant_confirmed",
      actor: "研发负责人",
      payload: { participantId: engineeringId, text: "两周内只能完成低风险范围，并保留人工回退。" },
    }),
  });
  assert.equal(confirmed.response.status, 200);
  assert.ok(confirmed.payload.decision.artifacts.some((item) => item.type === `viewpoint:${engineeringId}`));

  const triageStage = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "stage_changed", actor: "Resolve", payload: { stage: "triage" } }),
  });
  assert.equal(triageStage.response.status, 200);

  const triageDecision = await request(baseUrl, "/api/decisions/sample-ai-refund/events", {
    method: "POST",
    body: JSON.stringify({ type: "triage_decided", actor: "产品负责人", payload: { outcome: "proceed" } }),
  });
  assert.equal(triageDecision.response.status, 200);

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
  assert.equal(reopened.getDecision("sample-ai-refund").status, "complete");
  assert.equal(reopened.getDecision(created.payload.decision.id).title, "默认模型选择");
  reopened.close();
});
