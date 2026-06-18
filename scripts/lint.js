#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const JS_FILES = [
  "storage-layer.js",
  "project-manager.js",
  "data-manager.js",
  "data-migration.js",
  "version-history.js",
  "backup-restore.js",
  "mineral-rules.js",
  "lesson-package.js",
  "annotation-view.js",
  "image-viewer.js",
  "review.js",
  "app.js",
  "tests.js",
  "test-runner.js"
];

const CHECKS = [
  {
    name: "语法有效性 (VM.parse)",
    run: (content, file) => {
      try {
        new vm.Script(content, { filename: file });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  },
  {
    name: "console.log 残留检查",
    run: (content, file) => {
      if (file === "test-runner.js" || file.startsWith("scripts/")) return { ok: true };
      const regex = /\bconsole\.(log|debug|warn|info)\s*\(/g;
      const matches = [];
      let m;
      const lines = content.split("\n");
      while ((m = regex.exec(content)) !== null) {
        const line = content.substring(0, m.index).split("\n").length;
        const lineText = lines[line - 1]?.trim() || "";
        if (!lineText.includes("TODO") && !lineText.includes("HACK")) {
          matches.push({ line, text: lineText.substring(0, 100) });
        }
      }
      if (matches.length > 0) {
        return {
          ok: true,
          warning: `发现 ${matches.length} 处 console.log，请确认是否需要移除`,
          details: matches
        };
      }
      return { ok: true };
    }
  },
  {
    name: "全局泄露检查 (非 IIFE 模式)",
    run: (content, file) => {
      if (file === "app.js") return { ok: true };
      const hasIIFE = /^\(function\s*\(/.test(content.trim()) ||
        /^\(function\s*\(global\)/.test(content.trim());
      if (!hasIIFE && content.includes("window.")) {
        return { ok: true, warning: "未使用 IIFE 包裹，可能存在全局污染风险" };
      }
      return { ok: true };
    }
  },
  {
    name: "挂载检查 (window.xxx 模块导出)",
    run: (content, file) => {
      if (file === "app.js" || file === "tests.js" || file === "test-runner.js") {
        return { ok: true };
      }
      const mountMatch = content.match(/global\.(\w+)\s*=/g) || [];
      const windowMatch = content.match(/window\.(\w+)\s*=/g) || [];
      if (mountMatch.length === 0 && windowMatch.length === 0) {
        return { ok: false, error: "未发现模块挂载点 (global.xxx / window.xxx)" };
      }
      return { ok: true, info: `挂载点: ${[...mountMatch, ...windowMatch].join(", ")}` };
    }
  },
  {
    name: "未闭合大括号粗略检查",
    run: (content, file) => {
      let depth = 0;
      let inStr = null;
      let inComment = false;
      for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        const next = content[i + 1];
        if (inComment) {
          if (ch === "*" && next === "/") { inComment = false; i++; }
          continue;
        }
        if (inStr) {
          if (ch === "\\") { i++; continue; }
          if (ch === inStr) inStr = null;
          continue;
        }
        if (ch === "/" && next === "/") {
          while (i < content.length && content[i] !== "\n") i++;
          continue;
        }
        if (ch === "/" && next === "*") { inComment = true; i++; continue; }
        if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
        if (ch === "{") depth++;
        if (ch === "}") depth--;
      }
      if (depth !== 0) {
        return { ok: true, warning: `启发式检测: 大括号最终深度为 ${depth}（如 VM 语法无报错，可忽略）` };
      }
      return { ok: true };
    }
  },
  {
    name: "use strict 检查",
    run: (content, file) => {
      if (file === "test-runner.js") return { ok: true };
      if (!content.includes('"use strict"') && !content.includes("'use strict'")) {
        return { ok: true, warning: "缺少 'use strict' 声明" };
      }
      return { ok: true };
    }
  },
  {
    name: "危险操作: eval / innerHTML",
    run: (content, file) => {
      const issues = [];
      if (/\beval\s*\(/.test(content)) {
        issues.push("发现 eval() 调用");
      }
      const unsafeHtml = content.match(/\.innerHTML\s*=\s*[^=]/g) || [];
      if (unsafeHtml.length > 0 && file !== "app.js") {
        issues.push(`发现 ${unsafeHtml.length} 处 innerHTML 赋值（需确保无 XSS 风险）`);
      }
      if (issues.length > 0) {
        return { ok: true, warning: issues.join("; ") };
      }
      return { ok: true };
    }
  },
  {
    name: "try-catch 吞异常检查",
    run: (content, file) => {
      const catches = content.match(/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g) || [];
      const emptyHandlers = content.match(/catch\s*\([^)]*\)\s*\{\s*(console\.(log|error|warn|info).*)?\s*\}/g) || [];
      if (catches.length > 0) {
        return { ok: true, warning: `${catches.length} 处空 catch 块，异常可能被静默吞掉` };
      }
      if (emptyHandlers.length > 0 && file !== "storage-layer.js") {
        return { ok: true, info: `${emptyHandlers.length} 处 catch 块仅做日志或为空` };
      }
      return { ok: true };
    }
  }
];

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";

let totalErrors = 0;
let totalWarnings = 0;
let totalFiles = 0;

console.log(`\n${BOLD}${CYAN}=== 代码语法与规范检查 ===${RESET}\n`);

JS_FILES.forEach((relPath) => {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`${GRAY}  ⏭  跳过不存在的文件: ${relPath}${RESET}`);
    return;
  }
  totalFiles++;
  const content = fs.readFileSync(filePath, "utf8");
  const size = (content.length / 1024).toFixed(1);
  const lines = content.split("\n").length;

  console.log(`${BOLD}📄 ${relPath}${RESET} ${GRAY}(${lines} 行, ${size} KB)${RESET}`);

  let fileHasError = false;
  CHECKS.forEach((check) => {
    const result = check.run(content, relPath);
    if (!result.ok) {
      fileHasError = true;
      totalErrors++;
      console.log(`  ${RED}✗ 错误 [${check.name}]${RESET}: ${result.error}`);
    } else if (result.warning) {
      totalWarnings++;
      console.log(`  ${YELLOW}⚠ 警告 [${check.name}]${RESET}: ${result.warning}`);
      if (result.details && result.details.length > 0) {
        result.details.slice(0, 3).forEach((d) => {
          console.log(`      ${GRAY}L${d.line}: ${d.text}${RESET}`);
        });
        if (result.details.length > 3) {
          console.log(`      ${GRAY}...还有 ${result.details.length - 3} 处${RESET}`);
        }
      }
    } else if (result.info) {
      console.log(`  ${GRAY}ℹ 信息 [${check.name}]${RESET}: ${result.info}`);
    }
  });

  if (!fileHasError) {
    console.log(`  ${GREEN}✓ 基础检查通过${RESET}`);
  }
  console.log("");
});

console.log("─".repeat(60));
console.log(
  `  检查文件: ${CYAN}${totalFiles}${RESET} | ` +
  `错误: ${totalErrors > 0 ? RED : GREEN}${totalErrors}${RESET} | ` +
  `警告: ${YELLOW}${totalWarnings}${RESET}`
);
console.log("─".repeat(60));

if (totalErrors > 0) {
  console.log(`\n${RED}${BOLD}❌ 存在语法/结构错误，请修复后再提交${RESET}\n`);
  process.exit(1);
} else if (totalWarnings > 0) {
  console.log(`\n${YELLOW}${BOLD}⚠  存在 ${totalWarnings} 条警告，建议排查${RESET}\n`);
  process.exit(0);
} else {
  console.log(`\n${GREEN}${BOLD}✅ 所有文件基础检查通过！${RESET}\n`);
  process.exit(0);
}
