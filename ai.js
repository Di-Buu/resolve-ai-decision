const AI_PROVIDER = (process.env.AI_PROVIDER || "dashscope").toLowerCase();
const providerSettings = {
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseUrl: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.DASHSCOPE_MODEL || "qwen3.7-plus-2026-05-26",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
  },
};
const provider = providerSettings[AI_PROVIDER] || providerSettings.dashscope;

const baseRules = [
  "你是 Resolve 的决策协作模块。",
  "用简洁、自然的中文输出可供人确认的结构化对象。",
  "明确区分已确认事实、硬约束、偏好和未经验证的假设。",
  "信息不足时必须指出缺口，不得编造数据或替负责人做最终价值判断。",
].join("\n");

const schemas = {
  analyze: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      goal: { type: "string" },
      decision_question: { type: "string" },
      participants: {
        type: "array", minItems: 2, maxItems: 6,
        items: {
          type: "object", additionalProperties: false,
          properties: { role: { type: "string" }, interest: { type: "string" } },
          required: ["role", "interest"],
        },
      },
      conflicts: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
      constraints: {
        type: "array", minItems: 1, maxItems: 6,
        items: {
          type: "object", additionalProperties: false,
          properties: {
            statement: { type: "string" },
            type: { type: "string", enum: ["hard", "soft", "assumption"] },
            evidence_needed: { type: "boolean" },
          },
          required: ["statement", "type", "evidence_needed"],
        },
      },
      information_gaps: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
      recommended_next_step: { type: "string", enum: ["collect_evidence", "proceed_to_conflict", "reframe_decision"] },
      boundary_note: { type: "string" },
    },
    required: ["title", "goal", "decision_question", "participants", "conflicts", "constraints", "information_gaps", "recommended_next_step", "boundary_note"],
  },
  diagnose: {
    type: "object",
    additionalProperties: false,
    properties: {
      demand_assessment: {
        type: "object", additionalProperties: false,
        properties: {
          summary: { type: "string" },
          evidence_status: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["summary", "evidence_status", "recommendation"],
      },
      conflicts: {
        type: "array", minItems: 1, maxItems: 4,
        items: {
          type: "object", additionalProperties: false,
          properties: {
            id: { type: "string" }, title: { type: "string" }, side_a: { type: "string" }, side_b: { type: "string" },
            severity: { type: "string", enum: ["medium", "high", "critical"] },
            status: { type: "string", enum: ["known", "potential"] }, evidence_note: { type: "string" },
          },
          required: ["id", "title", "side_a", "side_b", "severity", "status", "evidence_note"],
        },
      },
      questions: {
        type: "array", minItems: 1, maxItems: 3,
        items: {
          type: "object", additionalProperties: false,
          properties: { id: { type: "string" }, owner: { type: "string" }, question: { type: "string" }, why: { type: "string" } },
          required: ["id", "owner", "question", "why"],
        },
      },
    },
    required: ["demand_assessment", "conflicts", "questions"],
  },
  propose: {
    type: "object",
    additionalProperties: false,
    properties: {
      proposals: {
        type: "array", minItems: 2, maxItems: 3,
        items: {
          type: "object", additionalProperties: false,
          properties: {
            id: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, tradeoff: { type: "string" }, risk: { type: "string" },
            coverage: { type: "string", enum: ["low", "medium", "high"] },
            time_confidence: { type: "string", enum: ["low", "medium", "high", "uncertain"] },
            risk_control: { type: "string", enum: ["low", "medium", "high", "uncertain"] },
            assumptions: { type: "array", maxItems: 4, items: { type: "string" } },
            meets_constraints: { type: "boolean" },
          },
          required: ["id", "title", "summary", "tradeoff", "risk", "coverage", "time_confidence", "risk_control", "assumptions", "meets_constraints"],
        },
      },
    },
    required: ["proposals"],
  },
  validate: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      results: {
        type: "array", minItems: 2, maxItems: 3,
        items: {
          type: "object", additionalProperties: false,
          properties: {
            proposal_id: { type: "string" },
            status: { type: "string", enum: ["pass", "needs_evidence", "human_tradeoff", "blocked"] },
            reason: { type: "string" },
          },
          required: ["proposal_id", "status", "reason"],
        },
      },
    },
    required: ["summary", "results"],
  },
  objection: {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", enum: ["new_fact", "new_constraint", "changed_constraint", "preference", "assumption_invalidated", "value_difference"] },
      summary: { type: "string" },
      affected_proposal_ids: { type: "array", maxItems: 3, items: { type: "string" } },
      invalidated_assumptions: { type: "array", maxItems: 4, items: { type: "string" } },
      recommended_action: { type: "string" },
    },
    required: ["category", "summary", "affected_proposal_ids", "invalidated_assumptions", "recommended_action"],
  },
};

function extractOutputText(response) {
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text") return content.text;
    }
  }
  return "";
}

function extractChatCompletionText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item?.text || "").join("");
  return "";
}

function validateSchema(schema, value, location = "result") {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${location} 应为对象`);
    for (const key of schema.required || []) {
      if (!(key in value)) throw new Error(`${location}.${key} 缺失`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties || {}))) throw new Error(`${location}.${key} 不在输出契约中`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (key in value) validateSchema(childSchema, value[key], `${location}.${key}`);
    }
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) throw new Error(`${location} 应为数组`);
    if (schema.minItems != null && value.length < schema.minItems) throw new Error(`${location} 数量不足`);
    if (schema.maxItems != null && value.length > schema.maxItems) throw new Error(`${location} 数量过多`);
    value.forEach((item, index) => validateSchema(schema.items, item, `${location}[${index}]`));
  }
  if (schema.type === "string" && typeof value !== "string") throw new Error(`${location} 应为文字`);
  if (schema.type === "boolean" && typeof value !== "boolean") throw new Error(`${location} 应为布尔值`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${location} 的值不合法`);
}

function normalize(task, value) {
  if (task === "analyze") {
    return {
      title: value.title,
      goal: value.goal,
      decisionQuestion: value.decision_question,
      participants: value.participants,
      conflicts: value.conflicts,
      constraints: value.constraints.map((item) => ({ statement: item.statement, type: item.type, evidenceNeeded: item.evidence_needed })),
      informationGaps: value.information_gaps,
      recommendedNextStep: value.recommended_next_step,
      boundaryNote: value.boundary_note,
    };
  }
  if (task === "diagnose") {
    return {
      demandAssessment: {
        summary: value.demand_assessment.summary,
        evidenceStatus: value.demand_assessment.evidence_status,
        recommendation: value.demand_assessment.recommendation,
      },
      conflicts: value.conflicts.map((item) => ({ id: item.id, title: item.title, sideA: item.side_a, sideB: item.side_b, severity: item.severity, status: item.status, evidenceNote: item.evidence_note })),
      questions: value.questions,
    };
  }
  if (task === "propose") {
    return {
      proposals: value.proposals.map((item, index) => ({
        id: item.id || String.fromCharCode(65 + index), title: item.title, summary: item.summary, tradeoff: item.tradeoff, risk: item.risk,
        coverage: item.coverage, timeConfidence: item.time_confidence, riskControl: item.risk_control,
        assumptions: item.assumptions, meetsConstraints: item.meets_constraints,
      })),
    };
  }
  if (task === "validate") {
    return { summary: value.summary, results: value.results.map((item) => ({ proposalId: item.proposal_id, status: item.status, reason: item.reason })) };
  }
  return {
    category: value.category,
    summary: value.summary,
    affectedProposalIds: value.affected_proposal_ids,
    invalidatedAssumptions: value.invalidated_assumptions,
    recommendedAction: value.recommended_action,
  };
}

function taskInstructions(task) {
  const instructions = {
    analyze: "整理用户的问题，给出标题、决策目标、决策问题、所有明确相关角色、初步分歧、限制和信息缺口。参与者要覆盖输入中明确提到的受影响客户或用户，但不要凭空添加未被输入支持的角色。每个由不同目标、时间、质量、成本或限制构成的独立矛盾分别列出，不要把多个变量合并成一个冲突；当多个角色存在明显对立目标时，至少分别列出两条冲突。至少输出一条限制或假设；如果输入没有确定限制，就输出‘关键条件尚未明确’这类 type=assumption，并标记需要证据。分类时只有输入明确表达不可违背的合规红线、已确认且必须遵守的截止时间或确定性规则才使用 hard；客户要求、团队目标和希望优先级通常使用 soft；工期估算、资源占用、收益、质量、成本、延迟、百分比以及没有证据支持的说法使用 assumption，并把需要验证的依据写入信息缺口。不要把所有限制都标成 hard；即使存在 hard，也要把相关偏好或未经验证的估算分别标为 soft/assumption。信息明显不足、用户在问‘下一步怎么做’时，recommended_next_step 使用 collect_evidence 或 reframe_decision，不要直接使用 proceed_to_conflict。所有数组元素必须是完整、简洁的自然语言，不能输出 JSON 片段、字段名、残缺引号或转义残片。boundary_note 要提醒最终决定由人确认。",
    diagnose: "根据已确认材料判断需求证据是否足够，找出真正冲突，并只提出一到三个最值得回答的问题。",
    propose: "基于目标、限制和澄清回答生成二到三个取舍方向明显不同的方案，不要只换措辞。",
    validate: "独立检查每个候选方案是否违反硬约束、依赖未验证假设或需要负责人主动取舍。严格区分四种状态：只有明确违反已确认硬约束时使用 blocked；缺少完成方案所必需的事实或证据时使用 needs_evidence；硬约束均满足但需要负责人主动接受偏好损失或重大代价时使用 human_tradeoff；已满足全部已确认硬约束、关键依据已确认且剩余风险与代价已清楚写明时使用 pass。备选方案不是当前首选、存在普通风险或覆盖范围较小，本身不能作为 blocked 的理由。不得因为方案看起来合理就标记通过，也不得把输入中已明确确认的事实重新说成未验证假设。",
    objection: "理解参与者异议，判断它属于新事实、新约束、偏好、假设失效还是价值分歧，并只标出真正受影响的方案。",
  };
  return `${baseRules}\n${instructions[task]}`;
}

async function callStructured(task, userInput) {
  if (!provider.apiKey) {
    const error = new Error("AI 服务尚未配置。");
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }
  const isDashScope = AI_PROVIDER !== "openai";
  const endpoint = isDashScope
    ? `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`
    : `${provider.baseUrl.replace(/\/$/, "")}/responses`;
  const schema = schemas[task];
  const requestBody = isDashScope
    ? {
        model: provider.model,
        messages: [{ role: "system", content: taskInstructions(task) }, { role: "user", content: userInput }],
        response_format: { type: "json_schema", json_schema: { name: `resolve_${task}`, strict: true, schema } },
        enable_thinking: false,
        temperature: task === "propose" ? 0.35 : 0.15,
        max_tokens: 2400,
      }
    : {
        model: provider.model,
        store: false,
        reasoning: { effort: "low" },
        instructions: taskInstructions(task),
        input: userInput,
        max_output_tokens: 2400,
        text: { format: { type: "json_schema", name: `resolve_${task}`, strict: true, schema } },
      };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `模型服务返回 ${response.status}`);
    error.code = "AI_REQUEST_FAILED";
    throw error;
  }
  const outputText = isDashScope ? extractChatCompletionText(payload) : extractOutputText(payload);
  if (!outputText) {
    const error = new Error("模型没有返回可用结果。");
    error.code = "AI_EMPTY_OUTPUT";
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    const error = new Error("模型结果无法解析。");
    error.code = "AI_INVALID_JSON";
    throw error;
  }
  try {
    validateSchema(schema, parsed);
  } catch (schemaError) {
    const error = new Error(`模型结果不符合结构化契约：${schemaError.message}`);
    error.code = "AI_SCHEMA_INVALID";
    throw error;
  }
  const rawUsage = payload.usage || {};
  const usage = {
    inputTokens: Number(rawUsage.prompt_tokens ?? rawUsage.input_tokens ?? 0),
    outputTokens: Number(rawUsage.completion_tokens ?? rawUsage.output_tokens ?? 0),
    totalTokens: Number(rawUsage.total_tokens ?? 0),
  };
  return { result: normalize(task, parsed), provider: isDashScope ? "dashscope" : "openai", model: provider.model, responseId: payload.id || null, usage };
}

function compactDecision(snapshot) {
  const relevant = snapshot.artifacts
    .filter((item) => item.type.startsWith("viewpoint:")
      || item.type.startsWith("review:")
      || ["analysis", "diagnosis", "clarification", "proposals", "validation", "selection", "objection"].includes(item.type))
    .map((item) => ({ type: item.type, payload: item.payload }));
  return JSON.stringify({
    title: snapshot.title,
    sourceText: snapshot.sourceText,
    participants: snapshot.participants.map((item) => ({ name: item.name, role: item.role, status: item.submissionStatus })),
    artifacts: relevant,
  }).slice(0, 18_000);
}

async function analyzeProblem(problem) {
  return callStructured("analyze", problem);
}

async function runDecisionTask(task, snapshot) {
  if (!["diagnose", "propose", "validate", "objection"].includes(task)) throw new Error("未知的 AI 任务。");
  return callStructured(task, compactDecision(snapshot));
}

function getAiHealth() {
  return {
    configured: Boolean(provider.apiKey),
    provider: AI_PROVIDER === "openai" ? "openai" : "dashscope",
    model: provider.model,
  };
}

module.exports = { analyzeProblem, runDecisionTask, getAiHealth };
