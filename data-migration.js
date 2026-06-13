(function (global) {
  "use strict";

  const LEGACY_STORAGE_KEY = "wxyy-2-thin-section-index";
  const MIGRATION_VERSION = 4;

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
      await migrateAppStateSchema();
      return { migrated: false, reason: "already_migrated" };
    }

    const legacyData = readLegacyData();
    if (!legacyData) {
      await window.StorageLayer.AppStateStore.setMigrationStatus(true);
      await migrateAppStateSchema();
      return { migrated: false, reason: "no_legacy_data" };
    }

    const samples = legacyData.samples || [];
    const tasks = legacyData.tasks || [];
    const compareList = legacyData.compare || [];
    const submissions = legacyData.submissions || [];
    const rubrics = legacyData.rubrics || [];
    const lessonMetas = legacyData.lessonMetas || {};

    let sampleCount = 0;
    let taskCount = 0;
    let submissionCount = 0;

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
        lessonPackageId: s.lessonPackageId || "",
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
        lessonPackageId: t.lessonPackageId || "",
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

    if (submissions.length > 0 || rubrics.length > 0 || Object.keys(lessonMetas).length > 0) {
      if (submissions.length > 0) {
        const submissionsWithDefaults = submissions.map(sub => ({
          id: sub.id || crypto.randomUUID(),
          packageId: sub.packageId || crypto.randomUUID(),
          lessonPackageId: sub.lessonPackageId || "",
          lessonTitle: sub.lessonTitle || "",
          importedAt: sub.importedAt || new Date().toISOString(),
          studentInfo: sub.studentInfo || { name: "", studentId: "", className: "" },
          tasks: sub.tasks || [],
          answers: sub.answers || {},
          taskProgress: sub.taskProgress || {},
          scores: sub.scores || {},
          finalScore: sub.finalScore !== undefined ? sub.finalScore : null,
          gradedAt: sub.gradedAt || null,
          gradedBy: sub.gradedBy || ""
        }));
        await window.StorageLayer.setAppState("submissions", submissionsWithDefaults);
        submissionCount = submissionsWithDefaults.length;
      }
      if (rubrics.length > 0) {
        await window.StorageLayer.setAppState("rubrics", rubrics);
      }
      if (lessonMetas && typeof lessonMetas === "object" && Object.keys(lessonMetas).length > 0) {
        await window.StorageLayer.setAppState("lessonMetas", lessonMetas);
      }
    }

    const localAnswers = legacyData.localAnswers || [];
    if (localAnswers.length > 0 && window.StorageLayer.AnswerStore) {
      await window.StorageLayer.AnswerStore.bulkSave(localAnswers);
    }

    await window.StorageLayer.AppStateStore.setMigrationStatus(true);
    await migrateAppStateSchema();

    return {
      migrated: true,
      sampleCount,
      taskCount,
      compareCount: compareList.length,
      submissionCount
    };
  }

  async function checkAndMigrate() {
    const hasLegacy = hasLegacyData();
    const migrationDone = await window.StorageLayer.AppStateStore.getMigrationStatus();

    if (!migrationDone && hasLegacy) {
      return true;
    }

    const schemaVersion = await window.StorageLayer.AppStateStore.getSchemaVersion();
    if (schemaVersion < MIGRATION_VERSION) {
      return true;
    }

    return false;
  }

  async function migrateAppStateSchema() {
    if (!window.StorageLayer) return;

    const schemaVersion = await window.StorageLayer.AppStateStore.getSchemaVersion();
    if (schemaVersion >= MIGRATION_VERSION) return;

    if (schemaVersion < 2) {
      const submissions = await window.StorageLayer.getAppState("submissions", []);
      if (Array.isArray(submissions)) {
        const migrated = submissions.map(sub => ({
          id: sub.id || crypto.randomUUID(),
          packageId: sub.packageId || crypto.randomUUID(),
          lessonPackageId: sub.lessonPackageId || "",
          lessonTitle: sub.lessonTitle || "",
          importedAt: sub.importedAt || new Date().toISOString(),
          studentInfo: sub.studentInfo || { name: "", studentId: "", className: "" },
          tasks: sub.tasks || [],
          answers: sub.answers || {},
          taskProgress: sub.taskProgress || {},
          scores: sub.scores || {},
          finalScore: sub.finalScore !== undefined ? sub.finalScore : null,
          gradedAt: sub.gradedAt || null,
          gradedBy: sub.gradedBy || ""
        }));
        await window.StorageLayer.setAppState("submissions", migrated);
      }

      const rubrics = await window.StorageLayer.getAppState("rubrics", []);
      if (!Array.isArray(rubrics)) {
        await window.StorageLayer.setAppState("rubrics", []);
      }

      const lessonMetas = await window.StorageLayer.getAppState("lessonMetas", {});
      if (!lessonMetas || typeof lessonMetas !== "object" || Array.isArray(lessonMetas)) {
        await window.StorageLayer.setAppState("lessonMetas", {});
      } else {
        const normalized = {};
        Object.entries(lessonMetas).forEach(([pkgId, meta]) => {
          normalized[pkgId] = {
            packageId: meta.packageId || pkgId,
            title: meta.title || "",
            description: meta.description || "",
            importedAt: meta.importedAt || new Date().toISOString(),
            rubrics: (meta.rubrics && Array.isArray(meta.rubrics)) ? meta.rubrics : [],
            referenceAnswers: (meta.referenceAnswers && typeof meta.referenceAnswers === "object") ? meta.referenceAnswers : {}
          };
        });
        await window.StorageLayer.setAppState("lessonMetas", normalized);
      }
    }

    if (schemaVersion < 3) {
      await window.StorageLayer.initDB();
    }

    if (schemaVersion < 4) {
      await window.StorageLayer.initDB();
    }

    await window.StorageLayer.AppStateStore.setSchemaVersion(MIGRATION_VERSION);
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
    migrateAppStateSchema,
    clearLegacyData
  };

})(window);
