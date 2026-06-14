(function (global) {
  "use strict";

  const LEGACY_STORAGE_KEY = "wxyy-2-thin-section-index";
  const MIGRATION_VERSION = 6;

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

  async function ensureDefaultProject() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }
    const DEFAULT_PROJECT_ID = window.StorageLayer.DEFAULT_PROJECT_ID;
    const existing = await window.StorageLayer.ProjectStore.getById(DEFAULT_PROJECT_ID);
    if (!existing) {
      await window.StorageLayer.ProjectStore.add({
        id: DEFAULT_PROJECT_ID,
        name: "默认项目",
        description: "系统自动创建的默认项目",
        createdAt: new Date().toISOString()
      });
    }
    return DEFAULT_PROJECT_ID;
  }

  async function migrateExistingDataToProjects() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    const projectMigrationDone = await window.StorageLayer.AppStateStore.getProjectMigrationStatus();
    if (projectMigrationDone) {
      return { migrated: false, reason: "project_migration_already_done" };
    }

    const DEFAULT_PROJECT_ID = await ensureDefaultProject();

    const allSamples = await window.StorageLayer.SampleStore.getAll();
    const samplesWithoutProject = allSamples.filter(s => !s.projectId);
    for (const sample of samplesWithoutProject) {
      await window.StorageLayer.SampleStore.update(sample.id, { projectId: DEFAULT_PROJECT_ID });
    }

    const allTasks = await window.StorageLayer.TaskStore.getAll();
    const tasksWithoutProject = allTasks.filter(t => !t.projectId);
    for (const task of tasksWithoutProject) {
      await window.StorageLayer.TaskStore.update(task.id, { projectId: DEFAULT_PROJECT_ID });
    }

    const allAnswers = await window.StorageLayer.AnswerStore.getAll();
    const answersWithoutProject = allAnswers.filter(a => !a.projectId);
    for (const ans of answersWithoutProject) {
      await window.StorageLayer.AnswerStore.save({ ...ans, projectId: DEFAULT_PROJECT_ID });
    }

    const allRecycleItems = await window.StorageLayer.RecycleStore.getAll();
    const recycleWithoutProject = allRecycleItems.filter(r => !r.projectId);
    for (const item of recycleWithoutProject) {
      await window.StorageLayer.RecycleStore.add({ ...item, projectId: DEFAULT_PROJECT_ID });
    }

    const oldCompareList = await window.StorageLayer.getAppState("compareList", null);
    if (oldCompareList !== null) {
      await window.StorageLayer.AppStateStore.setCompareList(oldCompareList, DEFAULT_PROJECT_ID);
    }

    await window.StorageLayer.AppStateStore.setProjectMigrationStatus(true);

    return {
      migrated: true,
      sampleCount: samplesWithoutProject.length,
      taskCount: tasksWithoutProject.length,
      answerCount: answersWithoutProject.length,
      recycleCount: recycleWithoutProject.length
    };
  }

  async function runMigration() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    await window.StorageLayer.initDB();
    await ensureDefaultProject();

    const migrationDone = await window.StorageLayer.AppStateStore.getMigrationStatus();
    let migrationResult = { migrated: false };

    if (!migrationDone) {
      const legacyData = readLegacyData();
      if (legacyData) {
        migrationResult = await migrateFromLegacy(legacyData);
      } else {
        await window.StorageLayer.AppStateStore.setMigrationStatus(true);
      }
    }

    await migrateExistingDataToProjects();
    await migrateAppStateSchema();

    return migrationResult;
  }

  async function migrateFromLegacy(legacyData) {
    const DEFAULT_PROJECT_ID = window.StorageLayer.DEFAULT_PROJECT_ID;

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
      const codeGroups = new Map();
      samples.forEach(s => {
        if (!s.code) return;
        if (!codeGroups.has(s.code)) codeGroups.set(s.code, []);
        codeGroups.get(s.code).push(s.id || crypto.randomUUID());
      });

      const sampleGroupMetas = [];
      const groupIdMap = {};

      for (const [code, ids] of codeGroups) {
        if (ids.length < 2) continue;
        const polars = new Set();
        const relatedSamples = samples.filter(s => s.code === code);
        relatedSamples.forEach(s => polars.add(s.polarization));
        if (polars.size < 2) continue;

        const groupId = crypto.randomUUID();
        groupIdMap[code] = groupId;
        sampleGroupMetas.push({
          id: groupId,
          name: code,
          sampleIds: ids,
          createdAt: new Date().toISOString()
        });
      }

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
        groupId: (s.code && groupIdMap[s.code]) ? groupIdMap[s.code] : (s.groupId || ""),
        projectId: DEFAULT_PROJECT_ID,
        createdAt: s.createdAt || new Date().toISOString()
      }));

      await window.StorageLayer.SampleStore.bulkAdd(samplesWithDefaults);
      sampleCount = samplesWithDefaults.length;

      if (sampleGroupMetas.length > 0) {
        const existingGroups = await window.StorageLayer.AppStateStore.getSampleGroups(DEFAULT_PROJECT_ID);
        await window.StorageLayer.AppStateStore.setSampleGroups([...existingGroups, ...sampleGroupMetas], DEFAULT_PROJECT_ID);
      }
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
        projectId: DEFAULT_PROJECT_ID,
        createdAt: t.createdAt || new Date().toISOString()
      }));

      for (const task of tasksWithDefaults) {
        await window.StorageLayer.TaskStore.add(task);
      }
      taskCount = tasksWithDefaults.length;
    }

    if (compareList.length > 0) {
      await window.StorageLayer.AppStateStore.setCompareList(compareList, DEFAULT_PROJECT_ID);
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
      const answersWithProject = localAnswers.map(a => ({
        ...a,
        projectId: DEFAULT_PROJECT_ID
      }));
      await window.StorageLayer.AnswerStore.bulkSave(answersWithProject);
    }

    await window.StorageLayer.AppStateStore.setMigrationStatus(true);

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
    const projectMigrationDone = await window.StorageLayer.AppStateStore.getProjectMigrationStatus();

    if (!migrationDone && hasLegacy) {
      return true;
    }

    if (!projectMigrationDone) {
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

    if (schemaVersion < 5) {
      await ensureDefaultProject();
      await migrateExistingDataToProjects();
    }

    if (schemaVersion < 6) {
      await autoGroupSamplesByCode();
    }

    await window.StorageLayer.AppStateStore.setSchemaVersion(MIGRATION_VERSION);
  }

  async function autoGroupSamplesByCode() {
    if (!window.StorageLayer) return;

    const allSamples = await window.StorageLayer.SampleStore.getAll();
    const codeGroups = new Map();

    allSamples.forEach(s => {
      if (s.groupId) return;
      if (!s.code) return;
      if (!codeGroups.has(s.code)) codeGroups.set(s.code, []);
      codeGroups.get(s.code).push(s);
    });

    const groupsToCreate = [];
    for (const [code, samples] of codeGroups) {
      if (samples.length < 2) continue;

      const polars = new Set(samples.map(s => s.polarization));
      if (polars.size < 2) continue;

      const groupId = crypto.randomUUID();
      const sampleIds = samples.map(s => s.id);

      groupsToCreate.push({
        id: groupId,
        name: code,
        sampleIds,
        createdAt: new Date().toISOString()
      });

      for (const sample of samples) {
        await window.StorageLayer.SampleStore.update(sample.id, { groupId });
      }
    }

    if (groupsToCreate.length > 0) {
      const existingGroups = await window.StorageLayer.AppStateStore.getSampleGroups();
      const allGroups = [...existingGroups, ...groupsToCreate];
      await window.StorageLayer.AppStateStore.setSampleGroups(allGroups);
    }
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
    migrateExistingDataToProjects,
    autoGroupSamplesByCode,
    clearLegacyData,
    ensureDefaultProject
  };

})(window);
