"use strict";

const TestFramework = require("./test-framework.js");

const t = new TestFramework("StorageLayer 存储层");
t.setupBrowserEnvironment();
t.loadScript("storage-layer.js", { reload: true });

async function waitTick(n = 20) {
  for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => process.nextTick(r));
  }
}

function SL() { return global.StorageLayer; }

t.beforeEach(async function () {
  t.resetDB();
  await waitTick(3);
});

t.suite("一、数据库初始化与 Schema", function () {
  this.test("initDB() 应成功初始化并创建所有 stores", async function () {
    await SL().initDB();
    await waitTick();
    const dump = t.dumpDB();
    const dbName = Object.keys(dump)[0];
    t.assertExists(dbName, "应存在数据库文件");
    const stores = Object.keys(dump[dbName] || {});
    t.assertTrue(stores.length >= 10, `应创建至少 10 个 stores，实际 ${stores.length}`);
    t.assertContains(stores, SL().STORES?.PROJECTS || "projects", "缺少 projects store");
    t.assertContains(stores, SL().STORES?.SAMPLES || "samples", "缺少 samples store");
    t.assertContains(stores, SL().STORES?.TASKS || "tasks", "缺少 tasks store");
    t.assertContains(stores, SL().STORES?.APP_STATE || "appState", "缺少 appState store");
  });

  this.test("常量 STORES 应全部定义", function () {
    const STORES = SL().STORES;
    const expected = ["PROJECTS", "SAMPLES", "PHOTOS", "TASKS", "APP_STATE",
      "ANNOTATIONS", "VERSION_HISTORY", "RECYCLE_BIN", "STUDENT_ANSWERS"];
    expected.forEach(k => {
      t.assertExists(STORES?.[k], `缺少 STORES.${k}`);
    });
  });

  this.test("DEFAULT_PROJECT_ID 常量存在", function () {
    t.assertExists(SL()?.DEFAULT_PROJECT_ID, "DEFAULT_PROJECT_ID 未导出");
    t.assertEqual(SL().DEFAULT_PROJECT_ID, "default-project");
  });
});

t.suite("二、ProjectStore 项目存储", function () {
  this.test("add() 应创建项目并自动生成 ID", async function () {
    const p = await SL().ProjectStore.add({
      name: "测试项目",
      description: "测试描述"
    });
    await waitTick(10);
    t.assertExists(p.id, "项目 ID 应存在");
    t.assertEqual(p.name, "测试项目");
    t.assertEqual(p.description, "测试描述");
    t.assertExists(p.createdAt, "createdAt 应存在");
  });

  this.test("getById() 应能根据 ID 取回项目", async function () {
    const created = await SL().ProjectStore.add({
      name: "取回测试",
      description: "desc"
    });
    await waitTick(10);
    const fetched = await SL().ProjectStore.getById(created.id);
    await waitTick(10);
    t.assertEqual(fetched.id, created.id);
    t.assertEqual(fetched.name, "取回测试");
  });

  this.test("getAll() 应返回按创建时间倒序的项目列表", async function () {
    await SL().ProjectStore.add({ id: "p-1", name: "项目1" });
    await waitTick(5);
    await SL().ProjectStore.add({ id: "p-2", name: "项目2" });
    await waitTick(5);
    await SL().ProjectStore.add({ id: "p-3", name: "项目3", isArchived: true });
    await waitTick(10);
    const all = await SL().ProjectStore.getAll(true);
    await waitTick(5);
    t.assertEqual(all.length, 3, "包含归档应返回 3 个项目");
    t.assertEqual(all[0]?.id, "p-3", "应按 createdAt 倒序，最新的排第一");
    const nonArchived = await SL().ProjectStore.getAll(false);
    await waitTick(5);
    t.assertEqual(nonArchived.length, 2, "排除归档应返回 2 个项目");
  });

  this.test("update() 应正确更新项目字段", async function () {
    const p = await SL().ProjectStore.add({ name: "原名", description: "" });
    await waitTick(10);
    const updated = await SL().ProjectStore.update(p.id, {
      name: "新名称",
      description: "新描述"
    });
    await waitTick(10);
    t.assertEqual(updated.name, "新名称");
    t.assertEqual(updated.description, "新描述");
    t.assertExists(updated.updatedAt, "updatedAt 应更新");
  });

  this.test("remove() 应删除项目及其关联的样本/任务", async function () {
    const p = await SL().ProjectStore.add({ name: "待删除" });
    await waitTick(10);
    await SL().ProjectStore.remove(p.id);
    await waitTick(10);
    const fetched = await SL().ProjectStore.getById(p.id);
    await waitTick(5);
    t.assertEqual(fetched, undefined, "项目应已删除");
  });
});

t.suite("三、SampleStore 样本存储", function () {
  this.test("add() 应保存样本并关联项目", async function () {
    const sample = await SL().SampleStore.add({
      id: "sample-001",
      code: "BX-001",
      minerals: "石英、长石",
      photo: "data:image/png;base64,test-photo-data",
      annotations: [{ id: "a1", type: "point" }]
    });
    await waitTick(15);
    t.assertEqual(sample.code, "BX-001");
    t.assertEqual(sample.projectId, SL().DEFAULT_PROJECT_ID);
    t.assertExists(sample.photoResourceId, "应创建 photoResourceId 关联");
  });

  this.test("getAll() 按项目过滤", async function () {
    await SL().SampleStore.add({
      id: "s1", code: "BX-001", projectId: SL().DEFAULT_PROJECT_ID
    });
    await SL().SampleStore.add({
      id: "s2", code: "BX-002", projectId: "other-project"
    });
    await waitTick(15);
    const allDefault = await SL().SampleStore.getAll(SL().DEFAULT_PROJECT_ID);
    await waitTick(5);
    t.assertEqual(allDefault.length, 1);
    t.assertEqual(allDefault[0].code, "BX-001");
  });

  this.test("getWithPhoto() 应返回带照片数据的完整样本", async function () {
    const photoData = "data:image/jpeg;base64,sample-photo-bytes";
    await SL().SampleStore.add({
      id: "photo-test",
      code: "PHOTO-01",
      photo: photoData
    });
    await waitTick(15);
    const hydrated = await SL().SampleStore.getWithPhoto("photo-test");
    await waitTick(10);
    t.assertExists(hydrated, "应取回样本");
  });

  this.test("update() 应正确更新字段", async function () {
    const created = await SL().SampleStore.add({
      id: "update-test", code: "OLD-001", minerals: "旧矿物"
    });
    await waitTick(15);
    const updated = await SL().SampleStore.update("update-test", {
      code: "NEW-001",
      minerals: "新矿物"
    });
    await waitTick(10);
    t.assertEqual(updated.code, "NEW-001");
    t.assertEqual(updated.minerals, "新矿物");
  });

  this.test("remove() 应级联清理样本及关联", async function () {
    await SL().SampleStore.add({
      id: "del-test", code: "DEL-001", photo: "photo-data"
    });
    await waitTick(15);
    await SL().SampleStore.remove("del-test");
    await waitTick(10);
    const fetched = await SL().SampleStore.getById("del-test");
    await waitTick(5);
    t.assertEqual(fetched, undefined, "样本应已删除");
  });

  this.test("bulkAdd() 批量添加样本", async function () {
    const samples = [
      { id: "b1", code: "BULK-01" },
      { id: "b2", code: "BULK-02" },
      { id: "b3", code: "BULK-03" }
    ];
    await SL().SampleStore.bulkAdd(samples);
    await waitTick(15);
    const all = await SL().SampleStore.getAll();
    await waitTick(5);
    const bulkSamples = all.filter(s => s.code?.startsWith("BULK"));
    t.assertEqual(bulkSamples.length, 3, "应成功批量添加 3 个样本");
  });
});

t.suite("四、AppStateStore 应用状态", function () {
  this.test("getCurrentProjectId / setCurrentProjectId 读写", async function () {
    await SL().AppStateStore.setCurrentProjectId("custom-pid");
    await waitTick(10);
    const id = await SL().AppStateStore.getCurrentProjectId();
    await waitTick(5);
    t.assertEqual(id, "custom-pid");
  });

  this.test("getCompareList / setCompareList 读写对比列表", async function () {
    const list = ["s1", "s2", "s3"];
    await SL().AppStateStore.setCompareList(list);
    await waitTick(10);
    const fetched = await SL().AppStateStore.getCompareList();
    await waitTick(5);
    t.assertEqual(fetched, list);
  });

  this.test("getFilterViews / addFilterView 筛选视图管理", async function () {
    const v = await SL().AppStateStore.addFilterView({
      name: "待审核视图",
      reviewStatus: "pending"
    });
    await waitTick(10);
    const views = await SL().AppStateStore.getFilterViews();
    await waitTick(5);
    t.assertEqual(views.length, 1);
    t.assertEqual(views[0].name, "待审核视图");
    t.assertEqual(views[0].reviewStatus, "pending");
  });
});

t.suite("五、VersionStore & RecycleStore", function () {
  this.test("版本历史应按样本查询并排序", async function () {
    await SL().VersionStore.bulkAdd([
      { id: "v1", sampleId: "s1", timestamp: "2025-01-01T00:00:00.000Z", version: 1 },
      { id: "v2", sampleId: "s1", timestamp: "2025-01-02T00:00:00.000Z", version: 2 },
      { id: "v3", sampleId: "s1", timestamp: "2025-01-03T00:00:00.000Z", version: 3 }
    ]);
    await waitTick(10);
    const history = await SL().VersionStore.getBySampleId("s1");
    await waitTick(5);
    t.assertEqual(history.length, 3);
    t.assertEqual(history[0].version, 1, "应按时间升序排列");
    t.assertEqual(history[2].version, 3);
  });

  this.test("回收站增删查", async function () {
    await SL().RecycleStore.bulkAdd([
      { id: "r1", sampleId: "d1", deletedAt: "2025-01-03T00:00:00.000Z", sampleData: { code: "R-01" } },
      { id: "r2", sampleId: "d2", deletedAt: "2025-01-01T00:00:00.000Z", sampleData: { code: "R-02" } }
    ]);
    await waitTick(10);
    const items = await SL().RecycleStore.getAll();
    await waitTick(5);
    t.assertEqual(items.length, 2);
    t.assertEqual(items[0].id, "r1", "应按删除时间倒序");
  });
});

t.suite("六、PhotoResourceStore 资源去重", function () {
  this.test("同一张照片应产生相同 checksum 并复用资源", async function () {
    const photoData = "data:image/png;base64,shared-photo-content";
    const r1 = await SL().PhotoResourceStore.add("sample-a", photoData);
    await waitTick(10);
    const r2 = await SL().PhotoResourceStore.add("sample-b", photoData);
    await waitTick(10);
    t.assertEqual(r1.checksum, r2.checksum, "相同内容 checksum 应相同");
    t.assertEqual(r1.id, r2.id, "相同照片应复用同一资源 ID");
  });
});

t.run().then(summary => {
  process.exit(summary.allPassed ? 0 : 1);
});
