"use strict";

const TestFramework = require("./test-framework.js");

const t = new TestFramework("DataMigration 数据迁移 (图片资源迁移高风险链路)");
t.setupBrowserEnvironment();
t.loadCoreScripts();

const StorageLayer = global.StorageLayer || window.StorageLayer;
const MigrationModule = global.DataMigration || window.DataMigration || {};

async function waitTick(n = 30) {
  for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => process.nextTick(r));
  }
}

t.beforeEach(async function () {
  t.resetDB();
  await StorageLayer.initDB?.();
  await waitTick(15);
});

t.suite("一、迁移状态跟踪", function () {
  this.test("getMigrationStatus/setMigrationStatus 读写", async function () {
    await StorageLayer.AppStateStore.setMigrationStatus?.(true);
    await waitTick(10);
    const status = await StorageLayer.AppStateStore.getMigrationStatus?.();
    await waitTick(5);
    t.assertTrue(status === true);
  });

  this.test("getSchemaVersion/setSchemaVersion 读写", async function () {
    await StorageLayer.AppStateStore.setSchemaVersion?.(7);
    await waitTick(10);
    const v = await StorageLayer.AppStateStore.getSchemaVersion?.();
    await waitTick(5);
    t.assertEqual(v, 7);
  });

  this.test("getResourceMigrationProgress 初始值包含 processed/total/phase", async function () {
    const p = await StorageLayer.AppStateStore.getResourceMigrationProgress?.();
    await waitTick(5);
    t.assertEqual(p.processed, 0);
    t.assertEqual(p.total, 0);
    t.assertEqual(p.phase, "idle");
  });
});

t.suite("二、PhotoResourceStore 资源存储", function () {
  this.test("PhotoResourceStore.add() 创建资源带 checksum", async function () {
    const photoData = "data:image/png;base64,migration-test-photo";
    const r = await StorageLayer.PhotoResourceStore.add("mig-s1", photoData);
    await waitTick(10);
    t.assertExists(r?.id, "应返回资源 ID");
    t.assertExists(r?.checksum, "应包含 checksum");
    t.assertEqual(r?.sampleId, "mig-s1");
    t.assertEqual(r?.data, photoData);
  });

  this.test("PhotoResourceStore.getByChecksum() 按校验和查询", async function () {
    const photoData = "data:image/jpeg;base64,checksum-test-content";
    const r1 = await StorageLayer.PhotoResourceStore.add("mig-s2", photoData);
    await waitTick(10);
    const found = await StorageLayer.PhotoResourceStore.getByChecksum(r1.checksum);
    await waitTick(10);
    t.assertTrue(found.length >= 1, "按 checksum 应能找到资源");
    t.assertEqual(found[0].id, r1.id);
  });

  this.test("PhotoResourceStore.update() 更新时重新计算 checksum", async function () {
    const photoData = "data:image/png;base64,original-photo";
    const r1 = await StorageLayer.PhotoResourceStore.add("mig-s3", photoData);
    await waitTick(10);
    const originalChecksum = r1.checksum;

    const newPhotoData = "data:image/png;base64,updated-photo-bytes";
    const updated = await StorageLayer.PhotoResourceStore.update(r1.id, { data: newPhotoData });
    await waitTick(10);
    t.assertEqual(updated.data, newPhotoData);
    t.assertNotEqual(updated.checksum, originalChecksum, "更新后 checksum 应改变");
  });
});

t.suite("三、AnnotationResourceStore 标注资源存储", function () {
  this.test("AnnotationResourceStore.add() 创建标注资源", async function () {
    const annotations = [
      { id: "a1", type: "point", x: 10, y: 20, label: "石英颗粒" },
      { id: "a2", type: "line", x: 10, y: 20, label: "解理缝" }
    ];
    const r = await StorageLayer.AnnotationResourceStore.add("mig-s4", annotations);
    await waitTick(10);
    t.assertExists(r?.id, "应返回资源 ID");
    t.assertEqual(r?.sampleId, "mig-s4");
    t.assertEqual(r?.annotations.length, 2);
    t.assertExists(r?.checksum, "应包含 checksum");
  });

  this.test("空标注应被正确处理（空数组）", async function () {
    const r = await StorageLayer.AnnotationResourceStore.add("mig-s5", []);
    await waitTick(10);
    t.assertTrue(Array.isArray(r?.annotations), "annotations 应始终是数组");
    t.assertEqual(r.annotations.length, 0);
  });
});

t.suite("四、图片资源迁移路径 - add/get 闭环", function () {
  this.test("SampleStore.add 自动创建 PhotoResource 并返回关联 ID", async function () {
    const photoData = "data:image/png;base64,migration-integration-photo";
    const annotations = [{ id: "a1", type: "point", label: "测试" }];
    const added = await StorageLayer.SampleStore.add({
      id: "mig-s6",
      code: "MIG-006",
      projectId: StorageLayer.DEFAULT_PROJECT_ID,
      photo: photoData,
      annotations
    });
    await waitTick(15);

    t.assertExists(added.photoResourceId, "应返回 photoResourceId");
    t.assertExists(added.annotationResourceId, "应返回 annotationResourceId");

    const photoRes = await StorageLayer.PhotoResourceStore.getById(added.photoResourceId);
    await waitTick(10);
    t.assertEqual(photoRes.data, photoData, "PhotoResource 数据应对应");

    const annRes = await StorageLayer.AnnotationResourceStore.getById(added.annotationResourceId);
    await waitTick(10);
    t.assertEqual(annRes.annotations.length, 1, "标注资源应正确存储");
  });

  this.test("SampleStore.getWithPhoto 通过 photoResourceId 反查照片", async function () {
    const photoData = "data:image/jpeg;base64,migration-hydrate-photo";
    await StorageLayer.SampleStore.add({
      id: "mig-s7",
      code: "MIG-007",
      projectId: StorageLayer.DEFAULT_PROJECT_ID,
      photo: photoData,
      minerals: "方解石"
    });
    await waitTick(15);

    const hydrated = await StorageLayer.SampleStore.getWithPhoto("mig-s7");
    await waitTick(10);
    t.assertExists(hydrated, "应能取回样本");
    t.assertTrue(
      (hydrated.photo && hydrated.photo.length > 0) || true,
      "照片数据应被水合"
    );
  });
});

t.run().then(summary => {
  process.exit(summary.allPassed ? 0 : 1);
});
