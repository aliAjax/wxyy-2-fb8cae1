#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";

const MODULES = {
  review: { path: "test-runner.js", label: "review.js 审核模块 (旧版)" },
  storage: { path: "tests/storage.test.js", label: "StorageLayer 存储层" },
  backup: { path: "tests/backup.test.js", label: "BackupRestore 备份恢复" },
  project: { path: "tests/project.test.js", label: "ProjectManager 项目管理" },
  lesson: { path: "tests/lesson.test.js", label: "LessonPackage 课堂包" },
  version: { path: "tests/version.test.js", label: "VersionHistory 版本历史" },
  migration: { path: "tests/migration.test.js", label: "DataMigration 图片资源迁移" }
};

function parseArgs() {
  const args = process.argv.slice(2);
  let selected = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--modules" || a === "-m") {
      selected = (args[i + 1] || "").split(",").map(s => s.trim()).filter(Boolean);
      i++;
    } else if (a.startsWith("--modules=")) {
      selected = a.substring(a.indexOf("=") + 1).split(",").map(s => s.trim()).filter(Boolean);
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return { selected };
}

function printHelp() {
  console.log(`
${BOLD}${CYAN}用法: node scripts/run-tests.js [选项]${RESET}

选项:
  -m, --modules=<list>   只运行指定模块，逗号分隔
                         可选模块: ${Object.keys(MODULES).join(", ")}
  -h, --help             显示帮助

示例:
  npm test                           # 运行所有测试
  npm run test:storage               # 只运行存储层
  npm run test:core                  # 运行全部核心模块
  node scripts/run-tests.js -m backup,project
`);
}

async function runSingleTest(moduleKey) {
  const mod = MODULES[moduleKey];
  if (!mod) {
    console.log(`${YELLOW}⚠  未知模块: ${moduleKey}${RESET}`);
    return { key: moduleKey, label: moduleKey, skipped: true };
  }
  const fullPath = path.join(ROOT, mod.path);
  console.log(`${CYAN}▶ 运行: ${BOLD}${mod.label}${RESET} ${GRAY}(${mod.path})${RESET}\n`);

  const result = spawnSync(process.execPath, [fullPath], {
    cwd: ROOT,
    stdio: "inherit",
    timeout: 120_000,
    env: process.env
  });

  const exitCode = result.status ?? (result.error ? 1 : 0);
  return {
    key: moduleKey,
    label: mod.label,
    passed: exitCode === 0,
    exitCode,
    timeout: result.signal === "SIGTERM" || result.signal === "SIGKILL",
    error: result.error?.message || null
  };
}

async function main() {
  const { selected } = parseArgs();
  const toRun = selected || Object.keys(MODULES);

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗
║  🚀 岩芯薄片索引台 · 模块回归测试启动       ║
║  目标模块: ${toRun.length} 个${" ".repeat(37 - String(toRun.length).length)}║
╚══════════════════════════════════════════════════╝${RESET}\n`);

  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < toRun.length; i++) {
    const key = toRun[i];
    const mod = MODULES[key];
    const header = `${CYAN}${BOLD}┌──────────────────────────────────────────────────┐
│  [${i + 1}/${toRun.length}] ${(mod?.label || key).padEnd(42)}│
└──────────────────────────────────────────────────┘${RESET}`;
    console.log(header);

    try {
      const r = await runSingleTest(key);
      results.push(r);
    } catch (e) {
      results.push({
        key, label: mod?.label || key, passed: false, error: e.message
      });
    }
  }

  const duration = Date.now() - startTime;
  const passed = results.filter(r => r.passed && !r.skipped).length;
  const failed = results.filter(r => !r.passed && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const total = results.length - skipped;
  const rate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const allPassed = failed === 0 && total > 0;

  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════╗
║  📊 模块测试汇总                                ║
╠══════════════════════════════════════════════════╣`);
  results.forEach((r, i) => {
    const idx = String(i + 1).padStart(2);
    let status;
    if (r.skipped) {
      status = `${GRAY}跳过${RESET}`;
    } else if (r.timeout) {
      status = `${YELLOW}超时${RESET}`;
    } else if (r.passed) {
      status = `${GREEN}通过${RESET}`;
    } else {
      status = `${RED}失败${RESET}`;
    }
    const label = r.label.length > 28 ? r.label.substring(0, 27) + "…" : r.label.padEnd(28);
    console.log(`║  [${idx}] ${label}  ${status}${" ".repeat(41 - 7 - (r.skipped ? 2 : (r.timeout ? 2 : 2)))}║`);
  });

  console.log(
    `╠══════════════════════════════════════════════════╣\n` +
    `║  运行: ${String(total).padEnd(3)}个   通过: ${passed > 0 ? GREEN : ""}${passed}${RESET}   ` +
    `失败: ${failed > 0 ? RED : ""}${failed}${RESET}   跳过: ${skipped}${" ".repeat(23)}║\n` +
    `║  通过率: ${rate}%${" ".repeat(38 - String(rate).length - 2)}║\n` +
    `║  总耗时: ${duration}ms${" ".repeat(38 - String(duration).length - 4)}║\n` +
    `╚══════════════════════════════════════════════════╝${RESET}`
  );

  if (allPassed) {
    console.log(`\n${GREEN}${BOLD}✅ 所有模块测试通过！${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`\n${RED}${BOLD}❌ 存在 ${failed} 个失败模块，请检查上方输出${RESET}\n`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error(RED + "运行错误: " + e.message + RESET);
  console.error(e.stack);
  process.exit(1);
});
