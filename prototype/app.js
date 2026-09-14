const demoCase = "双十一前我们希望上线 AI 自动退款。业务希望尽可能全自动，研发表示完整版本至少需要四周，现在只有两周，风控要求 500 元以上退款必须人工审核。";
const sampleObjectionText = "研发重新拆分任务后发现，识别低风险退款的功能至少需要三周，两周内做不完。";
const sampleViewpoints = {
  "sample-product": "我希望双十一前先上线一版，真正减少客服的工作量，但不能为了赶时间增加误退款风险。",
  "sample-business": "希望第一版尽量多处理一些退款，优先处理数量最多、规则最清楚的情况。",
  "sample-engineering": "如果全部做完，至少需要四周。现在只有两周，第一版必须缩小范围。",
  "sample-risk": "500 元以上的退款必须由人工审核；其他退款如果出现异常，也要能马上转给人工处理。",
};
const sampleReviewDefaults = {
  "sample-product": { status: "accept", note: "同意先做风险较低的范围，以后再逐步扩大。" },
  "sample-business": { status: "concern", note: "可以接受，但需要关注第一版到底能减少多少人工退款。" },
  "sample-risk": { status: "accept", note: "高金额退款继续人工审核，可以接受。" },
};

const reviewLabels = { accept: "接受", concern: "有顾虑，但可以接受", oppose: "反对" };
const reviewTones = { accept: "green", concern: "amber", oppose: "red" };
const objectionCategoryLabels = {
  new_fact: "出现了新事实",
  new_constraint: "新增了一项限制",
  changed_constraint: "原有限制发生变化",
  preference: "偏好不同",
  assumption_invalidated: "原来的判断已经不适用",
  value_difference: "需要负责人决定接受什么、放弃什么",
};

const templates = [
  { key: "scope-time", label: "功能与时间", text: "时间不够，应该先做哪些功能？", input: "客户要求两周内上线新版本，但全部做完预计需要六周。我们需要决定第一版先做哪些功能。", icon: "scope" },
  { key: "value-cost", label: "价值与成本", text: "需求可能有价值，但开发代价很大。", input: "业务提出一个可能带来大客户签约的定制需求，但研发成本较高，也会增加长期维护负担。", icon: "value" },
  { key: "model-tradeoff", label: "选择 AI 模型", text: "效果、费用和速度应该怎么平衡？", input: "更强的模型回答更好，但费用更高、等待时间也更长。我们需要确定默认使用哪个模型，以及模型不可用时怎么办。", icon: "model" },
  { key: "launch-risk", label: "上线与风险", text: "有风险，但业务希望尽快上线。", input: demoCase, icon: "risk" },
  { key: "custom-standard", label: "定制与标准化", text: "要不要为了大客户做定制功能？", input: "大客户要求增加一套专属审批流程，并承诺签约，但该功能可能破坏通用产品架构。", icon: "value" },
  { key: "custom", label: "其他问题", text: "直接用自己的话描述。", input: "", icon: "custom" },
];

const workDomains = [
  { key: "product", label: "产品与研发", description: "决定需求要不要做、第一版做多少，以及什么时候上线。", examples: "要不要做 · 第一版做什么 · 上线风险", status: "当前可用", enabled: true },
  { key: "project", label: "项目与资源", description: "优先级、排期、预算、人力与跨团队依赖。", status: "即将开放", enabled: false },
  { key: "operation", label: "运营与增长", description: "增长策略、实验方案、活动节奏和用户运营。", status: "即将开放", enabled: false },
  { key: "customer", label: "客户与商务", description: "客户承诺、定制需求、合作条件和交付边界。", status: "即将开放", enabled: false },
  { key: "team", label: "团队与组织", description: "职责分工、协作机制、招聘和组织变化。", status: "即将开放", enabled: false },
  { key: "general-work", label: "不确定领域", description: "不确定属于哪里时，先直接描述问题。", examples: "无需提前归类", status: "直接描述", enabled: true },
];

const stageLabels = {
  collect: "收集观点",
  triage: "判断是否继续",
  conflict: "看看卡在哪里",
  clarify: "补充信息",
  proposals: "比较方案",
  review: "处理异议",
  final: "确认决定",
};
const stageOrder = Object.keys(stageLabels);
const decisionScreens = new Set(["overview", "input", "triage", "conflict", "clarify", "explore", "review", "final"]);
const simpleScreens = new Set(["home", "work", "scene", "create"]);
const stageScreens = {
  collect: "overview",
  triage: "triage",
  conflict: "conflict",
  clarify: "clarify",
  proposals: "explore",
  review: "review",
  final: "final",
};

const icons = {
  work: '<path d="M4 8.5h16v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z"/><path d="M9 8.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2.5M4 12h16M10 12v2h4v-2"/>',
  life: '<path d="M12 20s-7-4.2-7-10a4 4 0 0 1 7-2.7A4 4 0 0 1 19 10c0 5.8-7 10-7 10Z"/>',
  learn: '<path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M7 12.5V16c2.6 2 7.4 2 10 0v-3.5M21 9v6"/>',
  product: '<path d="M5 4h14v16H5z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  project: '<path d="M4 6h16v14H4z"/><path d="M8 6V4h8v2M8 11h8M8 15h5"/>',
  operation: '<path d="M5 19V9M12 19V5M19 19v-7"/><path d="m4 8 6-4 5 4 5-4"/>',
  customer: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M18 8v6M15 11h6"/>',
  team: '<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-2a5 5 0 0 1 10 0v2M14 20v-1.5a4 4 0 0 1 7-2.8"/>',
  general: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M4 12h2M18 12h2"/>',
  scope: '<path d="M5 5h6v6H5zM13 13h6v6h-6zM14 5h5M5 16h5"/>',
  value: '<path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
  model: '<path d="M7 7h10v10H7z"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  risk: '<path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v4M12 17h.01"/>',
  custom: '<path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4 4-2Z"/>',
};

const state = {
  screen: "home",
  decisions: [],
  decision: null,
  caseText: "",
  activeTemplate: "custom",
  activeDomain: "product",
  homeAnalyzed: false,
  previewAnalysis: null,
  selectedParticipantId: null,
  participantDraft: "",
  clarificationAnswers: {},
  revisingClarification: false,
  clarificationJustSaved: false,
  objectionEvidenceMode: false,
  objectionEvidenceJustSaved: false,
  forceRegenerate: false,
  selectedReviewerId: null,
  reviewChoice: "accept",
  reviewDraft: "",
  finalRiskAcknowledged: false,
  finalHumanAcknowledged: false,
  busy: "",
  error: "",
};

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function icon(name, className = "line-icon") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.compass}</svg>`;
}

function artifact(type) {
  return [...(state.decision?.artifacts || [])].reverse().find((item) => item.type === type)?.payload || null;
}

function reviewFor(participantId) {
  const review = artifact(`review:${participantId}`);
  return reviewLabels[review?.status] ? review : null;
}

function defaultSampleReview(participant) {
  if (!state.decision?.isSample || !participant) return { status: "accept", note: "" };
  if (participant.id === "sample-engineering") {
    const selectedId = artifact("selection")?.proposalId;
    return selectedId === "B"
      ? { status: "oppose", note: sampleObjectionText }
      : { status: "concern", note: "可以执行，但必须能随时转给人工处理，并持续检查识别结果。" };
  }
  return sampleReviewDefaults[participant.id] || { status: "accept", note: "" };
}

function selectReviewer(participant) {
  state.selectedReviewerId = participant?.id || null;
  const savedReview = participant ? reviewFor(participant.id) : null;
  const fallback = defaultSampleReview(participant);
  state.reviewChoice = savedReview?.status || fallback.status;
  state.reviewDraft = savedReview?.note ?? fallback.note;
}

function resetDecisionUi(decision) {
  state.selectedParticipantId = null;
  state.participantDraft = "";
  state.clarificationAnswers = {};
  state.revisingClarification = false;
  state.clarificationJustSaved = false;
  state.objectionEvidenceMode = false;
  state.objectionEvidenceJustSaved = false;
  state.forceRegenerate = false;
  state.finalRiskAcknowledged = false;
  state.finalHumanAcknowledged = false;
  const nextReviewer = decision?.participants?.find((participant) => {
    const saved = [...(decision.artifacts || [])].reverse().find((item) => item.type === `review:${participant.id}`)?.payload;
    return !reviewLabels[saved?.status];
  }) || decision?.participants?.[0];
  selectReviewer(nextReviewer);
}

function validationFor(proposalId) {
  return (artifact("validation")?.results || []).find((item) => item.proposalId === proposalId) || null;
}

function displayValidationFor(proposalId) {
  const stored = artifact("objection_analysis");
  const active = stored?.active === false ? null : stored;
  if (active?.affectedProposalIds?.includes(proposalId)) {
    return { proposalId, status: "blocked", reason: active.summary || "新的情况表明这个方案不能继续。" };
  }
  return validationFor(proposalId);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "暂时无法完成操作，请稍后重试。");
  return payload;
}

function routeFor(screen) {
  const params = new URLSearchParams();
  if (decisionScreens.has(screen) && state.decision?.id) params.set("decision", state.decision.id);
  if (screen !== "home") params.set("screen", screen);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

function syncRoute(screen, mode = "push") {
  const target = routeFor(screen);
  const current = `${window.location.pathname}${window.location.search}`;
  if (target === current) return;
  window.history[mode === "replace" ? "replaceState" : "pushState"]({ screen, decisionId: state.decision?.id || null }, "", target);
}

function go(screen, options = {}) {
  state.screen = screen;
  state.error = "";
  if (!options.skipHistory) syncRoute(screen, options.replace ? "replace" : "push");
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function currentStageIndex() {
  return Math.max(0, stageOrder.indexOf(state.decision?.currentStage || "collect"));
}

function viewedStageIndex() {
  if (["overview", "input"].includes(state.screen)) return 0;
  const entry = Object.entries(stageScreens).find(([, screen]) => screen === state.screen);
  return Math.max(0, stageOrder.indexOf(entry?.[0] || state.decision?.currentStage || "collect"));
}

function topbar() {
  const labels = { home: "首页", work: "工作", scene: "产品与研发", create: "创建决策", overview: "决定总览", input: "收集观点", triage: "判断是否继续", conflict: "看看卡在哪里", clarify: "补充信息", explore: "比较方案", review: "处理异议", final: "确认决定" };
  const location = labels[state.screen] || stageLabels[state.decision?.currentStage] || "这项决定";
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="返回 Resolve 首页"><span class="brand-mark">R</span><span>Resolve</span></button><div class="top-actions"><span class="screen-count">${location}</span>${state.decision ? '<button class="text-button" data-action="overview">决策总览</button>' : ""}</div></header>`;
}

function sidebar() {
  const current = currentStageIndex();
  const active = viewedStageIndex();
  return `<aside class="sidebar"><div class="case-name">${escapeHtml(state.decision?.title || "当前决策")}</div><nav class="step-list" aria-label="决策阶段">${stageOrder.map((key, index) => {
    const available = index <= current || index === active;
    return `<button class="step ${index === active ? "active" : index < current ? "done" : ""} ${index === current ? "current" : ""}" data-action="stage-nav" data-screen="${stageScreens[key]}" ${available ? "" : "disabled"}><span class="step-dot">${index < current ? "✓" : index + 1}</span><span>${stageLabels[key]}</span></button>`;
  }).join("")}</nav></aside>`;
}

function notice() {
  return state.error ? `<div class="global-notice" role="status"><strong>这一步没有完成</strong><span>${escapeHtml(state.error)}</span><button class="icon-button" data-action="dismiss-error" aria-label="关闭提示">×</button></div>` : "";
}

function shell(content) {
  const simple = ["home", "work", "scene", "create"].includes(state.screen);
  const demoBanner = state.decision?.isSample && !simple
    ? `<section class="demo-banner"><div><span class="badge">预置演示</span><strong>示例内容已经准备好</strong><p>你可以直接确认每一步。先选方案 B，可以看到新信息怎样让原方案无法继续。</p></div><button class="secondary" data-action="reset-example">从头体验</button></section>`
    : "";
  return `<div class="app-shell">${topbar()}${notice()}${simple ? content : `<main class="workspace">${sidebar()}<section class="content">${demoBanner}${content}</section></main>`}</div>`;
}

function decisionCard(item) {
  const status = item.status === "complete" ? "已完成" : item.currentStage === "collect" ? "收集中" : stageLabels[item.currentStage] || "进行中";
  return `<button class="recent-card" data-action="open-decision" data-id="${item.id}"><div><span class="badge ${item.isSample ? "" : "muted"}">${item.isSample ? "继续示例" : status}</span><h3>${escapeHtml(item.title)}</h3><p>${item.isSample ? "保留上次体验进度" : `${item.confirmedCount}/${item.participantCount} 位参与者已确认观点`}</p></div><span class="recent-arrow">→</span></button>`;
}

function renderHome() {
  const hasEnoughInput = state.caseText.trim().length >= 10;
  return shell(`<main class="page home-page">
    <section class="home-hero"><div class="hero-copy"><p class="eyebrow">Resolve</p><h1>让分歧变得<br />可以讨论</h1><p class="lead">把各方的目标、限制和顾虑放在一起，找到真正卡住决定的地方。</p></div><div class="hero-visual" aria-hidden="true"><img src="assets/resolve-home.png" alt="" /></div></section>
    <section class="composer" aria-label="描述决策问题"><label class="composer-label" for="home-input">你们现在需要决定什么？</label><textarea id="home-input" aria-label="描述需要决定的问题" placeholder="例如：两周后必须上线，但完整功能至少需要一个月，我们该保留哪些范围？">${escapeHtml(state.caseText)}</textarea><div class="composer-foot"><p class="helper">直接用自己的话说清背景和限制即可。</p><div class="composer-actions"><button class="secondary" data-action="reset-example">从头体验示例</button><button class="primary" data-action="home-analyze" ${hasEnoughInput ? "" : "disabled"}>继续</button></div></div></section>
    ${state.homeAnalyzed ? `<section class="panel" style="margin-top:16px"><div class="object-head"><div><p class="section-label">这个问题可能属于</p><h3>工作 · 产品与研发</h3></div><span class="status-pill">可以修改</span></div><p>接下来会先由 AI 帮你整理目标、相关人员和限制。</p><div class="page-actions"><button class="secondary" data-action="work">换一个领域</button><button class="primary" data-action="create">继续完善</button></div></section>` : ""}
    ${state.decisions.length ? `<section class="recent-section"><div class="row-between"><div><p class="section-label">继续上次的决定</p><h2 class="section-heading">最近的决策</h2></div></div><div class="recent-grid">${state.decisions.slice(0, 3).map(decisionCard).join("")}</div></section>` : ""}
    <section class="scene-section"><p class="section-label">或者先选一个场景</p><h2 class="section-heading">这件事发生在哪里？</h2><div class="scene-grid"><button class="scene-card" data-action="work"><span class="scene-icon">${icon("work")}</span><div><span class="badge">当前可用</span><h3>工作</h3><p>产品、项目与团队协作中的复杂决定。</p></div></button><button class="scene-card" disabled><span class="scene-icon">${icon("life")}</span><div><span class="badge muted">即将开放</span><h3>生活</h3><p>旅行、消费和家庭中的共同选择。</p></div></button><button class="scene-card" disabled><span class="scene-icon">${icon("learn")}</span><div><span class="badge muted">即将开放</span><h3>学习</h3><p>小组任务、选题和学习计划。</p></div></button></div></section>
  </main>`);
}

function renderWork() {
  return shell(`<main class="page"><div class="breadcrumbs"><button data-action="home">首页</button> / 工作</div><div class="page-head work-head"><div><p class="eyebrow">工作</p><h1 class="page-title">这件事更接近哪个领域？</h1><p class="lead">选一个最接近的即可。不确定时，可以直接描述问题。</p></div></div><div class="domain-grid">${workDomains.map((domain) => `<button class="domain-card ${domain.enabled ? "" : "disabled"}" data-action="open-domain" data-domain="${domain.key}" ${domain.enabled ? "" : "disabled"}><div class="domain-card-top"><span class="domain-icon">${icon(domain.key === "general-work" ? "general" : domain.key)}</span><span class="badge ${domain.enabled ? "" : "muted"}">${domain.status}</span></div><h2>${domain.label}</h2><p>${domain.description}</p><small>${domain.enabled ? domain.examples || "" : ""}</small></button>`).join("")}</div></main>`);
}

function renderScene() {
  return shell(`<main class="page"><div class="breadcrumbs"><button data-action="home">首页</button> / <button data-action="work">工作</button> / 产品与研发</div><div class="page-head"><div><p class="eyebrow">产品与研发</p><h1 class="page-title">从你们正在纠结的问题开始</h1><p class="lead">直接描述最省事，也可以选择一个相近的例子。</p></div><button class="primary" data-action="start-product-custom">描述我的问题</button></div><div class="template-guidance"><div><strong>常见例子</strong><p>只是帮你更快开始，不需要准确归类。</p></div></div><div class="template-grid">${templates.map((item) => `<button class="template-card" data-action="use-template" data-template="${item.key}"><span class="template-icon">${icon(item.icon)}</span><div><span class="badge">${item.label}</span><h3>${item.text}</h3><p>${item.key === "custom" ? "从空白问题开始" : "使用这个例子"}</p></div></button>`).join("")}</div></main>`);
}

function renderCreate() {
  const hasEnoughInput = state.caseText.trim().length >= 10;
  const analysis = state.previewAnalysis;
  return shell(`<main class="page create-page"><div class="breadcrumbs"><button data-action="work">工作</button> / <button data-action="scene">产品与研发</button> / 创建决策</div><div class="page-head"><div><p class="eyebrow">创建决策</p><h1 class="page-title">先把问题说清楚</h1><p>写下要决定的事情，以及你已经知道的限制。</p></div></div>
    <section class="composer"><label class="composer-label" for="case-input">问题和背景</label><textarea id="case-input" aria-label="问题和背景" placeholder="例如：必须在两周内上线，但完整范围预计需要六周，我们该保留哪些能力？" ${state.busy ? "disabled" : ""}>${escapeHtml(state.caseText)}</textarea><div class="composer-foot"><p class="helper">不用整理格式，AI 会先帮你拆开。</p><button class="primary" data-action="analyze-case" ${(hasEnoughInput && !state.busy) ? "" : "disabled"}>${state.busy === "analyze" ? "正在整理…" : "让 AI 帮我整理"}</button></div></section>
    ${state.busy === "analyze" ? '<section class="panel ai-loading-panel"><span class="loading-dot"></span><div><strong>正在理解这个问题</strong><p>梳理目标、相关人员、限制和还缺的信息。</p></div></section>' : ""}
    ${analysis ? `<section class="panel analysis-panel"><div class="object-head"><div><p class="section-label">AI 整理的内容</p><h2>${escapeHtml(analysis.title)}</h2></div><div class="analysis-badges"><span class="status-pill green">已经整理</span><span class="status-pill amber">请检查</span></div></div><div class="object-card"><strong>这次要解决什么</strong><p>${escapeHtml(analysis.goal)}</p></div><div class="analysis-columns"><div><p class="section-label">大家可能意见不同的地方</p><div class="chip-row">${(analysis.conflicts || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div></div><div><p class="section-label">还缺什么信息</p><ul class="list">${(analysis.informationGaps || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></div><div class="page-actions"><button class="secondary" data-action="edit-case">修改描述</button><button class="primary" data-action="create-decision" ${state.busy ? "disabled" : ""}>${state.busy === "create" ? "正在创建…" : "确认并开始"}</button></div></section>` : ""}
    ${!analysis && state.error ? '<section class="panel ai-error-panel"><div><strong>AI 暂时没有完成整理</strong><p>你的内容已经保留，可以重试，或先查看一份示例决策。</p></div><div class="card-actions"><button class="secondary" data-action="open-example">查看示例</button><button class="primary" data-action="analyze-case">重试</button></div></section>' : ""}
  </main>`);
}

function renderOverview() {
  const decision = state.decision;
  if (!decision) return renderHome();
  const confirmed = decision.participants.filter((item) => item.submissionStatus === "confirmed").length;
  const total = decision.participants.length || 1;
  const percent = Math.round((confirmed / total) * 100);
  const nextPending = decision.participants.find((item) => item.submissionStatus !== "confirmed");
  const diagnosis = artifact("diagnosis");
  const complete = decision.status === "complete";
  const nextAction = complete ? "final" : nextPending ? "select-participant" : decision.currentStage === "triage" ? "triage" : decision.currentStage === "conflict" || decision.currentStage === "clarify" ? "conflict" : decision.currentStage === "proposals" ? "explore" : decision.currentStage === "review" ? "review" : decision.currentStage === "final" ? "final" : "run-diagnose";
  const nextLabel = complete ? "查看决定记录" : nextPending ? "确认观点" : decision.currentStage === "triage" ? "判断是否继续" : decision.currentStage === "conflict" ? "看看卡在哪里" : decision.currentStage === "clarify" ? "补充信息" : decision.currentStage === "proposals" ? "比较方案" : decision.currentStage === "review" ? "让各方确认方案" : decision.currentStage === "final" ? "查看决定记录" : "整理大家的意见";
  const nextTitle = complete ? "这项决定已经保存" : nextPending ? `等待 ${escapeHtml(nextPending.name)} 确认观点` : decision.currentStage === "review" ? "正在等待每个人确认方案" : decision.currentStage === "final" ? "这项决定已经确认" : diagnosis ? "大家的观点已经整理好" : "可以开始整理大家的意见";
  const nextDescription = complete ? "你可以随时回来查看当时为什么这样决定。" : nextPending ? "最后一位参与者确认后，再判断这件事是否继续。" : decision.currentStage === "review" ? "切换身份，说明每个人能否接受当前方案。" : decision.currentStage === "final" ? "查看已经保存的决定、依据和负责人。" : diagnosis ? "接下来由负责人判断这件事是否值得继续。" : "AI 会根据每个人确认过的话，找出大家真正卡住的地方。";
  const nextButton = complete ? `<button class="primary" data-action="${nextAction}">${nextLabel}</button>` : nextPending ? `<button class="primary" data-action="select-participant" data-id="${nextPending.id}">${nextLabel}</button>` : `<button class="primary" data-action="${nextAction}" ${state.busy ? "disabled" : ""}>${state.busy === "diagnose" ? "正在梳理…" : nextLabel}</button>`;
  return shell(`<div class="page-head"><div><p class="eyebrow">这项决定</p><h1 style="font-size:36px">${escapeHtml(decision.title)}</h1><p>负责人：${escapeHtml(decision.ownerName)}${decision.deadline ? ` · 希望完成时间：${escapeHtml(decision.deadline)}` : ""}</p></div><span class="status-pill ${complete ? "green" : "amber"}">${complete ? "已经确认" : stageLabels[decision.currentStage] || "进行中"}</span></div>
    <section class="overview-grid"><div class="panel progress-panel"><div class="progress-ring" style="--progress:${percent * 3.6}deg"><span>${percent}%</span></div><div><p class="section-label">各方观点</p><h3>${confirmed} / ${total} 位参与者已确认</h3><p>只有本人确认过的话，AI 才会用来继续分析。</p></div></div><div class="panel timeline-panel"><p class="section-label">现在进行到哪里</p><div class="mini-timeline">${stageOrder.map((key, index) => `<span class="${index <= currentStageIndex() ? "done" : ""}"><i></i>${stageLabels[key]}</span>`).join("")}</div></div></section>
    <section class="panel"><div class="row-between"><div><p class="section-label">参与者</p><h3>查看或填写每个人的观点</h3></div></div><div class="participant-list">${decision.participants.map((participant) => `<button class="participant participant-button" data-action="select-participant" data-id="${participant.id}"><span class="avatar">${escapeHtml(participant.name.slice(0, 1))}</span><div><strong>${escapeHtml(participant.name)}</strong><small>${escapeHtml(participant.role)}</small></div><span class="status-pill ${participant.submissionStatus === "confirmed" ? "green" : "amber"}">${participant.submissionStatus === "confirmed" ? "已确认" : "待确认"}</span></button>`).join("")}</div></section>
    <section class="panel next-step-panel"><div><p class="section-label">下一步</p><h3>${nextTitle}</h3><p>${nextDescription}</p></div>${nextButton}</section>`);
}

function renderInput() {
  const decision = state.decision;
  if (!decision) return renderHome();
  const participant = decision.participants.find((item) => item.id === state.selectedParticipantId) || decision.participants.find((item) => item.submissionStatus !== "confirmed") || decision.participants[0];
  const saved = artifact(`viewpoint:${participant.id}`);
  const defaultText = decision.isSample ? sampleViewpoints[participant.id] || "" : "";
  const draft = state.participantDraft || saved?.text || defaultText;
  return shell(`<div class="page-head"><div><p class="eyebrow">参与者观点</p><h1 style="font-size:36px">${escapeHtml(participant.name)}怎么想？</h1><p>先说清目标、顾虑和不能接受的情况。</p></div><span class="status-pill ${participant.submissionStatus === "confirmed" ? "green" : "amber"}">${participant.submissionStatus === "confirmed" ? "已确认" : "待确认"}</span></div>
    <section class="role-context"><span class="avatar large">${escapeHtml(participant.name.slice(0, 1))}</span><div><strong>${escapeHtml(participant.name)}</strong><p>${escapeHtml(participant.role)}</p></div></section>
    <section class="composer"><label class="composer-label" for="participant-input">我的观点</label><textarea id="participant-input" aria-label="参与者观点" placeholder="例如：我希望按期上线，但不能接受高金额退款被自动处理。">${escapeHtml(draft)}</textarea><div class="composer-foot"><p class="helper">提交后，AI 会和其他人的观点一起梳理。</p><button class="primary" data-action="confirm-participant" data-participant-id="${escapeHtml(participant.id)}" ${state.busy ? "disabled" : ""}>${state.busy === "participant" ? "正在保存…" : "确认并提交"}</button></div></section><div class="page-actions"><button class="secondary" data-action="overview">返回总览</button></div>`);
}

function renderTriage() {
  const diagnosis = artifact("diagnosis");
  const triage = artifact("triage_decision");
  if (!diagnosis) return shell(`<section class="panel empty-state"><h2>还没有整理大家的意见</h2><p>先看看现有信息够不够，以及大家真正卡在哪里。</p><button class="primary" data-action="run-diagnose">开始整理</button></section>`);
  const assessment = diagnosis.demandAssessment;
  const outcomes = { need_evidence: "先找更多依据", defer: "暂时不决定", reject: "不再继续", proceed: "继续讨论" };
  return shell(`<div class="page-head"><div><p class="eyebrow">判断是否继续</p><h1 style="font-size:36px">这件事值得继续讨论吗？</h1><p>AI 帮你整理已有依据和风险，最后由负责人决定。</p></div><span class="status-pill amber">${escapeHtml(assessment.evidenceStatus)}</span></div>
    <section class="panel demand-card"><div class="demand-visual">${icon("value", "line-icon large-icon")}</div><div><p class="section-label">AI 帮你看到的情况</p><h2>${escapeHtml(assessment.summary)}</h2><p>${escapeHtml(assessment.recommendation)}</p></div></section>
    ${triage && triage.outcome !== "proceed" ? `<section class="panel alert"><h3>${outcomes[triage.outcome]}</h3><p>这个结果已经保存，你仍可以修改决定并继续。</p></section>` : ""}
    <section class="panel"><p class="section-label">由 ${escapeHtml(state.decision.ownerName)} 决定</p><div class="card-actions"><button class="primary" data-action="triage-decision" data-outcome="proceed">继续讨论</button><button class="secondary" data-action="triage-decision" data-outcome="need_evidence">先找更多依据</button><button class="secondary" data-action="triage-decision" data-outcome="defer">暂时不决定</button><button class="danger" data-action="triage-decision" data-outcome="reject">不再继续</button></div></section>`);
}

function severityLabel(value) {
  return value === "critical" ? "影响很大" : value === "high" ? "重要" : "需要关注";
}

function renderConflict() {
  const analysis = artifact("analysis") || {};
  const diagnosis = artifact("diagnosis");
  if (!diagnosis) return renderTriage();
  return shell(`<div class="page-head"><div><p class="eyebrow">看看卡在哪里</p><h1 style="font-size:36px">为什么大家一直定不下来？</h1><p>重点不是谁反对谁，而是哪两件事现在无法同时做到。</p></div><span class="status-pill red">${diagnosis.conflicts.length} 个主要问题</span></div>
    <section class="panel conflict-map-panel"><div class="map-goal"><span class="map-kicker">大家共同想做到</span><strong>${escapeHtml(analysis.goal || state.decision.title)}</strong></div><div class="conflict-map" aria-label="主要问题">${diagnosis.conflicts.map((conflict) => `<article class="conflict-map-row"><div class="map-node"><span>希望做到</span><strong>${escapeHtml(conflict.sideA)}</strong></div><div class="map-bridge ${conflict.severity === "critical" ? "red" : "amber"}"><span>${escapeHtml(conflict.title)}</span><strong>${severityLabel(conflict.severity)}</strong></div><div class="map-node"><span>但同时</span><strong>${escapeHtml(conflict.sideB)}</strong></div></article>`).join("")}</div></section>
    <section class="panel question-highlight"><span class="question-icon">?</span><div class="row-between"><div><p class="section-label">现在最该弄清楚</p><h3>${escapeHtml(diagnosis.questions[0]?.question || "还有哪些信息会改变选择？")}</h3><p>${escapeHtml(diagnosis.questions[0]?.why || "先弄清这个问题，再比较方案。")}</p></div><button class="primary" data-action="clarify">回答这个问题</button></div></section>`);
}

function metric(value) {
  const map = { low: ["低", 1], medium: ["中", 2], high: ["高", 3], uncertain: ["待确认", 1] };
  return map[value] || map.uncertain;
}

function proposalCard(proposal, selectedId) {
  const validation = displayValidationFor(proposal.id) || { status: proposal.meetsConstraints ? "pass" : "needs_evidence", reason: "还需要确认" };
  const labels = { pass: "可以选择", needs_evidence: "还缺信息", human_tradeoff: "需要决定是否接受代价", blocked: "现在不能选" };
  const tones = { pass: "green", needs_evidence: "amber", human_tradeoff: "amber", blocked: "red" };
  const selectable = ["pass", "human_tradeoff"].includes(validation.status);
  const metrics = [["能覆盖多少", ...metric(proposal.coverage)], ["能否按时", ...metric(proposal.timeConfidence)], ["风险是否可控", ...metric(proposal.riskControl)]];
  const actionLabel = validation.status === "human_tradeoff" ? "接受这个代价并选择" : labels[validation.status];
  const selectedLabel = selectedId === proposal.id && !selectable ? "原来选择，现已不可用" : selectedId === proposal.id ? "已选择" : actionLabel;
  return `<article class="proposal-card ${selectedId === proposal.id ? "recommended" : ""} ${selectable ? "" : "blocked"}"><div class="object-head"><span class="tag">方案 ${escapeHtml(proposal.id)}</span><span class="status-pill ${tones[validation.status]}">${labels[validation.status]}</span></div><h3>${escapeHtml(proposal.title)}</h3><p>${escapeHtml(proposal.summary)}</p><div class="proposal-metrics">${metrics.map(([label, value, level]) => `<div class="proposal-metric"><span>${label}</span><span class="metric-dots" aria-label="${label}${value}">${[1, 2, 3].map((index) => `<i class="${index <= level ? "filled" : ""}"></i>`).join("")}</span><strong>${value}</strong></div>`).join("")}</div><div class="proposal-note"><span>需要接受什么</span><p>${escapeHtml(proposal.tradeoff)}</p></div><details class="proposal-details"><summary>查看风险和选择条件</summary><p><strong>需要注意：</strong>${escapeHtml(proposal.risk)}</p><p><strong>为什么能选或不能选：</strong>${escapeHtml(validation.reason)}</p></details><div class="card-actions"><button class="choice-button ${selectedId === proposal.id ? "active" : ""}" data-action="select-proposal" data-id="${escapeHtml(proposal.id)}" ${selectable ? "" : "disabled"}>${selectedLabel}</button></div></article>`;
}

function renderClarify() {
  const diagnosis = artifact("diagnosis");
  const clarification = artifact("clarification");
  if (!diagnosis) return renderTriage();
  const evidenceQuestions = [{
    id: "objection-evidence",
    owner: "研发负责人",
    question: "为什么现在判断风险分类功能需要三周？",
    why: "确认工期是怎样估出来的，再决定是否按这条新信息调整方案。",
  }];
  const questions = state.objectionEvidenceMode ? evidenceQuestions : diagnosis.questions;
  const editable = ["conflict", "clarify"].includes(state.decision.currentStage) || state.revisingClarification;
  const justSaved = state.clarificationJustSaved && state.decision.currentStage === "clarify";
  if (justSaved) {
    const afterObjection = state.objectionEvidenceJustSaved;
    return shell(`<div class="page-head"><div><p class="eyebrow">补充信息</p><h1 style="font-size:36px">${afterObjection ? "新信息的依据已经补上" : "关键信息已经补上"}</h1><p>${afterObjection ? "现在可以回到方案页，看看哪些方案还能继续。" : "接下来用这些信息准备并检查候选方案。"}</p></div><span class="status-pill green">回答已保存</span></div><section class="panel success-panel"><p class="section-label">下一步</p><h3>${afterObjection ? "重新看看可选方案" : state.forceRegenerate ? "根据新信息更新方案" : "比较几种不同做法"}</h3><p>${state.decision.isSample ? "示例结果已经准备好，不需要等待 AI。" : "系统会根据刚补充的信息更新并检查方案。"}</p></section><div class="page-actions"><button class="secondary" data-action="conflict">返回看看问题</button><button class="primary" data-action="generate-proposals" ${state.busy ? "disabled" : ""}>${state.busy === "proposals" ? "正在准备方案…" : afterObjection ? "回到方案选择" : state.forceRegenerate ? "更新并检查方案" : "查看可选方案"}</button></div>`);
  }
  if (!editable) {
    return shell(`<div class="page-head"><div><p class="eyebrow">补充信息</p><h1 style="font-size:36px">决定方案前，我们补充了什么？</h1><p>这些回答会影响哪些方案能选。</p></div><span class="status-pill green">已经补充</span></div><section class="panel"><div class="question-list">${questions.map((question, index) => { const previous = (clarification?.answers || []).find((answer) => answer.questionId === question.id)?.answer || (state.decision.isSample ? "约 92%" : "未记录"); return `<div class="question-box"><p class="section-label">${index + 1}/${questions.length} · ${escapeHtml(question.owner)}</p><h3>${escapeHtml(question.question)}</h3><p class="saved-answer">${escapeHtml(previous)}</p></div>`; }).join("")}</div></section><div class="page-actions"><button class="secondary" data-action="conflict">返回看看问题</button><button class="primary" data-action="revise-clarification">修改信息并更新方案</button></div>`);
  }
  return shell(`<div class="page-head"><div><p class="eyebrow">补充信息</p><h1 style="font-size:36px">${state.objectionEvidenceMode ? "先确认这条新信息靠不靠谱" : "先补上最影响结果的信息"}</h1><p>${state.objectionEvidenceMode ? "有依据再调整方案，避免一句新说法就推翻原来的决定。" : "回答清楚后，才知道哪些方案能做。"}</p></div><span class="status-pill amber">${questions.length} 个问题</span></div><section class="panel"><div class="question-list">${questions.map((question, index) => { const previous = (clarification?.answers || []).find((answer) => answer.questionId === question.id)?.answer || ""; const sampleAnswer = state.objectionEvidenceMode ? "研发重新拆分了任务：规则整理 4 天、开发和联调 8 天、测试 3 天，至少需要三周。" : "约 92%"; return `<div class="question-box"><p class="section-label">请 ${escapeHtml(question.owner)} 回答 · ${index + 1}/${questions.length}</p><label for="answer-${escapeHtml(question.id)}">${escapeHtml(question.question)}</label><p>${escapeHtml(question.why)}</p><input id="answer-${escapeHtml(question.id)}" data-question-id="${escapeHtml(question.id)}" value="${escapeHtml(state.clarificationAnswers[question.id] || previous || (state.decision.isSample ? sampleAnswer : ""))}" /></div>`; }).join("")}</div><div class="page-actions"><button class="secondary" data-action="${state.objectionEvidenceMode ? "cancel-objection-evidence" : "conflict"}">${state.objectionEvidenceMode ? "返回各方意见" : "返回看看问题"}</button><button class="primary" data-action="save-clarifications">${state.objectionEvidenceMode ? "确认这条依据" : state.revisingClarification ? "保存并更新方案" : "保存回答"}</button></div></section>`);
}

function renderExplore() {
  const diagnosis = artifact("diagnosis");
  const proposalData = artifact("proposals");
  const selection = artifact("selection");
  if (!diagnosis) return renderTriage();
  if (!proposalData) return renderClarify();
  const proposals = proposalData.proposals || [];
  const activeObjection = artifact("objection_analysis");
  const hasAffectedSelection = activeObjection?.active !== false && activeObjection?.affectedProposalIds?.includes(selection?.proposalId);
  const effectiveSelectableCount = proposals.filter((item) => ["pass", "human_tradeoff"].includes(displayValidationFor(item.id)?.status)).length;
  const validationSummary = hasAffectedSelection
    ? "新信息已经让原方案无法继续，请从剩下的方案中重新选择。"
    : artifact("validation")?.summary || "每个方案都检查了限制和风险";
  const sampleTip = state.decision.isSample && !selection?.proposalId ? `<section class="panel demo-tip"><p class="section-label">演示建议</p><h3>先选择方案 B，看看新信息怎样改变选择</h3><p>研发更新工期后，方案 B 会变得不可用，你需要回到这里重新决定。</p></section>` : "";
  return shell(`<div class="page-head"><div><p class="eyebrow">比较方案</p><h1 style="font-size:36px">哪种做法更合适？</h1><p>比较每种做法能做到什么、要放弃什么，以及能不能按时完成。</p></div><span class="status-pill ${effectiveSelectableCount ? "green" : "amber"}">${effectiveSelectableCount} 个可以选择</span></div>${hasAffectedSelection ? '<section class="panel alert"><h3>原来选择的方案已经不能继续</h3><p>新信息改变了完成时间，请重新选择。</p></section>' : ""}${sampleTip}<div class="proposal-grid">${proposals.map((proposal) => proposalCard(proposal, selection?.proposalId)).join("")}</div><section class="panel subtle"><p class="section-label">检查结果</p><div class="check-summary"><span class="check-mark">${effectiveSelectableCount ? "✓" : "!"}</span><div><strong>${escapeHtml(validationSummary)}</strong><p>违反不能更改的条件，或者还缺关键信息的方案不能选择；是否接受代价由负责人决定。</p></div></div></section><div class="page-actions">${selection?.proposalId ? '<button class="secondary" data-action="clarify">查看补充信息</button>' : '<button class="secondary" data-action="revise-clarification">补充信息并更新方案</button>'}<button class="primary" data-action="review" ${(selection?.proposalId && !hasAffectedSelection) ? "" : "disabled"}>让各方确认方案</button></div>`);
}

function renderReview() {
  const selection = artifact("selection");
  const proposals = artifact("proposals")?.proposals || [];
  const selected = proposals.find((item) => item.id === selection?.proposalId);
  const storedObjection = artifact("objection");
  const objection = storedObjection?.active === false ? null : storedObjection;
  const storedObjectionAnalysis = artifact("objection_analysis");
  const objectionAnalysis = storedObjectionAnalysis?.active === false ? null : storedObjectionAnalysis;
  if (!selected) return renderExplore();
  const affected = objectionAnalysis?.affectedProposalIds || [];
  const selectionAffected = affected.includes(selected.id);
  const reviewedCount = state.decision.participants.filter((participant) => reviewFor(participant.id)).length;
  const allReviewed = reviewedCount === state.decision.participants.length;
  const reviewer = state.decision.participants.find((participant) => participant.id === state.selectedReviewerId)
    || state.decision.participants.find((participant) => !reviewFor(participant.id))
    || state.decision.participants[0];
  const savedReview = reviewFor(reviewer.id);
  const choice = savedReview?.status || state.reviewChoice;
  const note = savedReview?.note ?? state.reviewDraft;
  const canContinue = allReviewed && (!objection || objectionAnalysis) && !selectionAffected;
  return shell(`<div class="page-head"><div><p class="eyebrow">各方确认方案</p><h1 style="font-size:36px">${escapeHtml(selected.title)}</h1><p>每个人分别说明能否接受；有顾虑或反对时，需要写清原因。</p></div><span class="status-pill ${selectionAffected ? "red" : allReviewed ? "green" : "amber"}">${selectionAffected ? "当前方案需要重新处理" : `${reviewedCount}/${state.decision.participants.length} 已表态`}</span></div>
    <section class="panel selected-proposal"><p class="section-label">大家正在讨论的方案</p><h2>${escapeHtml(selected.summary)}</h2><div class="chip-row"><span class="tag">需要接受：${escapeHtml(selected.tradeoff)}</span><span class="tag">需要注意：${escapeHtml(selected.risk)}</span></div></section>
    <section class="panel"><div class="row-between"><div><p class="section-label">每个人的意见</p><h3>切换身份，确认能否接受当前方案</h3></div><strong class="review-progress">${reviewedCount}/${state.decision.participants.length}</strong></div><div class="review-list">${state.decision.participants.map((participant) => { const review = reviewFor(participant.id); return `<button class="review-row reviewer-button ${participant.id === reviewer.id ? "active" : ""}" data-action="select-reviewer" data-id="${escapeHtml(participant.id)}"><div><strong>${escapeHtml(participant.name)}</strong><small>${escapeHtml(participant.role)}</small></div><span class="status-pill ${review ? reviewTones[review.status] : "amber"}">${review ? reviewLabels[review.status] : "待确认"}</span></button>`; }).join("")}</div></section>
    <section class="panel review-editor"><div class="row-between"><div><p class="section-label">${escapeHtml(reviewer.name)}的意见</p><h3>${savedReview ? "可以修改已经提交的意见" : "你是否接受当前方案？"}</h3></div><span class="avatar">${escapeHtml(reviewer.name.slice(0, 1))}</span></div><div class="review-choice-grid">${Object.entries(reviewLabels).map(([value, label]) => `<button class="choice-button ${choice === value ? "active" : ""}" data-action="set-review-status" data-status="${value}">${label}</button>`).join("")}</div><label class="composer-label" for="review-note">${choice === "accept" ? "补充说明（选填）" : "请说明原因"}</label><textarea id="review-note" class="compact-textarea" aria-label="方案意见" placeholder="${choice === "accept" ? "例如：同意按这个范围推进。" : "说明具体顾虑、新情况或不能接受的条件。"}">${escapeHtml(note)}</textarea><div class="page-actions"><span class="helper">这条意见会保存在最后的决定记录里。</span><button class="primary" data-action="save-review" ${state.busy ? "disabled" : ""}>${state.busy === "review" ? "正在保存…" : "保存我的意见"}</button></div></section>
    ${objection ? (objectionAnalysis ? `<section class="panel danger-panel"><div class="object-head"><div><p class="section-label">这个新情况会影响什么</p><h3>${escapeHtml(objectionAnalysis.summary)}</h3></div><span class="status-pill red">${escapeHtml(objectionCategoryLabels[objectionAnalysis.category] || "需要处理")}</span></div><p>${escapeHtml(objectionAnalysis.recommendedAction)}</p><div class="impact-strip"><span>不能继续的方案</span><strong>${affected.length ? affected.map((id) => `方案 ${escapeHtml(id)}`).join("、") : "当前方案仍可继续"}</strong></div></section>` : `<section class="panel alert"><h3>反对意见已经保存</h3><p>AI 暂时没有分析完成，你可以稍后重试。</p><button class="primary" data-action="retry-objection">重试</button></section>`) : ""}
    <div class="page-actions">${selectionAffected ? '<span class="helper">如果对新信息还不确定，可以先查看依据；如果已经确认，就直接调整方案。</span><button class="secondary" data-action="check-objection-evidence">先确认新信息</button><button class="primary" data-action="explore">按新信息调整方案</button>' : `<span class="helper">${allReviewed ? "每个人都已经表态。" : "所有参与者表态后，才能进入最终确认。"}</span><button class="primary" data-action="final" ${canContinue ? "" : "disabled"}>进入最终确认</button>`}</div>`);
}

function buildFinalRecord() {
  const existing = artifact("final_record");
  if (existing) return existing;
  const selection = artifact("selection");
  const proposals = artifact("proposals")?.proposals || [];
  const proposal = proposals.find((item) => item.id === selection?.proposalId) || proposals[0] || {};
  const analysis = artifact("analysis") || {};
  const diagnosis = artifact("diagnosis") || {};
  const storedObjectionAnalysis = artifact("objection_analysis");
  const objectionAnalysis = storedObjectionAnalysis?.active === false ? null : storedObjectionAnalysis;
  const lastMeaningfulObjection = [...(state.decision.artifacts || [])].reverse().find((item) => item.type === "objection_analysis" && item.payload?.summary)?.payload || null;
  const reviews = state.decision.participants.map((participant) => ({ participant, review: reviewFor(participant.id) })).filter((item) => item.review);
  return {
    decision: proposal.summary || state.decision.title,
    why: `这个方案更接近大家共同想做到的事：“${analysis.goal || state.decision.title}”。目前也没有发现必须停止的问题。`,
    satisfied: ["保留了当前最重要的目标。", validationFor(proposal.id)?.reason || "没有违反已经确认的条件。"],
    evidence: (analysis.constraints || []).map((item) => item.statement).slice(0, 4).concat(diagnosis.demandAssessment?.evidenceStatus ? [`目前支持这项需求的信息：${diagnosis.demandAssessment.evidenceStatus}`] : []).slice(0, 5),
    sacrificed: proposal.tradeoff || "第一版要做多少仍需明确。",
    rejectedOptions: proposals.filter((item) => item.id !== proposal.id).map((item) => {
      const objectionReason = lastMeaningfulObjection?.affectedProposalIds?.includes(item.id) ? lastMeaningfulObjection.summary : "";
      return `${item.title}：${objectionReason || validationFor(item.id)?.reason || item.tradeoff || "不符合现在的选择"}`;
    }),
    risks: proposal.risk || "执行过程中仍要留意新的信息。",
    unresolvedObjections: reviews.filter((item) => item.review.status !== "accept").map((item) => `${item.participant.name}：${item.review.note}`).concat(objectionAnalysis && !objectionAnalysis.affectedProposalIds?.includes(proposal.id) ? [`${objectionAnalysis.summary}（已经确认，不影响当前方案继续）`] : []),
    acceptedRisks: [proposal.risk || "执行中继续留意新的信息"],
    responsibilities: state.decision.participants.map((item) => item.name === state.decision.ownerName ? `${item.name}：确认范围、推进执行并跟踪风险。` : `${item.name}：按${item.role}职责确认执行条件，发现变化时及时反馈。`),
    assumptions: proposal.assumptions || [],
    reopen: "关键目标、时间、成本或风险条件发生变化时，重新打开这项决定。",
    humanDecisionNote: `AI 帮忙整理、提出方案并检查问题；${state.decision.ownerName}听取各方意见后作出最终选择。`,
  };
}

function renderFinal() {
  const record = buildFinalRecord();
  const complete = state.decision?.status === "complete";
  const ready = state.finalRiskAcknowledged && state.finalHumanAcknowledged;
  return shell(`<div class="record-header"><p class="eyebrow">最终决定</p><h1>${escapeHtml(record.decision)}</h1><p>${complete ? "负责人已经确认并保存" : "等待负责人确认"}</p></div>${complete ? '<section class="panel success-panel"><div class="check-summary"><span class="check-mark">✓</span><div><strong>这项决定已经保存</strong><p>以后出现新信息时，原来的记录仍会保留。</p></div></div></section>' : ""}<div class="record-layout"><section class="record-section"><h3>为什么这样决定</h3><p>${escapeHtml(record.why)}</p></section><section class="record-section"><h3>做到了什么</h3><ul class="list">${(record.satisfied || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="record-section"><h3>主要依据</h3><ul class="list">${(record.evidence || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="record-section"><h3>为什么没有选其他方案</h3><ul class="list">${(record.rejectedOptions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="record-section"><h3>接受了什么代价</h3><p>${escapeHtml(record.sacrificed)}</p></section><section class="record-section"><h3>还要注意什么</h3><p>${escapeHtml(record.risks)}</p></section><section class="record-section"><h3>大家还有哪些顾虑</h3>${record.unresolvedObjections?.length ? `<ul class="list">${record.unresolvedObjections.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>目前没有尚未记录的顾虑。</p>"}</section><section class="record-section"><h3>谁来跟进</h3><ul class="list">${(record.responsibilities || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="record-section"><h3>什么情况下重新讨论</h3><p>${escapeHtml(record.reopen)}</p></section><section class="record-section"><h3>人和 AI 分别做了什么</h3><p>${escapeHtml(record.humanDecisionNote)}</p></section></div>${complete ? '<div class="page-actions"><button class="secondary" data-action="home">返回首页</button></div>' : `<section class="panel confirmation-panel"><label><input type="checkbox" id="confirm-risk" ${state.finalRiskAcknowledged ? "checked" : ""} />我已经了解仍然存在的问题和风险。</label><label><input type="checkbox" id="confirm-human" ${state.finalHumanAcknowledged ? "checked" : ""} />我确认最终选择由负责人作出。</label></section><div class="page-actions"><button class="secondary" data-action="review">返回各方意见</button><button class="primary" data-action="confirm-final" ${ready && !state.busy ? "" : "disabled"}>${state.busy === "final" ? "正在保存…" : "确认并保存"}</button></div>`}`);
}

function render() {
  const views = { home: renderHome, work: renderWork, scene: renderScene, create: renderCreate, overview: renderOverview, input: renderInput, triage: renderTriage, conflict: renderConflict, clarify: renderClarify, explore: renderExplore, review: renderReview, final: renderFinal };
  document.getElementById("app").innerHTML = (views[state.screen] || renderHome)();
  bindInputs();
  bindActions();
}

function bindInputs() {
  document.getElementById("home-input")?.addEventListener("input", (event) => { state.caseText = event.target.value; state.homeAnalyzed = false; event.target.closest(".composer")?.querySelector('[data-action="home-analyze"]')?.toggleAttribute("disabled", state.caseText.trim().length < 10); });
  document.getElementById("case-input")?.addEventListener("input", (event) => { state.caseText = event.target.value; state.previewAnalysis = null; state.error = ""; event.target.closest(".composer")?.querySelector('[data-action="analyze-case"]')?.toggleAttribute("disabled", state.caseText.trim().length < 10); });
  document.getElementById("participant-input")?.addEventListener("input", (event) => { state.participantDraft = event.target.value; });
  document.querySelectorAll("[data-question-id]").forEach((input) => input.addEventListener("input", () => { state.clarificationAnswers[input.dataset.questionId] = input.value; }));
  document.getElementById("review-note")?.addEventListener("input", (event) => { state.reviewDraft = event.target.value; });
  document.getElementById("confirm-risk")?.addEventListener("change", (event) => { state.finalRiskAcknowledged = event.target.checked; render(); });
  document.getElementById("confirm-human")?.addEventListener("change", (event) => { state.finalHumanAcknowledged = event.target.checked; render(); });
}

function bindActions() {
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action, button).catch((error) => { state.busy = ""; state.error = error.message; render(); })));
}

async function refreshDecisionList() {
  const payload = await api("/api/decisions");
  state.decisions = payload.decisions;
}

async function openDecision(id, screen = "overview", options = {}) {
  state.busy = "open";
  render();
  const payload = await api(`/api/decisions/${encodeURIComponent(id)}`);
  state.decision = payload.decision;
  resetDecisionUi(state.decision);
  state.busy = "";
  go(screen, options);
}

async function postEvent(type, payload = {}, actor) {
  const result = await api(`/api/decisions/${encodeURIComponent(state.decision.id)}/events`, { method: "POST", body: JSON.stringify({ type, actor: actor || state.decision.ownerName, payload }) });
  state.decision = result.decision;
  await refreshDecisionList();
  return result.decision;
}

async function runAiTask(task) {
  const payload = await api(`/api/decisions/${encodeURIComponent(state.decision.id)}/ai/${task}`, { method: "POST", body: "{}" });
  state.decision = payload.decision;
  return payload.result;
}

async function handleAction(action, button) {
  if (action === "dismiss-error") { state.error = ""; return render(); }
  if (action === "home") { state.decision = null; resetDecisionUi(null); await refreshDecisionList(); return go("home"); }
  if (action === "stage-nav") return go(button.dataset.screen);
  if (action === "reset-example") {
    state.busy = "reset";
    render();
    try {
      const payload = await api("/api/decisions/sample-ai-refund/reset", { method: "POST", body: "{}" });
      state.decision = payload.decision;
      resetDecisionUi(state.decision);
      await refreshDecisionList();
      go("overview");
    } finally { state.busy = ""; render(); }
    return;
  }
  if (action === "check-objection-evidence") {
    state.revisingClarification = true;
    state.objectionEvidenceMode = true;
    state.objectionEvidenceJustSaved = false;
    state.clarificationJustSaved = false;
    return go("clarify");
  }
  if (action === "cancel-objection-evidence") {
    state.revisingClarification = false;
    state.objectionEvidenceMode = false;
    state.objectionEvidenceJustSaved = false;
    return go("review");
  }
  if (action === "triage") {
    if (state.decision?.currentStage === "collect" && artifact("diagnosis")) await postEvent("stage_changed", { stage: "triage" }, "Resolve");
    return go("triage");
  }
  if (["work", "scene", "create", "overview", "input", "conflict", "clarify", "explore", "final"].includes(action)) return go(action);
  if (action === "review") {
    const nextReviewer = state.decision?.participants?.find((participant) => !reviewFor(participant.id)) || state.decision?.participants?.[0];
    selectReviewer(nextReviewer);
    return go("review");
  }
  if (action === "open-example") return openDecision("sample-ai-refund");
  if (action === "open-decision") return openDecision(button.dataset.id, button.dataset.id === "sample-ai-refund" ? "overview" : "overview");
  if (action === "home-analyze") { state.caseText = document.getElementById("home-input")?.value.trim() || state.caseText; state.homeAnalyzed = true; return render(); }
  if (action === "open-domain") { state.activeDomain = button.dataset.domain; state.caseText = ""; state.previewAnalysis = null; return go(state.activeDomain === "product" ? "scene" : "create"); }
  if (action === "start-product-custom") { state.caseText = ""; state.previewAnalysis = null; return go("create"); }
  if (action === "use-template") { const item = templates.find((template) => template.key === button.dataset.template); state.activeTemplate = item?.key || "custom"; state.caseText = item?.input || ""; state.previewAnalysis = null; return go("create"); }
  if (action === "edit-case") { state.previewAnalysis = null; return render(); }
  if (action === "analyze-case") {
    state.caseText = document.getElementById("case-input")?.value.trim() || state.caseText;
    state.busy = "analyze"; state.error = ""; render();
    try { const payload = await api("/api/analyze", { method: "POST", body: JSON.stringify({ problem: state.caseText }) }); state.previewAnalysis = payload.analysis; }
    finally { state.busy = ""; render(); }
    return;
  }
  if (action === "create-decision") {
    state.busy = "create"; render();
    try { const payload = await api("/api/decisions", { method: "POST", body: JSON.stringify({ sourceText: state.caseText, analysis: state.previewAnalysis, ownerName: "产品负责人", participants: state.previewAnalysis.participants }) }); state.decision = payload.decision; resetDecisionUi(state.decision); await refreshDecisionList(); go("overview"); }
    finally { state.busy = ""; render(); }
    return;
  }
  if (action === "select-participant") { state.selectedParticipantId = button.dataset.id; state.participantDraft = ""; return go("input"); }
  if (action === "confirm-participant") {
    const text = document.getElementById("participant-input")?.value.trim() || state.participantDraft.trim();
    if (text.length < 5) throw new Error("请先写下这位参与者的观点。");
    const participant = state.decision.participants.find((item) => item.id === button.dataset.participantId);
    if (!participant) throw new Error("没有找到这位参与者。");
    state.busy = "participant"; render();
    try { await postEvent("participant_confirmed", { participantId: participant.id, text }, participant.name); state.participantDraft = ""; go("overview"); }
    finally { state.busy = ""; render(); }
    return;
  }
  if (action === "run-diagnose") {
    state.busy = "diagnose"; state.error = ""; render();
    try { if (artifact("diagnosis")) await postEvent("stage_changed", { stage: "triage" }, "Resolve"); else await runAiTask("diagnose"); go("triage"); }
    finally { state.busy = ""; render(); }
    return;
  }
  if (action === "triage-decision") { await postEvent("triage_decided", { outcome: button.dataset.outcome }); return go(button.dataset.outcome === "proceed" ? "conflict" : "triage"); }
  if (action === "save-clarifications") {
    const answers = [...document.querySelectorAll("[data-question-id]")].map((input) => ({ questionId: input.dataset.questionId, answer: input.value.trim() })).filter((item) => item.answer);
    if (!answers.length) throw new Error("请至少回答一个问题。");
    const resolvingObjection = state.objectionEvidenceMode;
    const isRevision = state.revisingClarification || ["proposals", "review"].includes(state.decision.currentStage);
    await postEvent("clarification_answered", { answers }, "本地参与者");
    state.revisingClarification = false;
    state.objectionEvidenceMode = false;
    state.objectionEvidenceJustSaved = resolvingObjection;
    state.forceRegenerate = isRevision && !(resolvingObjection && state.decision.isSample);
    state.clarificationJustSaved = true;
    return go("clarify");
  }
  if (action === "revise-clarification") {
    if (["proposals", "review"].includes(state.decision.currentStage)) await postEvent("stage_changed", { stage: "conflict" }, "Resolve");
    state.revisingClarification = true;
    state.clarificationJustSaved = false;
    state.objectionEvidenceMode = false;
    state.objectionEvidenceJustSaved = false;
    state.forceRegenerate = false;
    return go("clarify");
  }
  if (action === "generate-proposals") {
    state.busy = "proposals"; state.error = ""; render();
    try {
      const regenerate = state.forceRegenerate;
      if (regenerate || !artifact("proposals")) await runAiTask("propose");
      if (regenerate || !artifact("validation")) await runAiTask("validate");
      else await postEvent("stage_changed", { stage: "proposals" }, "Resolve");
      state.forceRegenerate = false;
      state.clarificationJustSaved = false;
      state.objectionEvidenceJustSaved = false;
      go("explore");
    }
    finally { state.busy = ""; render(); }
    return;
  }
  if (action === "select-proposal") { await postEvent("proposal_selected", { proposalId: button.dataset.id }); return go("explore"); }
  if (action === "select-reviewer") {
    const participant = state.decision.participants.find((item) => item.id === button.dataset.id);
    selectReviewer(participant);
    return render();
  }
  if (action === "set-review-status") {
    state.reviewChoice = button.dataset.status;
    const participant = state.decision.participants.find((item) => item.id === state.selectedReviewerId);
    if (!state.reviewDraft && state.decision.isSample) state.reviewDraft = defaultSampleReview(participant).note;
    return render();
  }
  if (action === "save-review") {
    const participant = state.decision.participants.find((item) => item.id === state.selectedReviewerId);
    if (!participant) throw new Error("请选择一位参与者。");
    const note = document.getElementById("review-note")?.value.trim() || state.reviewDraft.trim();
    if (state.reviewChoice !== "accept" && note.length < 5) throw new Error("请说明你的顾虑或反对原因。");
    state.busy = "review"; state.error = ""; render();
    try {
      await postEvent("review_submitted", { participantId: participant.id, status: state.reviewChoice, note }, participant.name);
      if (state.reviewChoice === "oppose") {
        await postEvent("objection_submitted", { text: note }, participant.name);
        if (state.decision.isSample) await postEvent("objection_processed", { analysis: artifact("objection_template") }, "Resolve");
        else await runAiTask("objection");
      }
      const nextReviewer = state.decision.participants.find((item) => !reviewFor(item.id));
      selectReviewer(nextReviewer || participant);
      go("review");
    } finally { state.busy = ""; render(); }
    return;
  }
  if (action === "retry-objection") {
    const text = artifact("objection")?.text;
    if (!text || text.length < 5) throw new Error("请说明新的事实或顾虑。");
    state.busy = "objection"; state.error = ""; render();
    try {
      if (state.decision.isSample) await postEvent("objection_processed", { analysis: artifact("objection_template") }, "Resolve");
      else await runAiTask("objection");
      go("review");
    } finally { state.busy = ""; render(); }
    return;
  }
  if (action === "confirm-final") {
    if (!state.finalRiskAcknowledged || !state.finalHumanAcknowledged) return;
    state.busy = "final"; render();
    try { await postEvent("final_confirmed", { record: buildFinalRecord(), riskAcknowledged: true, humanAcknowledged: true }); go("final"); }
    finally { state.busy = ""; render(); }
  }
}

async function restoreRoute() {
  const params = new URLSearchParams(window.location.search);
  const decisionId = params.get("decision");
  const requestedScreen = params.get("screen");
  if (decisionId && decisionScreens.has(requestedScreen || "overview")) {
    await openDecision(decisionId, requestedScreen || "overview", { skipHistory: true });
    return;
  }
  state.decision = null;
  resetDecisionUi(null);
  go(simpleScreens.has(requestedScreen) ? requestedScreen : "home", { skipHistory: true });
}

async function initialize() {
  render();
  await refreshDecisionList();
  await restoreRoute();
  window.history.replaceState({ screen: state.screen, decisionId: state.decision?.id || null }, "", routeFor(state.screen));
  window.addEventListener("popstate", () => {
    restoreRoute().catch((error) => { state.busy = ""; state.error = error.message; render(); });
  });
}

initialize().catch((error) => { state.busy = ""; state.error = error.message; render(); });
