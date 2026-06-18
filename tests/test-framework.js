"use strict";

const { setupBrowserGlobals } = require("./idb-mock.js");
const fs = require("fs");
const path = require("path");

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";

class TestFramework {
  constructor(moduleName) {
    this.moduleName = moduleName;
    this.suites = [];
    this.currentSuite = null;
    this.beforeEachFns = [];
    this.afterEachFns = [];
    this.idbMock = null;
    this.ROOT = path.resolve(__dirname, "..");
    this._loadedScripts = [];
  }

  setupBrowserEnvironment() {
    this.idbMock = setupBrowserGlobals();
  }

  loadScript(filename, opts = {}) {
    const fullPath = path.join(this.ROOT, filename);
    const content = fs.readFileSync(fullPath, "utf8");
    try {
      eval.call(global, content);
    } catch (e) {
      throw new Error(`加载 ${filename} 失败: ${e.message}`);
    }
    const entry = { file: filename, content, reload: !!opts.reload };
    if (!this._loadedScripts.find(x => x.file === filename)) {
      this._loadedScripts.push(entry);
    }
    return entry;
  }

  loadCoreScripts() {
    ["storage-layer.js", "data-manager.js", "data-migration.js",
      "version-history.js", "backup-restore.js", "mineral-rules.js",
      "lesson-package.js", "project-manager.js", "review.js"].forEach(f => {
      if (fs.existsSync(path.join(this.ROOT, f))) {
        try { this.loadScript(f, { reload: f === "storage-layer.js" }); } catch (e) {}
      }
    });
  }

  resetDB() {
    if (this.idbMock) this.idbMock._reset();
    const reloadable = this._loadedScripts.filter(x => x.reload);
    reloadable.forEach(x => {
      try { eval.call(global, x.content); } catch (e) {}
    });
  }

  dumpDB() {
    return this.idbMock ? this.idbMock._dumpAll() : {};
  }

  suite(name, fn) {
    const prev = this.currentSuite;
    this.currentSuite = {
      name,
      tests: [],
      before: [],
      after: [],
      beforeEach: [...this.beforeEachFns],
      afterEach: [...this.afterEachFns]
    };
    this.suites.push(this.currentSuite);
    try {
      fn.call(this);
    } finally {
      this.currentSuite = prev;
    }
  }

  before(fn) {
    if (this.currentSuite) this.currentSuite.before.push(fn);
  }

  after(fn) {
    if (this.currentSuite) this.currentSuite.after.push(fn);
  }

  beforeEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEach.push(fn);
    } else {
      this.beforeEachFns.push(fn);
    }
  }

  afterEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterEach.push(fn);
    } else {
      this.afterEachFns.push(fn);
    }
  }

  test(name, fn) {
    if (!this.currentSuite) {
      throw new Error("test() 必须在 suite() 内部调用");
    }
    this.currentSuite.tests.push({ name, fn });
  }

  assertEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(
        (msg || "断言失败") +
        `\n     期望: ${b}\n     实际: ${a}`
      );
    }
  }

  assertNotEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a === b) {
      throw new Error((msg || "断言失败") + `: 期望值不应为 ${b}`);
    }
  }

  assertTrue(cond, msg) {
    if (!cond) {
      throw new Error(msg || "应为 true");
    }
  }

  assertFalse(cond, msg) {
    if (cond) {
      throw new Error(msg || "应为 false");
    }
  }

  assertContains(arr, item, msg) {
    const a = Array.isArray(arr) ? arr : (typeof arr === "string" ? arr : JSON.stringify(arr));
    const found = Array.isArray(arr)
      ? arr.some(x => JSON.stringify(x) === JSON.stringify(item))
      : a.includes(item);
    if (!found) {
      throw new Error(
        (msg || "应包含") +
        ` ${JSON.stringify(item)}\n     实际值: ${JSON.stringify(arr)}`
      );
    }
  }

  assertNotContains(arr, item, msg) {
    const a = Array.isArray(arr) ? arr : (typeof arr === "string" ? arr : JSON.stringify(arr));
    const found = Array.isArray(arr)
      ? arr.some(x => JSON.stringify(x) === JSON.stringify(item))
      : a.includes(item);
    if (found) {
      throw new Error(
        (msg || "不应包含") +
        ` ${JSON.stringify(item)}\n     实际值: ${JSON.stringify(arr)}`
      );
    }
  }

  assertThrows(fn, msg) {
    let threw = false;
    try {
      typeof fn === "function" ? fn() : (async () => await fn)();
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      throw new Error(msg || "期望抛出异常");
    }
  }

  assertExists(val, msg) {
    if (val === null || val === undefined) {
      throw new Error(msg || "值不应为 null/undefined");
    }
  }

  assertNotEmpty(arr, msg) {
    if (!arr || arr.length === 0) {
      throw new Error(msg || "数组/集合不应为空");
    }
  }

  assertMatches(str, regex, msg) {
    if (!regex.test(String(str))) {
      throw new Error((msg || "格式不匹配") + `: ${String(str)} 不匹配 ${regex}`);
    }
  }

  async run() {
    const startTime = Date.now();
    const allResults = [];
    let totalPassed = 0;
    let totalFailed = 0;

    console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════╗`);
    console.log(`║  🧪 测试模块: ${this.moduleName.padEnd(30)}║`);
    console.log(`╚══════════════════════════════════════════════╝${RESET}\n`);

    for (const suite of this.suites) {
      console.log(`${BOLD}📦 ${suite.name}${RESET}`);

      try {
        for (const beforeFn of suite.before) {
          await this._safeExec(beforeFn);
        }
      } catch (e) {
        console.log(`  ${RED}⚠  before 钩子失败: ${e.message}${RESET}`);
        continue;
      }

      for (const test of suite.tests) {
        for (const beFn of suite.beforeEach) {
          try { await this._safeExec(beFn); } catch (e) {}
        }

        const result = {
          suite: suite.name,
          name: test.name,
          passed: false,
          error: null,
          duration: 0
        };

        const testStart = Date.now();
        try {
          await this._safeExec(test.fn);
          result.passed = true;
          totalPassed++;
        } catch (e) {
          result.passed = false;
          result.error = e.message || String(e);
          totalFailed++;
        }
        result.duration = Date.now() - testStart;
        allResults.push(result);

        const no = String(allResults.filter(r => r.suite === suite.name).length).padStart(2, "0");
        const durStr = `${result.duration}ms`.padStart(6);
        if (result.passed) {
          console.log(`  ${GREEN}✓${RESET} ${GRAY}[${no}]${RESET} ${test.name} ${GRAY}${durStr}${RESET}`);
        } else {
          console.log(`  ${RED}✗${RESET} ${GRAY}[${no}]${RESET} ${RED}${BOLD}${test.name}${RESET} ${GRAY}${durStr}${RESET}`);
          const errLines = (result.error || "").split("\n");
          errLines.forEach((l) => {
            console.log(`      ${GRAY}│${RESET} ${YELLOW}${l}${RESET}`);
          });
        }

        for (const aeFn of suite.afterEach) {
          try { await this._safeExec(aeFn); } catch (e) {}
        }
      }

      try {
        for (const afterFn of suite.after) {
          await this._safeExec(afterFn);
        }
      } catch (e) {
        console.log(`  ${YELLOW}⚠  after 钩子失败: ${e.message}${RESET}`);
      }

      console.log("");
    }

    const totalDuration = Date.now() - startTime;
    const total = allResults.length;
    const passRate = total > 0 ? Math.round((totalPassed / total) * 100) : 0;

    console.log("─".repeat(60));
    if (totalFailed === 0) {
      console.log(
        `  ${GREEN}${BOLD}✓ 全部通过${RESET}  ` +
        `${totalPassed}/${total} 用例 (${passRate}%)  ` +
        `${GRAY}耗时 ${totalDuration}ms${RESET}`
      );
    } else {
      console.log(
        `  ${RED}${BOLD}✗ 存在失败${RESET}  ` +
        `${totalPassed}通过 / ${totalFailed}失败 / ${total}总计  ` +
        `${GRAY}耗时 ${totalDuration}ms${RESET}`
      );
    }
    console.log("─".repeat(60) + "\n");

    return {
      moduleName: this.moduleName,
      total,
      passed: totalPassed,
      failed: totalFailed,
      passRate,
      duration: totalDuration,
      allPassed: totalFailed === 0,
      results: allResults
    };
  }

  async _safeExec(fn) {
    if (fn.constructor.name === "AsyncFunction" || fn.toString().includes("await ")) {
      return await fn.call(this);
    }
    const result = fn.call(this);
    if (result && typeof result.then === "function") {
      return await result;
    }
    return result;
  }
}

module.exports = TestFramework;
