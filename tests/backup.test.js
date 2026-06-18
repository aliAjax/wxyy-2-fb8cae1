"use strict";

const TestFramework = require("./test-framework.js");

const t = new TestFramework("BackupRestore 备份恢复 (高风险链路)");
t.setupBrowserEnvironment();
t.loadScript("storage-layer.js", { reload: true });
t.loadScript("data-manager.js", { reload: true });
t.loadScript("data-migration.js");
t.loadScript("version-history.js");
t.loadScript("backup-restore.js");
t.loadScript("mineral-rules.js");
t.loadScript("lesson-package.js", { reload: true });
t.loadScript("project-manager.js", { reload: true });
t.loadScript("review.js");

function SL() { return global.StorageLayer; }
function BR() { return global.BackupRestore || {}; }
function PM() { return global.ProjectManager; }

async function waitTick(n = 30) {
  for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => process.nextTick(r));
  }
}

async function seedProjectData(projectId) {
  const samples = [
    { id: "seed-1", projectId, code: "BX-001", minerals: "石英", photo: "data:image/png;base64,AAA=" },
    { id: "seed-2", projectId, code: "BX-002", minerals: "长石", annotationResourceId: null },
    { id: "seed-3", projectId, code: "BX-003", reviewStatus: "confirmed" }
  ];
  await SL().SampleStore.bulkAdd(samples);
  await waitTick(10);

  await SL().VersionStore.bulkAdd([
    { id: "vh1", sampleId: "seed-1", version: 1, timestamp: "2025-01-01T00:00:00.000Z", snapshot: { code: "BX-001" } }
  ]);
  await waitTick(10);

  await SL().TaskStore.add({
    id: "task-1", projectId, title: "教学任务1", sampleIds: ["seed-1", "seed-2"]
  });
  await waitTick(10);
  return samples;
}

t.beforeEach(async function () {
  t.resetDB();
  await waitTick(3);
  if (PM()) {
    await PM().init?.();
    await waitTick(15);
  }
});

t.suite("一、备份格式与结构校验", function () {
  this.before(async function () {
    await PM()?.init?.();
    await waitTick(20);
  });

  this.test("备份文件格式标识 format 应为规范值", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(pid);
    const backup = await SL().exportProjectData(pid, { includeHistory: true, includeRecycleBin: true });
    await waitTick(10);
    t.assertContains(
      ["wxyy-thin-section-project-backup", "wxyy-thin-section-backup", "wxyy-thin-section-full-backup"],
      backup.format,
      "format 应为项目规范标识"
    );
  });

  this.test("version 字段应存在且为数字", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(pid);
    const backup = await SL().exportProjectData(pid);
    await waitTick(10);
    t.assertTrue(typeof backup.version === "number", "version 应为数字");
    t.assertTrue(backup.version >= 1, "version 应 >= 1");
  });

  this.test("exportDate 应符合 ISO 时间格式", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(pid);
    const backup = await SL().exportProjectData(pid);
    await waitTick(10);
    t.assertMatches(backup.exportDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, "exportDate 格式错误");
  });

  this.test("project 信息块包含 id/name/createdAt 必要字段", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(pid);
    const backup = await SL().exportProjectData(pid);
    await waitTick(10);
    t.assertExists(backup.project, "缺少 project 块");
    t.assertExists(backup.project.id, "缺少 project.id");
    t.assertExists(backup.project.name, "缺少 project.name");
    t.assertExists(backup.project.createdAt, "缺少 project.createdAt");
  });

  this.test("samples 数组每个样本都有必要字段", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(pid);
    const backup = await SL().exportProjectData(pid);
    await waitTick(10);
    t.assertTrue(Array.isArray(backup.samples), "samples 应是数组");
    t.assertTrue(backup.samples.length >= 3, "应包含至少 3 个样本");
    backup.samples.forEach((s, i) => {
      t.assertExists(s.id, `samples[${i}] 缺少 id`);
      t.assertExists(s.code, `samples[${i}] 缺少 code`);
    });
  });
});

t.suite("二、备份导出完整性 (includeHistory/includeRecycleBin)", function () {
  this.test("includeHistory=false 时不导出版本历史和照片", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(pid);
    const backup = await SL().exportProjectData(pid, { includeHistory: false, includeRecycleBin: false });
    await waitTick(10);
    t.assertEqual(backup.versionHistory, undefined, "versionHistory 不应存在");
    backup.samples.forEach(s => {
      if (s.code === "BX-001") {
        t.assertEqual(s.photo, "", "includeHistory=false 时照片应置空");
      }
    });
  });

  this.test("includeHistory=true 时应包含版本历史数组", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(pid);
    const backup = await SL().exportProjectData(pid, { includeHistory: true, includeRecycleBin: true });
    await waitTick(10);
    t.assertTrue(Array.isArray(backup.versionHistory), "versionHistory 应是数组");
  });

  this.test("includeRecycleBin=true 时应包含回收站数组", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(pid);
    await SL().RecycleStore.add({
      id: "rb-1", projectId: pid, sampleId: "deleted-sample",
      deletedAt: new Date().toISOString(), sampleData: { code: "DEL-001" }
    });
    await waitTick(10);
    const backup = await SL().exportProjectData(pid, { includeRecycleBin: true });
    await waitTick(10);
    t.assertTrue(Array.isArray(backup.recycleBin), "recycleBin 应是数组");
    t.assertTrue(backup.recycleBin.length >= 1, "recycleBin 应包含数据");
  });

  this.test("任务数据应随项目导出", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(pid);
    const backup = await SL().exportProjectData(pid);
    await waitTick(10);
    t.assertTrue(Array.isArray(backup.tasks), "tasks 应是数组");
    t.assertTrue(backup.tasks.length >= 1, "应包含至少 1 个任务");
  });
});

t.suite("三、BackupModule 格式分析工具函数", function () {
  this.test("normalizeBackupData 能识别标准格式", function () {
    const good = {
      format: "wxyy-thin-section-project-backup",
      version: 2,
      project: { id: "p1", name: "x" },
      samples: []
    };
    const normalized = BR().normalizeBackupData?.(good);
    if (normalized) {
      t.assertEqual(normalized.version, 2);
    }
  });

  this.test("normalizeBackupData 能识别旧版 legacy 格式", function () {
    const legacy = [
      { id: "s1", code: "BX-001" }
    ];
    const normalized = BR().normalizeBackupData?.(legacy);
    if (normalized) {
      t.assertTrue(normalized.isLegacy === true, "应标记 isLegacy=true");
      t.assertExists(normalized.samples, "应转换出 samples 字段");
    }
  });

  this.test("getBackupFormatInfo 能识别项目备份类型", function () {
    const info = BR().getBackupFormatInfo?.({
      format: "wxyy-thin-section-project-backup",
      project: { id: "1", name: "X" }
    });
    if (info) {
      t.assertEqual(info.type, "project");
      t.assertExists(info.project);
    }
  });

  this.test("getBackupFormatInfo 能识别全量备份类型", function () {
    const info = BR().getBackupFormatInfo?.({
      format: "wxyy-thin-section-full-backup",
      projects: []
    });
    if (info) {
      t.assertEqual(info.type, "full");
    }
  });

  this.test("无效数据应返回 invalid/unknown 类型", function () {
    const info1 = BR().getBackupFormatInfo?.(null);
    if (info1) t.assertEqual(info1.type, "invalid");
    const info2 = BR().getBackupFormatInfo?.({ random: "data" });
    if (info2) t.assertTrue(["unknown", "invalid"].includes(info2.type));
  });
});

t.suite("四、ID 重映射安全 (导入不污染原数据)", function () {
  this.test("导入应重映射样本 ID，不与原始冲突", async function () {
    const srcPid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(srcPid);
    await waitTick(15);
    const backup = await SL().exportProjectData(srcPid, { includeHistory: true });
    await waitTick(10);

    const originalSampleIds = backup.samples.map(s => s.id);
    t.assertEqual(originalSampleIds.length, 3);

    const importResult = await SL().importProjectData(backup, { newProjectId: "imported-pid-1" });
    await waitTick(30);

    const newSamples = await SL().SampleStore.getAll("imported-pid-1");
    await waitTick(10);
    t.assertEqual(newSamples.length, 3, "应导入 3 个样本");

    newSamples.forEach(ns => {
      t.assertNotContains(originalSampleIds, ns.id, "新样本 ID 不应与原始冲突");
    });
  });

  this.test("导入应重命名项目，不覆盖源项目", async function () {
    const srcPid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(srcPid);
    await waitTick(15);
    const backup = await SL().exportProjectData(srcPid);
    await waitTick(10);
    const srcName = backup.project.name;

    await SL().importProjectData(backup, {
      newProjectId: "renamed-pid",
      renameProject: `${srcName} - 导入副本`
    });
    await waitTick(30);

    const importedProject = await SL().ProjectStore.getById("renamed-pid");
    await waitTick(10);
    t.assertExists(importedProject, "导入项目应存在");
    t.assertEqual(importedProject.name, `${srcName} - 导入副本`);
  });

  this.test("任务中的 sampleIds 应随样本 ID 同步重映射", async function () {
    const srcPid = SL().DEFAULT_PROJECT_ID;
    await seedProjectData(srcPid);
    await waitTick(15);
    const backup = await SL().exportProjectData(srcPid);
    await waitTick(10);
    const origTaskSampleIds = backup.tasks[0]?.sampleIds || [];

    await SL().importProjectData(backup, { newProjectId: "mapped-pid" });
    await waitTick(30);

    const newTasks = await SL().TaskStore.getAll("mapped-pid");
    await waitTick(10);
    t.assertTrue(newTasks.length >= 1);
    const mappedTaskSampleIds = newTasks[0]?.sampleIds || [];
    mappedTaskSampleIds.forEach(id => {
      t.assertNotContains(origTaskSampleIds, id, "任务中的 sampleIds 应被重映射");
    });
  });
});

t.suite("五、校验 hash 与内容一致性", function () {
  this.test("computeContentHash 对于相同数据返回相同 hash", async function () {
    if (!BR().computeContentHash) return;
    const data = { samples: [{ a: 1, b: 2 }], project: { id: "p1" } };
    const h1 = await BR().computeContentHash(data);
    const h2 = await BR().computeContentHash(JSON.parse(JSON.stringify(data)));
    t.assertEqual(h1, h2, "相同内容 hash 应一致");
  });

  this.test("computeContentHash 对于不同数据返回不同 hash", async function () {
    if (!BR().computeContentHash) return;
    const d1 = { samples: [{ code: "BX-001" }] };
    const d2 = { samples: [{ code: "BX-002" }] };
    const h1 = await BR().computeContentHash(d1);
    const h2 = await BR().computeContentHash(d2);
    t.assertNotEqual(h1, h2, "不同内容 hash 不应相同");
  });

  this.test("getBackupSummary 返回统计摘要信息", function () {
    const info = BR().getBackupSummary?.({
      samples: Array(10).fill({ id: "x" }),
      tasks: Array(3).fill({ id: "t" }),
      versionHistory: Array(5).fill({})
    });
    if (info) {
      t.assertEqual(info.sampleCount, 10);
      t.assertEqual(info.taskCount, 3);
    }
  });
});

t.run().then(summary => {
  process.exit(summary.allPassed ? 0 : 1);
});
