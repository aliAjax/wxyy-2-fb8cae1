(function (global) {
  "use strict";

  const state = {
    samples: [],
    compare: [],
    tasks: []
  };

  let saveTimeout = null;
  let isDirty = false;
  let initPromise = null;

  async function loadAllData() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    await window.StorageLayer.initDB();

    const samples = await window.StorageLayer.SampleStore.getAllWithPhotos();
    const tasks = await window.StorageLayer.TaskStore.getAll();
    const compare = await window.StorageLayer.AppStateStore.getCompareList();

    state.samples = samples;
    state.tasks = tasks;
    state.compare = compare;

    return state;
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

    try {
      await window.StorageLayer.SampleStore.bulkAdd(state.samples);
      await window.StorageLayer.TaskStore.clearAll();
      for (const task of state.tasks) {
        await window.StorageLayer.TaskStore.add(task);
      }
      await window.StorageLayer.AppStateStore.setCompareList(state.compare);
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

  function addSample(sample) {
    state.samples.unshift(sample);
    save();
  }

  function updateSample(id, updates) {
    const index = state.samples.findIndex(s => s.id === id);
    if (index !== -1) {
      state.samples[index] = { ...state.samples[index], ...updates };
      save();
      return state.samples[index];
    }
    return null;
  }

  async function deleteSample(id) {
    state.samples = state.samples.filter(s => s.id !== id);
    state.compare = state.compare.filter(cid => cid !== id);
    state.tasks.forEach(task => {
      task.sampleIds = task.sampleIds.filter(sid => sid !== id);
      task.completedSamples = (task.completedSamples || []).filter(sid => sid !== id);
    });

    try {
      await window.StorageLayer.SampleStore.remove(id);
      await window.StorageLayer.AppStateStore.setCompareList(state.compare);
    } catch (e) {
      console.error("删除样本持久化失败:", e);
      save();
    }
  }

  function getSampleById(id) {
    return state.samples.find(s => s.id === id) || null;
  }

  function addTask(task) {
    state.tasks.unshift(task);
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

  async function clearAll() {
    state.samples = [];
    state.tasks = [];
    state.compare = [];
    await window.StorageLayer.clearAllData();
  }

  global.DataManager = {
    init,
    reload,
    getState,
    save,
    forceSave,
    addSample,
    updateSample,
    deleteSample,
    getSampleById,
    addTask,
    updateTask,
    deleteTask,
    getTaskById,
    setCompareList,
    toggleCompare,
    clearAll
  };

})(window);
