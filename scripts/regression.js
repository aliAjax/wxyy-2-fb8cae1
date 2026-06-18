#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync, spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";

const STAGES = [
  {
    key: "lint",
    name: "代码语法与规范检查",
    cmd: process.execPath,
    args: [path.join(ROOT, "scripts", "lint.js")],
    env: { ...process.env, NODE_PATH: ROOT },
    fatal: true,
    timeout: 30_000
  },
  {
    key: "fixtures",
    name: "生成示例数据（fixtures）",
    cmd: process.execPath,
    args: [path.join(ROOT, "scripts", "generate-sample-data.js")],
    env: { ...process.env },
    fatal: true,
    timeout: 15_000
  },
  {
    key: "validate-fixture",
    name: "示例备份文件结构校验",
    cmd: process.execPath,
    args: [
      path.join(ROOT, "scripts", "validate-backup.js"),
      path.join(ROOT, "tests", "fixtures", "sample-backup.json")
    ],
    env: { ...process.env },
    fatal: true,
    timeout: 15_000
  },
  {
    key: "validate-minimal",
    name: "最小化备份校验",
    cmd: process.execPath,
    args: [
      path.join(ROOT, "scripts", "validate-backup.js"),
      path.join(ROOT, "tests", "fixtures", "sample-backup-minimal.json")
    ],
    env: { ...process.env },
    fatal: false,
    timeout: 10_000
  },
  {
    key: "validate-legacy",
    name: "Legacy 格式兼容校验",
    cmd: process.execPath,
    args: [
      path.join(ROOT, "scripts", "validate-backup.js"),
      path.join(ROOT, "tests", "fixtures", "sample-backup-legacy.json")
    ],
    env: { ...process.env },
    fatal: false,
    timeout: 10_000
  },
  {
    key: "validate-lesson",
    name: "课堂包格式校验",
    cmd: process.execPath,
    args: [
      path.join(ROOT, "scripts", "validate-backup.js"),
      path.join(ROOT, "tests", "fixtures", "sample-lesson-package.json")
    ],
    env: { ...process.env },
    fatal: true,
    timeout: 10_000
  },
  {
    key: "review-module",
    name: "review.js 审核模块测试",
    cmd: process.execPath,
    args: [path.join(ROOT, "test-runner.js")],
    env: { ...process.env },
    fatal: true,
    timeout: 30_000
  },
  {
    key: "storage-module",
    name: "StorageLayer 存储层测试",
    cmd: process.execPath,
    args: [path.join(ROOT, "tests", "storage.test.js")],
    env: { ...process.env },
    fatal: true,
    timeout: 60_000
  },
  {
    key: "backup-module",
    name: "BackupRestore 备份恢复测试",
    cmd: process.execPath,
    args: [path.join(ROOT, "tests", "backup.test.js")],
    env: { ...process.env },
    fatal: true,
    timeout: 60_000
  },
  {
    key: "project-module",
    name: "ProjectManager 项目管理测试",
    cmd: process.execPath,
    args: [path.join(ROOT, "tests", "project.test.js")],
    env: { ...process.env },
    fatal: true,
    timeout: 60_000
  },
  {
    key: "lesson-module",
    name: "LessonPackage 课堂包测试",
    cmd: process.execPath,
    args: [path.join(ROOT, "tests", "lesson.test.js")],
    env: { ...process.env },
    fatal: true,
    timeout: 60_000
  },
  {
    key: "version-module",
    name: "VersionHistory 版本历史测试",
    cmd: process.execPath,
    args: [path.join(ROOT, "tests", "version.test.js")],
    env: { ...process.env },
    fatal: true,
    timeout: 60_000
  },
  {
    key: "migration-module",
    name: "DataMigration 资源迁移测试",
    cmd: process.execPath,
    args: [path.join(ROOT, "tests", "migration.test.js")],
    env: { ...process.env },
    fatal: false,
    timeout: 60_000
  }
];

function banner() {
  console.log(`
${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗
║  🔥 一键回归验证 · 岩芯薄片显微照片索引台                ║
╠══════════════════════════════════════════════════════════════╣
║  覆盖链路:                                                 ║
║   · 语法检查         · 备份生成/校验                        ║
║   · 存储层（IndexedDB）                                     ║
║   · 备份恢复链路     · 项目管理                             ║
║   · 课堂包管理       · 版本历史                             ║
║   · 图片资源迁移链路 · 审核模块                             ║
╚══════════════════════════════════════════════════════════════╝${RESET}
`);
}

function stageHeader(idx, total, name, key) {
  console.log(`${CYAN}${BOLD}┌${"─".repeat(66)}┐
│  [${idx}/${total}] ${name.padEnd(58)} │
│   ${GRAY}${key.padEnd(60)}${CYAN} │
└${"─".repeat(66)}┘${RESET}\n`);
}

function runStage(stage) {
  return new Promise((resolve) => {
    const start = Date.now();
    let output = "";
    const child = spawn(stage.cmd, stage.args, {
      cwd: ROOT,
      env: {
        ...process.env,
        REGRESSION_DETERMINISTIC: "1",
        ...(stage.env || {})
      },
      timeout: stage.timeout
    });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    let done = false;
    const finish = (exitCode, timedOut = false) => {
      if (done) return;
      done = true;
      const duration = Date.now() - start;
      resolve({
        ...stage,
        passed: exitCode === 0 && !timedOut,
        exitCode,
        timedOut,
        duration,
        output
      });
    };

    child.on("exit", (code) => finish(code ?? 0));
    child.on("error", () => finish(1));
    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch (e) { }
      finish(-1, true);
    }, stage.timeout + 500);
  });
}

async function main() {
  banner();
  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    stageHeader(i + 1, STAGES.length, stage.name, stage.key);
    const result = await runStage(stage);
    results.push(result);
    const time = `${result.duration}ms`.padStart(8);

    if (result.timedOut) {
      console.log(`${YELLOW}${BOLD}⏱  超时${RESET} ${GRAY}${time}${RESET}\n`);
    } else if (result.passed) {
      console.log(`${GREEN}${BOLD}✅ 通过${RESET} ${GRAY}${time}${RESET}\n`);
    } else {
      console.log(`${RED}${BOLD}❌ 失败（exit=${result.exitCode}）${RESET} ${GRAY}${time}${RESET}\n`);
      if (result.fatal) {
        console.log(`${RED}${BOLD}🚨 此阶段为 fatal，后续阶段将被跳过！${RESET}`);
        break;
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed && !r.timedOut).length;
  const timedOut = results.filter(r => r.timedOut).length;
  const skipped = STAGES.length - results.length;
  const rate = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;
  const allPassed = passed === results.length && skipped === 0;

  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗
║  📊 回归验证汇总报告                                      ║
╠══════════════════════════════════════════════════════════════╣`);

  results.forEach((r, i) => {
    const idx = String(i + 1).padStart(2, "0");
    let status, padLen;
    if (r.timedOut) {
      status = `${YELLOW}超时${RESET}`;
      padLen = 2;
    } else if (r.passed) {
      status = `${GREEN}通过${RESET}`;
      padLen = 2;
    } else {
      status = `${RED}失败${RESET}`;
      padLen = 2;
    }
    const name = r.name.length > 32 ? r.name.substring(0, 31) + "…" : r.name.padEnd(32);
    const label = `[${idx}] ${name}  ${status}`;
    const dur = `${r.duration}ms`.padStart(8);
    console.log(`║  ${label}${" ".repeat(Math.max(0, 38 - name.length - padLen))}${GRAY}${dur}${CYAN}  ║`);
  });

  if (skipped > 0) {
    console.log(`╠${"─".repeat(66)}╣`);
    const skippedNames = STAGES.slice(results.length).map(s => s.name).join("、");
    const sn = skippedNames.length > 48 ? skippedNames.substring(0, 47) + "…" : skippedNames;
    console.log(`║  ${YELLOW}已跳过 ${skipped} 项:${RESET} ${GRAY}${sn}${" ".repeat(59 - 11 - sn.length)}${CYAN}║`);
  }

  console.log(
    `╠${"─".repeat(66)}╣\n` +
    `║  执行: ${results.length}/${STAGES.length}   通过: ${passed}   失败: ${failed}${timedOut ? `   超时: ${timedOut}` : ""}   跳过: ${skipped}${" ".repeat(42 - 2 * String(timedOut).length - String(skipped).length)}║\n` +
    `║  通过率: ${rate}%${" ".repeat(58 - String(rate).length - 2)}║\n` +
    `║  总耗时: ${totalDuration}ms${" ".repeat(58 - String(totalDuration).length - 4)}║\n` +
    `╚${"═".repeat(66)}╝${RESET}`
  );

  console.log("\n📌 下一步提示:");
  if (allPassed) {
    console.log(`  ${GREEN}✅ 全部通过！${RESET} 可提交修改或部署。`);
    console.log(`  ${GRAY}· 启动开发调试: npm start${RESET}`);
    console.log(`  ${GRAY}· 启动测试页面: 打开 /test.html 或 /tests/test-all.html${RESET}`);
  } else {
    console.log(`  ${RED}❌ 存在失败阶段。${RESET} 请根据上方输出定位问题。`);
    const failingStages = results.filter(r => !r.passed);
    failingStages.forEach((r, i) => {
      console.log(`  ${i + 1}. 单独重跑 [${r.key}]: ${GRAY}${r.cmd} ${r.args.slice(1).join(" ")}${RESET}`);
    });
  }
  console.log("");

  process.exit(allPassed ? 0 : 1);
}

main().catch(e => {
  console.error(RED + "回归流程异常终止: " + e.message + RESET);
  console.error(e.stack);
  process.exit(2);
});
