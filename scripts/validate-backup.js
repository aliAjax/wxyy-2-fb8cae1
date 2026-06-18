#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PATH = path.join(ROOT, "tests", "fixtures", "sample-backup.json");

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";

const VALID_FORMATS = [
  "wxyy-thin-section-project-backup",
  "wxyy-thin-section-full-backup",
  "wxyy-thin-section-backup",
  "wxyy-lesson-package",
  "wxyy-answer-package"
];

const REQUIRED_SAMPLE_FIELDS = ["id", "code"];
const RECOMMENDED_SAMPLE_FIELDS = ["minerals", "texture", "location", "magnification", "polarization"];

function loadJSON(filePath) {
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(absPath)) {
    return { error: `文件不存在: ${absPath}`, data: null };
  }
  try {
    const text = fs.readFileSync(absPath, "utf8");
    if (text.trim().length === 0) {
      return { error: "文件为空", data: null };
    }
    try {
      const data = JSON.parse(text);
      return { error: null, data, sizeKB: (Buffer.byteLength(text) / 1024).toFixed(1) };
    } catch (e) {
      return { error: `JSON 解析失败: ${e.message}`, data: null };
    }
  } catch (e) {
    return { error: `文件读取失败: ${e.message}`, data: null };
  }
}

function check(cond, msg, level = "error") {
  return { pass: !!cond, level, msg };
}

function validateProjectBackup(data) {
  const issues = [];
  const infos = [];
  const warnings = [];

  if (!data.project || typeof data.project !== "object") {
    issues.push(check(false, "缺少 project 信息块"));
  } else {
    const p = data.project;
    if (!p.id) issues.push(check(false, "project.id 缺失"));
    if (!p.name) issues.push(check(false, "project.name 缺失"));
    if (!p.createdAt) warnings.push(check(false, "project.createdAt 缺失", "warning"));
    infos.push(check(true, `项目名称: ${p.name} ${p.id ? `(ID: ${p.id.substring(0, 13)}...)` : ""}`));
  }

  if (!Array.isArray(data.samples)) {
    issues.push(check(false, "samples 字段不是数组"));
  } else {
    infos.push(check(true, `样本数量: ${data.samples.length}`));
    if (data.samples.length === 0) {
      warnings.push(check(false, "samples 数组为空（这是合理的，但请确认）", "warning"));
    } else {
      const codeSet = new Set();
      const idSet = new Set();
      let withPhoto = 0;
      let withAnnotations = 0;
      const fieldCoverage = {};
      RECOMMENDED_SAMPLE_FIELDS.forEach(f => fieldCoverage[f] = 0);

      data.samples.forEach((s, i) => {
        REQUIRED_SAMPLE_FIELDS.forEach(f => {
          if (!s[f]) issues.push(check(false, `samples[${i}] 缺少必填字段 ${f}`));
        });
        if (s.id) {
          if (idSet.has(s.id)) issues.push(check(false, `samples[${i}] ID 重复: ${s.id}`));
          idSet.add(s.id);
        }
        if (s.code) {
          if (codeSet.has(s.code)) warnings.push(check(false, `samples[${i}] 样本编号重复: ${s.code}`, "warning"));
          codeSet.add(s.code);
        }
        if (s.photo && String(s.photo).trim().length > 10) withPhoto++;
        if (s.annotations && Array.isArray(s.annotations) && s.annotations.length > 0) withAnnotations++;
        RECOMMENDED_SAMPLE_FIELDS.forEach(f => {
          if (s[f] !== undefined && String(s[f]).trim().length > 0) fieldCoverage[f]++;
        });
      });

      infos.push(check(true, `带照片样本: ${withPhoto}/${data.samples.length}`));
      if (withAnnotations > 0) infos.push(check(true, `带标注样本: ${withAnnotations}/${data.samples.length}`));

      Object.entries(fieldCoverage).forEach(([f, count]) => {
        const pct = Math.round((count / data.samples.length) * 100);
        if (pct < 30) {
          warnings.push(check(false, `字段 ${f} 填充率仅 ${pct}%`, "warning"));
        } else {
          infos.push(check(true, `字段 ${f} 填充率: ${pct}%`));
        }
      });
    }
  }

  if (data.tasks) {
    if (!Array.isArray(data.tasks)) {
      issues.push(check(false, "tasks 字段不是数组"));
    } else {
      infos.push(check(true, `任务数量: ${data.tasks.length}`));
      data.tasks.forEach((t, i) => {
        if (!t.id) issues.push(check(false, `tasks[${i}] 缺少 id`));
        if (!t.title) warnings.push(check(false, `tasks[${i}] 缺少 title`, "warning"));
        if (t.sampleIds && !Array.isArray(t.sampleIds)) {
          issues.push(check(false, `tasks[${i}].sampleIds 不是数组`));
        }
      });
    }
  }

  if (data.versionHistory) {
    if (!Array.isArray(data.versionHistory)) {
      issues.push(check(false, "versionHistory 不是数组"));
    } else {
      infos.push(check(true, `版本历史记录: ${data.versionHistory.length} 条`));
    }
  }

  if (data.recycleBin) {
    if (!Array.isArray(data.recycleBin)) {
      issues.push(check(false, "recycleBin 不是数组"));
    } else {
      infos.push(check(true, `回收站条目: ${data.recycleBin.length} 条`));
    }
  }

  if (data.studentAnswers) {
    if (!Array.isArray(data.studentAnswers)) {
      issues.push(check(false, "studentAnswers 不是数组"));
    } else {
      infos.push(check(true, `学生作答: ${data.studentAnswers.length} 份`));
      const graded = data.studentAnswers.filter(a => a.score !== null && a.score !== undefined).length;
      if (graded > 0) infos.push(check(true, `已评分: ${graded}/${data.studentAnswers.length}`));
    }
  }

  if (data.lessonGrading) {
    const lg = data.lessonGrading;
    if (lg.rubrics) infos.push(check(true, `评分项: ${lg.rubrics.length} 项`));
    if (lg.submissions) infos.push(check(true, `提交记录: ${lg.submissions.length} 条`));
  }

  if (data.appState) {
    const as = data.appState;
    if (as.filterViews?.length) infos.push(check(true, `筛选视图: ${as.filterViews.length} 个`));
    if (as.compareList?.length) infos.push(check(true, `对比列表: ${as.compareList.length} 个样本`));
  }

  return { issues, warnings, infos };
}

function validateFullBackup(data) {
  const issues = [];
  const warnings = [];
  const infos = [];

  if (!Array.isArray(data.projects)) {
    issues.push(check(false, "projects 字段不是数组"));
    return { issues, warnings, infos };
  }

  infos.push(check(true, `包含项目数量: ${data.projects.length}`));

  data.projects.forEach((project, i) => {
    infos.push(check(true, `── 项目 ${i + 1}: ${project.project?.name || "(无名称)"} ──`));
    const result = validateProjectBackup(project);
    issues.push(...result.issues.map(it => ({ ...it, msg: `[项目${i + 1}] ${it.msg}` })));
    warnings.push(...result.warnings.map(w => ({ ...w, msg: `[项目${i + 1}] ${w.msg}` })));
    infos.push(...result.infos.map(inf => ({ ...inf, msg: `  ${inf.msg}` })));
  });

  return { issues, warnings, infos };
}

function validateLessonPackage(data) {
  const issues = [];
  const warnings = [];
  const infos = [];

  if (!data.title) issues.push(check(false, "课堂包缺少 title"));
  if (!data.packageId) issues.push(check(false, "课堂包缺少 packageId"));
  if (!Array.isArray(data.samples)) {
    issues.push(check(false, "samples 不是数组"));
  } else {
    infos.push(check(true, `包含样本: ${data.samples.length} 个`));
  }
  if (data.rubrics) {
    if (!Array.isArray(data.rubrics)) {
      issues.push(check(false, "rubrics 不是数组"));
    } else {
      const total = data.rubrics.reduce((a, b) => a + (b.maxScore || 0), 0);
      infos.push(check(true, `评分项: ${data.rubrics.length} 项，总分: ${total}`));
      if (total !== 100) warnings.push(check(false, `评分总分应为 100，当前: ${total}`, "warning"));
    }
  }
  if (data.referenceAnswers) {
    const keys = Object.keys(data.referenceAnswers);
    infos.push(check(true, `参考答案: ${keys.length} 条`));
  }
  if (!data.lessonContentHash) warnings.push(check(false, "缺少 lessonContentHash，将无法校验内容完整性", "warning"));
  return { issues, warnings, infos };
}

function printItem(item, indent = "") {
  const prefix = item.level === "error" ? `${RED}✗${RESET}` :
    item.level === "warning" ? `${YELLOW}⚠${RESET}` :
      `${GRAY}ℹ${RESET}`;
  const color = item.level === "error" ? RED :
    item.level === "warning" ? YELLOW : GRAY;
  console.log(`${indent}  ${prefix} ${color}${item.msg}${RESET}`);
}

async function main() {
  const target = process.argv[2] || DEFAULT_PATH;
  const absTarget = path.isAbsolute(target) ? target : path.join(process.cwd(), target);

  console.log(`\n${BOLD}${CYAN}=== 备份文件校验 ===${RESET}`);
  console.log(`校验目标: ${absTarget}`);
  console.log("");

  const loaded = loadJSON(target);
  if (loaded.error) {
    console.log(`${RED}${BOLD}❌ 加载失败: ${loaded.error}${RESET}\n`);
    process.exit(1);
  }

  const { data, sizeKB } = loaded;
  console.log(`${GRAY}文件大小: ${sizeKB} KB${RESET}\n`);

  let issues = [];
  let warnings = [];
  let infos = [];

  const format = data.format || "(未声明)";
  const version = data.version !== undefined ? data.version : "(未声明)";
  const isLegacyArray = Array.isArray(data);

  console.log(`${BOLD}📄 格式声明${RESET}`);
  if (VALID_FORMATS.includes(format)) {
    console.log(`  ${GREEN}✓${RESET} format: ${format}`);
  } else if (isLegacyArray) {
    console.log(`  ${YELLOW}⚠${RESET} format: (未声明 - Legacy 纯数组格式，建议升级)`);
  } else {
    issues.push(check(false, `未知格式标识: ${format}`));
    console.log(`  ${RED}✗${RESET} format: ${format} (未知)`);
  }
  if (!isLegacyArray) {
    console.log(`  version: ${version}\n`);
  } else {
    console.log(`  version: (未声明 - Legacy格式) \n`);
  }

  if (format === "wxyy-thin-section-full-backup") {
    const r = validateFullBackup(data);
    issues = r.issues; warnings = r.warnings; infos = r.infos;
  } else if (format === "wxyy-lesson-package") {
    const r = validateLessonPackage(data);
    issues = r.issues; warnings = r.warnings; infos = r.infos;
  } else if (isLegacyArray) {
    console.log(`${YELLOW}ℹ 检测到 legacy 格式（纯数组），将进行规范化检查${RESET}\n`);
    const normalized = { samples: data, project: { id: "legacy", name: "Legacy数据" } };
    const r = validateProjectBackup(normalized);
    issues = r.issues; warnings = r.warnings; infos = r.infos;
  } else if (format === "wxyy-thin-section-project-backup" ||
    format === "wxyy-thin-section-backup" ||
    data.samples || data.project) {
    const r = validateProjectBackup(data);
    issues = r.issues; warnings = r.warnings; infos = r.infos;
  } else {
    issues.push(check(false, `无法识别的备份结构，format=${format}`));
  }

  if (data.exportDate) {
    infos.push(check(true, `导出时间: ${data.exportDate}`));
  }

  if (infos.length > 0) {
    console.log(`${BOLD}ℹ️  数据摘要${RESET}`);
    infos.forEach(it => printItem(it));
    console.log("");
  }

  if (warnings.length > 0) {
    console.log(`${BOLD}${YELLOW}⚠  警告 (${warnings.length})${RESET}`);
    warnings.forEach(w => printItem(w));
    console.log("");
  }

  if (issues.length > 0) {
    console.log(`${BOLD}${RED}❌ 错误 (${issues.length})${RESET}`);
    issues.forEach(it => printItem(it));
    console.log("");
  }

  console.log("─".repeat(60));
  if (issues.length > 0) {
    console.log(`${RED}${BOLD}❌ 校验失败，存在 ${issues.length} 个严重问题${RESET}\n`);
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log(`${YELLOW}${BOLD}⚠  校验通过但有 ${warnings.length} 条警告${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${GREEN}${BOLD}✅ 备份校验完全通过！${RESET}\n`);
    process.exit(0);
  }
}

main().catch(e => {
  console.error(RED + "运行错误: " + e.message + RESET);
  console.error(e.stack);
  process.exit(1);
});
