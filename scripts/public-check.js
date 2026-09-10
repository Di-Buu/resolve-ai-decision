const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = [
  "README.md",
  "LICENSE",
  ".github/workflows/ci.yml",
  "server.js",
  "ai.js",
  "db/database.js",
  "db/seed.js",
  "prototype/index.html",
  "prototype/app.js",
  "prototype/styles.css",
  "evals/run-smoke.js",
  "evals/run-flow.js",
  "evals/run-baseline.js",
  "evals/resolvebench_smoke.json",
  "evals/resolvebench_sample.json",
  "evals/resolvebench_flow.json",
  "package.json",
  ".env.example",
  "docs/02_Resolve_Mini_PRD_V1.md",
  "docs/04_AI方案与评测设计.md",
  "docs/09_模型对比实验报告.md",
  "docs/10_工作流基线对照报告.md",
  "docs/11_项目案例一页版.md",
];

const requiredIgnoreRules = [
  ".env",
  "node_modules/",
  "data/",
  "evals/results/",
  "evals/resolvebench_holdout.json",
  "career/",
  "AGENTS.md",
  "docs/01_产品概览.md",
  "docs/03_页面状态与交互规则.md",
  "docs/05_迭代记录.md",
  "docs/06_目标用户走查计划.md",
  "docs/07_项目案例说明.md",
  "docs/08_模型选型与调用策略.md",
  "prototype/README.md",
];
const ignoreFile = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
const missingRules = requiredIgnoreRules.filter((rule) => !ignoreFile.split(/\r?\n/).includes(rule));
if (missingRules.length) throw new Error(`缺少 Git 忽略规则：${missingRules.join(", ")}`);

const secretPatterns = [
  /sk-[A-Za-z0-9]{20,}/,
  /DASHSCOPE_API_KEY[ \t]*=[ \t]*[^\s#]{12,}/,
  /OPENAI_API_KEY[ \t]*=[ \t]*[^\s#]{12,}/,
];
const forbiddenUserFacingPhrases = ["为了求职", "给面试官看", "原型范围", "服务端密钥", "调用耗时"];
const failures = [];
for (const relative of files) {
  const fullPath = path.join(root, relative);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${relative} 不存在`);
    continue;
  }
  const content = fs.readFileSync(fullPath, "utf8");
  if (secretPatterns.some((pattern) => pattern.test(content))) failures.push(`${relative} 疑似包含密钥`);
  if (relative === "prototype/app.js") {
    for (const phrase of forbiddenUserFacingPhrases) {
      if (content.includes(phrase)) failures.push(`主界面文案仍包含“${phrase}”`);
    }
  }
}
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`公开前检查通过：扫描 ${files.length} 个项目文件，未发现密钥或不应进入主界面的开发说明。`);
}
