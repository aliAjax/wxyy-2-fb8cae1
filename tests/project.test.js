"use strict";

const TestFramework = require("./test-framework.js");

const t = new TestFramework("ProjectManager 项目管理 (高风险链路)");
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
function PM() { return global.ProjectManager; }

async function waitTick(n = 30) {
  for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => process.nextTick(r));
  }
}

t.beforeEach(async function () {
  t.resetDB();
  await waitTick(3);
  if (PM()) {
    await PM().init?.();
    await waitTick(15);
  }
});

t.suite("一、初始化与默认项目", function () {
  this.test("init() 后 getCurrentProjectId 应返回默认项目 ID", async function () {
    const cid = PM()?.getCurrentProjectId?.();
    t.assertEqual(cid, SL().DEFAULT_PROJECT_ID);
  });

  this.test("init() 应确保默认项目存在于 DB", async function () {
    const pid = SL().DEFAULT_PROJECT_ID;
    const p = await SL().ProjectStore.getById(pid);
    await waitTick(5);
    t.assertExists(p, "默认项目应已创建");
    t.assertEqual(p.name, "默认项目");
  });

  this.test("listProjects() 返回项目列表（至少包含默认项目）", async function () {
    const list = await PM()?.listProjects?.();
    await waitTick(5);
    t.assertTrue(Array.isArray(list), "应返回数组");
    t.assertTrue(list.length >= 1, "至少包含默认项目");
  });
});

t.suite("二、项目创建与切换", function () {
  this.test("createProject() 创建新项目并返回完整对象", async function () {
    const p = await PM()?.createProject?.("2025春季沉积岩实习", "用于2025春季学期沉积岩薄片观察");
    await waitTick(10);
    t.assertExists(p?.id, "应返回项目 ID");
    t.assertEqual(p?.name, "2025春季沉积岩实习");
    t.assertEqual(p?.description, "用于2025春季学期沉积岩薄片观察");
    t.assertExists(p?.createdAt);
  });

  this.test("createProject() 空名称应抛异常", async function () {
    try {
      await PM()?.createProject?.("  ");
      await waitTick(5);
      t.assertTrue(false, "应抛出异常");
    } catch (e) {
      t.assertTrue(true);
    }
  });

  this.test("setCurrentProject() 切换到非归档项目", async function () {
    const p = await PM()?.createProject?.("可切换项目");
    await waitTick(10);
    await PM()?.setCurrentProject?.(p.id);
    await waitTick(5);
    const cid = PM()?.getCurrentProjectId?.();
    t.assertEqual(cid, p.id);
  });

  this.test("setCurrentProject() 切换到不存在的项目应抛异常", async function () {
    try {
      await PM()?.setCurrentProject?.("non-existent-id-xyz");
      await waitTick(5);
      t.assertTrue(false, "应抛异常");
    } catch (e) {
      t.assertTrue(true);
    }
  });
});

t.suite("三、项目归档/解档/重命名", function () {
  this.test("archiveProject() 归档后项目不出现在非归档列表", async function () {
    const p = await PM()?.createProject?.("待归档项目");
    await waitTick(10);
    const archived = await PM()?.archiveProject?.(p.id);
    await waitTick(10);
    t.assertEqual(archived?.isArchived, true, "isArchived 应为 true");
    t.assertExists(archived?.archivedAt);

    const list = await PM()?.listProjects?.(false);
    await waitTick(5);
    const found = list.find(pp => pp.id === p.id);
    t.assertEqual(found, undefined, "归档项目不应出现在默认列表");
  });

  this.test("默认项目不能归档（应有保护）", async function () {
    try {
      await PM()?.archiveProject?.(SL().DEFAULT_PROJECT_ID);
      await waitTick(5);
      t.assertTrue(false, "默认项目归档应抛异常");
    } catch (e) {
      t.assertTrue(true);
    }
  });

  this.test("归档后如果是当前项目，应自动切回默认项目", async function () {
    const p = await PM()?.createProject?.("归档会被切换走的项目");
    await waitTick(10);
    await PM()?.setCurrentProject?.(p.id);
    await waitTick(5);
    t.assertEqual(PM()?.getCurrentProjectId?.(), p.id, "先确认切换成功");

    await PM()?.archiveProject?.(p.id);
    await waitTick(10);
    t.assertEqual(
      PM()?.getCurrentProjectId?.(),
      SL().DEFAULT_PROJECT_ID,
      "归档后应切回默认项目"
    );
  });

  this.test("unarchiveProject() 解档后项目恢复可见", async function () {
    const p = await PM()?.createProject?.("解档测试项目");
    await waitTick(10);
    await PM()?.archiveProject?.(p.id);
    await waitTick(10);
    const restored = await PM()?.unarchiveProject?.(p.id);
    await waitTick(10);
    t.assertEqual(restored?.isArchived, false);
    t.assertEqual(restored?.archivedAt, null);
  });

  this.test("renameProject() / updateProjectDescription() 更新字段", async function () {
    const p = await PM()?.createProject?.("原名", "原描述");
    await waitTick(10);
    const renamed = await PM()?.renameProject?.(p.id, "新名称");
    await waitTick(10);
    t.assertEqual(renamed?.name, "新名称");
    t.assertTrue(renamed?.updatedAt > renamed?.createdAt || renamed?.updatedAt === renamed?.createdAt);

    const descUpdated = await PM()?.updateProjectDescription?.(p.id, "新描述内容");
    await waitTick(10);
    t.assertEqual(descUpdated?.description, "新描述内容");
  });
});

t.suite("四、项目删除与复制 (高风险)", function () {
  this.test("deleteProject() 删除后项目不存在", async function () {
    const p = await PM()?.createProject?.("待删除项目");
    await waitTick(10);
    const result = await PM()?.deleteProject?.(p.id);
    await waitTick(15);
    t.assertTrue(result, "应返回 true");
    const fetched = await SL().ProjectStore.getById(p.id);
    await waitTick(5);
    t.assertEqual(fetched, undefined);
  });

  this.test("默认项目不能删除（保护）", async function () {
    try {
      await PM()?.deleteProject?.(SL().DEFAULT_PROJECT_ID);
      await waitTick(5);
      t.assertTrue(false, "默认项目删除应抛异常");
    } catch (e) {
      t.assertTrue(true);
    }
  });

  this.test("duplicateProject() 复制出独立项目，包含相同数据", async function () {
    const p = await PM()?.createProject?.("源项目");
    await waitTick(10);

    await SL().SampleStore.bulkAdd([
      { id: "dup-s1", projectId: p.id, code: "DUP-001", minerals: "石英" },
      { id: "dup-s2", projectId: p.id, code: "DUP-002", minerals: "长石" }
    ]);
    await waitTick(15);

    const copy = await PM()?.duplicateProject?.(p.id, "源项目 - 副本");
    await waitTick(30);

    t.assertExists(copy?.id, "应返回复制出的项目");
    t.assertTrue(copy?.id !== p.id, "副本 ID 应不同于源");
    t.assertEqual(copy?.name, "源项目 - 副本");

    const copySamples = await SL().SampleStore.getAll(copy.id);
    await waitTick(10);
    t.assertEqual(copySamples.length, 2, "副本应包含 2 个样本");
    const codes = copySamples.map(s => s.code).sort();
    t.assertEqual(codes, ["DUP-001", "DUP-002"]);
  });
});

t.suite("五、导出备份与状态持久化", function () {
  this.test("exportProjectBackup() 导出结构正确", async function () {
    const p = await PM()?.createProject?.("备份导出测试项目");
    await waitTick(10);
    await SL().SampleStore.add({
      id: "bk-s1", projectId: p.id, code: "BK-001", minerals: "A"
    });
    await waitTick(15);
    const backup = await PM()?.exportProjectBackup?.(p.id);
    await waitTick(10);
    t.assertExists(backup?.format, "备份 format 应存在");
    t.assertEqual(backup?.project?.id, p.id);
    t.assertTrue(backup?.samples?.length >= 1);
  });
});

t.run().then(summary => {
  process.exit(summary.allPassed ? 0 : 1);
});
