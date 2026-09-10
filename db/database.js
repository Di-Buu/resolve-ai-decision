const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const { sampleDecision } = require("./seed");

const STAGES = ["collect", "triage", "conflict", "clarify", "proposals", "review", "final"];
const EVENT_TYPES = new Set([
  "participant_confirmed",
  "triage_decided",
  "stage_changed",
  "clarification_answered",
  "proposal_selected",
  "review_submitted",
  "objection_submitted",
  "objection_processed",
  "final_confirmed",
]);

const STAGE_TRANSITIONS = {
  collect: new Set(["collect", "triage"]),
  triage: new Set(["triage", "conflict"]),
  conflict: new Set(["conflict", "clarify", "proposals"]),
  clarify: new Set(["clarify", "conflict", "proposals"]),
  proposals: new Set(["proposals", "conflict", "review"]),
  review: new Set(["review", "proposals", "final"]),
  final: new Set(["final"]),
};

const REVIEW_STATUSES = new Set(["accept", "concern", "oppose"]);
const FINAL_RECORD_FIELDS = ["decision", "why", "sacrificed", "risks", "reopen", "humanDecisionNote"];
const FINAL_RECORD_REQUIRED_LIST_FIELDS = ["satisfied", "evidence", "rejectedOptions", "acceptedRisks", "responsibilities"];
const FINAL_RECORD_OPTIONAL_LIST_FIELDS = ["unresolvedObjections", "assumptions"];

function isoNow() {
  return new Date().toISOString();
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createDatabase(options = {}) {
  const dbPath = options.dbPath || process.env.RESOLVE_DB_PATH || path.join(__dirname, "..", "data", "resolve.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  const migration = fs.readFileSync(path.join(__dirname, "migrations", "001_init.sql"), "utf8");
  db.exec(migration);
  db.pragma("optimize");

  const insertDecision = db.prepare(`
    INSERT INTO decisions (id, title, source_text, scenario, owner_name, status, current_stage, deadline, is_sample, created_at, updated_at)
    VALUES (@id, @title, @sourceText, @scenario, @ownerName, @status, @currentStage, @deadline, @isSample, @createdAt, @updatedAt)
  `);
  const insertParticipant = db.prepare(`
    INSERT INTO participants (id, decision_id, name, role, submission_status, confirmed_at)
    VALUES (@id, @decisionId, @name, @role, @submissionStatus, @confirmedAt)
  `);
  const insertArtifact = db.prepare(`
    INSERT INTO artifacts (id, decision_id, type, status, version, payload_json, created_at, updated_at)
    VALUES (@id, @decisionId, @type, @status, @version, @payloadJson, @createdAt, @updatedAt)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO events (decision_id, event_type, actor, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    const exists = db.prepare("SELECT 1 FROM decisions WHERE id = ?").get(sampleDecision.id);
    const createdAt = isoNow();
    if (!exists) {
      insertDecision.run({
        id: sampleDecision.id,
        title: sampleDecision.title,
        sourceText: sampleDecision.sourceText,
        scenario: sampleDecision.scenario,
        ownerName: sampleDecision.ownerName,
        status: sampleDecision.status,
        currentStage: sampleDecision.currentStage,
        deadline: sampleDecision.deadline,
        isSample: sampleDecision.isSample ? 1 : 0,
        createdAt,
        updatedAt: createdAt,
      });
      for (const participant of sampleDecision.participants) {
        insertParticipant.run({
          ...participant,
          decisionId: sampleDecision.id,
          confirmedAt: participant.submissionStatus === "confirmed" ? createdAt : null,
        });
      }
      insertEvent.run(sampleDecision.id, "sample_created", "Resolve", "{}", createdAt);
    }
    for (const artifact of sampleDecision.artifacts) {
      const artifactExists = db.prepare("SELECT 1 FROM artifacts WHERE decision_id = ? AND type = ? LIMIT 1").get(sampleDecision.id, artifact.type);
      if (artifactExists) continue;
      insertArtifact.run({
        id: artifact.id,
        decisionId: sampleDecision.id,
        type: artifact.type,
        status: artifact.status,
        version: 1,
        payloadJson: JSON.stringify(artifact.payload),
        createdAt,
        updatedAt: createdAt,
      });
    }
  });

  if (options.seed !== false) seed();

  function saveArtifact(decisionId, type, payload, status = "draft") {
    const existing = db.prepare("SELECT id, version FROM artifacts WHERE decision_id = ? AND type = ? ORDER BY version DESC LIMIT 1").get(decisionId, type);
    const updatedAt = isoNow();
    if (existing) {
      const version = existing.version + 1;
      const id = crypto.randomUUID();
      insertArtifact.run({
        id,
        decisionId,
        type,
        status,
        version,
        payloadJson: JSON.stringify(payload),
        createdAt: updatedAt,
        updatedAt,
      });
      return { id, version };
    }
    const id = crypto.randomUUID();
    insertArtifact.run({
      id,
      decisionId,
      type,
      status,
      version: 1,
      payloadJson: JSON.stringify(payload),
      createdAt: updatedAt,
      updatedAt,
    });
    return { id, version: 1 };
  }

  function latestArtifact(decisionId, type) {
    const row = db.prepare("SELECT payload_json FROM artifacts WHERE decision_id = ? AND type = ? ORDER BY version DESC LIMIT 1").get(decisionId, type);
    return row ? parseJson(row.payload_json) : null;
  }

  function allParticipantsConfirmed(decisionId) {
    const row = db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN submission_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed
      FROM participants WHERE decision_id = ?
    `).get(decisionId);
    return Number(row.total) > 0 && Number(row.total) === Number(row.confirmed || 0);
  }

  function allParticipantsReviewed(decisionId) {
    const participants = db.prepare("SELECT id FROM participants WHERE decision_id = ?").all(decisionId);
    return participants.length > 0 && participants.every((participant) => REVIEW_STATUSES.has(latestArtifact(decisionId, `review:${participant.id}`)?.status));
  }

  function assertStageTransition(decisionId, nextStage) {
    const currentStage = db.prepare("SELECT current_stage FROM decisions WHERE id = ?").get(decisionId)?.current_stage;
    if (!currentStage || !STAGE_TRANSITIONS[currentStage]?.has(nextStage)) {
      throw new Error("当前进度不能直接进入这一步，请按页面提示继续。");
    }
  }

  function validateFinalRecord(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("最终决定记录不完整。");
    for (const field of FINAL_RECORD_FIELDS) {
      if (typeof record[field] !== "string" || record[field].trim().length < 2) throw new Error("最终决定记录不完整。");
    }
    for (const field of FINAL_RECORD_REQUIRED_LIST_FIELDS) {
      if (!Array.isArray(record[field]) || !record[field].length || record[field].some((item) => typeof item !== "string" || !item.trim())) {
        throw new Error("最终决定记录不完整。");
      }
    }
    for (const field of FINAL_RECORD_OPTIONAL_LIST_FIELDS) {
      if (!Array.isArray(record[field]) || record[field].some((item) => typeof item !== "string" || !item.trim())) throw new Error("最终决定记录不完整。");
    }
  }

  function getDecision(id) {
    const row = db.prepare("SELECT * FROM decisions WHERE id = ?").get(id);
    if (!row) return null;
    const participants = db.prepare("SELECT * FROM participants WHERE decision_id = ? ORDER BY rowid").all(id).map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      submissionStatus: item.submission_status,
      confirmedAt: item.confirmed_at,
    }));
    const artifacts = db.prepare("SELECT * FROM artifacts WHERE decision_id = ? ORDER BY created_at, rowid").all(id).map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      version: item.version,
      payload: parseJson(item.payload_json),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));
    const events = db.prepare("SELECT * FROM events WHERE decision_id = ? ORDER BY id DESC LIMIT 50").all(id).map((item) => ({
      id: item.id,
      type: item.event_type,
      actor: item.actor,
      payload: parseJson(item.payload_json),
      createdAt: item.created_at,
    }));
    const aiRuns = db.prepare("SELECT * FROM ai_runs WHERE decision_id = ? ORDER BY id DESC LIMIT 20").all(id).map((item) => ({
      id: item.id,
      task: item.task,
      provider: item.provider,
      model: item.model,
      status: item.status,
      durationMs: item.duration_ms,
      errorCode: item.error_code,
      createdAt: item.created_at,
    }));
    return {
      id: row.id,
      title: row.title,
      sourceText: row.source_text,
      scenario: row.scenario,
      ownerName: row.owner_name,
      status: row.status,
      currentStage: row.current_stage,
      deadline: row.deadline,
      isSample: Boolean(row.is_sample),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      participants,
      artifacts,
      events,
      aiRuns,
    };
  }

  function listDecisions() {
    return db.prepare(`
      SELECT d.*, COUNT(p.id) AS participant_count,
        SUM(CASE WHEN p.submission_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count
      FROM decisions d
      LEFT JOIN participants p ON p.decision_id = d.id
      GROUP BY d.id
      ORDER BY d.is_sample DESC, d.updated_at DESC
    `).all().map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      currentStage: row.current_stage,
      ownerName: row.owner_name,
      deadline: row.deadline,
      isSample: Boolean(row.is_sample),
      participantCount: Number(row.participant_count || 0),
      confirmedCount: Number(row.confirmed_count || 0),
      updatedAt: row.updated_at,
    }));
  }

  const createDecisionTx = db.transaction((input) => {
    const id = crypto.randomUUID();
    const createdAt = isoNow();
    const analysis = input.analysis || {};
    insertDecision.run({
      id,
      title: analysis.title || input.title || "待确认的决策",
      sourceText: input.sourceText,
      scenario: input.scenario || "work_product",
      ownerName: input.ownerName || "产品负责人",
      status: "active",
      currentStage: "collect",
      deadline: input.deadline || null,
      isSample: 0,
      createdAt,
      updatedAt: createdAt,
    });

    const supplied = Array.isArray(input.participants) && input.participants.length
      ? input.participants
      : analysis.participants || [];
    const participants = supplied.slice(0, 6).map((participant, index) => ({
      id: crypto.randomUUID(),
      name: typeof participant === "string" ? participant : participant.role || `参与者 ${index + 1}`,
      role: typeof participant === "string" ? "意见参与者" : participant.interest || "意见参与者",
      submissionStatus: "pending",
    }));
    if (!participants.some((participant) => participant.name === (input.ownerName || "产品负责人"))) {
      participants.unshift({ id: crypto.randomUUID(), name: input.ownerName || "产品负责人", role: "决策负责人", submissionStatus: "pending" });
    }
    for (const participant of participants) {
      insertParticipant.run({
        ...participant,
        decisionId: id,
        confirmedAt: participant.submissionStatus === "confirmed" ? createdAt : null,
      });
    }
    saveArtifact(id, "analysis", analysis, "confirmed");
    insertEvent.run(id, "decision_created", input.ownerName || "产品负责人", JSON.stringify({ source: "ai_analysis" }), createdAt);
    return getDecision(id);
  });

  function createDecision(input) {
    if (!input || typeof input.sourceText !== "string" || input.sourceText.trim().length < 10) {
      throw new Error("请先提供完整的问题背景。");
    }
    return createDecisionTx({ ...input, sourceText: input.sourceText.trim() });
  }

  const addEventTx = db.transaction((decisionId, event) => {
    const decision = db.prepare("SELECT id, owner_name, current_stage FROM decisions WHERE id = ?").get(decisionId);
    if (!decision) return null;
    if (!EVENT_TYPES.has(event.type)) throw new Error("不支持的操作类型。");
    const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
    const actor = typeof event.actor === "string" && event.actor.trim() ? event.actor.trim() : "本地用户";
    const createdAt = isoNow();

    if (event.type === "participant_confirmed") {
      if (decision.current_stage !== "collect") throw new Error("当前进度不能再修改参与者观点。");
      const participant = db.prepare("SELECT id FROM participants WHERE id = ? AND decision_id = ?").get(payload.participantId, decisionId);
      if (!participant) throw new Error("没有找到该参与者。");
      const participantName = db.prepare("SELECT name FROM participants WHERE id = ?").get(payload.participantId)?.name;
      if (actor !== participantName) throw new Error("只有这位参与者本人可以确认观点。");
      if (String(payload.text || "").trim().length < 5) throw new Error("请先写下这位参与者的观点。");
      db.prepare("UPDATE participants SET submission_status = 'confirmed', confirmed_at = ? WHERE id = ?").run(createdAt, payload.participantId);
      saveArtifact(decisionId, `viewpoint:${payload.participantId}`, { text: String(payload.text || "").trim(), participantId: payload.participantId }, "confirmed");
    }
    if (event.type === "stage_changed") {
      if (!STAGES.includes(payload.stage)) throw new Error("未知的决策阶段。");
      if (actor !== "Resolve") throw new Error("只有系统可以更新决策进度。");
      assertStageTransition(decisionId, payload.stage);
      db.prepare("UPDATE decisions SET current_stage = ?, updated_at = ? WHERE id = ?").run(payload.stage, createdAt, decisionId);
    }
    if (event.type === "triage_decided") {
      if (decision.current_stage !== "triage") throw new Error("当前进度还不能判断是否继续。");
      if (actor !== decision.owner_name) throw new Error("只有决策负责人可以判断是否继续。");
      const outcome = ["proceed", "need_evidence", "defer", "reject"].includes(payload.outcome) ? payload.outcome : "proceed";
      saveArtifact(decisionId, "triage_decision", { outcome, note: String(payload.note || "").trim() }, "confirmed");
      const nextStage = outcome === "proceed" ? "conflict" : "triage";
      db.prepare("UPDATE decisions SET current_stage = ?, updated_at = ? WHERE id = ?").run(nextStage, createdAt, decisionId);
    }
    if (event.type === "clarification_answered") {
      if (!["conflict", "clarify"].includes(decision.current_stage)) throw new Error("当前进度还不能补充澄清信息。");
      const answers = Array.isArray(payload.answers)
        ? payload.answers.map((item) => ({ questionId: String(item.questionId || ""), answer: String(item.answer || "").trim() })).filter((item) => item.answer)
        : [{ questionId: payload.questionId, answer: String(payload.answer || "").trim() }];
      saveArtifact(decisionId, "clarification", { answers, owner: actor }, "confirmed");
      db.prepare("UPDATE decisions SET current_stage = 'clarify', updated_at = ? WHERE id = ?").run(createdAt, decisionId);
    }
    if (event.type === "proposal_selected") {
      if (actor !== decision.owner_name) throw new Error("只有决策负责人可以选择方案。");
      if (!allParticipantsConfirmed(decisionId)) throw new Error("还有参与者尚未确认观点。");
      assertStageTransition(decisionId, "review");
      const proposalId = String(payload.proposalId || "");
      const validation = latestArtifact(decisionId, "validation");
      const result = validation?.results?.find((item) => item.proposalId === proposalId);
      if (!result || !["pass", "human_tradeoff"].includes(result.status)) throw new Error("这个方案还没有通过检查，暂时不能选择。");
      const previousSelection = latestArtifact(decisionId, "selection");
      if (previousSelection?.proposalId && previousSelection.proposalId !== proposalId) {
        const participants = db.prepare("SELECT id FROM participants WHERE decision_id = ?").all(decisionId);
        for (const participant of participants) {
          saveArtifact(decisionId, `review:${participant.id}`, { participantId: participant.id, status: "invalidated", reason: "方案已经更换，需要重新审阅。" }, "draft");
        }
        saveArtifact(decisionId, "objection", { active: false, reason: "方案已经更换。" }, "draft");
        saveArtifact(decisionId, "objection_analysis", { active: false, affectedProposalIds: [] }, "draft");
      }
      saveArtifact(decisionId, "selection", { proposalId: payload.proposalId }, "confirmed");
      db.prepare("UPDATE decisions SET current_stage = 'review', updated_at = ? WHERE id = ?").run(createdAt, decisionId);
    }
    if (event.type === "review_submitted") {
      if (decision.current_stage !== "review") throw new Error("请先选择一个通过检查的方案。");
      const participant = db.prepare("SELECT id, name FROM participants WHERE id = ? AND decision_id = ?").get(payload.participantId, decisionId);
      if (!participant) throw new Error("没有找到该参与者。");
      if (actor !== participant.name) throw new Error("只有这位参与者本人可以提交审阅意见。");
      const status = String(payload.status || "");
      const note = String(payload.note || "").trim();
      if (!REVIEW_STATUSES.has(status)) throw new Error("请选择接受、有顾虑地接受或反对。");
      if (status !== "accept" && note.length < 5) throw new Error("请说明你的顾虑或反对原因。");
      const selection = latestArtifact(decisionId, "selection");
      saveArtifact(decisionId, `review:${participant.id}`, { participantId: participant.id, proposalId: selection?.proposalId || null, status, note }, "confirmed");
    }
    if (event.type === "objection_submitted") {
      if (decision.current_stage !== "review") throw new Error("当前进度还不能提交方案异议。");
      const participant = db.prepare("SELECT name FROM participants WHERE decision_id = ? AND name = ?").get(decisionId, actor);
      const text = String(payload.text || "").trim();
      if (!participant) throw new Error("只有参与者可以提交异议。");
      if (text.length < 5) throw new Error("请说明新的事实或顾虑。");
      saveArtifact(decisionId, "objection", { text, actor }, "confirmed");
      db.prepare("UPDATE decisions SET current_stage = 'review', updated_at = ? WHERE id = ?").run(createdAt, decisionId);
    }
    if (event.type === "objection_processed") {
      if (decision.current_stage !== "review") throw new Error("当前进度还不能处理方案异议。");
      if (actor !== "Resolve") throw new Error("只有系统可以保存异议分析。");
      if (!latestArtifact(decisionId, "objection")) throw new Error("请先提交需要处理的异议。");
      saveArtifact(decisionId, "objection_analysis", payload.analysis || {}, "confirmed");
    }
    if (event.type === "final_confirmed") {
      if (decision.current_stage !== "review") throw new Error("当前进度还不能确认最终决定。");
      if (actor !== decision.owner_name) throw new Error("只有决策负责人可以确认最终决定。");
      if (!allParticipantsConfirmed(decisionId)) throw new Error("还有参与者尚未确认观点。");
      if (!allParticipantsReviewed(decisionId)) throw new Error("还有参与者尚未完成方案审阅。");
      if (payload.riskAcknowledged !== true || payload.humanAcknowledged !== true) throw new Error("请先确认剩余风险和人工责任。");
      const selection = latestArtifact(decisionId, "selection");
      if (!selection?.proposalId) throw new Error("请先选择一个通过检查的方案。");
      const validation = latestArtifact(decisionId, "validation");
      const selectedResult = validation?.results?.find((item) => item.proposalId === selection.proposalId);
      if (!selectedResult || !["pass", "human_tradeoff"].includes(selectedResult.status)) throw new Error("所选方案没有通过检查，暂时不能确认。");
      const storedObjection = latestArtifact(decisionId, "objection");
      const storedObjectionAnalysis = latestArtifact(decisionId, "objection_analysis");
      const objection = storedObjection?.active === false ? null : storedObjection;
      const objectionAnalysis = storedObjectionAnalysis?.active === false ? null : storedObjectionAnalysis;
      if (objection && !objectionAnalysis) throw new Error("还有一条异议尚未处理。");
      if (objectionAnalysis?.affectedProposalIds?.includes(selection.proposalId)) throw new Error("新的异议影响了当前方案，请先重新选择。");
      validateFinalRecord(payload.record);
      assertStageTransition(decisionId, "final");
      saveArtifact(decisionId, "final_record", payload.record || {}, "confirmed");
      db.prepare("UPDATE decisions SET status = 'complete', current_stage = 'final', updated_at = ? WHERE id = ?").run(createdAt, decisionId);
    }

    insertEvent.run(decisionId, event.type, actor, JSON.stringify(payload), createdAt);
    db.prepare("UPDATE decisions SET updated_at = ? WHERE id = ?").run(createdAt, decisionId);
    return getDecision(decisionId);
  });

  function addEvent(decisionId, event) {
    return addEventTx(decisionId, event);
  }

  function logAiRun(decisionId, task, details) {
    db.prepare(`
      INSERT INTO ai_runs (decision_id, task, provider, model, status, duration_ms, error_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(decisionId || null, task, details.provider, details.model, details.status, details.durationMs || null, details.errorCode || null, isoNow());
  }

  return {
    path: dbPath,
    raw: db,
    listDecisions,
    getDecision,
    createDecision,
    addEvent,
    saveArtifact,
    latestArtifact,
    allParticipantsConfirmed,
    allParticipantsReviewed,
    logAiRun,
    close: () => db.close(),
  };
}

module.exports = { createDatabase, STAGES };
