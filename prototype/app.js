const demoCase = "双十一前我们希望上线 AI 自动退款。业务希望尽可能全自动，研发表示完整版本至少需要四周，现在只有两周，风控要求 500 元以上退款必须人工审核。";
const sampleObjectionText = "风险分类模块实际需要三周，原来的工期假设不成立。";

const reviewLabels = { accept: "接受", concern: "有顾虑地接受", oppose: "反对" };
const reviewTones = { accept: "green", concern: "amber", oppose: "red" };
const objectionCategoryLabels = {
  new_fact: "出现了新事实",
  new_constraint: "新增了一项限制",
  changed_constraint: "原有限制发生变化",
  preference: "偏好不同",
  assumption_invalidated: "关键假设已失效",
  value_difference: "需要负责人取舍",
};

const templates = [
  { key: "scope-time", label: "范围与时间", text: "时间不够，应该保留哪些功能？", input: "客户要求两周内上线新版本，但完整范围预计需要六周。我们需要决定首期保留哪些能力。", icon: "scope" },
  { key: "value-cost", label: "价值与成本", text: "需求可能有价值，但开发代价很大。", input: "业务提出一个可能带来大客户签约的定制需求，但研发成本较高，也会增加长期维护负担。", icon: "value" },
  { key: "model-tradeoff", label: "AI 能力取舍", text: "模型效果、成本和速度怎么平衡？", input: "更强模型能提高回答质量，但推理成本翻倍、响应时间也更长。我们需要确定默认模型和降级策略。", icon: "model" },
  { key: "launch-risk", label: "上线与风险", text: "有风险，但业务希望尽快上线。", input: demoCase, icon: "risk" },
  { key: "custom-standard", label: "定制与标准化", text: "要不要为了大客户做定制功能？", input: "大客户要求增加一套专属审批流程，并承诺签约，但该功能可能破坏通用产品架构。", icon: "value" },
  { key: "custom", label: "其他问题", text: "直接用自己的话描述。", input: "", icon: "custom" },
];

const workDomains = [
  { key: "product", label: "产品与研发", description: "需求、范围、技术方案、模型能力和上线质量。", examples: "需求取舍 · 版本范围 · 上线风险", status: "当前可用", enabled: true },
  { key: "project", label: "项目与资源", description: "优先级、排期、预算、人力与跨团队依赖。", status: "即将开放", enabled: false },
  { key: "operation", label: "运营与增长", description: "增长策略、实验方案、活动节奏和用户运营。", status: "即将开放", enabled: false },
  { key: "customer", label: "客户与商务", description: "客户承诺、定制需求、合作条件和交付边界。", status: "即将开放", enabled: false },
  { key: "team", label: "团队与组织", description: "职责分工、协作机制、招聘和组织变化。", status: "即将开放", enabled: false },
  { key: "general-work", label: "不确定领域", description: "不确定属于哪里时，先直接描述问题。", examples: "无需提前归类", status: "直接描述", enabled: true },
];

const stageLabels = {
  collect: "收集观点",
  triage: "判断需求",
  conflict: "看清分歧",
  clarify: "补充信息",
  proposals: "比较方案",
  review: "处理异议",
  final: "确认决定",
};
const stageOrder = Object.keys(stageLabels);

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

function resetDecisionUi(decision) {
  state.selectedParticipantId = null;
  state.participantDraft = "";
  state.clarificationAnswers = {};
  state.revisingClarification = false;
  state.forceRegenerate = false;
  state.finalRiskAcknowledged = false;
  state.finalHumanAcknowledged = false;
  const nextReviewer = decision?.participants?.find((participant) => {
    const saved = [...(decision.artifacts || [])].reverse().find((item) => item.type === `review:${participant.id}`)?.payload;
    return !reviewLabels[saved?.status];
  }) || decision?.participants?.[0];
  state.selectedReviewerId = nextReviewer?.id || null;
  state.reviewChoice = decision?.isSample && nextReviewer?.name === "研发负责人" ? "oppose" : "accept";
  state.reviewDraft = decision?.isSample && nextReviewer?.name === "研发负责人" ? sampleObjectionText : "";
}

function validationFor(proposalId) {
  return (artifact("validation")?.results || []).find((item) => item.proposalId === proposalId) || null;
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

function go(screen) {
  state.screen = screen;
  state.error = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function currentStageIndex() {
  return Math.max(0, stageOrder.indexOf(state.decision?.currentStage || "collect"));
}

function topbar() {
  const labels = { home: "首页", work: "工作", scene: "产品与研发", create: "创建决策", overview: "决策总览", input: "收集观点", triage: "判断需求", conflict: "看清分歧", explore: "比较方案", review: "处理异议", final: "确认决定" };
  const location = labels[state.screen] || stageLabels[state.decision?.currentStage] || "决策空间";
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="返回 Resolve 首页"><span class="brand-mark">R</span><span>Resolve</span></button><div class="top-actions"><span class="screen-count">${location}</span>${state.decision ? '<button class="text-button" data-action="overview">决策总览</button>' : ""}</div></header>`;
}

function sidebar() {
  const active = currentStageIndex();
  return `<aside class="sidebar"><div class="case-name">${escapeHtml(state.decision?.title || "当前决策")}</div><nav class="step-list" aria-label="决策阶段">${stageOrder.map((key, index) => `<div class="step ${index === active ? "active" : index < active ? "done" : ""}"><span class="step-dot">${index < active ? "✓" : index + 1}</span><span>${stageLabels[key]}</span></div>`).join("")}</nav></aside>`;
}

function notice() {
  return state.error ? `<div class="global-notice" role="status"><strong>这一步没有完成</strong><span>${escapeHtml(state.error)}</span><button class="icon-button" data-action="dismiss-error" aria-label="关闭提示">×</button></div>` : "";
}

function shell(content) {
  const simple = ["home", "work", "scene", "create"].includes(state.screen);
  return `<div class="app-shell">${topbar()}${notice()}${simple ? content : `<main class="workspace">${sidebar()}<section class="content">${content}</section></main>`}</div>`;
}

function decisionCard(item) {
  const status = item.status === "complete" ? "已完成" : item.currentStage === "collect" ? "收集中" : stageLabels[item.currentStage] || "进行中";
  return `<button class="recent-card" data-action="open-decision" data-id="${item.id}"><div><span class="badge ${item.isSample ? "" : "muted"}">${item.isSample ? "示例" : status}</span><h3>${escapeHtml(item.title)}</h3><p>${item.confirmedCount}/${item.participantCount} 位参与者已确认观点</p></div><span class="recent-arrow">→</span></button>`;
}

function renderHome() {
  const hasEnoughInput = state.caseText.trim().length >= 10;
  return shell(`<main class="page home-page">
    <section class="home-hero"><div class="hero-copy"><p class="eyebrow">Resolve</p><h1>让分歧变得<br />可以讨论</h1><p class="lead">把各方的目标、限制和顾虑放在一起，找到真正卡住决定的地方。</p></div><div class="hero-visual" aria-hidden="true"><img src="assets/resolve-home.png" alt="" /></div></section>
    <section class="composer" aria-label="描述决策问题"><label class="composer-label" for="home-input">你们现在需要决定什么？</label><textarea id="home-input" aria-label="描述需要决定的问题" placeholder="例如：两周后必须上线，但完整功能至少需要一个月，我们该保留哪些范围？">${escapeHtml(state.caseText)}</textarea><div class="composer-foot"><p class="helper">直接用自己的话说清背景和限制即可。</p><div class="composer-actions"><button class="secondary" data-action="open-example">查看示例决策</button><button class="primary" data-action="home-analyze" ${hasEnoughInput ? "" : "disabled"}>继续</button></div></div></section>
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
    ${analysis ? `<section class="panel analysis-panel"><div class="object-head"><div><p class="section-label">AI 的理解</p><h2>${escapeHtml(analysis.title)}</h2></div><div class="analysis-badges"><span class="status-pill green">AI 已整理</span><span class="status-pill amber">请确认</span></div></div><div class="object-card"><strong>需要达成的目标</strong><p>${escapeHtml(analysis.goal)}</p></div><div class="analysis-columns"><div><p class="section-label">可能存在的分歧</p><div class="chip-row">${(analysis.conflicts || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div></div><div><p class="section-label">还需要了解</p><ul class="list">${(analysis.informationGaps || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></div><div class="page-actions"><button class="secondary" data-action="edit-case">修改描述</button><button class="primary" data-action="create-decision" ${state.busy ? "disabled" : ""}>${state.busy === "create" ? "正在创建…" : "确认并创建决策"}</button></div></section>` : ""}
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
  const nextLabel = complete ? "查看决策记录" : nextPending ? "提交观点" : decision.currentStage === "triage" ? "进入需求判断" : decision.currentStage === "conflict" ? "查看关键分歧" : decision.currentStage === "clarify" ? "补充信息" : decision.currentStage === "proposals" ? "比较方案" : decision.currentStage === "review" ? "进入方案审阅" : decision.currentStage === "final" ? "查看决策记录" : "梳理需求和分歧";
  const nextTitle = complete ? "这项决定已经留档" : nextPending ? `等待 ${escapeHtml(nextPending.name)} 确认观点` : decision.currentStage === "review" ? "方案已经进入各方审阅" : decision.currentStage === "final" ? "这项决定已经确认" : diagnosis ? "各方观点已经整理完成" : "可以开始梳理需求和分歧";
  const nextDescription = complete ? "你可以随时回来查看当时的理由和风险。" : nextPending ? "完成最后一位参与者的输入，再进入需求判断。" : decision.currentStage === "review" ? "切换身份，确认每个人对当前方案的意见。" : decision.currentStage === "final" ? "查看已保存的决定、证据和责任。" : diagnosis ? "接下来先确认这项需求是否值得继续讨论。" : "AI 会结合各方已确认的内容，找出真正冲突。";
  const nextButton = complete ? `<button class="primary" data-action="${nextAction}">${nextLabel}</button>` : nextPending ? `<button class="primary" data-action="select-participant" data-id="${nextPending.id}">${nextLabel}</button>` : `<button class="primary" data-action="${nextAction}" ${state.busy ? "disabled" : ""}>${state.busy === "diagnose" ? "正在梳理…" : nextLabel}</button>`;
  return shell(`<div class="page-head"><div><p class="eyebrow">决策空间</p><h1 style="font-size:36px">${escapeHtml(decision.title)}</h1><p>负责人：${escapeHtml(decision.ownerName)}${decision.deadline ? ` · 目标时间：${escapeHtml(decision.deadline)}` : ""}</p></div><span class="status-pill ${complete ? "green" : "amber"}">${complete ? "已经确认" : stageLabels[decision.currentStage] || "进行中"}</span></div>
    <section class="overview-grid"><div class="panel progress-panel"><div class="progress-ring" style="--progress:${percent * 3.6}deg"><span>${percent}%</span></div><div><p class="section-label">观点收集</p><h3>${confirmed} / ${total} 位参与者已确认</h3><p>只有本人确认过的内容，才会进入后续分析。</p></div></div><div class="panel timeline-panel"><p class="section-label">当前进度</p><div class="mini-timeline">${stageOrder.map((key, index) => `<span class="${index <= currentStageIndex() ? "done" : ""}"><i></i>${stageLabels[key]}</span>`).join("")}</div></div></section>
    <section class="panel"><div class="row-between"><div><p class="section-label">参与者</p><h3>切换身份，补充各方观点</h3></div></div><div class="participant-list">${decision.participants.map((participant) => `<button class="participant participant-button" data-action="select-participant" data-id="${participant.id}"><span class="avatar">${escapeHtml(participant.name.slice(0, 1))}</span><div><strong>${escapeHtml(participant.name)}</strong><small>${escapeHtml(participant.role)}</small></div><span class="status-pill ${participant.submissionStatus === "confirmed" ? "green" : "amber"}">${participant.submissionStatus === "confirmed" ? "已确认" : "待提交"}</span></button>`).join("")}</div></section>
    <section class="panel next-step-panel"><div><p class="section-label">下一步</p><h3>${nextTitle}</h3><p>${nextDescription}</p></div>${nextButton}</section>`);
}

function renderInput() {
  const decision = state.decision;
  if (!decision) return renderHome();
  const participant = decision.participants.find((item) => item.id === state.selectedParticipantId) || decision.participants.find((item) => item.submissionStatus !== "confirmed") || decision.participants[0];
  const saved = artifact(`viewpoint:${participant.id}`);
  const defaultText = decision.isSample && participant.name === "研发负责人" ? "完整自动退款至少需要四周。两周内只能上线低风险退款，高风险部分现在上线风险太大。" : "";
  const draft = state.participantDraft || saved?.text || defaultText;
  return shell(`<div class="page-head"><div><p class="eyebrow">参与者观点</p><h1 style="font-size:36px">${escapeHtml(participant.name)}怎么想？</h1><p>先说清目标、顾虑和不能接受的情况。</p></div><span class="status-pill ${participant.submissionStatus === "confirmed" ? "green" : "amber"}">${participant.submissionStatus === "confirmed" ? "已确认" : "待确认"}</span></div>
    <section class="role-context"><span class="avatar large">${escapeHtml(participant.name.slice(0, 1))}</span><div><strong>${escapeHtml(participant.name)}</strong><p>${escapeHtml(participant.role)}</p></div></section>
    <section class="composer"><label class="composer-label" for="participant-input">我的观点</label><textarea id="participant-input" aria-label="参与者观点" placeholder="例如：我希望按期上线，但不能接受高金额退款被自动处理。">${escapeHtml(draft)}</textarea><div class="composer-foot"><p class="helper">提交后，AI 会和其他人的观点一起梳理。</p><button class="primary" data-action="confirm-participant" data-participant-id="${escapeHtml(participant.id)}" ${state.busy ? "disabled" : ""}>${state.busy === "participant" ? "正在保存…" : "确认并提交"}</button></div></section><div class="page-actions"><button class="secondary" data-action="overview">返回总览</button></div>`);
}

function renderTriage() {
  const diagnosis = artifact("diagnosis");
  const triage = artifact("triage_decision");
  if (!diagnosis) return shell(`<section class="panel empty-state"><h2>还没有完成需求梳理</h2><p>先结合各方观点，看清证据是否足够。</p><button class="primary" data-action="run-diagnose">开始梳理</button></section>`);
  const assessment = diagnosis.demandAssessment;
  const outcomes = { need_evidence: "等待补充证据", defer: "暂缓这项决定", reject: "不再继续", proceed: "继续讨论" };
  return shell(`<div class="page-head"><div><p class="eyebrow">需求判断</p><h1 style="font-size:36px">这项需求值得继续讨论吗？</h1><p>AI 提供证据和风险，是否继续由负责人决定。</p></div><span class="status-pill amber">${escapeHtml(assessment.evidenceStatus)}</span></div>
    <section class="panel demand-card"><div class="demand-visual">${icon("value", "line-icon large-icon")}</div><div><p class="section-label">目前的判断</p><h2>${escapeHtml(assessment.summary)}</h2><p>${escapeHtml(assessment.recommendation)}</p></div></section>
    ${triage && triage.outcome !== "proceed" ? `<section class="panel alert"><h3>${outcomes[triage.outcome]}</h3><p>这个结果已经保存，你仍可以修改决定并继续。</p></section>` : ""}
    <section class="panel"><p class="section-label">由 ${escapeHtml(state.decision.ownerName)} 决定</p><div class="card-actions"><button class="primary" data-action="triage-decision" data-outcome="proceed">继续讨论</button><button class="secondary" data-action="triage-decision" data-outcome="need_evidence">先补充证据</button><button class="secondary" data-action="triage-decision" data-outcome="defer">暂缓</button><button class="danger" data-action="triage-decision" data-outcome="reject">不再继续</button></div></section>`);
}

function severityLabel(value) {
  return value === "critical" ? "影响很大" : value === "high" ? "重要" : "需要关注";
}

function renderConflict() {
  const analysis = artifact("analysis") || {};
  const diagnosis = artifact("diagnosis");
  if (!diagnosis) return renderTriage();
  return shell(`<div class="page-head"><div><p class="eyebrow">关键分歧</p><h1 style="font-size:36px">是什么让这件事迟迟定不下来？</h1><p>问题不在于谁反对谁，而在于哪些目标和限制无法同时满足。</p></div><span class="status-pill red">${diagnosis.conflicts.length} 个关键分歧</span></div>
    <section class="panel conflict-map-panel"><div class="map-goal"><span class="map-kicker">共同目标</span><strong>${escapeHtml(analysis.goal || state.decision.title)}</strong></div><div class="conflict-map" aria-label="关键分歧">${diagnosis.conflicts.map((conflict) => `<article class="conflict-map-row"><div class="map-node"><span>一项要求</span><strong>${escapeHtml(conflict.sideA)}</strong></div><div class="map-bridge ${conflict.severity === "critical" ? "red" : "amber"}"><span>${escapeHtml(conflict.title)}</span><strong>${severityLabel(conflict.severity)}</strong></div><div class="map-node"><span>另一项限制</span><strong>${escapeHtml(conflict.sideB)}</strong></div></article>`).join("")}</div></section>
    <section class="panel question-highlight"><span class="question-icon">?</span><div class="row-between"><div><p class="section-label">现在最值得补充的信息</p><h3>${escapeHtml(diagnosis.questions[0]?.question || "还有哪些信息会改变方案？")}</h3><p>${escapeHtml(diagnosis.questions[0]?.why || "补充后再比较方案，会更可靠。")}</p></div><button class="primary" data-action="explore">补充信息</button></div></section>`);
}

function metric(value) {
  const map = { low: ["低", 1], medium: ["中", 2], high: ["高", 3], uncertain: ["待确认", 1] };
  return map[value] || map.uncertain;
}

function proposalCard(proposal, selectedId) {
  const validation = validationFor(proposal.id) || { status: proposal.meetsConstraints ? "pass" : "needs_evidence", reason: "仍需确认" };
  const labels = { pass: "可以选择", needs_evidence: "信息待确认", human_tradeoff: "需负责人取舍", blocked: "暂不可选" };
  const tones = { pass: "green", needs_evidence: "amber", human_tradeoff: "amber", blocked: "red" };
  const selectable = ["pass", "human_tradeoff"].includes(validation.status);
  const metrics = [["覆盖范围", ...metric(proposal.coverage)], ["按期把握", ...metric(proposal.timeConfidence)], ["风险可控", ...metric(proposal.riskControl)]];
  const actionLabel = validation.status === "human_tradeoff" ? "确认接受这个取舍" : labels[validation.status];
  return `<article class="proposal-card ${selectedId === proposal.id ? "recommended" : ""} ${selectable ? "" : "blocked"}"><div class="object-head"><span class="tag">方案 ${escapeHtml(proposal.id)}</span><span class="status-pill ${tones[validation.status]}">${labels[validation.status]}</span></div><h3>${escapeHtml(proposal.title)}</h3><p>${escapeHtml(proposal.summary)}</p><div class="proposal-metrics">${metrics.map(([label, value, level]) => `<div class="proposal-metric"><span>${label}</span><span class="metric-dots" aria-label="${label}${value}">${[1, 2, 3].map((index) => `<i class="${index <= level ? "filled" : ""}"></i>`).join("")}</span><strong>${value}</strong></div>`).join("")}</div><div class="proposal-note"><span>主要取舍</span><p>${escapeHtml(proposal.tradeoff)}</p></div><details class="proposal-details"><summary>查看风险和条件</summary><p><strong>风险：</strong>${escapeHtml(proposal.risk)}</p><p><strong>检查结果：</strong>${escapeHtml(validation.reason)}</p></details><div class="card-actions"><button class="choice-button ${selectedId === proposal.id ? "active" : ""}" data-action="select-proposal" data-id="${escapeHtml(proposal.id)}" ${selectable ? "" : "disabled"}>${selectedId === proposal.id ? "已选择" : actionLabel}</button></div></article>`;
}

function renderExplore() {
  const diagnosis = artifact("diagnosis");
  const clarification = artifact("clarification");
  const proposalData = artifact("proposals");
  const selection = artifact("selection");
  if (!diagnosis) return renderTriage();
  if (!proposalData || state.revisingClarification || state.forceRegenerate) {
    return shell(`<div class="page-head"><div><p class="eyebrow">补充信息</p><h1 style="font-size:36px">先补上最影响结果的信息</h1><p>回答会直接影响哪些方案可行。</p></div><span class="status-pill amber">${diagnosis.questions.length} 个问题</span></div>
      ${!clarification || state.revisingClarification ? `<section class="panel"><div class="question-list">${diagnosis.questions.map((question, index) => { const previous = (clarification?.answers || []).find((answer) => answer.questionId === question.id)?.answer || ""; return `<div class="question-box"><p class="section-label">请 ${escapeHtml(question.owner)} 回答 · ${index + 1}/${diagnosis.questions.length}</p><label for="answer-${escapeHtml(question.id)}">${escapeHtml(question.question)}</label><p>${escapeHtml(question.why)}</p><input id="answer-${escapeHtml(question.id)}" data-question-id="${escapeHtml(question.id)}" value="${escapeHtml(state.clarificationAnswers[question.id] || previous || (state.decision.isSample ? "约 92%" : ""))}" /></div>`; }).join("")}</div><div class="page-actions"><button class="secondary" data-action="conflict">返回分歧</button><button class="primary" data-action="save-clarifications">${proposalData ? "保存补充信息" : "保存回答"}</button></div></section>` : `<section class="panel success-panel"><p class="section-label">回答已保存</p><h3>${state.forceRegenerate ? "补充信息会用于新一轮方案" : "现在可以比较不同的取舍方向"}</h3><p>AI 会结合已确认目标、限制和补充信息生成方案。</p></section><div class="page-actions"><button class="secondary" data-action="conflict">返回分歧</button><button class="primary" data-action="generate-proposals" ${state.busy ? "disabled" : ""}>${state.busy === "proposals" ? "正在准备方案…" : state.forceRegenerate ? "重新生成并检查" : "查看可选方案"}</button></div>`}`);
  }
  const proposals = proposalData.proposals || [];
  const selectableCount = proposals.filter((item) => ["pass", "human_tradeoff"].includes(validationFor(item.id)?.status)).length;
  return shell(`<div class="page-head"><div><p class="eyebrow">比较方案</p><h1 style="font-size:36px">哪一种取舍更合适？</h1><p>重点比较范围、时间和风险，不必寻找没有代价的答案。</p></div><span class="status-pill ${selectableCount ? "green" : "amber"}">${selectableCount} 个可以选择</span></div><div class="proposal-grid">${proposals.map((proposal) => proposalCard(proposal, selection?.proposalId)).join("")}</div><section class="panel subtle"><p class="section-label">方案检查结果</p><div class="check-summary"><span class="check-mark">${selectableCount ? "✓" : "!"}</span><div><strong>${escapeHtml(artifact("validation")?.summary || "每个方案都已检查限制和风险")}</strong><p>违反硬约束或缺少关键证据的方案不能选择；价值取舍由负责人确认。</p></div></div></section><div class="page-actions">${selection?.proposalId ? '<button class="secondary" data-action="conflict">返回分歧</button>' : '<button class="secondary" data-action="revise-clarification">补充信息并重做方案</button>'}<button class="primary" data-action="review" ${selection?.proposalId ? "" : "disabled"}>进入方案审阅</button></div>`);
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
  return shell(`<div class="page-head"><div><p class="eyebrow">方案审阅</p><h1 style="font-size:36px">${escapeHtml(selected.title)}</h1><p>每个人分别说明是否接受；有顾虑或反对时，需要写清原因。</p></div><span class="status-pill ${selectionAffected ? "red" : allReviewed ? "green" : "amber"}">${selectionAffected ? "所选方案受到影响" : `${reviewedCount}/${state.decision.participants.length} 已完成审阅`}</span></div>
    <section class="panel selected-proposal"><p class="section-label">当前选择</p><h2>${escapeHtml(selected.summary)}</h2><div class="chip-row"><span class="tag">取舍：${escapeHtml(selected.tradeoff)}</span><span class="tag">风险：${escapeHtml(selected.risk)}</span></div></section>
    <section class="panel"><div class="row-between"><div><p class="section-label">各方审阅</p><h3>切换身份，确认对当前方案的意见</h3></div><strong class="review-progress">${reviewedCount}/${state.decision.participants.length}</strong></div><div class="review-list">${state.decision.participants.map((participant) => { const review = reviewFor(participant.id); return `<button class="review-row reviewer-button ${participant.id === reviewer.id ? "active" : ""}" data-action="select-reviewer" data-id="${escapeHtml(participant.id)}"><div><strong>${escapeHtml(participant.name)}</strong><small>${escapeHtml(participant.role)}</small></div><span class="status-pill ${review ? reviewTones[review.status] : "amber"}">${review ? reviewLabels[review.status] : "待审阅"}</span></button>`; }).join("")}</div></section>
    <section class="panel review-editor"><div class="row-between"><div><p class="section-label">${escapeHtml(reviewer.name)}的意见</p><h3>${savedReview ? "可以修改已经提交的审阅" : "你是否接受当前方案？"}</h3></div><span class="avatar">${escapeHtml(reviewer.name.slice(0, 1))}</span></div><div class="review-choice-grid">${Object.entries(reviewLabels).map(([value, label]) => `<button class="choice-button ${choice === value ? "active" : ""}" data-action="set-review-status" data-status="${value}">${label}</button>`).join("")}</div><label class="composer-label" for="review-note">${choice === "accept" ? "补充说明（选填）" : "请说明原因"}</label><textarea id="review-note" class="compact-textarea" aria-label="审阅说明" placeholder="${choice === "accept" ? "例如：同意按这个范围推进。" : "说明具体顾虑、新事实或不能接受的条件。"}">${escapeHtml(note)}</textarea><div class="page-actions"><span class="helper">审阅意见会作为决策记录的一部分保留。</span><button class="primary" data-action="save-review" ${state.busy ? "disabled" : ""}>${state.busy === "review" ? "正在保存…" : "保存审阅意见"}</button></div></section>
    ${objection ? (objectionAnalysis ? `<section class="panel danger-panel"><div class="object-head"><div><p class="section-label">这条异议会带来什么影响</p><h3>${escapeHtml(objectionAnalysis.summary)}</h3></div><span class="status-pill red">${escapeHtml(objectionCategoryLabels[objectionAnalysis.category] || "需要进一步处理")}</span></div><p>${escapeHtml(objectionAnalysis.recommendedAction)}</p><div class="impact-strip"><span>受到影响</span><strong>${affected.length ? affected.map((id) => `方案 ${escapeHtml(id)}`).join("、") : "当前方案不受影响"}</strong></div></section>` : `<section class="panel alert"><h3>异议已经保存</h3><p>AI 暂时没有完成理解，你可以稍后重试。</p><button class="primary" data-action="retry-objection">重试</button></section>`) : ""}
    <div class="page-actions">${selectionAffected ? '<button class="primary" data-action="explore">返回方案并重新选择</button>' : `<span class="helper">${allReviewed ? "各方已经完成审阅。" : "所有参与者完成审阅后，才能进入最终确认。"}</span><button class="primary" data-action="final" ${canContinue ? "" : "disabled"}>进入最终确认</button>`}</div>`);
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
  const reviews = state.decision.participants.map((participant) => ({ participant, review: reviewFor(participant.id) })).filter((item) => item.review);
  return {
    decision: proposal.summary || state.decision.title,
    why: `这个方向更符合“${analysis.goal || state.decision.title}”，并且当前检查没有发现阻断性的硬约束冲突。`,
    satisfied: ["保留了当前最重要的目标。", validationFor(proposal.id)?.reason || "满足已确认限制。"],
    evidence: (analysis.constraints || []).map((item) => item.statement).slice(0, 4).concat(diagnosis.demandAssessment?.evidenceStatus ? [`需求证据状态：${diagnosis.demandAssessment.evidenceStatus}`] : []).slice(0, 5),
    sacrificed: proposal.tradeoff || "仍需明确首期范围。",
    rejectedOptions: proposals.filter((item) => item.id !== proposal.id).map((item) => `${item.title}：${validationFor(item.id)?.reason || item.tradeoff || "不符合当前取舍方向"}`),
    risks: proposal.risk || "执行过程中仍需持续观察新证据。",
    unresolvedObjections: reviews.filter((item) => item.review.status !== "accept").map((item) => `${item.participant.name}：${item.review.note}`).concat(objectionAnalysis && !objectionAnalysis.affectedProposalIds?.includes(proposal.id) ? [`${objectionAnalysis.summary}（已评估，不阻断当前方案）`] : []),
    acceptedRisks: [proposal.risk || "执行中继续观察新证据"],
    responsibilities: state.decision.participants.map((item) => item.name === state.decision.ownerName ? `${item.name}：确认范围、推进执行并跟踪风险。` : `${item.name}：按${item.role}职责确认执行条件，发现变化时及时反馈。`),
    assumptions: proposal.assumptions || [],
    reopen: "关键目标、时间、成本或风险条件发生变化时，重新打开这项决定。",
    humanDecisionNote: `AI 提供候选方案和检查结果；${state.decision.ownerName}查看各方审阅后作出最终选择。`,
  };
}

function renderFinal() {
  const record = buildFinalRecord();
  const complete = state.decision?.status === "complete";
  const ready = state.finalRiskAcknowledged && state.finalHumanAcknowledged;
  return shell(`<div class="record-header"><p class="eyebrow">最终决定</p><h1>${escapeHtml(record.decision)}</h1><p>${complete ? "已经由负责人确认并留档" : "等待负责人确认"}</p></div>${complete ? '<section class="panel success-panel"><div class="check-summary"><span class="check-mark">✓</span><div><strong>这项决定已经保存</strong><p>以后出现新信息时，原记录不会被覆盖。</p></div></div></section>' : ""}<div class="record-layout"><section class="record-section"><h3>为什么这样决定</h3><p>${escapeHtml(record.why)}</p></section><section class="record-section"><h3>满足了什么</h3><ul class="list">${(record.satisfied || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="record-section"><h3>关键依据</h3><ul class="list">${(record.evidence || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="record-section"><h3>为什么没有选其他方案</h3><ul class="list">${(record.rejectedOptions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="record-section"><h3>接受了什么代价</h3><p>${escapeHtml(record.sacrificed)}</p></section><section class="record-section"><h3>仍需关注的风险</h3><p>${escapeHtml(record.risks)}</p></section><section class="record-section"><h3>各方仍有的顾虑</h3>${record.unresolvedObjections?.length ? `<ul class="list">${record.unresolvedObjections.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>当前没有未记录的顾虑。</p>"}</section><section class="record-section"><h3>谁来跟进</h3><ul class="list">${(record.responsibilities || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="record-section"><h3>什么时候重新讨论</h3><p>${escapeHtml(record.reopen)}</p></section><section class="record-section"><h3>人和 AI 如何分工</h3><p>${escapeHtml(record.humanDecisionNote)}</p></section></div>${complete ? '<div class="page-actions"><button class="secondary" data-action="home">返回首页</button></div>' : `<section class="panel confirmation-panel"><label><input type="checkbox" id="confirm-risk" ${state.finalRiskAcknowledged ? "checked" : ""} />我已经了解仍然存在的风险。</label><label><input type="checkbox" id="confirm-human" ${state.finalHumanAcknowledged ? "checked" : ""} />我确认这是负责人的最终决定。</label></section><div class="page-actions"><button class="secondary" data-action="review">返回审阅</button><button class="primary" data-action="confirm-final" ${ready && !state.busy ? "" : "disabled"}>${state.busy === "final" ? "正在保存…" : "确认并留档"}</button></div>`}`);
}

function render() {
  const views = { home: renderHome, work: renderWork, scene: renderScene, create: renderCreate, overview: renderOverview, input: renderInput, triage: renderTriage, conflict: renderConflict, explore: renderExplore, review: renderReview, final: renderFinal };
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

async function openDecision(id, screen = "overview") {
  state.busy = "open";
  render();
  const payload = await api(`/api/decisions/${encodeURIComponent(id)}`);
  state.decision = payload.decision;
  resetDecisionUi(state.decision);
  state.busy = "";
  go(screen);
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
  if (action === "home") { state.decision = null; resetDecisionUi(null); state.screen = "home"; await refreshDecisionList(); return render(); }
  if (action === "triage") {
    if (state.decision?.currentStage === "collect" && artifact("diagnosis")) await postEvent("stage_changed", { stage: "triage" }, "Resolve");
    return go("triage");
  }
  if (action === "explore") {
    if (state.decision && artifact("proposals") && state.decision.currentStage !== "proposals") await postEvent("stage_changed", { stage: "proposals" }, "Resolve");
    return go("explore");
  }
  if (["work", "scene", "create", "overview", "input", "conflict", "review", "final"].includes(action)) return go(action);
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
    finally { state.busy = ""; }
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
    finally { state.busy = ""; }
    return;
  }
  if (action === "run-diagnose") {
    state.busy = "diagnose"; state.error = ""; render();
    try { if (artifact("diagnosis")) await postEvent("stage_changed", { stage: "triage" }, "Resolve"); else await runAiTask("diagnose"); go("triage"); }
    finally { state.busy = ""; }
    return;
  }
  if (action === "triage-decision") { await postEvent("triage_decided", { outcome: button.dataset.outcome }); return go(button.dataset.outcome === "proceed" ? "conflict" : "triage"); }
  if (action === "save-clarifications") {
    const answers = [...document.querySelectorAll("[data-question-id]")].map((input) => ({ questionId: input.dataset.questionId, answer: input.value.trim() })).filter((item) => item.answer);
    if (!answers.length) throw new Error("请至少回答一个问题。");
    const isRevision = state.revisingClarification || Boolean(artifact("proposals"));
    await postEvent("clarification_answered", { answers }, "本地参与者");
    state.revisingClarification = false;
    state.forceRegenerate = isRevision;
    return go("explore");
  }
  if (action === "revise-clarification") {
    if (["proposals", "review"].includes(state.decision.currentStage)) await postEvent("stage_changed", { stage: "conflict" }, "Resolve");
    state.revisingClarification = true;
    state.forceRegenerate = false;
    return go("explore");
  }
  if (action === "generate-proposals") {
    state.busy = "proposals"; state.error = ""; render();
    try {
      const regenerate = state.forceRegenerate;
      if (regenerate || !artifact("proposals")) await runAiTask("propose");
      if (regenerate || !artifact("validation")) await runAiTask("validate");
      else await postEvent("stage_changed", { stage: "proposals" }, "Resolve");
      state.forceRegenerate = false;
      go("explore");
    }
    finally { state.busy = ""; }
    return;
  }
  if (action === "select-proposal") { await postEvent("proposal_selected", { proposalId: button.dataset.id }); return go("explore"); }
  if (action === "select-reviewer") {
    state.selectedReviewerId = button.dataset.id;
    const participant = state.decision.participants.find((item) => item.id === state.selectedReviewerId);
    const savedReview = reviewFor(state.selectedReviewerId);
    state.reviewChoice = savedReview?.status || (state.decision.isSample && participant?.name === "研发负责人" ? "oppose" : "accept");
    state.reviewDraft = savedReview?.note ?? (state.decision.isSample && participant?.name === "研发负责人" ? sampleObjectionText : "");
    return render();
  }
  if (action === "set-review-status") {
    state.reviewChoice = button.dataset.status;
    const participant = state.decision.participants.find((item) => item.id === state.selectedReviewerId);
    if (state.reviewChoice === "oppose" && state.decision.isSample && participant?.name === "研发负责人" && !state.reviewDraft) state.reviewDraft = sampleObjectionText;
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
      state.selectedReviewerId = nextReviewer?.id || participant.id;
      state.reviewChoice = nextReviewer ? "accept" : state.reviewChoice;
      state.reviewDraft = "";
      go("review");
    } finally { state.busy = ""; }
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
    } finally { state.busy = ""; }
    return;
  }
  if (action === "confirm-final") {
    if (!state.finalRiskAcknowledged || !state.finalHumanAcknowledged) return;
    state.busy = "final"; render();
    try { await postEvent("final_confirmed", { record: buildFinalRecord(), riskAcknowledged: true, humanAcknowledged: true }); go("final"); }
    finally { state.busy = ""; }
  }
}

async function initialize() {
  render();
  await refreshDecisionList();
  const params = new URLSearchParams(window.location.search);
  const decisionId = params.get("decision");
  const requestedScreen = params.get("screen");
  const allowedScreens = new Set(["overview", "input", "triage", "conflict", "explore", "review", "final"]);
  if (decisionId) {
    await openDecision(decisionId, allowedScreens.has(requestedScreen) ? requestedScreen : "overview");
    return;
  }
  render();
}

initialize().catch((error) => { state.busy = ""; state.error = error.message; render(); });
