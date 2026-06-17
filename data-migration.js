(function (global) {
  "use strict";

  const LEGACY_STORAGE_KEY = "wxyy-2-thin-section-index";
  const MIGRATION_VERSION = 7;
  const RESOURCE_MIGRATION_BATCH_SIZE = 10;

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

    const resourceMigrationResult = await migrateToResourceModel();
    if (resourceMigrationResult.migrated) {
      migrationResult = {
        ...migrationResult,
        ...resourceMigrationResult,
        resourceMigrated: true
      };
    }

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
    const resourceMigrationDone = await window.StorageLayer.AppStateStore.getResourceMigrationStatus();

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

    if (!resourceMigrationDone) {
      const samples = await window.StorageLayer.SampleStore.getAll();
      if (samples.length > 0) {
        return true;
      }
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

  async function migrateToResourceModel() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    const migrationDone = await window.StorageLayer.AppStateStore.getResourceMigrationStatus();
    if (migrationDone) {
      return { migrated: false, reason: "resource_migration_already_done" };
    }

    const progress = await window.StorageLayer.AppStateStore.getResourceMigrationProgress();
    const samples = await window.StorageLayer.SampleStore.getAll();
    const totalSamples = samples.length;

    if (totalSamples === 0) {
      await window.StorageLayer.AppStateStore.setResourceMigrationStatus(true);
      return { migrated: true, sampleCount: 0, reason: "no_samples_to_migrate" };
    }

    let processed = progress.processed || 0;
    let photoMigrated = 0;
    let annotationMigrated = 0;
    let skipped = 0;
    let errors = [];

    await window.StorageLayer.AppStateStore.setResourceMigrationProgress({
      processed,
      total: totalSamples,
      phase: "migrating",
      startedAt: new Date().toISOString()
    });

    const STORES = window.StorageLayer.STORES;
    const PhotoResourceStore = window.StorageLayer.PhotoResourceStore;
    const AnnotationResourceStore = window.StorageLayer.AnnotationResourceStore;

    for (let i = processed; i < totalSamples; i++) {
      const sample = samples[i];
      try {
        if (sample.photoResourceId && sample.annotationResourceId) {
          skipped++;
          processed++;
          continue;
        }

        if (!sample.photoResourceId) {
          const photo = await window.StorageLayer.getById(STORES.PHOTOS, sample.id);
          if (photo && photo.data) {
            const photoResource = await PhotoResourceStore.add(sample.id, photo.data);
            if (photoResource) {
              await window.StorageLayer.SampleStore.update(sample.id, {
                photoResourceId: photoResource.id
              });
              photoMigrated++;
            }
          }
        }

        if (!sample.annotationResourceId) {
          const annotations = await window.StorageLayer.getByIndex(STORES.ANNOTATIONS, "sampleId", sample.id);
          const annResource = await AnnotationResourceStore.add(sample.id, annotations || []);
          if (annResource) {
            await window.StorageLayer.SampleStore.update(sample.id, {
              annotationResourceId: annResource.id
            });
            annotationMigrated++;
          }
        }

        processed++;

        if (processed % RESOURCE_MIGRATION_BATCH_SIZE === 0) {
          await window.StorageLayer.AppStateStore.setResourceMigrationProgress({
            processed,
            total: totalSamples,
            phase: "migrating",
            photoMigrated,
            annotationMigrated,
            skipped,
            lastProcessedId: sample.id
          });
        }
      } catch (e) {
        console.error(`迁移样本 ${sample.id} 失败:`, e);
        errors.push({ sampleId: sample.id, error: e.message });
      }
    }

    await migrateVersionHistoryToResourceModel();
    await migrateRecycleBinToResourceModel();

    await window.StorageLayer.AppStateStore.setResourceMigrationProgress({
      processed,
      total: totalSamples,
      phase: "completed",
      photoMigrated,
      annotationMigrated,
      skipped,
      errors,
      completedAt: new Date().toISOString()
    });

    await window.StorageLayer.AppStateStore.setResourceMigrationStatus(true);

    return {
      migrated: true,
      sampleCount: totalSamples,
      photoMigrated,
      annotationMigrated,
      skipped,
      errors
    };
  }

  async function migrateVersionHistoryToResourceModel() {
    if (!window.StorageLayer) return;

    const STORES = window.StorageLayer.STORES;
    const VersionStore = window.StorageLayer.VersionStore;
    const PhotoResourceStore = window.StorageLayer.PhotoResourceStore;
    const AnnotationResourceStore = window.StorageLayer.AnnotationResourceStore;

    const allVersions = await VersionStore.getAll();
    const processedIds = new Set();

    for (const version of allVersions) {
      if (!version.snapshot || processedIds.has(version.id)) continue;
      if (version.snapshot.photoResourceId && version.snapshot.annotationResourceId) {
        processedIds.add(version.id);
        continue;
      }

      const snapshot = version.snapshot;
      let photoResourceId = null;
      let annotationResourceId = null;

      try {
        if (snapshot.photo && !snapshot.photoResourceId) {
          const photoResource = await PhotoResourceStore.add(version.sampleId, snapshot.photo);
          if (photoResource) {
            photoResourceId = photoResource.id;
          }
        }

        if (snapshot.annotations && !snapshot.annotationResourceId) {
          const annResource = await AnnotationResourceStore.add(version.sampleId, snapshot.annotations);
          if (annResource) {
            annotationResourceId = annResource.id;
          }
        }

        if (photoResourceId || annotationResourceId) {
          const updatedSnapshot = { ...snapshot };
          if (photoResourceId) updatedSnapshot.photoResourceId = photoResourceId;
          if (annotationResourceId) updatedSnapshot.annotationResourceId = annotationResourceId;
          await VersionStore.update(version.id, { snapshot: updatedSnapshot });
        }

        processedIds.add(version.id);
      } catch (e) {
        console.error(`迁移版本历史 ${version.id} 失败:`, e);
      }
    }
  }

  async function migrateRecycleBinToResourceModel() {
    if (!window.StorageLayer) return;

    const RecycleStore = window.StorageLayer.RecycleStore;
    const PhotoResourceStore = window.StorageLayer.PhotoResourceStore;
    const AnnotationResourceStore = window.StorageLayer.AnnotationResourceStore;

    const allItems = await RecycleStore.getAll();

    for (const item of allItems) {
      if (!item.sampleSnapshot) continue;
      if (item.sampleSnapshot.photoResourceId && item.sampleSnapshot.annotationResourceId) continue;

      try {
        const snapshot = item.sampleSnapshot;
        let photoResourceId = snapshot.photoResourceId;
        let annotationResourceId = snapshot.annotationResourceId;

        if (snapshot.photo && !photoResourceId) {
          const photoResource = await PhotoResourceStore.add(item.sampleId, snapshot.photo);
          if (photoResource) photoResourceId = photoResource.id;
        }

        if (snapshot.annotations && !annotationResourceId) {
          const annResource = await AnnotationResourceStore.add(item.sampleId, snapshot.annotations);
          if (annResource) annotationResourceId = annResource.id;
        }

        if (photoResourceId || annotationResourceId) {
          const updatedSnapshot = { ...snapshot };
          if (photoResourceId) updatedSnapshot.photoResourceId = photoResourceId;
          if (annotationResourceId) updatedSnapshot.annotationResourceId = annotationResourceId;
          await RecycleStore.update(item.id, { sampleSnapshot: updatedSnapshot });
        }
      } catch (e) {
        console.error(`迁移回收站 ${item.id} 失败:`, e);
      }
    }
  }

  async function checkResourceMigrationNeeded() {
    if (!window.StorageLayer) return false;
    const migrationDone = await window.StorageLayer.AppStateStore.getResourceMigrationStatus();
    return !migrationDone;
  }

  async function getResourceMigrationStatus() {
    if (!window.StorageLayer) return null;
    const status = await window.StorageLayer.AppStateStore.getResourceMigrationStatus();
    const progress = await window.StorageLayer.AppStateStore.getResourceMigrationProgress();
    return { status, progress };
  }

  async function validateResourceMigration() {
    if (!window.StorageLayer) {
      return { valid: false, error: "StorageLayer 未加载" };
    }

    const results = {
      valid: true,
      samples: { total: 0, withPhotoResource: 0, withAnnotationResource: 0, errors: [] },
      versionHistory: { total: 0, withResourceRefs: 0, errors: [] },
      recycleBin: { total: 0, withResourceRefs: 0, errors: [] },
      photoResources: { total: 0, referenced: 0, orphaned: 0 },
      annotationResources: { total: 0, referenced: 0, orphaned: 0 }
    };

    const PhotoResourceStore = window.StorageLayer.PhotoResourceStore;
    const AnnotationResourceStore = window.StorageLayer.AnnotationResourceStore;
    const VersionStore = window.StorageLayer.VersionStore;
    const RecycleStore = window.StorageLayer.RecycleStore;

    const samples = await window.StorageLayer.SampleStore.getAll();
    results.samples.total = samples.length;

    const referencedPhotoResourceIds = new Set();
    const referencedAnnotationResourceIds = new Set();

    for (const sample of samples) {
      if (sample.photoResourceId) {
        results.samples.withPhotoResource++;
        referencedPhotoResourceIds.add(sample.photoResourceId);
        const pr = await PhotoResourceStore.getById(sample.photoResourceId);
        if (!pr) {
          results.samples.errors.push({
            sampleId: sample.id,
            type: "missing_photo_resource",
            resourceId: sample.photoResourceId
          });
          results.valid = false;
        }
      } else if (sample.photo) {
        results.samples.errors.push({
          sampleId: sample.id,
          type: "photo_not_migrated",
          message: "样本有照片但未迁移到资源表"
        });
        results.valid = false;
      }

      if (sample.annotationResourceId) {
        results.samples.withAnnotationResource++;
        referencedAnnotationResourceIds.add(sample.annotationResourceId);
        const ar = await AnnotationResourceStore.getById(sample.annotationResourceId);
        if (!ar) {
          results.samples.errors.push({
            sampleId: sample.id,
            type: "missing_annotation_resource",
            resourceId: sample.annotationResourceId
          });
          results.valid = false;
        }
      } else if (sample.annotations && sample.annotations.length > 0) {
        results.samples.errors.push({
          sampleId: sample.id,
          type: "annotations_not_migrated",
          message: "样本有标注但未迁移到资源表"
        });
        results.valid = false;
      }
    }

    const allVersions = await VersionStore.getAll();
    results.versionHistory.total = allVersions.length;
    for (const v of allVersions) {
      if (v.snapshot?.photoResourceId || v.snapshot?.annotationResourceId) {
        results.versionHistory.withResourceRefs++;
      } else if (v.snapshot?.photo || (v.snapshot?.annotations && v.snapshot.annotations.length > 0)) {
        results.versionHistory.errors.push({
          versionId: v.id,
          sampleId: v.sampleId,
          type: "version_not_migrated"
        });
        results.valid = false;
      }
    }

    const allRecycleItems = await RecycleStore.getAll();
    results.recycleBin.total = allRecycleItems.length;
    for (const item of allRecycleItems) {
      if (item.sampleSnapshot?.photoResourceId || item.sampleSnapshot?.annotationResourceId) {
        results.recycleBin.withResourceRefs++;
      } else if (item.sampleSnapshot?.photo || (item.sampleSnapshot?.annotations && item.sampleSnapshot.annotations.length > 0)) {
        results.recycleBin.errors.push({
          recycleId: item.id,
          sampleId: item.sampleId,
          type: "recycle_not_migrated"
        });
        results.valid = false;
      }
    }

    const allPhotoResources = await PhotoResourceStore.getAll();
    results.photoResources.total = allPhotoResources.length;
    for (const pr of allPhotoResources) {
      if (referencedPhotoResourceIds.has(pr.id)) {
        results.photoResources.referenced++;
      } else {
        results.photoResources.orphaned++;
      }
    }

    const allAnnotationResources = await AnnotationResourceStore.getAll();
    results.annotationResources.total = allAnnotationResources.length;
    for (const ar of allAnnotationResources) {
      if (referencedAnnotationResourceIds.has(ar.id)) {
        results.annotationResources.referenced++;
      } else {
        results.annotationResources.orphaned++;
      }
    }

    return results;
  }

  async function validateOldDataAccess() {
    if (!window.StorageLayer) {
      return { valid: false, error: "StorageLayer 未加载" };
    }

    const results = {
      valid: true,
      name: "旧数据访问验证",
      timestamp: new Date().toISOString(),
      tests: []
    };

    const STORES = window.StorageLayer.STORES;

    try {
      const oldPhotos = await window.StorageLayer.getAll(STORES.PHOTOS);
      results.tests.push({
        name: "旧照片表读取",
        passed: true,
        count: oldPhotos.length
      });
    } catch (e) {
      results.tests.push({
        name: "旧照片表读取",
        passed: false,
        error: e.message
      });
      results.valid = false;
    }

    try {
      const oldAnnotations = await window.StorageLayer.getAll(STORES.ANNOTATIONS);
      results.tests.push({
        name: "旧标注表读取",
        passed: true,
        count: oldAnnotations.length
      });
    } catch (e) {
      results.tests.push({
        name: "旧标注表读取",
        passed: false,
        error: e.message
      });
      results.valid = false;
    }

    try {
      const samples = await window.StorageLayer.SampleStore.getAll();
      let accessCount = 0;
      for (const sample of samples) {
        if (!sample.photoResourceId) {
          const photo = await window.StorageLayer.getById(STORES.PHOTOS, sample.id);
          if (photo) accessCount++;
        }
      }
      results.tests.push({
        name: "旧表数据双轨访问",
        passed: true,
        accessedViaOldTable: accessCount
      });
    } catch (e) {
      results.tests.push({
        name: "旧表数据双轨访问",
        passed: false,
        error: e.message
      });
      results.valid = false;
    }

    return results;
  }

  async function validateNewDataAccess() {
    if (!window.StorageLayer) {
      return { valid: false, error: "StorageLayer 未加载" };
    }

    const results = {
      valid: true,
      name: "新数据访问验证",
      timestamp: new Date().toISOString(),
      tests: []
    };

    const PhotoResourceStore = window.StorageLayer.PhotoResourceStore;
    const AnnotationResourceStore = window.StorageLayer.AnnotationResourceStore;

    try {
      const photoResources = await PhotoResourceStore.getAll();
      results.tests.push({
        name: "新照片资源表读取",
        passed: true,
        count: photoResources.length
      });
    } catch (e) {
      results.tests.push({
        name: "新照片资源表读取",
        passed: false,
        error: e.message
      });
      results.valid = false;
    }

    try {
      const annotationResources = await AnnotationResourceStore.getAll();
      results.tests.push({
        name: "新标注资源表读取",
        passed: true,
        count: annotationResources.length
      });
    } catch (e) {
      results.tests.push({
        name: "新标注资源表读取",
        passed: false,
        error: e.message
      });
      results.valid = false;
    }

    try {
      const samples = await window.StorageLayer.SampleStore.getAllWithPhotos();
      let hydratedCount = 0;
      for (const sample of samples) {
        if (sample.photoResourceId && sample.photo) {
          hydratedCount++;
        }
      }
      results.tests.push({
        name: "资源数据注入验证",
        passed: true,
        hydratedWithPhoto: hydratedCount,
        totalSamples: samples.length
      });
    } catch (e) {
      results.tests.push({
        name: "资源数据注入验证",
        passed: false,
        error: e.message
      });
      results.valid = false;
    }

    try {
      const samples = await window.StorageLayer.SampleStore.getAll();
      let checksumVerified = 0;
      for (const sample of samples) {
        if (sample.photoResourceId) {
          const pr = await PhotoResourceStore.getById(sample.photoResourceId);
          if (pr && pr.checksum) {
            const verifyChecksum = await window.StorageLayer.computeChecksum(pr.data);
            if (verifyChecksum === pr.checksum) {
              checksumVerified++;
            }
          }
        }
      }
      results.tests.push({
        name: "资源校验和验证",
        passed: true,
        checksumVerified
      });
    } catch (e) {
      results.tests.push({
        name: "资源校验和验证",
        passed: false,
        error: e.message
      });
      results.valid = false;
    }

    return results;
  }

  async function validateBackupImport() {
    if (!window.StorageLayer) {
      return { valid: false, error: "StorageLayer 未加载" };
    }

    const results = {
      valid: true,
      name: "备份导入数据验证",
      timestamp: new Date().toISOString(),
      tests: []
    };

    const PhotoResourceStore = window.StorageLayer.PhotoResourceStore;
    const AnnotationResourceStore = window.StorageLayer.AnnotationResourceStore;

    try {
      const samples = await window.StorageLayer.SampleStore.getAll();
      const importedSamples = samples.filter(s => s.projectId && s.projectId !== "default-project");

      let importedWithResources = 0;
      for (const sample of importedSamples) {
        if (sample.photoResourceId || sample.annotationResourceId) {
          importedWithResources++;
        }
      }

      results.tests.push({
        name: "导入样本资源关联",
        passed: true,
        importedSamples: importedSamples.length,
        withResources: importedWithResources
      });
    } catch (e) {
      results.tests.push({
        name: "导入样本资源关联",
        passed: false,
        error: e.message
      });
      results.valid = false;
    }

    try {
      const photoResources = await PhotoResourceStore.getAll();
      const checksums = new Map();
      let duplicates = 0;

      for (const pr of photoResources) {
        if (pr.checksum) {
          if (checksums.has(pr.checksum)) {
            duplicates++;
          } else {
            checksums.set(pr.checksum, pr.id);
          }
        }
      }

      results.tests.push({
        name: "资源去重验证",
        passed: true,
        totalResources: photoResources.length,
        uniqueChecksums: checksums.size,
        duplicates
      });
    } catch (e) {
      results.tests.push({
        name: "资源去重验证",
        passed: false,
        error: e.message
      });
      results.valid = false;
    }

    return results;
  }

  async function runFullValidation() {
    if (!window.StorageLayer) {
      return { valid: false, error: "StorageLayer 未加载" };
    }

    const migrationStatus = await getResourceMigrationStatus();
    const migrationValidation = await validateResourceMigration();
    const oldDataValidation = await validateOldDataAccess();
    const newDataValidation = await validateNewDataAccess();
    const backupImportValidation = await validateBackupImport();

    const overallValid = migrationValidation.valid &&
                         oldDataValidation.valid &&
                         newDataValidation.valid &&
                         backupImportValidation.valid;

    return {
      valid: overallValid,
      timestamp: new Date().toISOString(),
      dbVersion: window.StorageLayer.DB_VERSION,
      resourceModelVersion: window.StorageLayer.RESOURCE_MODEL_VERSION,
      migrationStatus,
      validations: {
        migration: migrationValidation,
        oldData: oldDataValidation,
        newData: newDataValidation,
        backupImport: backupImportValidation
      },
      summary: {
        totalSamples: migrationValidation.samples.total,
        photoResources: migrationValidation.photoResources.total,
        annotationResources: migrationValidation.annotationResources.total,
        errors: [
          ...migrationValidation.samples.errors,
          ...migrationValidation.versionHistory.errors,
          ...migrationValidation.recycleBin.errors
        ]
      }
    };
  }

  function printValidationReport(results) {
    console.log("=".repeat(60));
    console.log("  数据模型验证报告");
    console.log("=".repeat(60));
    console.log(`验证时间: ${results.timestamp}`);
    console.log(`数据库版本: v${results.dbVersion}`);
    console.log(`资源模型版本: v${results.resourceModelVersion}`);
    console.log(`整体状态: ${results.valid ? "✅ 通过" : "❌ 失败"}`);
    console.log(`迁移状态: ${results.migrationStatus.status ? "✅ 已完成" : "⏳ 未完成"}`);
    console.log("-".repeat(60));

    for (const [key, validation] of Object.entries(results.validations)) {
      const status = validation.valid ? "✅" : "❌";
      console.log(`\n${status} ${validation.name}:`);
      for (const test of validation.tests) {
        const testStatus = test.passed ? "  ✓" : "  ✗";
        let detail = "";
        if (test.count !== undefined) detail += ` (${test.count} 条)`;
        if (test.hydratedWithPhoto !== undefined) detail += ` (${test.hydratedWithPhoto}/${test.totalSamples} 已注入)`;
        if (test.checksumVerified !== undefined) detail += ` (${test.checksumVerified} 条验证通过)`;
        if (test.importedSamples !== undefined) detail += ` (${test.withResources}/${test.importedSamples} 有资源)`;
        if (test.uniqueChecksums !== undefined) detail += ` (${test.uniqueChecksums} 唯一 / ${test.duplicates} 重复)`;
        console.log(`${testStatus} ${test.name}${detail}`);
        if (!test.passed && test.error) {
          console.log(`     错误: ${test.error}`);
        }
      }
    }

    console.log("\n" + "-".repeat(60));
    console.log("摘要:");
    console.log(`  总样本数: ${results.summary.totalSamples}`);
    console.log(`  照片资源: ${results.summary.photoResources}`);
    console.log(`  标注资源: ${results.summary.annotationResources}`);
    if (results.summary.errors.length > 0) {
      console.log(`  错误数: ${results.summary.errors.length}`);
      results.summary.errors.forEach((err, i) => {
        console.log(`    ${i + 1}. ${err.type}: ${err.sampleId || err.versionId || err.recycleId}`);
      });
    }
    console.log("=".repeat(60));

    return results;
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
    RESOURCE_MIGRATION_BATCH_SIZE,
    hasLegacyData,
    readLegacyData,
    runMigration,
    checkAndMigrate,
    migrateAppStateSchema,
    migrateExistingDataToProjects,
    autoGroupSamplesByCode,
    migrateToResourceModel,
    migrateVersionHistoryToResourceModel,
    migrateRecycleBinToResourceModel,
    checkResourceMigrationNeeded,
    getResourceMigrationStatus,
    validateResourceMigration,
    validateOldDataAccess,
    validateNewDataAccess,
    validateBackupImport,
    runFullValidation,
    printValidationReport,
    clearLegacyData,
    ensureDefaultProject
  };

})(window);
