(function (global) {
  "use strict";

  let currentProjectId = null;
  let initPromise = null;
  let projectChangeListeners = [];
  let projectsCache = [];

  function getProjects() {
    return projectsCache;
  }

  function getProjectById(id) {
    return projectsCache.find(p => p.id === id) || null;
  }

  function getCurrentProjectSync() {
    if (!currentProjectId) return null;
    return getProjectById(currentProjectId);
  }

  async function refreshProjectsCache() {
    try {
      projectsCache = await window.StorageLayer.ProjectStore.getAll(true);
    } catch (e) {
      console.warn("刷新项目缓存失败:", e);
    }
    return projectsCache;
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

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      await window.StorageLayer.initDB();
      await ensureDefaultProject();
      await refreshProjectsCache();
      const savedProjectId = await window.StorageLayer.AppStateStore.getCurrentProjectId();
      const project = await window.StorageLayer.ProjectStore.getById(savedProjectId);
      if (project && !project.isArchived) {
        currentProjectId = savedProjectId;
      } else {
        const DEFAULT_PROJECT_ID = window.StorageLayer.DEFAULT_PROJECT_ID;
        currentProjectId = DEFAULT_PROJECT_ID;
        await window.StorageLayer.AppStateStore.setCurrentProjectId(DEFAULT_PROJECT_ID);
      }
      return currentProjectId;
    })();
    return initPromise;
  }

  function getCurrentProjectId() {
    return currentProjectId;
  }

  async function getCurrentProject() {
    if (!currentProjectId) return null;
    return window.StorageLayer.ProjectStore.getById(currentProjectId);
  }

  async function setCurrentProject(projectId) {
    const project = await window.StorageLayer.ProjectStore.getById(projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    if (project.isArchived) {
      throw new Error("无法切换到已归档的项目");
    }
    currentProjectId = projectId;
    await window.StorageLayer.AppStateStore.setCurrentProjectId(projectId);
    notifyProjectChange(projectId);
    return project;
  }

  function onProjectChange(listener) {
    if (typeof listener === "function") {
      projectChangeListeners.push(listener);
      return () => {
        projectChangeListeners = projectChangeListeners.filter(l => l !== listener);
      };
    }
    return () => {};
  }

  function notifyProjectChange(projectId) {
    projectChangeListeners.forEach(listener => {
      try { listener(projectId); } catch (e) { console.error(e); }
    });
  }

  async function listProjects(includeArchived = false) {
    return window.StorageLayer.ProjectStore.getAll(includeArchived);
  }

  async function createProject(name, description = "") {
    if (!name || !name.trim()) {
      throw new Error("项目名称不能为空");
    }
    const project = await window.StorageLayer.ProjectStore.add({
      name: name.trim(),
      description: description.trim(),
      createdAt: new Date().toISOString()
    });
    await refreshProjectsCache();
    return project;
  }

  async function renameProject(projectId, newName) {
    if (!newName || !newName.trim()) {
      throw new Error("项目名称不能为空");
    }
    const updated = await window.StorageLayer.ProjectStore.update(projectId, {
      name: newName.trim()
    });
    await refreshProjectsCache();
    return updated;
  }

  async function updateProjectDescription(projectId, description) {
    const updated = await window.StorageLayer.ProjectStore.update(projectId, {
      description: (description || "").trim()
    });
    await refreshProjectsCache();
    return updated;
  }

  async function archiveProject(projectId) {
    if (projectId === window.StorageLayer.DEFAULT_PROJECT_ID) {
      throw new Error("默认项目不能归档");
    }
    const updated = await window.StorageLayer.ProjectStore.update(projectId, {
      isArchived: true,
      archivedAt: new Date().toISOString()
    });
    await refreshProjectsCache();
    if (currentProjectId === projectId) {
      const DEFAULT_PROJECT_ID = window.StorageLayer.DEFAULT_PROJECT_ID;
      await setCurrentProject(DEFAULT_PROJECT_ID);
    }
    return updated;
  }

  async function unarchiveProject(projectId) {
    const updated = await window.StorageLayer.ProjectStore.update(projectId, {
      isArchived: false,
      archivedAt: null
    });
    await refreshProjectsCache();
    return updated;
  }

  async function deleteProject(projectId) {
    if (projectId === window.StorageLayer.DEFAULT_PROJECT_ID) {
      throw new Error("默认项目不能删除");
    }
    if (currentProjectId === projectId) {
      const DEFAULT_PROJECT_ID = window.StorageLayer.DEFAULT_PROJECT_ID;
      await setCurrentProject(DEFAULT_PROJECT_ID);
    }
    await window.StorageLayer.ProjectStore.remove(projectId);
    await refreshProjectsCache();
    return true;
  }

  async function duplicateProject(projectId, newName) {
    const projectData = await window.StorageLayer.exportProjectData(projectId, {
      includeHistory: true,
      includeRecycleBin: true
    });
    const name = newName || `${projectData.project.name} - 副本`;
    const result = await window.StorageLayer.importProjectData(projectData, {
      renameProject: name
    });
    await refreshProjectsCache();
    return result.project;
  }

  async function exportProjectBackup(projectId) {
    return window.StorageLayer.exportProjectData(projectId, {
      includeHistory: true,
      includeRecycleBin: true
    });
  }

  async function downloadProjectBackup(projectId) {
    const data = await exportProjectBackup(projectId);
    const project = data.project;
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = (project.name || "project").replace(/[^\w\u4e00-\u9fa5-]/g, "_");
    const filename = `project-${safeName}-${dateStr}.json`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);

    try {
      await updateLastBackupTime(projectId);
    } catch (e) {
      console.warn("更新备份时间失败:", e);
    }

    return { filename, data };
  }

  async function importProjectBackup(file, options = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          let result;
          if (data.format === "wxyy-thin-section-project-backup" && data.project) {
            result = await window.StorageLayer.importProjectData(data, options);
          } else if (data.format === "wxyy-thin-section-backup" || data.samples) {
            result = await importLegacyBackupAsProject(data, options);
          } else {
            reject(new Error("无效的项目备份文件格式"));
            return;
          }
          await refreshProjectsCache();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsText(file, "UTF-8");
    });
  }

  async function importLegacyBackupAsProject(data, options = {}) {
    const projectName = options.renameProject || `导入项目-${new Date().toLocaleDateString()}`;
    const newProjectId = crypto.randomUUID();
    const idMapping = {};

    const projectRecord = await window.StorageLayer.ProjectStore.add({
      id: newProjectId,
      name: projectName,
      description: "从旧版备份导入",
      createdAt: new Date().toISOString(),
      meta: { importedFromLegacy: true, importedAt: new Date().toISOString() }
    });

    if (data.samples && Array.isArray(data.samples)) {
      const samplesWithNewIds = data.samples.map(s => {
        const oldId = s.id;
        const newId = crypto.randomUUID();
        idMapping[oldId] = newId;
        return {
          ...s,
          id: newId,
          projectId: newProjectId,
          annotations: (s.annotations || []).map(a => ({
            ...a,
            id: crypto.randomUUID(),
            sampleId: newId
          }))
        };
      });
      await window.StorageLayer.SampleStore.bulkAdd(samplesWithNewIds);
    }

    if (data.tasks && Array.isArray(data.tasks)) {
      for (const task of data.tasks) {
        const newTaskId = crypto.randomUUID();
        idMapping[task.id] = newTaskId;
        await window.StorageLayer.TaskStore.add({
          ...task,
          id: newTaskId,
          projectId: newProjectId,
          sampleIds: (task.sampleIds || []).map(id => idMapping[id] || id),
          completedSamples: (task.completedSamples || []).map(id => idMapping[id] || id)
        });
      }
    }

    if (data.appState && data.appState.compareList) {
      const mappedCompare = data.appState.compareList.map(id => idMapping[id]).filter(Boolean);
      await window.StorageLayer.AppStateStore.setCompareList(mappedCompare, newProjectId);
    }

    await refreshProjectsCache();
    return {
      project: projectRecord,
      sampleCount: (data.samples || []).length,
      taskCount: (data.tasks || []).length
    };
  }

  const COMPLETENESS_FIELDS = [
    { key: "code", weight: 20 },
    { key: "photo", weight: 25 },
    { key: "minerals", weight: 20 },
    { key: "texture", weight: 15 },
    { key: "comment", weight: 10 },
    { key: "location", weight: 5 },
    { key: "magnification", weight: 5 }
  ];

  function calcCompleteness(sample) {
    if (!sample) return { score: 0, percent: 0 };
    let score = 0;
    COMPLETENESS_FIELDS.forEach((field) => {
      const value = field.key === "photo" ? (sample.photo || sample.hasPhoto) : sample[field.key];
      const hasValue = field.key === "photo"
        ? !!value
        : (value && String(value).trim().length > 0);
      if (hasValue) {
        score += field.weight;
      }
    });
    return { score, percent: Math.round(score) };
  }

  function calculateReviewStatus(sample) {
    if (!sample) return "incomplete";
    if (sample.reviewStatus) return sample.reviewStatus;
    const { percent } = calcCompleteness(sample);
    return percent < 60 ? "incomplete" : "pending";
  }

  async function getProjectStats(projectId) {
    const samples = await window.StorageLayer.SampleStore.getAll(projectId);
    const tasks = await window.StorageLayer.TaskStore.getAll(projectId);
    const compare = await window.StorageLayer.AppStateStore.getCompareList(projectId);
    const recycleItems = await window.StorageLayer.RecycleStore.getAll(projectId);
    const project = await window.StorageLayer.ProjectStore.getById(projectId);
    let answerCount = 0;
    try {
      if (window.StorageLayer.AnswerStore) {
        const answers = await window.StorageLayer.AnswerStore.getAll(projectId);
        answerCount = answers.length;
      }
    } catch (e) {}

    let pendingReviewCount = 0;
    let incompleteCount = 0;
    let confirmedCount = 0;
    let lastSampleUpdate = null;
    samples.forEach(sample => {
      const status = calculateReviewStatus(sample);
      if (status === "pending") {
        pendingReviewCount++;
      } else if (status === "incomplete") {
        incompleteCount++;
      } else if (status === "confirmed") {
        confirmedCount++;
      }
      if (sample.updatedAt) {
        const t = new Date(sample.updatedAt).getTime();
        if (!lastSampleUpdate || t > lastSampleUpdate) {
          lastSampleUpdate = t;
        }
      }
    });

    const projectUpdatedAt = project?.updatedAt ? new Date(project.updatedAt).getTime() : 0;
    const lastBackupAt = project?.meta?.lastBackupAt || null;
    const latestUpdateTime = Math.max(projectUpdatedAt, lastSampleUpdate || 0);

    return {
      sampleCount: samples.length,
      taskCount: tasks.length,
      pendingReviewCount,
      incompleteCount,
      confirmedCount,
      recycleCount: recycleItems.length,
      compareCount: compare.length,
      photosCount: samples.filter(s => s.photo || s.hasPhoto).length,
      answerCount,
      lastUpdateTime: latestUpdateTime ? new Date(latestUpdateTime).toISOString() : null,
      backupStatus: {
        hasBackup: !!lastBackupAt,
        lastBackupAt: lastBackupAt
      }
    };
  }

  async function updateLastBackupTime(projectId) {
    const project = await window.StorageLayer.ProjectStore.getById(projectId);
    if (!project) return null;
    const meta = { ...(project.meta || {}), lastBackupAt: new Date().toISOString() };
    const updated = await window.StorageLayer.ProjectStore.update(projectId, { meta });
    await refreshProjectsCache();
    return updated;
  }

  global.ProjectManager = {
    init,
    getCurrentProjectId,
    getCurrentProject,
    getCurrentProjectSync,
    setCurrentProject,
    onProjectChange,
    listProjects,
    getProjects,
    getProjectById,
    refreshProjectsCache,
    createProject,
    renameProject,
    updateProjectDescription,
    archiveProject,
    unarchiveProject,
    deleteProject,
    duplicateProject,
    exportProjectBackup,
    downloadProjectBackup,
    importProjectBackup,
    getProjectStats,
    calcCompleteness,
    calculateReviewStatus,
    updateLastBackupTime,
    ensureDefaultProject,
    COMPLETENESS_FIELDS
  };

})(window);
