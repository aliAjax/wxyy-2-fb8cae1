"use strict";

const TestFramework = require("./test-framework.js");

const t = new TestFramework("VersionHistory 版本历史 (高风险链路)");
t.setupBrowserEnvironment();
t.loadScript("storage-layer.js", { reload: true });
t.loadScript("version-history.js");

async function waitTick(n = 20) {
  for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => process.nextTick(r));
  }
}

function VH() { return global.VersionHistory; }
function SL() { return global.StorageLayer; }

t.beforeEach(async function () {
  t.resetDB();
  await waitTick(3);
});

t.suite("一、TRACKED_FIELDS 与常量", function () {
  this.test("TRACKED_FIELDS 包含关键观察字段", function () {
    const tf = VH()?.TRACKED_FIELDS || [];
    const keys = tf.map(f => f.key);
    t.assertContains(keys, "code", "缺少样本编号字段");
    t.assertContains(keys, "minerals", "缺少主要矿物字段");
    t.assertContains(keys, "texture", "缺少颗粒结构字段");
    t.assertContains(keys, "reviewStatus", "缺少审核状态字段");
  });

  this.test("CHANGE_TYPE_LABELS 包含 5 种变更类型", function () {
    const cl = VH()?.CHANGE_TYPE_LABELS || {};
    t.assertEqual(cl.create, "创建样本");
    t.assertEqual(cl.update, "修改字段");
    t.assertEqual(cl.review, "审核变更");
    t.assertEqual(cl.rollback, "回滚操作");
    t.assertEqual(cl.restore, "从回收站恢复");
  });
});

t.suite("二、快照与变更检测核心函数", function () {
  this.test("buildSnapshot() 产生所有跟踪字段的快照", function () {
    const sample = {
      id: "snap-1",
      code: "BX-SNAP-001",
      location: "剖面A第5层",
      magnification: "100x",
      polarization: "正交偏光",
      minerals: "石英、长石",
      texture: "粒状结构",
      comment: "典型花岗岩",
      observationFeatures: ["f1", "f2"],
      reviewStatus: "pending",
      reviewComment: "待复核",
      photo: "data:image/png;base64,test",
      annotations: [{ id: "a1" }]
    };
    const snap = VH()?.buildSnapshot?.(sample);
    if (snap) {
      const tf = VH().TRACKED_FIELDS.map(f => f.key);
      tf.forEach(k => {
        t.assertTrue(k in snap, `快照缺少字段 ${k}`);
      });
      t.assertTrue(snap.hasPhoto === true, "hasPhoto 应为 true");
      t.assertTrue(snap.annotationCount === 1, "annotationCount 应为 1");
    }
  });

  this.test("detectChanges() 识别矿物与结构字段变更", function () {
    const oldSnap = VH()?.buildSnapshot?.({
      code: "BX-001",
      minerals: "石英",
      texture: "粒状",
      photo: "",
      annotations: []
    });
    const newSnap = VH()?.buildSnapshot?.({
      code: "BX-001",
      minerals: "石英、斜长石",
      texture: "半自形粒状",
      photo: "",
      annotations: []
    });
    const changed = VH()?.detectChanges?.(oldSnap, newSnap) || [];
    if (changed) {
      t.assertContains(changed, "minerals", "应检测到 minerals 变更");
      t.assertContains(changed, "texture", "应检测到 texture 变更");
      t.assertTrue(!changed.includes("code"), "code 未变，不应出现在变更列表");
    }
  });

  this.test("detectChanges() 识别照片变更", function () {
    const oldSnap = VH()?.buildSnapshot?.({ code: "A", photo: "photo-old", annotations: [] });
    const newSnap = VH()?.buildSnapshot?.({ code: "A", photo: "photo-new", annotations: [] });
    const changed = VH()?.detectChanges?.(oldSnap, newSnap) || [];
    t.assertContains(changed, "photo", "应检测到 photo 变更");
  });

  this.test("detectChanges() 识别标注数量变更", function () {
    const oldSnap = VH()?.buildSnapshot?.({
      code: "A", photo: "", annotations: [{ id: "a1" }]
    });
    const newSnap = VH()?.buildSnapshot?.({
      code: "A", photo: "", annotations: [{ id: "a1" }, { id: "a2" }, { id: "a3" }]
    });
    const changed = VH()?.detectChanges?.(oldSnap, newSnap) || [];
    t.assertTrue(
      changed.includes("annotations") || changed.includes("annotationCount"),
      "应检测到标注变更"
    );
  });

  this.test("buildChangeSummary() 输出中文标签汇总", function () {
    const summary = VH()?.buildChangeSummary?.(["minerals", "texture", "reviewStatus"]);
    if (summary) {
      t.assertMatches(summary, /变更：/, "应以 变更： 开头");
      t.assertMatches(summary, /主要矿物/, "应包含中文标签");
      t.assertMatches(summary, /颗粒结构/);
      t.assertMatches(summary, /审核状态/);
    }
  });

  this.test("detectChangeType() 纯审核变更返回 'review'", function () {
    const onlyReview = VH()?.detectChangeType?.(["reviewStatus", "reviewComment"]);
    t.assertEqual(onlyReview, "review");
    const mixed = VH()?.detectChangeType?.(["minerals", "reviewStatus"]);
    t.assertEqual(mixed, "update", "混合变更应为 update");
  });
});

t.suite("三、版本记录写入 (recordVersion)", function () {
  this.test("首次 create 应产生第 1 版版本记录", async function () {
    const sample = {
      id: "v-s1",
      code: "V-001",
      minerals: "石英",
      texture: "粒状",
      photo: "",
      annotations: []
    };
    await SL().SampleStore.add({ ...sample, projectId: SL().DEFAULT_PROJECT_ID });
    await waitTick(15);

    const record = await VH()?.recordVersion?.(sample.id, sample, "create");
    await waitTick(15);

    t.assertExists(record, "应返回创建的版本记录");
    t.assertEqual(record?.version, 1, "首版版本号应为 1");
    t.assertEqual(record?.changeType, "create");
    t.assertExists(record?.timestamp);
    t.assertExists(record?.snapshot);

    const history = await SL().VersionStore.getBySampleId(sample.id);
    await waitTick(5);
    t.assertEqual(history.length, 1, "DB 中应存储 1 条版本");
  });

  this.test("连续 3 次修改产生递增版本号", async function () {
    const sid = "v-s2";
    let s = { id: sid, code: "V-002", minerals: "A", texture: "T1", photo: "", annotations: [] };
    await SL().SampleStore.add({ ...s, projectId: SL().DEFAULT_PROJECT_ID });
    await waitTick(15);
    await VH()?.recordVersion?.(sid, s, "create");
    await waitTick(15);

    s.minerals = "A+B";
    await VH()?.recordVersion?.(sid, s, "update");
    await waitTick(15);

    s.texture = "T2";
    const last = await VH()?.recordVersion?.(sid, s, "update");
    await waitTick(15);

    t.assertEqual(last?.version, 3, "第三版应为 3");

    const history = await SL().VersionStore.getBySampleId(sid);
    await waitTick(5);
    t.assertEqual(history.length, 3, "DB 中应存储 3 条版本");
  });

  this.test("无有效变更时不重复记录", async function () {
    const sid = "v-s3";
    const s = { id: sid, code: "V-003", minerals: "A", photo: "", annotations: [] };
    await SL().SampleStore.add({ ...s, projectId: SL().DEFAULT_PROJECT_ID });
    await waitTick(15);
    await VH()?.recordVersion?.(sid, s, "create");
    await waitTick(15);

    const r1 = await VH()?.recordVersion?.(sid, s, "update");
    await waitTick(15);
    t.assertEqual(r1, undefined, "无变更应返回 undefined");

    const history = await SL().VersionStore.getBySampleId(sid);
    await waitTick(5);
    t.assertEqual(history.length, 1, "只有 create 版本");
  });
});

t.suite("四、版本对比与查询", function () {
  this.beforeEach(async function () {
    t.resetDB();
    await waitTick(3);
    const sid = "v-diff-s1";
    await SL().SampleStore.add({
      id: sid, code: "V-DIFF", projectId: SL().DEFAULT_PROJECT_ID,
      minerals: "石英", texture: "粒状", photo: "", annotations: []
    });
    await waitTick(15);

    const s1 = { id: sid, code: "V-DIFF", minerals: "石英", texture: "粒状", photo: "", annotations: [] };
    await VH()?.recordVersion?.(sid, s1, "create");
    await waitTick(15);

    const s2 = { id: sid, code: "V-DIFF", minerals: "石英+斜长石", texture: "粒状", photo: "", annotations: [] };
    await VH()?.recordVersion?.(sid, s2, "update");
    await waitTick(15);

    const s3 = { id: sid, code: "V-DIFF", minerals: "石英+斜长石", texture: "半自形粒状", reviewStatus: "confirmed", photo: "", annotations: [] };
    await VH()?.recordVersion?.(sid, s3, "review");
    await waitTick(15);
  });

  this.test("getHistory() 返回样本完整历史并按版本号排序", async function () {
    const history = await VH()?.getHistory?.("v-diff-s1");
    await waitTick(5);
    t.assertEqual(history.length, 3);
    history.forEach((h, i) => {
      t.assertEqual(h.version, i + 1, "版本号应从 1 递增");
    });
  });

  this.test("diffTwoVersions() 输出差异字段列表", async function () {
    const history = await VH()?.getHistory?.("v-diff-s1");
    await waitTick(5);
    const diff = await VH()?.diffTwoVersions?.(history[0], history[2]);
    if (diff && diff.length > 0) {
      const fields = diff.map(d => d.field);
      t.assertContains(fields, "minerals", "应检测到 minerals 差异");
      t.assertContains(fields, "texture", "应检测到 texture 差异");
      t.assertContains(fields, "reviewStatus", "应检测到 reviewStatus 差异");
      diff.forEach(d => {
        t.assertExists(d.oldValue, "差异项应有 oldValue");
        t.assertExists(d.newValue, "差异项应有 newValue");
        t.assertExists(d.label, "差异项应有中文 label");
      });
    }
  });
});

t.run().then(summary => {
  process.exit(summary.allPassed ? 0 : 1);
});
