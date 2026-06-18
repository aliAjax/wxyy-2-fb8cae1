#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const reviewSrc = fs.readFileSync(path.join(projectRoot, "review.js"), "utf8");
const testsSrc = fs.readFileSync(path.join(projectRoot, "tests.js"), "utf8");

global.window = global;
global.document = {
  body: { appendChild: function () {} },
  getElementById: function () { return null; }
};

try {
  eval.call(global, reviewSrc);
} catch (e) {
  console.error("加载 review.js 失败:", e.message);
  process.exit(1);
}

const ReviewModule = global.ReviewModule;

if (!ReviewModule) {
  console.error("错误: ReviewModule 未挂载到 window，请检查 review.js");
  process.exit(1);
}

const sandbox = { module: { exports: null }, exports: {}, self: global, window: global };
sandbox.global = sandbox;

const runnable = new Function(
  "module", "exports", "require", "__filename", "__dirname", "self", "window",
  testsSrc + "\nreturn module.exports;"
);

let ReviewTestsFactory;
try {
  ReviewTestsFactory = runnable(
    { exports: {} },
    {},
    require,
    __filename,
    __dirname,
    global,
    global
  );
} catch (e) {
  console.error("加载 tests.js 失败:", e.message);
  process.exit(1);
}

if (typeof ReviewTestsFactory !== "function") {
  console.error("错误: tests.js 未正确导出测试工厂函数");
  process.exit(1);
}

const summary = ReviewTestsFactory(ReviewModule);

// ---- 输出彩色结果 ----
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";
const BG_GREEN = "\x1b[42m\x1b[30m";
const BG_RED = "\x1b[41m\x1b[37m";

console.log("\n" + BOLD + "=== 审核模块 (review.js) 自动化测试 ===" + RESET + "\n");

summary.results.forEach((t, idx) => {
  const no = String(idx + 1).padStart(2, "0");
  if (t.passed) {
    console.log(`  ${GREEN}✓${RESET} ${GRAY}[${no}]${RESET} ${t.name}`);
  } else {
    console.log(`  ${RED}✗${RESET} ${GRAY}[${no}]${RESET} ${RED}${BOLD}${t.name}${RESET}`);
    const lines = (t.error || "").split("\n");
    lines.forEach((l) => {
      console.log(`      ${GRAY}│${RESET} ${YELLOW}${l}${RESET}`);
    });
  }
});

console.log("\n" + "─".repeat(50));
const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;

if (summary.allPassed) {
  console.log(
    BG_GREEN + BOLD + `  通过 ${summary.passed}/${summary.total}（${passRate}%）  ` + RESET +
    "  所有测试通过 ✅"
  );
} else {
  console.log(
    BG_RED + BOLD + `  失败 ${summary.failed}/${summary.total}（${passRate}%）  ` + RESET +
    "  请检查失败用例 ❌"
  );
}

console.log("─".repeat(50));
if (typeof process === "undefined" || !process.env || process.env.REGRESSION_DETERMINISTIC !== "1") {
  console.log(
    GRAY + "  运行时间: " + new Date().toLocaleString("zh-CN") + RESET
  );
}
console.log("");

process.exit(summary.allPassed ? 0 : 1);
