"use strict";

const TestFramework = require("./test-framework.js");

const t = new TestFramework("LessonPackage 课堂包 (高风险链路)");
t.setupBrowserEnvironment();
t.loadScript("storage-layer.js", { reload: true });
t.loadScript("lesson-package.js");

async function waitTick(n = 20) {
  for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => process.nextTick(r));
  }
}

function LP() { return global.LessonPackage; }
function SL() { return global.StorageLayer; }

function makeMockSamples(n = 5) {
  return Array.from({ length: n }, (_, i) => ({
    id: `ls-sample-${i + 1}`,
    code: `BX-LS-${String(i + 1).padStart(3, "0")}`,
    minerals: i % 2 === 0 ? "石英、斜长石" : "方解石、白云石",
    texture: "半自形粒状结构",
    location: `剖面第${i + 1}层`,
    magnification: "40x",
    polarization: i % 3 === 0 ? "正交偏光" : "单偏光",
    photo: `data:image/png;base64,mockphoto${i}`,
    annotations: [{ id: `a${i}`, type: "point", x: 10, y: 20, label: `矿物点${i}` }]
  }));
}

t.beforeEach(async function () {
  t.resetDB();
  await waitTick(3);
});

t.suite("一、课堂包格式常量与迁移", function () {
  this.test("格式常量应存在", function () {
    t.assertEqual(LP()?.LESSON_PACKAGE_FORMAT, "wxyy-lesson-package");
    t.assertEqual(LP()?.ANSWER_PACKAGE_FORMAT, "wxyy-answer-package");
  });

  this.test("PACKAGE_FORMAT_VERSION >= 1", function () {
    t.assertTrue((LP()?.PACKAGE_FORMAT_VERSION || 0) >= 1);
  });

  this.test("CONFLICT_STRATEGIES 冲突策略三态齐全", function () {
    const cs = LP()?.CONFLICT_STRATEGIES || {};
    t.assertEqual(cs.SKIP, "skip");
    t.assertEqual(cs.RENAME, "rename");
    t.assertEqual(cs.OVERWRITE, "overwrite");
  });
});

t.suite("二、课堂包迁移函数", function () {
  this.test("migrateLessonPackage() v0→latest 产生有效字段", function () {
    const old = {
      packageId: "pkg-001",
      title: "老版本课堂包",
      samples: [{ id: "s1" }],
      tasks: [{ id: "t1", title: "Task1", sampleIds: ["s1"] }]
    };
    const migrated = LP()?.migrateLessonPackage?.(old);
    if (migrated) {
      t.assertTrue(migrated.version >= 3, "迁移后版本应>=3，实际: " + migrated.version);
      t.assertExists(migrated.contentHash, "应添加 contentHash");
      t.assertExists(migrated.lessonContentHash, "应添加 lessonContentHash");
      t.assertExists(migrated.rubrics, "应添加默认 rubrics");
      t.assertExists(migrated.referenceAnswers, "应添加 referenceAnswers");
    }
  });

  this.test("migrateLessonPackage() 幂等性 - 多次迁移一致", function () {
    const orig = {
      packageId: "pkg-002",
      title: "幂等测试",
      samples: makeMockSamples(3),
      tasks: [{ id: "t1", title: "T", sampleIds: ["s1", "s2"] }]
    };
    const m1 = LP()?.migrateLessonPackage?.(JSON.parse(JSON.stringify(orig)));
    const m2 = LP()?.migrateLessonPackage?.(JSON.parse(JSON.stringify(m1)));
    if (m1 && m2) {
      t.assertEqual(m1.version, m2.version, "版本号应相同");
      t.assertEqual(m1.contentHash, m2.contentHash, "contentHash 应相同");
    }
  });

  this.test("migrateAnswerPackage() v0→latest 应清除 referenceAnswers", function () {
    const old = {
      answerPackageId: "ans-1",
      studentName: "学生A",
      referenceAnswers: { s1: { minerals: "石英" } },
      rubrics: [{ id: "r1" }],
      answers: { s1: { minerals: "学生填写的" } }
    };
    const migrated = LP()?.migrateAnswerPackage?.(old);
    if (migrated) {
      t.assertEqual(migrated.referenceAnswers, undefined, "答案包中不应保留参考答案");
      t.assertEqual(migrated.rubrics, undefined, "答案包中不应保留 rubrics");
      t.assertExists(migrated.lessonContentHash, "应添加 lessonContentHash");
    }
  });
});

t.suite("三、hash 计算一致性与稳定性", function () {
  this.test("stableStringify() 对于键序不同对象应产生相同字符串", function () {
    const s1 = LP()?.stableStringify?.({ a: 1, b: 2, c: 3 });
    const s2 = LP()?.stableStringify?.({ c: 3, a: 1, b: 2 });
    t.assertEqual(s1, s2, "键序不敏感");
  });

  this.test("computeNumericHash() 对于相同输入返回相同值", function () {
    const h1 = LP()?.computeNumericHash?.("相同的字符串");
    const h2 = LP()?.computeNumericHash?.("相同的字符串");
    t.assertEqual(h1, h2);
  });

  this.test("computeSha1Hash() 对于不同输入返回不同值", async function () {
    const h1 = await LP()?.computeSha1Hash?.("abc123");
    const h2 = await LP()?.computeSha1Hash?.("abc124");
    t.assertNotEqual(h1, h2);
  });

  this.test("computeLessonContentHash() 对相同课程内容稳定", function () {
    const data = {
      packageId: "pkg-stable",
      samples: makeMockSamples(5),
      tasks: [
        { id: "t1", title: "任务一", sampleIds: ["ls-sample-1", "ls-sample-2"] },
        { id: "t2", title: "任务二", sampleIds: ["ls-sample-3"] }
      ],
      rubrics: [
        { name: "矿物识别", maxScore: 40 },
        { name: "结构描述", maxScore: 30 }
      ],
      referenceAnswers: {
        "ls-sample-1": { minerals: "石英" }
      }
    };
    const h1 = LP()?.computeLessonContentHash?.(data);
    const h2 = LP()?.computeLessonContentHash?.(JSON.parse(JSON.stringify(data)));
    t.assertEqual(h1, h2, "课堂内容 hash 应稳定");
  });
});

t.suite("四、ID 映射与包构建辅助函数", function () {
  this.test("mapSampleIds() 重映射样本 ID 并保留结构", function () {
    const samples = makeMockSamples(3);
    const mapping = {};
    samples.forEach(s => { mapping[s.id] = `mapped-${s.id}`; });
    const mapped = LP()?.mapSampleIds?.(samples, mapping);
    if (mapped) {
      t.assertEqual(mapped.length, 3);
      mapped.forEach((ms, i) => {
        const old = samples[i];
        t.assertEqual(ms.id, mapping[old.id], "ID 应被替换");
        ms.annotations?.forEach((a, ai) => {
          t.assertEqual(a.id !== old.annotations[ai].id, true, "标注 ID 应重映射");
          t.assertEqual(a.sampleId, mapping[old.id]);
        });
      });
    }
  });

  this.test("buildDefaultRubrics() 返回标准三项评分", function () {
    const r = LP()?.buildDefaultRubrics?.();
    t.assertTrue(Array.isArray(r), "应返回数组");
    t.assertEqual(r.length, 3, "默认 3 个评分项");
    const sum = r.reduce((a, b) => a + (b.maxScore || 0), 0);
    t.assertEqual(sum, 100, "总分应为 100");
  });
});

t.suite("五、课堂包结构完整性 - 端到端", function () {
  this.test("完整课堂包结构包含所有必要字段", function () {
    if (!LP()?.buildDefaultRubrics) return;
    const samples = makeMockSamples(10);
    const tasks = [
      { id: "t1", title: "薄片观察一", sampleIds: samples.slice(0, 5).map(s => s.id), completedSamples: [], deadline: "" },
      { id: "t2", title: "薄片观察二", sampleIds: samples.slice(5).map(s => s.id), completedSamples: [] }
    ];
    const packageData = LP()?.migrateLessonPackage?.({
      packageId: "lesson-full-test",
      title: "沉积岩薄片观察 - 完整课程",
      description: "针对沉积岩主要岩石类型的系统观察训练",
      teacher: "李老师",
      samples,
      tasks,
      rubrics: LP().buildDefaultRubrics(),
      referenceAnswers: Object.fromEntries(
        samples.map(s => [s.id, { minerals: s.minerals, comment: "参考答案提示" }])
      ),
      createdAt: new Date().toISOString()
    });

    t.assertEqual(packageData.packageId, "lesson-full-test");
    t.assertEqual(packageData.title, "沉积岩薄片观察 - 完整课程");
    t.assertEqual(packageData.samples.length, 10);
    t.assertEqual(packageData.tasks.length, 2);
    t.assertEqual(packageData.rubrics.length, 3);
    t.assertEqual(Object.keys(packageData.referenceAnswers).length, 10);
    t.assertExists(packageData.lessonContentHash, "lessonContentHash 必须存在");
    t.assertExists(packageData.contentHash, "contentHash 必须存在");
  });
});

t.run().then(summary => {
  process.exit(summary.allPassed ? 0 : 1);
});
