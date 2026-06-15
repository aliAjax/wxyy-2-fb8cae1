(function (global) {
  "use strict";

  const LESSON_PACKAGE_FORMAT = "wxyy-lesson-package";
  const ANSWER_PACKAGE_FORMAT = "wxyy-answer-package";
  const PACKAGE_FORMAT_VERSION = 3;

  const CONFLICT_STRATEGIES = {
    SKIP: "skip",
    RENAME: "rename",
    OVERWRITE: "overwrite"
  };

  let state = {
    submissions: [],
    rubrics: [],
    lessonMetas: {}
  };

  let initPromise = null;

  function generateId() {
    return crypto.randomUUID();
  }

  function mapSampleIds(samples, idMapping) {
    return samples.map(s => ({
      ...s,
      id: idMapping[s.id] || s.id,
      annotations: (s.annotations || []).map(a => ({
        ...a,
        id: generateId(),
        sampleId: idMapping[s.id] || s.id
      }))
    }));
  }

  function mapTaskIds(tasks, sampleIdMapping, taskIdMapping) {
    return tasks.map(t => ({
      ...t,
      id: taskIdMapping[t.id] || t.id,
      sampleIds: t.sampleIds.map(sid => sampleIdMapping[sid] || sid),
      completedSamples: (t.completedSamples || []).map(sid => sampleIdMapping[sid] || sid)
    }));
  }

  function migrateLessonPackage(data) {
    if (!data.version || data.version < 1) {
      data.version = 1;
    }
    if (data.version === 1) {
      if (!data.rubrics || !Array.isArray(data.rubrics)) {
        data.rubrics = buildDefaultRubrics();
      }
      if (!data.referenceAnswers || typeof data.referenceAnswers !== "object") {
        data.referenceAnswers = {};
      }
      if (!data.description) {
        data.description = "";
      }
      data.version = 2;
    }
    if (data.version === 2) {
      if (!data.contentHash) {
        data.contentHash = computeContentHash(data);
      }
      data.version = 3;
    }
    return data;
  }

  function migrateAnswerPackage(data) {
    if (!data.version || data.version < 1) {
      data.version = 1;
    }
    if (data.version === 1) {
      if (!data.lessonTitle) {
        data.lessonTitle = "";
      }
      if (!data.rubrics) {
        data.rubrics = null;
      }
      if (!data.referenceAnswers) {
        data.referenceAnswers = null;
      }
      data.version = 2;
    }
    if (data.version === 2) {
      if (!data.contentHash) {
        data.contentHash = computeContentHash(data);
      }
      data.version = 3;
    }
    return data;
  }

  function buildDefaultRubrics() {
    return [
      { id: generateId(), name: "矿物识别", maxScore: 40, description: "正确识别主要矿物成分" },
      { id: generateId(), name: "结构描述", maxScore: 30, description: "准确描述岩石结构特征" },
      { id: generateId(), name: "综合分析", maxScore: 30, description: "合理的地质解释和分析" }
    ];
  }

  function computeContentHash(data) {
    const payload = {
      format: data.format,
      tasks: data.tasks ? data.tasks.map(t => t.id).sort() : [],
      samples: data.samples ? data.samples.map(s => s.id).sort() : [],
      answers: data.answers ? Object.keys(data.answers).sort() : [],
      studentInfo: data.studentInfo ? data.studentInfo.studentId : ""
    };
    const str = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function verifyContentHash(data) {
    if (!data.contentHash) return true;
    const currentHash = computeContentHash(data);
    return currentHash === data.contentHash;
  }

  function getCurrentProjectId() {
    return window.ProjectManager?.getCurrentProjectId?.()
      || window.StorageLayer?.DEFAULT_PROJECT_ID
      || "default-project";
  }

  async function loadState() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }
    await window.StorageLayer.initDB();

    const pid = getCurrentProjectId();

    const submissions = await window.StorageLayer.getAppState(`submissions_${pid}`, []);
    const rubrics = await window.StorageLayer.getAppState(`rubrics_${pid}`, []);
    const lessonMetas = await window.StorageLayer.getAppState(`lessonMetas_${pid}`, {});

    state.submissions = Array.isArray(submissions) ? submissions : [];
    state.rubrics = Array.isArray(rubrics) ? rubrics : [];
    state.lessonMetas = (lessonMetas && typeof lessonMetas === "object" && !Array.isArray(lessonMetas)) ? lessonMetas : {};

    const dirty = migrateSubmissionsSchema();
    const metaDirty = migrateLessonMetasSchema();

    if (dirty || metaDirty) {
      try {
        await saveState();
      } catch (e) {
        console.warn("持久化迁移后的课堂包状态失败:", e);
      }
    }

    return state;
  }

  function migrateSubmissionsSchema() {
    let dirty = false;
    state.submissions.forEach(sub => {
      if (!sub.id) { sub.id = generateId(); dirty = true; }
      if (!sub.scores) { sub.scores = {}; dirty = true; }
      if (sub.finalScore === undefined) { sub.finalScore = null; dirty = true; }
      if (!sub.gradedAt) { sub.gradedAt = null; dirty = true; }
      if (!sub.gradedBy) { sub.gradedBy = ""; dirty = true; }
      if (!sub.lessonTitle) { sub.lessonTitle = ""; dirty = true; }
      if (!sub.taskProgress) { sub.taskProgress = {}; dirty = true; }
      if (!sub.importedAt) { sub.importedAt = new Date().toISOString(); dirty = true; }
    });
    return dirty;
  }

  function migrateLessonMetasSchema() {
    let dirty = false;
    Object.keys(state.lessonMetas).forEach(pkgId => {
      const meta = state.lessonMetas[pkgId];
      if (!meta.packageId) { meta.packageId = pkgId; dirty = true; }
      if (!meta.title) { meta.title = ""; dirty = true; }
      if (!meta.description) { meta.description = ""; dirty = true; }
      if (!meta.importedAt) { meta.importedAt = new Date().toISOString(); dirty = true; }
      if (!meta.rubrics || !Array.isArray(meta.rubrics)) {
        meta.rubrics = buildDefaultRubrics();
        dirty = true;
      }
      if (!meta.referenceAnswers || typeof meta.referenceAnswers !== "object") {
        meta.referenceAnswers = {};
        dirty = true;
      }
    });
    return dirty;
  }

  function init() {
    initPromise = loadState();
    return initPromise;
  }

  function getState() {
    return state;
  }

  async function saveState() {
    const pid = getCurrentProjectId();
    await window.StorageLayer.setAppState(`submissions_${pid}`, state.submissions);
    await window.StorageLayer.setAppState(`rubrics_${pid}`, state.rubrics);
    await window.StorageLayer.setAppState(`lessonMetas_${pid}`, state.lessonMetas);
  }

  async function createLessonPackage(options) {
    const { taskIds, title, description, includePhotos = true, rubrics = null } = options;

    if (!window.DataManager) {
      throw new Error("DataManager 未加载");
    }

    const allState = window.DataManager.getState();

    const selectedTasks = taskIds
      .map(tid => allState.tasks.find(t => t.id === tid))
      .filter(Boolean);

    if (selectedTasks.length === 0) {
      throw new Error("请至少选择一个观察任务");
    }

    const sampleIdSet = new Set();
    selectedTasks.forEach(t => t.sampleIds.forEach(sid => sampleIdSet.add(sid)));

    const selectedSamples = allState.samples.filter(s => sampleIdSet.has(s.id));

    if (selectedSamples.length === 0) {
      throw new Error("选中的任务没有关联任何样本");
    }

    const involvedGroupIds = new Set();
    selectedSamples.forEach(s => {
      if (s.groupId) involvedGroupIds.add(s.groupId);
    });
    const sampleGroups = (allState.sampleGroups || []).filter(g => involvedGroupIds.has(g.id));

    const referenceAnswers = {};
    selectedSamples.forEach(s => {
      referenceAnswers[s.id] = {
        minerals: s.minerals || "",
        texture: s.texture || "",
        comment: s.comment || "",
        polarization: s.polarization || "单偏光",
        magnification: s.magnification || "",
        location: s.location || ""
      };
    });

    const finalRubrics = rubrics && rubrics.length > 0
      ? rubrics.map(r => ({ id: r.id || generateId(), name: r.name, maxScore: Number(r.maxScore) || 0, description: r.description || "" }))
      : buildDefaultRubrics();

    const lessonPackage = {
      format: LESSON_PACKAGE_FORMAT,
      version: PACKAGE_FORMAT_VERSION,
      packageId: generateId(),
      createdAt: new Date().toISOString(),
      title: title || selectedTasks[0].title,
      description: description || "",
      tasks: selectedTasks.map(t => ({
        id: t.id,
        title: t.title,
        objective: t.objective,
        deadline: t.deadline || "",
        sampleIds: [...t.sampleIds],
        createdAt: t.createdAt
      })),
      samples: selectedSamples.map(s => {
        const sampleCopy = {
          id: s.id,
          code: s.code,
          location: s.location,
          magnification: s.magnification,
          polarization: s.polarization,
          groupId: s.groupId || "",
          minerals: "",
          texture: "",
          comment: "",
          photo: includePhotos ? s.photo : "",
          annotations: includePhotos ? (s.annotations || []) : [],
          createdAt: s.createdAt
        };
        return sampleCopy;
      }),
      referenceAnswers,
      rubrics: finalRubrics,
      sampleGroups
    };

    lessonPackage.contentHash = computeContentHash(lessonPackage);

    return lessonPackage;
  }

  async function downloadLessonPackage(options) {
    const pkg = await createLessonPackage(options);
    const jsonStr = JSON.stringify(pkg, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });

    const safeTitle = (pkg.title || "lesson-package").replace(/[^\w\u4e00-\u9fa5-]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${safeTitle}-${dateStr}.lessonpkg.json`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);

    return pkg;
  }

  function validateLessonPackage(data) {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "无效的文件格式" };
    }

    if (data.format !== LESSON_PACKAGE_FORMAT) {
      return { valid: false, error: "不是有效的课堂包文件" };
    }

    if (data.version > PACKAGE_FORMAT_VERSION) {
      return { valid: false, error: `课堂包版本 v${data.version} 过高，当前应用支持 v${PACKAGE_FORMAT_VERSION}，请更新应用` };
    }

    if (!data.samples || !Array.isArray(data.samples)) {
      return { valid: false, error: "课堂包缺少样本数据" };
    }

    if (!data.tasks || !Array.isArray(data.tasks)) {
      return { valid: false, error: "课堂包缺少任务数据" };
    }

    if (data.contentHash && !verifyContentHash(data)) {
      return { valid: false, error: "课堂包数据校验失败，文件可能已损坏或被篡改" };
    }

    return { valid: true };
  }

  function detectConflicts(importSamples, existingSamples) {
    const existingCodes = new Map();
    existingSamples.forEach(s => existingCodes.set(s.code, s.id));

    const conflicts = [];
    importSamples.forEach(s => {
      if (existingCodes.has(s.code)) {
        conflicts.push({
          importSample: s,
          existingSampleId: existingCodes.get(s.code),
          code: s.code
        });
      }
    });

    return conflicts;
  }

  async function importLessonPackage(file, options = {}) {
    const { conflictStrategy = CONFLICT_STRATEGIES.SKIP, onProgress = null, onConflict = null } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          let data = JSON.parse(e.target.result);

          const validation = validateLessonPackage(data);
          if (!validation.valid) {
            throw new Error(validation.error);
          }

          data = migrateLessonPackage(data);

          if (onProgress) onProgress(0.2, "检测冲突中...");

          const allState = window.DataManager.getState();
          const conflicts = detectConflicts(data.samples, allState.samples);

          let resolvedStrategy = conflictStrategy;

          if (conflicts.length > 0 && onConflict) {
            const userChoice = await onConflict(conflicts);
            if (userChoice === null) {
              throw new Error("用户取消导入");
            }
            resolvedStrategy = userChoice;
          }

          if (onProgress) onProgress(0.4, "生成新的ID映射...");

          const sampleIdMapping = {};
          const taskIdMapping = {};

          const skipCodes = new Set();
          if (resolvedStrategy === CONFLICT_STRATEGIES.SKIP) {
            conflicts.forEach(c => skipCodes.add(c.code));
          }

          let samplesToImport = data.samples;
          if (resolvedStrategy === CONFLICT_STRATEGIES.SKIP) {
            samplesToImport = data.samples.filter(s => !skipCodes.has(s.code));
          } else if (resolvedStrategy === CONFLICT_STRATEGIES.RENAME) {
            samplesToImport = data.samples.map(s => {
              const conflict = conflicts.find(c => c.code === s.code);
              if (conflict) {
                return { ...s, code: s.code + "-导入-" + Date.now().toString().slice(-4) };
              }
              return s;
            });
          } else if (resolvedStrategy === CONFLICT_STRATEGIES.OVERWRITE) {
            for (const conflict of conflicts) {
              await window.DataManager.deleteSample(conflict.existingSampleId);
            }
            allState.samples = allState.samples.filter(s => !conflicts.some(c => c.existingSampleId === s.id));
          }

          samplesToImport.forEach(s => {
            sampleIdMapping[s.id] = generateId();
          });

          data.tasks.forEach(t => {
            taskIdMapping[t.id] = generateId();
          });

          const mappedSamples = mapSampleIds(samplesToImport, sampleIdMapping);
          const mappedTasks = mapTaskIds(data.tasks, sampleIdMapping, taskIdMapping);

          const newPackageId = data.packageId;

          mappedTasks.forEach(t => {
            t.sampleIds = t.sampleIds.filter(sid => mappedSamples.some(s => s.id === sid));
            t.completedSamples = [];
            t.comments = [];
            t.createdAt = new Date().toISOString();
            t.lessonPackageId = newPackageId;
          });

          mappedSamples.forEach(s => {
            s.createdAt = new Date().toISOString();
            s.lessonPackageId = newPackageId;
            s.minerals = "";
            s.texture = "";
            s.comment = "";
          });

          if (data.sampleGroups && Array.isArray(data.sampleGroups)) {
            const groupIdMapping = {};
            const importedSampleNewIds = new Set(mappedSamples.map(s => s.id));
            const mappedSampleGroups = data.sampleGroups
              .map(g => {
                const newGroupId = generateId();
                groupIdMapping[g.id] = newGroupId;
                const mappedSampleIds = (g.sampleIds || [])
                  .map(sid => sampleIdMapping[sid])
                  .filter(sid => sid && importedSampleNewIds.has(sid));
                return {
                  ...g,
                  id: newGroupId,
                  sampleIds: mappedSampleIds
                };
              })
              .filter(g => g.sampleIds.length > 0);

            mappedSamples.forEach(s => {
              if (s.groupId && groupIdMapping[s.groupId]) {
                s.groupId = groupIdMapping[s.groupId];
              } else {
                s.groupId = "";
              }
            });

            if (window.DataManager) {
              for (const group of mappedSampleGroups) {
                await window.DataManager.addSampleGroup(group);
              }
            }
          }

          const migratedReferenceAnswers = {};
          Object.entries(data.referenceAnswers || {}).forEach(([oldId, ref]) => {
            const newId = sampleIdMapping[oldId];
            if (newId) {
              migratedReferenceAnswers[newId] = ref;
            }
          });

          state.lessonMetas[newPackageId] = {
            packageId: newPackageId,
            title: data.title || "",
            description: data.description || "",
            rubrics: data.rubrics || buildDefaultRubrics(),
            referenceAnswers: migratedReferenceAnswers,
            importedAt: new Date().toISOString()
          };
          await saveState();

          if (onProgress) onProgress(0.7, "导入数据中...");

          for (const sample of mappedSamples) {
            window.DataManager.addSample(sample);
          }

          for (const task of mappedTasks) {
            window.DataManager.addTask(task);
          }

          await window.DataManager.forceSave();

          if (onProgress) onProgress(1.0, "导入完成");

          resolve({
            success: true,
            packageId: newPackageId,
            sampleCount: mappedSamples.length,
            taskCount: mappedTasks.length,
            skippedCount: data.samples.length - samplesToImport.length,
            conflicts,
            rubrics: data.rubrics || [],
            referenceAnswers: migratedReferenceAnswers,
            title: data.title,
            description: data.description
          });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsText(file, "UTF-8");
    });
  }

  async function createAnswerPackage(options) {
    const { lessonPackageId, studentInfo, taskIds, answers } = options;

    if (!window.DataManager) {
      throw new Error("DataManager 未加载");
    }

    if (!studentInfo || !studentInfo.name || !studentInfo.studentId) {
      throw new Error("请填写学生姓名和学号");
    }

    const allState = window.DataManager.getState();

    const selectedTasks = taskIds
      .map(tid => allState.tasks.find(t => t.id === tid))
      .filter(Boolean);

    const sampleIdSet = new Set();
    selectedTasks.forEach(t => t.sampleIds.forEach(sid => sampleIdSet.add(sid)));

    const taskProgress = {};
    selectedTasks.forEach(t => {
      taskProgress[t.id] = {
        taskId: t.id,
        title: t.title,
        completedSamples: [...(t.completedSamples || [])],
        startedAt: t.createdAt,
        submittedAt: new Date().toISOString()
      };
    });

    const lessonMeta = lessonPackageId ? (state.lessonMetas[lessonPackageId] || null) : null;

    const answerPackage = {
      format: ANSWER_PACKAGE_FORMAT,
      version: PACKAGE_FORMAT_VERSION,
      packageId: generateId(),
      lessonPackageId: lessonPackageId || "",
      lessonTitle: lessonMeta ? lessonMeta.title : "",
      createdAt: new Date().toISOString(),
      studentInfo: {
        name: studentInfo.name.trim(),
        studentId: studentInfo.studentId.trim(),
        className: (studentInfo.className || "").trim()
      },
      tasks: selectedTasks.map(t => ({
        id: t.id,
        title: t.title,
        objective: t.objective,
        sampleIds: [...t.sampleIds],
        completedSamples: [...(t.completedSamples || [])]
      })),
      answers: answers || {},
      taskProgress,
      rubrics: lessonMeta ? lessonMeta.rubrics : null,
      referenceAnswers: lessonMeta ? lessonMeta.referenceAnswers : null
    };

    answerPackage.contentHash = computeContentHash(answerPackage);

    return answerPackage;
  }

  async function downloadAnswerPackage(options) {
    const pkg = await createAnswerPackage(options);
    const jsonStr = JSON.stringify(pkg, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });

    const safeName = (pkg.studentInfo.name || "student").replace(/[^\w\u4e00-\u9fa5-]/g, "_");
    const safeId = (pkg.studentInfo.studentId || "000").replace(/[^\w-]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${safeName}-${safeId}-${dateStr}.answerpkg.json`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);

    return pkg;
  }

  function validateAnswerPackage(data) {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "无效的文件格式" };
    }

    if (data.format !== ANSWER_PACKAGE_FORMAT) {
      return { valid: false, error: "不是有效的作答包文件" };
    }

    if (data.version > PACKAGE_FORMAT_VERSION) {
      return { valid: false, error: `作答包版本 v${data.version} 过高，当前应用支持 v${PACKAGE_FORMAT_VERSION}，请更新应用` };
    }

    if (!data.studentInfo) {
      return { valid: false, error: "作答包缺少学生信息" };
    }

    if (data.contentHash && !verifyContentHash(data)) {
      return { valid: false, error: "作答包数据校验失败，文件可能已损坏或被篡改" };
    }

    return { valid: true };
  }

  async function importAnswerPackage(file, options = {}) {
    const { onDuplicate = null } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          let data = JSON.parse(e.target.result);

          const validation = validateAnswerPackage(data);
          if (!validation.valid) {
            throw new Error(validation.error);
          }

          data = migrateAnswerPackage(data);

          const existingSubmission = state.submissions.find(s =>
            s.lessonPackageId === data.lessonPackageId &&
            s.studentInfo.studentId === data.studentInfo.studentId
          );

          if (existingSubmission) {
            let shouldOverwrite = false;
            if (onDuplicate) {
              const choice = await onDuplicate(data.studentInfo, existingSubmission);
              if (choice === null) {
                throw new Error("用户取消导入");
              }
              shouldOverwrite = choice;
            } else {
              shouldOverwrite = true;
            }

            if (shouldOverwrite) {
              state.submissions = state.submissions.filter(s => s.id !== existingSubmission.id);
            } else {
              throw new Error("用户取消导入");
            }
          }

          if (data.lessonPackageId) {
            if (!state.lessonMetas[data.lessonPackageId]) {
              state.lessonMetas[data.lessonPackageId] = {
                packageId: data.lessonPackageId,
                title: data.lessonTitle || "",
                description: "",
                rubrics: data.rubrics || buildDefaultRubrics(),
                referenceAnswers: data.referenceAnswers || {},
                importedAt: new Date().toISOString()
              };
            } else {
              if (!state.lessonMetas[data.lessonPackageId].rubrics || state.lessonMetas[data.lessonPackageId].rubrics.length === 0) {
                state.lessonMetas[data.lessonPackageId].rubrics = data.rubrics || buildDefaultRubrics();
              }
              if (!state.lessonMetas[data.lessonPackageId].referenceAnswers || Object.keys(state.lessonMetas[data.lessonPackageId].referenceAnswers).length === 0) {
                state.lessonMetas[data.lessonPackageId].referenceAnswers = data.referenceAnswers || {};
              }
              if (data.lessonTitle && !state.lessonMetas[data.lessonPackageId].title) {
                state.lessonMetas[data.lessonPackageId].title = data.lessonTitle;
              }
            }
          }

          const submission = {
            id: generateId(),
            packageId: data.packageId,
            lessonPackageId: data.lessonPackageId,
            lessonTitle: data.lessonTitle || "",
            importedAt: new Date().toISOString(),
            studentInfo: data.studentInfo,
            tasks: data.tasks || [],
            answers: data.answers || {},
            taskProgress: data.taskProgress || {},
            scores: {},
            finalScore: null,
            gradedAt: null,
            gradedBy: ""
          };

          state.submissions.push(submission);
          await saveState();

          resolve({
            success: true,
            submission,
            isUpdate: !!existingSubmission
          });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsText(file, "UTF-8");
    });
  }

  function getAllSubmissions() {
    return [...state.submissions];
  }

  function getSubmissionById(id) {
    return state.submissions.find(s => s.id === id) || null;
  }

  function getSubmissionsByLesson(lessonPackageId) {
    return state.submissions.filter(s => s.lessonPackageId === lessonPackageId);
  }

  function getSubmissionsByStudent(studentId) {
    return state.submissions.filter(s => s.studentInfo.studentId === studentId);
  }

  async function saveScore(submissionId, sampleId, scores, comment = "") {
    const submission = getSubmissionById(submissionId);
    if (!submission) {
      throw new Error("提交记录不存在");
    }

    submission.scores[sampleId] = {
      ...scores,
      comment,
      scoredAt: new Date().toISOString()
    };

    const allScores = Object.values(submission.scores);
    if (allScores.length > 0) {
      submission.finalScore = allScores.reduce((sum, s) => {
        const sampleTotal = Object.entries(s)
          .filter(([k]) => k !== "comment" && k !== "scoredAt")
          .reduce((acc, [, v]) => acc + (typeof v === "number" ? v : 0), 0);
        return sum + sampleTotal;
      }, 0);
    }

    submission.gradedAt = new Date().toISOString();

    await saveState();
    return submission;
  }

  function getFilteredSubmissions(filters = {}) {
    let result = getAllSubmissions();

    if (filters.lessonPackageId) {
      result = result.filter(s => s.lessonPackageId === filters.lessonPackageId);
    }

    if (filters.studentId) {
      result = result.filter(s => s.studentInfo.studentId === filters.studentId);
    }

    if (filters.studentName) {
      const name = filters.studentName.toLowerCase();
      result = result.filter(s => s.studentInfo.name.toLowerCase().includes(name));
    }

    if (filters.taskId) {
      result = result.filter(s => s.tasks.some(t => t.id === filters.taskId || t.title === filters.taskId));
    }

    if (filters.status) {
      if (filters.status === "graded") {
        result = result.filter(s => getSubmissionStatus(s) === "graded");
      } else if (filters.status === "ungraded") {
        result = result.filter(s => getSubmissionStatus(s) === "ungraded");
      } else if (filters.status === "abnormal") {
        result = result.filter(s => isSubmissionAbnormal(s));
      }
    } else if (filters.graded !== undefined) {
      result = result.filter(s => {
        const hasScores = Object.keys(s.scores || {}).length > 0;
        return filters.graded ? hasScores : !hasScores;
      });
    }

    return result;
  }

  function getUniqueStudents() {
    const studentMap = new Map();
    state.submissions.forEach(s => {
      const key = s.studentInfo.studentId;
      if (!studentMap.has(key)) {
        studentMap.set(key, { ...s.studentInfo });
      }
    });
    return Array.from(studentMap.values());
  }

  function getUniqueLessons() {
    const lessonMap = new Map();
    state.submissions.forEach(s => {
      if (s.lessonPackageId && !lessonMap.has(s.lessonPackageId)) {
        const meta = state.lessonMetas[s.lessonPackageId];
        lessonMap.set(s.lessonPackageId, {
          lessonPackageId: s.lessonPackageId,
          title: meta ? meta.title : (s.lessonTitle || (s.tasks[0] ? s.tasks[0].title : "未命名课堂包")),
          description: meta ? meta.description : "",
          submissionCount: 0
        });
      }
      if (s.lessonPackageId && lessonMap.has(s.lessonPackageId)) {
        lessonMap.get(s.lessonPackageId).submissionCount++;
      }
    });
    return Array.from(lessonMap.values());
  }

  function getAnswerBySample(submission, sampleId) {
    return submission.answers[sampleId] || null;
  }

  function getScoreBySample(submission, sampleId) {
    return submission.scores[sampleId] || null;
  }

  function getRubricsForLesson(lessonPackageId) {
    if (lessonPackageId && state.lessonMetas[lessonPackageId]) {
      return [...(state.lessonMetas[lessonPackageId].rubrics || [])];
    }
    return getRubrics();
  }

  function getReferenceAnswersForLesson(lessonPackageId) {
    if (lessonPackageId && state.lessonMetas[lessonPackageId]) {
      return { ...(state.lessonMetas[lessonPackageId].referenceAnswers || {}) };
    }
    return {};
  }

  async function saveRubrics(rubrics, lessonPackageId) {
    const normalized = rubrics.map(r => ({
      id: r.id || generateId(),
      name: r.name,
      maxScore: Number(r.maxScore) || 0,
      description: r.description || ""
    }));

    if (lessonPackageId) {
      if (!state.lessonMetas[lessonPackageId]) {
        state.lessonMetas[lessonPackageId] = {
          packageId: lessonPackageId,
          title: "",
          description: "",
          rubrics: normalized,
          referenceAnswers: {},
          importedAt: new Date().toISOString()
        };
      } else {
        state.lessonMetas[lessonPackageId].rubrics = normalized;
      }
    } else {
      state.rubrics = normalized;
    }

    await saveState();
    return normalized;
  }

  function getRubrics(lessonPackageId) {
    if (lessonPackageId) {
      return getRubricsForLesson(lessonPackageId);
    }
    if (state.rubrics.length === 0) {
      return buildDefaultRubrics();
    }
    return [...state.rubrics];
  }

  async function deleteSubmission(id) {
    state.submissions = state.submissions.filter(s => s.id !== id);
    await saveState();
  }

  function parsePackageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          let type = "unknown";
          if (data.format === LESSON_PACKAGE_FORMAT) type = "lesson";
          else if (data.format === ANSWER_PACKAGE_FORMAT) type = "answer";

          resolve({ data, type });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsText(file, "UTF-8");
    });
  }

  function getLessonMeta(lessonPackageId) {
    return state.lessonMetas[lessonPackageId] || null;
  }

  async function exportGradingResults(lessonPackageId) {
    const submissions = getSubmissionsByLesson(lessonPackageId);
    const meta = getLessonMeta(lessonPackageId);
    const rubrics = getRubricsForLesson(lessonPackageId);

    return {
      format: "wxyy-grading-results",
      version: 1,
      exportedAt: new Date().toISOString(),
      lessonPackageId,
      lessonTitle: meta ? meta.title : "",
      rubrics,
      submissions: submissions.map(s => ({
        studentInfo: s.studentInfo,
        importedAt: s.importedAt,
        answers: s.answers,
        scores: s.scores,
        finalScore: s.finalScore,
        gradedAt: s.gradedAt
      }))
    };
  }

  async function batchImportAnswerPackages(files, options = {}) {
    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        const result = await importAnswerPackage(file, options);
        results.push({ file: file.name, success: true, ...result });
      } catch (err) {
        if (err.message === "用户取消导入") {
          errors.push({ file: file.name, cancelled: true });
        } else {
          errors.push({ file: file.name, error: err.message });
        }
      }
    }

    return { results, errors, totalSuccess: results.length, totalErrors: errors.length };
  }

  async function saveLocalAnswer(answerData) {
    if (!window.StorageLayer || !window.StorageLayer.AnswerStore) return;
    const pid = getCurrentProjectId();
    const dataWithProject = { ...answerData, projectId: answerData.projectId || pid };
    await window.StorageLayer.AnswerStore.save(dataWithProject);
  }

  async function getLocalAnswersByTask(taskId) {
    if (!window.StorageLayer || !window.StorageLayer.AnswerStore) return [];
    return window.StorageLayer.AnswerStore.getByTaskId(taskId);
  }

  async function getLocalAnswersByLesson(lessonPackageId) {
    if (!window.StorageLayer || !window.StorageLayer.AnswerStore) return [];
    return window.StorageLayer.AnswerStore.getByLessonPackageId(lessonPackageId);
  }

  async function deleteLocalAnswer(id) {
    if (!window.StorageLayer || !window.StorageLayer.AnswerStore) return;
    await window.StorageLayer.AnswerStore.remove(id);
  }

  async function deleteLocalAnswersByTask(taskId) {
    if (!window.StorageLayer || !window.StorageLayer.AnswerStore) return;
    await window.StorageLayer.AnswerStore.removeByTaskId(taskId);
  }

  async function downloadGradingResults(lessonPackageId) {
    const results = await exportGradingResults(lessonPackageId);
    const jsonStr = JSON.stringify(results, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });

    const meta = getLessonMeta(lessonPackageId);
    const safeTitle = (meta?.title || "grading-results").replace(/[^\w\u4e00-\u9fa5-]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${safeTitle}-评分结果-${dateStr}.json`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);

    return results;
  }

  function getAggregatedByTask(lessonPackageId) {
    const submissions = getSubmissionsByLesson(lessonPackageId);
    const taskMap = new Map();

    submissions.forEach(sub => {
      (sub.tasks || []).forEach(task => {
        if (!taskMap.has(task.id)) {
          taskMap.set(task.id, {
            taskId: task.id,
            taskTitle: task.title,
            sampleIds: task.sampleIds || [],
            students: []
          });
        }
        const entry = taskMap.get(task.id);
        const taskAnswers = {};
        (task.sampleIds || []).forEach(sid => {
          if (sub.answers[sid]) {
            taskAnswers[sid] = sub.answers[sid];
          }
        });
        const taskScores = {};
        (task.sampleIds || []).forEach(sid => {
          if (sub.scores[sid]) {
            taskScores[sid] = sub.scores[sid];
          }
        });
        entry.students.push({
          submissionId: sub.id,
          studentInfo: sub.studentInfo,
          answers: taskAnswers,
          scores: taskScores,
          finalScore: sub.finalScore
        });
      });
    });

    return Array.from(taskMap.values());
  }

  function getAggregatedBySample(lessonPackageId) {
    const submissions = getSubmissionsByLesson(lessonPackageId);
    const sampleMap = new Map();

    submissions.forEach(sub => {
      const sampleIds = new Set();
      (sub.tasks || []).forEach(t => (t.sampleIds || []).forEach(sid => sampleIds.add(sid)));

      sampleIds.forEach(sampleId => {
        if (!sampleMap.has(sampleId)) {
          sampleMap.set(sampleId, {
            sampleId,
            students: []
          });
        }
        const entry = sampleMap.get(sampleId);
        const answer = sub.answers[sampleId] || null;
        const score = sub.scores[sampleId] || null;
        entry.students.push({
          submissionId: sub.id,
          studentInfo: sub.studentInfo,
          answer,
          score
        });
      });
    });

    return Array.from(sampleMap.values());
  }

  function getImportedLessonPackages() {
    const packageIds = new Set();
    const packages = [];

    Object.entries(state.lessonMetas).forEach(([id, meta]) => {
      if (!packageIds.has(id)) {
        packageIds.add(id);
        const submissions = state.submissions.filter(s => s.lessonPackageId === id);
        const gradedCount = submissions.filter(s => getSubmissionStatus(s) === "graded").length;
        const ungradedCount = submissions.filter(s => getSubmissionStatus(s) === "ungraded").length;
        const abnormalCount = submissions.filter(s => isSubmissionAbnormal(s)).length;
        const scoredSubmissions = submissions.filter(s => s.finalScore !== null && !isSubmissionAbnormal(s));
        const avgScore = scoredSubmissions.length > 0
          ? Math.round(scoredSubmissions.reduce((sum, s) => sum + (s.finalScore || 0), 0) / scoredSubmissions.length)
          : 0;

        packages.push({
          packageId: id,
          title: meta.title || "未命名课堂包",
          description: meta.description || "",
          importedAt: meta.importedAt || "",
          rubrics: meta.rubrics || [],
          referenceAnswers: meta.referenceAnswers || {},
          submissionCount: submissions.length,
          gradedCount,
          ungradedCount,
          abnormalCount,
          avgScore
        });
      }
    });

    return packages;
  }

  function isSubmissionAbnormal(submission) {
    if (!submission) return false;
    const rubrics = getRubricsForLesson(submission.lessonPackageId);
    const answerCount = Object.keys(submission.answers || {}).length;
    const scoreCount = Object.keys(submission.scores || {}).length;

    if (answerCount === 0) return true;

    if (scoreCount > 0 && submission.finalScore !== null) {
      const maxPossibleScore = rubrics.reduce((sum, r) => sum + r.maxScore, 0) * answerCount;
      if (maxPossibleScore > 0 && submission.finalScore > maxPossibleScore) return true;
    }

    const studentId = submission.studentInfo?.studentId;
    if (!studentId || studentId.trim().length === 0) return true;

    const studentName = submission.studentInfo?.name;
    if (!studentName || studentName.trim().length === 0) return true;

    return false;
  }

  function getSubmissionStatus(submission) {
    if (isSubmissionAbnormal(submission)) return "abnormal";
    const hasScores = Object.keys(submission.scores || {}).length > 0;
    return hasScores ? "graded" : "ungraded";
  }

  function getSubmissionStatusLabel(status) {
    const labels = {
      ungraded: "待评分",
      graded: "已评分",
      abnormal: "异常"
    };
    return labels[status] || "未知";
  }

  function calculateSubmissionTotalScore(submission) {
    if (!submission || !submission.scores) return 0;
    let total = 0;
    Object.values(submission.scores).forEach(scoreData => {
      if (scoreData && typeof scoreData === "object") {
        Object.entries(scoreData).forEach(([key, value]) => {
          if (key !== "comment" && key !== "scoredAt" && typeof value === "number") {
            total += value;
          }
        });
      }
    });
    return total;
  }

  function getMaxScoreForLesson(lessonPackageId) {
    const rubrics = getRubricsForLesson(lessonPackageId);
    return rubrics.reduce((sum, r) => sum + r.maxScore, 0);
  }

  function getGradingStatsByLesson(lessonPackageId) {
    const submissions = getSubmissionsByLesson(lessonPackageId);
    const rubrics = getRubricsForLesson(lessonPackageId);
    const maxScorePerSample = rubrics.reduce((sum, r) => sum + r.maxScore, 0);

    const graded = submissions.filter(s => getSubmissionStatus(s) === "graded");
    const ungraded = submissions.filter(s => getSubmissionStatus(s) === "ungraded");
    const abnormal = submissions.filter(s => isSubmissionAbnormal(s));

    const scoredSubmissions = graded.filter(s => s.finalScore !== null);
    const totalScores = scoredSubmissions.reduce((sum, s) => sum + (s.finalScore || 0), 0);
    const avgScore = scoredSubmissions.length > 0 ? Math.round(totalScores / scoredSubmissions.length) : 0;

    const highestScore = scoredSubmissions.length > 0
      ? Math.max(...scoredSubmissions.map(s => s.finalScore || 0))
      : 0;
    const lowestScore = scoredSubmissions.length > 0
      ? Math.min(...scoredSubmissions.map(s => s.finalScore || 0))
      : 0;

    return {
      total: submissions.length,
      graded: graded.length,
      ungraded: ungraded.length,
      abnormal: abnormal.length,
      avgScore,
      highestScore,
      lowestScore,
      maxScorePerSample,
      rubricCount: rubrics.length
    };
  }

  global.LessonPackage = {
    LESSON_PACKAGE_FORMAT,
    ANSWER_PACKAGE_FORMAT,
    PACKAGE_FORMAT_VERSION,
    CONFLICT_STRATEGIES,

    init,
    getState,
    saveState,

    createLessonPackage,
    downloadLessonPackage,
    validateLessonPackage,
    importLessonPackage,
    detectConflicts,

    createAnswerPackage,
    downloadAnswerPackage,
    validateAnswerPackage,
    importAnswerPackage,
    batchImportAnswerPackages,

    getAllSubmissions,
    getSubmissionById,
    getSubmissionsByLesson,
    getSubmissionsByStudent,
    getFilteredSubmissions,
    getUniqueStudents,
    getUniqueLessons,
    getAnswerBySample,
    getScoreBySample,
    saveScore,
    deleteSubmission,

    getRubrics,
    getRubricsForLesson,
    saveRubrics,
    getReferenceAnswersForLesson,
    getLessonMeta,
    exportGradingResults,
    downloadGradingResults,

    saveLocalAnswer,
    getLocalAnswersByTask,
    getLocalAnswersByLesson,
    deleteLocalAnswer,
    deleteLocalAnswersByTask,

    getAggregatedByTask,
    getAggregatedBySample,
    getImportedLessonPackages,

    isSubmissionAbnormal,
    getSubmissionStatus,
    getSubmissionStatusLabel,
    calculateSubmissionTotalScore,
    getMaxScoreForLesson,
    getGradingStatsByLesson,

    computeContentHash,
    verifyContentHash,
    parsePackageFile,
    generateId
  };

})(window);
