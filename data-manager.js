(function (global) {
  "use strict";

  const state = {
    projectId: null,
    samples: [],
    compare: [],
    tasks: [],
    filterViews: []
  };

  let saveTimeout = null;
  let isDirty = false;
  let initPromise = null;

  function getCurrentProjectId() {
    if (window.ProjectManager) {
      const pid = window.ProjectManager.getCurrentProjectId();
      if (pid) return pid;
    }
    if (window.StorageLayer) {
      return window.StorageLayer.DEFAULT_PROJECT_ID;
    }
    return state.projectId || "default-project";
  }

  async function loadAllData() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    await window.StorageLayer.initDB();

    const projectId = getCurrentProjectId();
    state.projectId = projectId;

    const samples = await window.StorageLayer.SampleStore.getAllWithPhotos(projectId);
    const tasks = await window.StorageLayer.TaskStore.getAll(projectId);
    const compare = await window.StorageLayer.AppStateStore.getCompareList(projectId);
    const filterViews = await window.StorageLayer.AppStateStore.getFilterViews(projectId);

    state.samples = samples;
    state.tasks = tasks;
    state.compare = compare;
    state.filterViews = filterViews;

    return state;
  }

  async function reloadForProject() {
    initPromise = null;
    return loadAllData();
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = loadAllData();
    return initPromise;
  }

  async function reload() {
    initPromise = null;
    return loadAllData();
  }

  function getState() {
    return state;
  }

  function save() {
    isDirty = true;

    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
      await persistState();
    }, 300);
  }

  async function persistState() {
    if (!isDirty) return;
    isDirty = false;

    const projectId = getCurrentProjectId();

    try {
      const samplesWithProject = state.samples.map(s => ({ ...s, projectId }));
      await window.StorageLayer.SampleStore.bulkAdd(samplesWithProject);

      await window.StorageLayer.TaskStore.clearAll(projectId);
      for (const task of state.tasks) {
        await window.StorageLayer.TaskStore.add({ ...task, projectId });
      }
      await window.StorageLayer.AppStateStore.setCompareList(state.compare, projectId);
    } catch (e) {
      console.error("持久化状态失败:", e);
      isDirty = true;
    }
  }

  async function forceSave() {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    await persistState();
  }

  async function addSample(sample) {
    const projectId = getCurrentProjectId();
    const sampleWithProject = { ...sample, projectId };
    state.samples.unshift(sampleWithProject);
    save();

    if (window.VersionHistory) {
      try {
        await window.VersionHistory.recordVersion(sample.id, sampleWithProject, "create", null);
      } catch (e) {
        console.warn("记录版本历史失败:", e);
      }
    }
  }

  async function updateSample(id, updates) {
    const index = state.samples.findIndex(s => s.id === id);
    if (index !== -1) {
      const oldSample = { ...state.samples[index] };
      state.samples[index] = { ...state.samples[index], ...updates };
      save();

      if (window.VersionHistory) {
        try {
          const oldSnapshot = window.VersionHistory.buildSnapshot(oldSample);
          const changeType = window.VersionHistory.detectChangeType(
            Object.keys(updates).filter(k => {
              const tracked = window.VersionHistory.TRACKED_FIELDS.find(f => f.key === k);
              return tracked || k === "photo" || k === "hasPhoto" || k === "annotations" || k === "annotationCount";
            })
          );
          await window.VersionHistory.recordVersion(id, state.samples[index], changeType, oldSnapshot);
        } catch (e) {
          console.warn("记录版本历史失败:", e);
        }
      }

      return state.samples[index];
    }
    return null;
  }

  async function deleteSample(id) {
    const sample = state.samples.find(s => s.id === id);

    if (sample && window.VersionHistory) {
      try {
        await window.VersionHistory.moveToRecycleBin({ ...sample, projectId: getCurrentProjectId() });
      } catch (e) {
        console.warn("移入回收站失败:", e);
      }
    }

    state.samples = state.samples.filter(s => s.id !== id);
    state.compare = state.compare.filter(cid => cid !== id);
    const affectedTasks = [];
    state.tasks.forEach(task => {
      const sampleIds = task.sampleIds.filter(sid => sid !== id);
      const completedSamples = (task.completedSamples || []).filter(sid => sid !== id);
      const changed = sampleIds.length !== task.sampleIds.length ||
        completedSamples.length !== (task.completedSamples || []).length;
      task.sampleIds = sampleIds;
      task.completedSamples = completedSamples;
      if (changed) affectedTasks.push(task);
    });

    try {
      await window.StorageLayer.SampleStore.remove(id);
      await window.StorageLayer.AppStateStore.setCompareList(state.compare, getCurrentProjectId());
      for (const task of affectedTasks) {
        await window.StorageLayer.TaskStore.update(task.id, {
          sampleIds: task.sampleIds,
          completedSamples: task.completedSamples
        });
      }
    } catch (e) {
      console.error("删除样本持久化失败:", e);
      save();
    }
  }

  async function restoreSample(sample) {
    if (!sample || !sample.id) return;

    const projectId = getCurrentProjectId();
    const sampleWithProject = { ...sample, projectId };

    state.samples.unshift(sampleWithProject);
    save();

    try {
      await window.StorageLayer.SampleStore.add(sampleWithProject);
      if (window.VersionHistory) {
        await window.VersionHistory.recordVersion(sample.id, sampleWithProject, "restore", null);
      }
    } catch (e) {
      console.error("恢复样本失败:", e);
      save();
    }
  }

  function getSampleById(id) {
    return state.samples.find(s => s.id === id) || null;
  }

  function addTask(task) {
    const projectId = getCurrentProjectId();
    state.tasks.unshift({ ...task, projectId });
    save();
  }

  function updateTask(id, updates) {
    const index = state.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      state.tasks[index] = { ...state.tasks[index], ...updates };
      save();
      return state.tasks[index];
    }
    return null;
  }

  async function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);

    try {
      await window.StorageLayer.TaskStore.remove(id);
    } catch (e) {
      console.error("删除任务持久化失败:", e);
      save();
    }
  }

  function getTaskById(id) {
    return state.tasks.find(t => t.id === id) || null;
  }

  function setCompareList(list) {
    state.compare = list.slice(0, 2);
    save();
  }

  function toggleCompare(id) {
    const index = state.compare.indexOf(id);
    if (index === -1) {
      state.compare = [id, ...state.compare].slice(0, 2);
    } else {
      state.compare.splice(index, 1);
    }
    save();
    return state.compare;
  }

  async function addFilterView(view) {
    const projectId = getCurrentProjectId();
    await window.StorageLayer.AppStateStore.addFilterView(view, projectId);
    state.filterViews = await window.StorageLayer.AppStateStore.getFilterViews(projectId);
    return state.filterViews;
  }

  async function deleteFilterView(viewId) {
    const projectId = getCurrentProjectId();
    await window.StorageLayer.AppStateStore.deleteFilterView(viewId, projectId);
    state.filterViews = await window.StorageLayer.AppStateStore.getFilterViews(projectId);
    return state.filterViews;
  }

  async function clearAll() {
    const projectId = getCurrentProjectId();
    state.samples = [];
    state.tasks = [];
    state.compare = [];
    await window.StorageLayer.SampleStore.clearAll(projectId);
    await window.StorageLayer.TaskStore.clearAll(projectId);
    await window.StorageLayer.AnswerStore.clearAll(projectId);
    await window.StorageLayer.RecycleStore.clearAll(projectId);
    await window.StorageLayer.AppStateStore.setCompareList([], projectId);
  }

  async function ensureHistoryForExistingSamples() {
    if (!window.VersionHistory) return;

    for (const sample of state.samples) {
      try {
        await window.VersionHistory.ensureInitialVersion(sample.id, sample);
      } catch (e) {
        console.warn("为旧样本创建初始版本失败:", e);
      }
    }
  }

  global.DataManager = {
    init,
    reload,
    reloadForProject,
    getState,
    save,
    forceSave,
    addSample,
    updateSample,
    deleteSample,
    restoreSample,
    getSampleById,
    addTask,
    updateTask,
    deleteTask,
    getTaskById,
    setCompareList,
    toggleCompare,
    addFilterView,
    deleteFilterView,
    clearAll,
    ensureHistoryForExistingSamples,
    getCurrentProjectId
  };

})(window);
