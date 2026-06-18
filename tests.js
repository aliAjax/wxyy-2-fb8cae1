(function (root, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = factory;
  } else {
    root.ReviewTests = factory;
  }
})(typeof self !== "undefined" ? self : this, function (ReviewModule) {
  "use strict";

  const RS = ReviewModule.REVIEW_STATUS;
  const results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name, passed: true });
    } catch (e) {
      results.push({ name, passed: false, error: e.message || String(e) });
    }
  }

  function assertEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(
        (msg || "断言失败") +
        `\n  期望: ${b}\n  实际: ${a}`
      );
    }
  }

  function assertTrue(cond, msg) {
    if (!cond) {
      throw new Error(msg || "应为 true");
    }
  }

  function assertContains(arr, item, msg) {
    if (!arr.includes(item)) {
      throw new Error(
        (msg || "数组应包含") +
        ` ${JSON.stringify(item)}\n  数组: ${JSON.stringify(arr)}`
      );
    }
  }

  function assertNotContains(arr, item, msg) {
    if (arr.includes(item)) {
      throw new Error(
        (msg || "数组不应包含") +
        ` ${JSON.stringify(item)}\n  数组: ${JSON.stringify(arr)}`
      );
    }
  }

  // ============================================================
  // 一、calcCompleteness 完整度评分测试
  // ============================================================

  test("calcCompleteness: null 样本返回全零结果", function () {
    const r = ReviewModule.calcCompleteness(null);
    assertEqual(r.score, 0);
    assertEqual(r.percent, 0);
    assertEqual(r.missing, []);
    assertEqual(r.filled, []);
  });

  test("calcCompleteness: undefined 样本返回全零结果", function () {
    const r = ReviewModule.calcCompleteness(undefined);
    assertEqual(r.score, 0);
    assertEqual(r.percent, 0);
  });

  test("calcCompleteness: 空对象 {} 返回 0 分，所有字段 missing", function () {
    const r = ReviewModule.calcCompleteness({});
    assertEqual(r.score, 0);
    assertEqual(r.percent, 0);
    assertEqual(r.missing.length, 7);
    ["code", "photo", "minerals", "texture", "comment", "location", "magnification"]
      .forEach((k) => assertContains(r.missing, k));
    assertEqual(r.filled.length, 0);
  });

  test("calcCompleteness: 所有字段填充完整返回 100 分", function () {
    const fullSample = {
      id: "1",
      code: "BX-17-01",
      photo: "data:image/png;base64,xxx",
      minerals: "石英、斜长石",
      texture: "半自形粒状",
      comment: "典型花岗岩结构",
      location: "剖面东侧第二层",
      magnification: "40x"
    };
    const r = ReviewModule.calcCompleteness(fullSample);
    assertEqual(r.score, 100);
    assertEqual(r.percent, 100);
    assertEqual(r.missing.length, 0);
    assertEqual(r.filled.length, 7);
  });

  test("calcCompleteness: 只有照片缺失，分数应为 75 (100-25)", function () {
    const s = {
      code: "BX-17-01",
      minerals: "石英",
      texture: "粒状",
      comment: "xxx",
      location: "地点A",
      magnification: "100x"
    };
    const r = ReviewModule.calcCompleteness(s);
    assertEqual(r.score, 75);
    assertEqual(r.percent, 75);
    assertContains(r.missing, "photo");
    assertNotContains(r.missing, "code");
  });

  test("calcCompleteness: 仅有 code(20)+photo(25) 共 45 分，对应 missing 其余字段", function () {
    const s = { code: "A01", photo: "http://example.com/p.jpg" };
    const r = ReviewModule.calcCompleteness(s);
    assertEqual(r.score, 45);
    assertEqual(r.percent, 45);
    assertEqual(r.filled, ["code", "photo"]);
    ["minerals", "texture", "comment", "location", "magnification"]
      .forEach((k) => assertContains(r.missing, k));
  });

  test("calcCompleteness: 空字符串和纯空白视为未填充", function () {
    const s = {
      code: "   ",
      photo: "",
      minerals: "\t\n",
      texture: "粒状",
      comment: "有内容",
      location: "",
      magnification: "  "
    };
    const r = ReviewModule.calcCompleteness(s);
    // texture:15, comment:10 => score=25
    assertEqual(r.score, 25);
    assertEqual(r.percent, 25);
    assertContains(r.filled, "texture");
    assertContains(r.filled, "comment");
    assertContains(r.missing, "code");
    assertContains(r.missing, "photo");
    assertContains(r.missing, "minerals");
  });

  test("calcCompleteness: 0 分、59 分、60 分边界样本构造（供 status 推导用）", function () {
    // 边界：只有 code+photo+minerals+comment = 20+25+20+10 = 75 (>=60)
    const s75 = { code: "X", photo: "Y", minerals: "Z", comment: "C" };
    assertEqual(ReviewModule.calcCompleteness(s75).score, 75);

    // code+photo+comment = 20+25+10 = 55 (<60)
    const s55 = { code: "X", photo: "Y", comment: "C" };
    assertEqual(ReviewModule.calcCompleteness(s55).score, 55);

    // code+photo+minerals+texture = 20+25+20+15 = 80 (>=60)
    const s80 = { code: "X", photo: "Y", minerals: "Z", texture: "T" };
    assertEqual(ReviewModule.calcCompleteness(s80).score, 80);
  });

  test("calcCompleteness: 字段权重值正确性验证（逐项加总）", function () {
    const fields = [
      { key: "code", weight: 20 },
      { key: "photo", weight: 25 },
      { key: "minerals", weight: 20 },
      { key: "texture", weight: 15 },
      { key: "comment", weight: 10 },
      { key: "location", weight: 5 },
      { key: "magnification", weight: 5 }
    ];
    let cum = 0;
    const partial = {};
    for (const f of fields) {
      partial[f.key] = "v";
      cum += f.weight;
      const r = ReviewModule.calcCompleteness(Object.assign({}, partial));
      assertEqual(r.score, cum, `添加 ${f.key} 后分数应为 ${cum}`);
    }
    assertEqual(cum, 100, "所有权重之和应为 100");
  });

  // ============================================================
  // 二、getReviewStatus 审核状态推导测试
  // ============================================================

  test("getReviewStatus: null/undefined → INCOMPLETE", function () {
    assertEqual(ReviewModule.getReviewStatus(null), RS.INCOMPLETE);
    assertEqual(ReviewModule.getReviewStatus(undefined), RS.INCOMPLETE);
  });

  test("getReviewStatus: 空对象 {} → INCOMPLETE（0 分 <60）", function () {
    assertEqual(ReviewModule.getReviewStatus({}), RS.INCOMPLETE);
  });

  test("getReviewStatus: 完整度 55 分（<60）自动推导为 INCOMPLETE", function () {
    const s55 = { code: "X", photo: "Y", comment: "C" }; // 20+25+10=55
    assertEqual(ReviewModule.getReviewStatus(s55), RS.INCOMPLETE);
  });

  test("getReviewStatus: 完整度 75 分（>=60）自动推导为 PENDING", function () {
    const s75 = { code: "X", photo: "Y", minerals: "Z", comment: "C" }; // 20+25+20+10=75
    assertEqual(ReviewModule.getReviewStatus(s75), RS.PENDING);
  });

  test("getReviewStatus: 完整度 60 分边界应推导为 PENDING", function () {
    // code(20) + photo(25) + minerals(20) - 还差15分？ 20+25+15=60 不好凑
    // code(20) + photo(25) + minerals(15 no, weight 20)
    // code(20) + photo(25) + texture(15) = 60!
    const s60 = { code: "X", photo: "Y", minerals: "Z", comment: "no", texture: "no" }; // 20+25+20+10+15=90
    // 构造刚好 60: code+photo+texture+comment+location+magnification 缺少minerals
    // 20+25+15+10+5+5 = 80，仍>60
    // code+photo+minerals = 20+25+20 = 65 >=60
    const s65 = { code: "X", photo: "Y", minerals: "Z" }; // 20+25+20=65
    assertEqual(ReviewModule.calcCompleteness(s65).score, 65);
    assertEqual(ReviewModule.getReviewStatus(s65), RS.PENDING);
  });

  test("getReviewStatus: 完整度 59 分边界应推导为 INCOMPLETE", function () {
    // code+photo+comment = 20+25+10=55 <60
    const s55 = { code: "X", photo: "Y", comment: "C" };
    assertEqual(ReviewModule.calcCompleteness(s55).score, 55);
    assertEqual(ReviewModule.getReviewStatus(s55), RS.INCOMPLETE);

    // code+photo+texture = 20+25+15=60 >=60 → PENDING（另一边界）
    const s60 = { code: "X", photo: "Y", texture: "T" };
    assertEqual(ReviewModule.calcCompleteness(s60).score, 60);
    assertEqual(ReviewModule.getReviewStatus(s60), RS.PENDING);
  });

  test("getReviewStatus: 已有 reviewStatus=CONFIRMED 即使完整度低也不被覆盖", function () {
    const s = {
      code: "A", // 20 分，其余空 -> 20 分
      reviewStatus: RS.CONFIRMED
    };
    assertEqual(ReviewModule.calcCompleteness(s).score, 20);
    assertEqual(ReviewModule.getReviewStatus(s), RS.CONFIRMED);
  });

  test("getReviewStatus: 已有 reviewStatus=INCOMPLETE 即使完整度高也保持", function () {
    const s = {
      code: "X", photo: "Y", minerals: "Z", texture: "T",
      comment: "C", location: "L", magnification: "M",
      reviewStatus: RS.INCOMPLETE
    };
    assertEqual(ReviewModule.calcCompleteness(s).score, 100);
    assertEqual(ReviewModule.getReviewStatus(s), RS.INCOMPLETE);
  });

  test("getReviewStatus: 已有 reviewStatus=PENDING 即使完整度低也保持", function () {
    const s = { code: "X", reviewStatus: RS.PENDING }; // 仅 20 分
    assertEqual(ReviewModule.calcCompleteness(s).score, 20);
    assertEqual(ReviewModule.getReviewStatus(s), RS.PENDING);
  });

  test("getReviewStatus: 任何非空 reviewStatus 字符串都优先返回（包括自定义值）", function () {
    const s = { code: "X", reviewStatus: "rejected" };
    assertEqual(ReviewModule.getReviewStatus(s), "rejected");
  });

  // ============================================================
  // 三、空样本与缺照片样本的边界行为
  // ============================================================

  test("空样本边界: 只带 id，其余字段全空 → 0 分, INCOMPLETE", function () {
    const s = { id: "sample-001" };
    const r = ReviewModule.calcCompleteness(s);
    assertEqual(r.score, 0);
    assertEqual(r.percent, 0);
    assertEqual(r.missing.length, 7);
    assertEqual(ReviewModule.getReviewStatus(s), RS.INCOMPLETE);
  });

  test("缺照片样本: 除 photo 外全部填充 → 75 分, PENDING", function () {
    const s = {
      id: "s2", code: "BX-01", minerals: "石英", texture: "粒状",
      comment: "批注", location: "地点", magnification: "40x"
    };
    const r = ReviewModule.calcCompleteness(s);
    assertEqual(r.score, 75);
    assertEqual(r.percent, 75);
    assertEqual(r.missing, ["photo"]);
    assertEqual(ReviewModule.getReviewStatus(s), RS.PENDING);
    assertEqual(ReviewModule.getReviewStatusLabel(s), "待复核");
  });

  test("仅照片: 只有 photo 字段 (25 分) → INCOMPLETE", function () {
    const s = { photo: "data:image/png;base64,abc" };
    const r = ReviewModule.calcCompleteness(s);
    assertEqual(r.score, 25);
    assertEqual(r.missing.length, 6);
    assertNotContains(r.missing, "photo");
    assertEqual(ReviewModule.getReviewStatus(s), RS.INCOMPLETE);
  });

  test("缺照片且只有 code + minerals → 40 分, INCOMPLETE", function () {
    const s = { code: "X", minerals: "石英" }; // 20+20=40
    assertEqual(ReviewModule.calcCompleteness(s).score, 40);
    assertEqual(ReviewModule.getReviewStatus(s), RS.INCOMPLETE);
  });

  // ============================================================
  // 四、辅助函数：getReviewStatusLabel / getReviewStatusClass
  // ============================================================

  test("getReviewStatusLabel: 三态映射正确", function () {
    assertEqual(ReviewModule.getReviewStatusLabel({ reviewStatus: RS.INCOMPLETE }), "未完善");
    assertEqual(ReviewModule.getReviewStatusLabel({ reviewStatus: RS.PENDING }), "待复核");
    assertEqual(ReviewModule.getReviewStatusLabel({ reviewStatus: RS.CONFIRMED }), "已确认");
  });

  test("getReviewStatusLabel: null 样本回退默认值", function () {
    assertEqual(ReviewModule.getReviewStatusLabel(null), "未完善");
  });

  test("getReviewStatusClass: 与 getReviewStatus 返回值一致", function () {
    const s1 = {};
    assertEqual(ReviewModule.getReviewStatusClass(s1), ReviewModule.getReviewStatus(s1));

    const s2 = { code: "X", photo: "Y", minerals: "Z", texture: "T" }; // 80 分
    assertEqual(ReviewModule.getReviewStatusClass(s2), RS.PENDING);

    const s3 = { reviewStatus: RS.CONFIRMED };
    assertEqual(ReviewModule.getReviewStatusClass(s3), RS.CONFIRMED);
  });

  // ============================================================
  // 五、常数导出检查
  // ============================================================

  test("REVIEW_STATUS 常数: 三态值与标签映射存在", function () {
    assertTrue(RS.INCOMPLETE === "incomplete", "INCOMPLETE 应为 'incomplete'");
    assertTrue(RS.PENDING === "pending", "PENDING 应为 'pending'");
    assertTrue(RS.CONFIRMED === "confirmed", "CONFIRMED 应为 'confirmed'");

    const labels = ReviewModule.REVIEW_STATUS_LABELS;
    assertEqual(labels.incomplete, "未完善");
    assertEqual(labels.pending, "待复核");
    assertEqual(labels.confirmed, "已确认");
  });

  // ============================================================
  // 返回统计结果
  // ============================================================

  const passed = results.filter((t) => t.passed).length;
  const failed = results.filter((t) => !t.passed).length;
  return {
    total: results.length,
    passed,
    failed,
    allPassed: failed === 0,
    results
  };
});
