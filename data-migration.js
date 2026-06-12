(function (global) {
  "use strict";

  const LEGACY_STORAGE_KEY = "wxyy-2-thin-section-index";
  const MIGRATION_VERSION = 1;

  function hasLegacyData() {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      return !!raw;
    } catch {
      return false;
    }
  }

  function readLegacyData() {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (e) {
      console.error("读取旧数据失败:", e);
      return null;
    }
  }

  async function runMigration() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    const migrationDone = await window.StorageLayer.AppStateStore.getMigrationStatus();
    if (migrationDone) {
      return { migrated: false, reason: "already_migrated" };
    }

    const legacyData = readLegacyData();
    if (!legacyData) {
      await window.StorageLayer.AppStateStore.setMigrationStatus(true);
      return { migrated: false, reason: "no_legacy_data" };
    }

    const samples = legacyData.samples || [];
    const tasks = legacyData.tasks || [];
    const compareList = legacyData.compare || [];

    let sampleCount = 0;
    let taskCount = 0;

    if (samples.length > 0) {
      const samplesWithDefaults = samples.map(s => ({
        id: s.id || crypto.randomUUID(),
        code: s.code || "",
        location: s.location || "",
        magnification: s.magnification || "",
        polarization: s.polarization || "单偏光",
        minerals: s.minerals || "",
        texture: s.texture || "",
        comment: s.comment || "",
        photo: s.photo || "",
        annotations: s.annotations || [],
        reviewStatus: s.reviewStatus || null,
        reviewComment: s.reviewComment || "",
        reviewedAt: s.reviewedAt || null,
        createdAt: s.createdAt || new Date().toISOString()
      }));

      await window.StorageLayer.SampleStore.bulkAdd(samplesWithDefaults);
      sampleCount = samplesWithDefaults.length;
    }

    if (tasks.length > 0) {
      const tasksWithDefaults = tasks.map(t => ({
        id: t.id || crypto.randomUUID(),
        title: t.title || "",
        objective: t.objective || "",
        deadline: t.deadline || "",
        sampleIds: t.sampleIds || [],
        completedSamples: t.completedSamples || [],
        comments: t.comments || [],
        createdAt: t.createdAt || new Date().toISOString()
      }));

      for (const task of tasksWithDefaults) {
        await window.StorageLayer.TaskStore.add(task);
      }
      taskCount = tasksWithDefaults.length;
    }

    if (compareList.length > 0) {
      await window.StorageLayer.AppStateStore.setCompareList(compareList);
    }

    await window.StorageLayer.AppStateStore.setMigrationStatus(true);
    await window.StorageLayer.AppStateStore.setSchemaVersion(MIGRATION_VERSION);

    return {
      migrated: true,
      sampleCount,
      taskCount,
      compareCount: compareList.length
    };
  }

  async function checkAndMigrate() {
    const hasLegacy = hasLegacyData();
    const migrationDone = await window.StorageLayer.AppStateStore.getMigrationStatus();

    if (!migrationDone && hasLegacy) {
      return true;
    }
    return false;
  }

  function clearLegacyData() {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return true;
    } catch (e) {
      console.error("清除旧数据失败:", e);
      return false;
    }
  }

  global.DataMigration = {
    LEGACY_STORAGE_KEY,
    MIGRATION_VERSION,
    hasLegacyData,
    readLegacyData,
    runMigration,
    checkAndMigrate,
    clearLegacyData
  };

})(window);
