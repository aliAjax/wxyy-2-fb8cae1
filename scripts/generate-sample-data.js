#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "tests", "fixtures");
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const GRAY = "\x1b[90m";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function makePhotoBase64(label) {
  const header = "data:image/png;base64,";
  const body = Buffer.from(`mock-photo-${label}-${Date.now()}`).toString("base64");
  return header + body;
}

function generateProjectBackup(opts = {}) {
  const projectId = opts.projectId || uuid();
  const sampleCount = opts.sampleCount || 15;
  const taskCount = opts.taskCount || 3;

  const samples = [];
  for (let i = 1; i <= sampleCount; i++) {
    const minerals = ["石英、斜长石", "方解石、白云石", "钾长石、石英", "黑云母、角闪石", "辉石、橄榄石"];
    const textures = ["半自形粒状结构", "它形粒状结构", "斑状结构", "碎裂结构", "花岗变晶结构"];
    const locs = ["剖面东侧第一层", "剖面西侧第二层", "剖面北端第三层", "剖面南端第五层", "主剖面第八层"];
    const pols = ["单偏光", "正交偏光", "反射光"];
    const mags = ["40x", "100x", "200x", "400x"];
    const codes = ["BX", "GR", "MT", "SL", "DY"];

    samples.push({
      id: `sample-${String(i).padStart(4, "0")}`,
      projectId,
      code: `${codes[i % codes.length]}-${String(i).padStart(3, "0")}`,
      location: locs[i % locs.length],
      magnification: mags[i % mags.length],
      polarization: pols[i % pols.length],
      minerals: minerals[i % minerals.length],
      texture: textures[i % textures.length],
      comment: `样本 ${i} 老师批注：典型结构特征清晰，注意观察矿物的消光位。`,
      reviewStatus: i % 5 === 0 ? "confirmed" : i % 3 === 0 ? "incomplete" : "pending",
      reviewComment: i % 5 === 0 ? "鉴定准确，确认通过" : "",
      observationFeatures: i % 2 === 0 ? ["具有解理缝", "可见双晶"] : ["波状消光"],
      photo: makePhotoBase64(`sample-${i}`),
      photoResourceId: i % 2 === 0 ? `photo-res-${i}` : null,
      annotationResourceId: null,
      groupId: i % 4 === 0 ? `group-${Math.ceil(i / 4)}` : null,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - i * 43200000).toISOString()
    });
  }

  const tasks = [];
  for (let i = 1; i <= taskCount; i++) {
    const taskSamples = samples
      .filter((_, si) => si % taskCount === (i - 1))
      .map(s => s.id);
    tasks.push({
      id: `task-${i}`,
      projectId,
      title: `观察任务 ${i}：${["沉积岩识别", "火成岩手标本描述", "变质岩结构分析"][i - 1] || `综合观察 ${i}`}`,
      objective: `本次任务要求学生系统观察任务样本的矿物组成、结构特征，并结合沉积学原理进行成因分析。请标注关键矿物的光学特征。`,
      deadline: i % 2 === 0 ? new Date(Date.now() + 7 * 86400000).toISOString() : null,
      sampleIds: taskSamples,
      completedSamples: taskSamples.slice(0, Math.floor(taskSamples.length / 2)),
      lessonPackageId: i === 1 ? "lesson-pack-demo-001" : null,
      createdAt: new Date(Date.now() - i * 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - i * 86400000).toISOString()
    });
  }

  const versionHistory = [];
  samples.slice(0, Math.min(8, samples.length)).forEach((s, si) => {
    const vCount = (si % 3) + 2;
    for (let v = 1; v <= vCount; v++) {
      versionHistory.push({
        id: `vh-${si}-${v}`,
        sampleId: s.id,
        version: v,
        timestamp: new Date(Date.now() - (si * 5 + v) * 3600000).toISOString(),
        changeType: v === 1 ? "create" : "update",
        changedFields: v === 1 ? ["*"] : (v === 2 ? ["minerals", "texture"] : ["comment"]),
        summary: v === 1 ? "创建样本" : "修改：主要矿物、颗粒结构",
        snapshot: {
          code: s.code,
          minerals: v === 1 ? "" : s.minerals,
          texture: v === 1 ? "" : s.texture,
          comment: s.comment,
          hasPhoto: v >= 2,
          annotationCount: v >= 2 ? 3 : 0
        }
      });
    }
  });

  const recycleBin = [
    {
      id: "rb-1",
      projectId,
      sampleId: "recycled-1",
      deletedAt: new Date(Date.now() - 86400000).toISOString(),
      sampleData: {
        id: "recycled-1",
        projectId,
        code: "BX-DEL-001",
        minerals: "已删除矿物",
        photo: makePhotoBase64("deleted-1")
      }
    },
    {
      id: "rb-2",
      projectId,
      sampleId: "recycled-2",
      deletedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      sampleData: {
        id: "recycled-2",
        projectId,
        code: "BX-DEL-002"
      }
    }
  ];

  const studentAnswers = [
    {
      id: "ans-1", projectId,
      lessonPackageId: "lesson-pack-demo-001",
      taskId: "task-1",
      sampleId: samples[0].id,
      studentName: "张三",
      studentId: "2024001",
      minerals: "石英，斜长石，钾长石",
      texture: "半自形粒状结构",
      observation: "颗粒边界清晰，石英具有波状消光",
      comment: "这是一块典型的花岗岩薄片",
      score: null,
      gradedAt: null,
      submittedAt: new Date(Date.now() - 100000).toISOString()
    },
    {
      id: "ans-2", projectId,
      lessonPackageId: "lesson-pack-demo-001",
      taskId: "task-1",
      sampleId: samples[1].id,
      studentName: "李四",
      studentId: "2024002",
      minerals: "方解石",
      texture: "泥晶结构",
      observation: "方解石颗粒较小",
      comment: "石灰岩薄片，颗粒偏细",
      score: 85,
      gradedAt: new Date().toISOString(),
      submittedAt: new Date(Date.now() - 200000).toISOString()
    }
  ];

  const submissions = [
    {
      id: "sub-1",
      lessonPackageId: "lesson-pack-demo-001",
      studentName: "张三",
      studentId: "2024001",
      submittedAt: new Date(Date.now() - 100000).toISOString(),
      scores: {},
      answers: Object.fromEntries(
        samples.slice(0, 5).map(s => [s.id, { minerals: "学生填写的矿物", comment: "" }])
      )
    }
  ];

  const rubrics = [
    { id: "rub-1", name: "矿物识别", maxScore: 40, description: "准确识别薄片中主要矿物成分" },
    { id: "rub-2", name: "结构描述", maxScore: 30, description: "准确描述岩石结构特征" },
    { id: "rub-3", name: "综合分析", maxScore: 30, description: "合理的地质解释与分析" }
  ];

  return {
    format: "wxyy-thin-section-project-backup",
    version: 2,
    exportDate: new Date().toISOString(),
    project: {
      id: projectId,
      name: opts.projectName || "2025春季·沉积岩实习（示例数据）",
      description: "这是用于校验备份恢复链路的示例数据。包含 15 个样本、3 个任务、版本历史和学生作答。",
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      meta: {
        isSampleBackup: true,
        generatedAt: new Date().toISOString(),
        generator: "scripts/generate-sample-data.js",
        datasetSize: `${sampleCount} samples · ${taskCount} tasks`
      }
    },
    samples,
    tasks,
    sampleGroups: [
      { id: "group-1", name: "A 组样本", sampleIds: samples.filter(s => s.groupId === "group-1").map(s => s.id) }
    ],
    appState: {
      compareList: [samples[0].id, samples[1].id],
      filterViews: [
        { id: "fv-1", name: "待复核视图", reviewStatus: "pending", createdAt: new Date().toISOString() },
        { id: "fv-2", name: "正交偏光视图", polarization: "正交偏光", createdAt: new Date().toISOString() }
      ]
    },
    versionHistory,
    recycleBin,
    studentAnswers,
    lessonGrading: { submissions, rubrics, lessonMetas: {} }
  };
}

function generateFullBackup() {
  const projects = [
    { projectId: "demo-proj-1", projectName: "2025春·沉积岩实习" },
    { projectId: "demo-proj-2", projectName: "2025秋·火成岩手标本" },
    { projectId: "demo-proj-3", projectName: "变质岩综合练习" }
  ];

  return {
    format: "wxyy-thin-section-full-backup",
    version: 1,
    exportDate: new Date().toISOString(),
    projects: projects.map(p => ({
      ...generateProjectBackup({
        projectId: p.projectId,
        projectName: p.projectName,
        sampleCount: 8
      })
    }))
  };
}

function generateLessonPackage() {
  const backup = generateProjectBackup({ sampleCount: 12 });
  return {
    format: "wxyy-lesson-package",
    version: 4,
    packageId: "lesson-pack-demo-001",
    title: "第三章：沉积岩结构系统观察",
    description: "本课堂包包含 12 个典型沉积岩薄片样本，要求学生完成矿物识别、结构描述和成因分析三项任务。",
    teacher: "李老师",
    course: "岩矿鉴定实习",
    lessonContentHash: Math.abs(
      [...JSON.stringify(backup.samples)].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    ).toString(36),
    contentHash: Math.random().toString(36).slice(2, 18),
    samples: backup.samples.map(s => ({
      id: s.id, code: s.code, minerals: s.minerals, texture: s.texture,
      location: s.location, magnification: s.magnification,
      polarization: s.polarization, photo: s.photo,
      annotations: [{ id: uuid(), type: "point", x: 150, y: 120, label: "观察点1" }]
    })),
    tasks: backup.tasks,
    rubrics: [
      { id: "r1", name: "矿物识别", maxScore: 40, description: "准确识别主要矿物" },
      { id: "r2", name: "结构描述", maxScore: 30, description: "结构描述准确" },
      { id: "r3", name: "综合分析", maxScore: 30, description: "分析结论合理" }
    ],
    referenceAnswers: Object.fromEntries(
      backup.samples.map(s => [s.id, {
        minerals: s.minerals,
        texture: s.texture,
        comment: `参考结论：${s.minerals} 特征明显，${s.texture}表明沉积环境稳定。`
      }])
    ),
    createdAt: new Date().toISOString()
  };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filename, data) {
  const full = path.join(OUT_DIR, filename);
  fs.writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
  const sizeKB = (fs.statSync(full).size / 1024).toFixed(1);
  console.log(`  ${GREEN}✓${RESET} ${filename.padEnd(40)} ${GRAY}${sizeKB} KB${RESET}`);
  return { filename, sizeKB };
}

async function main() {
  ensureDir(OUT_DIR);
  console.log(`\n${BOLD}${CYAN}=== 生成示例数据 ===${RESET}`);
  console.log(`输出目录: ${OUT_DIR}\n`);

  const projectBackup = generateProjectBackup();
  writeJson("sample-backup.json", projectBackup);

  const minimalBackup = generateProjectBackup({
    sampleCount: 3, taskCount: 1, projectId: "minimal-proj",
    projectName: "最小化示例项目"
  });
  minimalBackup.versionHistory = minimalBackup.versionHistory.slice(0, 3);
  minimalBackup.studentAnswers = [];
  minimalBackup.recycleBin = [];
  writeJson("sample-backup-minimal.json", minimalBackup);

  const legacyBackup = projectBackup.samples.map(s => ({
    id: s.id, code: s.code, minerals: s.minerals, texture: s.texture,
    location: s.location, photo: s.photo,
    magnification: s.magnification, polarization: s.polarization,
    comment: s.comment
  }));
  writeJson("sample-backup-legacy.json", legacyBackup);

  writeJson("sample-full-backup.json", generateFullBackup());
  writeJson("sample-lesson-package.json", generateLessonPackage());

  const invalidBackups = [
    {
      file: "sample-backup-invalid-format.json",
      data: { format: "wrong-format", random: "data" }
    },
    {
      file: "sample-backup-missing-project.json",
      data: {
        format: "wxyy-thin-section-project-backup",
        version: 2,
        samples: [],
        tasks: []
      }
    },
    {
      file: "sample-backup-corrupted.json",
      data: null
    }
  ];

  invalidBackups.forEach(b => {
    const full = path.join(OUT_DIR, b.file);
    if (b.file.includes("corrupted")) {
      fs.writeFileSync(full, "{this is not valid json", "utf8");
    } else {
      fs.writeFileSync(full, JSON.stringify(b.data, null, 2), "utf8");
    }
    console.log(`  ${GREEN}✓${RESET} ${b.file.padEnd(40)}`);
  });

  console.log(`\n${BOLD}${GREEN}✅ 示例数据生成完成！${RESET}`);
  console.log(`${GRAY}提示：运行 npm run backup:check-sample 可校验生成的 sample-backup.json${RESET}\n`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
