(function (global) {
  "use strict";

  const DB_NAME = "wxyy-thin-section-db";
  const DB_VERSION = 2;

  const STORES = {
    SAMPLES: "samples",
    PHOTOS: "photos",
    TASKS: "tasks",
    APP_STATE: "appState",
    ANNOTATIONS: "annotations",
    STUDENT_ANSWERS: "studentAnswers"
  };

  let db = null;
  let initPromise = null;

  function initDB() {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        if (!database.objectStoreNames.contains(STORES.SAMPLES)) {
          const sampleStore = database.createObjectStore(STORES.SAMPLES, { keyPath: "id" });
          sampleStore.createIndex("code", "code", { unique: false });
          sampleStore.createIndex("createdAt", "createdAt", { unique: false });
          sampleStore.createIndex("polarization", "polarization", { unique: false });
        }

        if (!database.objectStoreNames.contains(STORES.PHOTOS)) {
          const photoStore = database.createObjectStore(STORES.PHOTOS, { keyPath: "sampleId" });
          photoStore.createIndex("sampleId", "sampleId", { unique: true });
        }

        if (!database.objectStoreNames.contains(STORES.TASKS)) {
          const taskStore = database.createObjectStore(STORES.TASKS, { keyPath: "id" });
          taskStore.createIndex("createdAt", "createdAt", { unique: false });
        }

        if (!database.objectStoreNames.contains(STORES.APP_STATE)) {
          database.createObjectStore(STORES.APP_STATE, { keyPath: "key" });
        }

        if (!database.objectStoreNames.contains(STORES.ANNOTATIONS)) {
          const annStore = database.createObjectStore(STORES.ANNOTATIONS, { keyPath: "id" });
          annStore.createIndex("sampleId", "sampleId", { unique: false });
        }

        if (!database.objectStoreNames.contains(STORES.STUDENT_ANSWERS)) {
          const ansStore = database.createObjectStore(STORES.STUDENT_ANSWERS, { keyPath: "id" });
          ansStore.createIndex("lessonPackageId", "lessonPackageId", { unique: false });
          ansStore.createIndex("taskId", "taskId", { unique: false });
          ansStore.createIndex("sampleId", "sampleId", { unique: false });
          ansStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
    });

    return initPromise;
  }

  function getStore(storeName, mode = "readonly") {
    if (!db) throw new Error("Database not initialized");
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(storeName) {
    await initDB();
    const store = getStore(storeName);
    return promisifyRequest(store.getAll());
  }

  async function getById(storeName, id) {
    await initDB();
    const store = getStore(storeName);
    return promisifyRequest(store.get(id));
  }

  async function put(storeName, data) {
    await initDB();
    const store = getStore(storeName, "readwrite");
    return promisifyRequest(store.put(data));
  }

  async function bulkPut(storeName, items) {
    await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      let completed = 0;
      let errors = [];

      items.forEach((item) => {
        const request = store.put(item);
        request.onerror = () => errors.push(request.error);
        request.onsuccess = () => {
          completed++;
          if (completed === items.length) {
            if (errors.length > 0) reject(new Error(`${errors.length} errors occurred`));
            else resolve();
          }
        };
      });

      if (items.length === 0) resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function remove(storeName, id) {
    await initDB();
    const store = getStore(storeName, "readwrite");
    return promisifyRequest(store.delete(id));
  }

  async function clearStore(storeName) {
    await initDB();
    const store = getStore(storeName, "readwrite");
    return promisifyRequest(store.clear());
  }

  async function getByIndex(storeName, indexName, value) {
    await initDB();
    const store = getStore(storeName);
    const index = store.index(indexName);
    return promisifyRequest(index.getAll(value));
  }

  async function getAppState(key, defaultValue = null) {
    await initDB();
    try {
      const store = getStore(STORES.APP_STATE);
      const result = await promisifyRequest(store.get(key));
      return result ? result.value : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async function setAppState(key, value) {
    await initDB();
    const store = getStore(STORES.APP_STATE, "readwrite");
    return promisifyRequest(store.put({ key, value }));
  }

  const SampleStore = {
    async getAll() {
      const samples = await getAll(STORES.SAMPLES);
      return samples.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getById(id) {
      return getById(STORES.SAMPLES, id);
    },

    async add(sample) {
      const sampleData = { ...sample };
      const photoData = sampleData.photo;
      delete sampleData.photo;

      await put(STORES.SAMPLES, sampleData);

      if (photoData) {
        await put(STORES.PHOTOS, { sampleId: sample.id, data: photoData });
      }

      if (sampleData.annotations && sampleData.annotations.length > 0) {
        await bulkPut(STORES.ANNOTATIONS, sampleData.annotations.map(a => ({ ...a, sampleId: sample.id })));
      }

      return sample;
    },

    async update(id, updates) {
      const existing = await this.getById(id);
      if (!existing) throw new Error("Sample not found");

      const updated = { ...existing, ...updates };
      const photoData = updated.photo;
      delete updated.photo;

      await put(STORES.SAMPLES, updated);

      if (photoData !== undefined) {
        if (photoData) {
          await put(STORES.PHOTOS, { sampleId: id, data: photoData });
        } else {
          await remove(STORES.PHOTOS, id);
        }
      }

      return updated;
    },

    async remove(id) {
      await remove(STORES.SAMPLES, id);
      try { await remove(STORES.PHOTOS, id); } catch (e) {}

      const annotations = await getByIndex(STORES.ANNOTATIONS, "sampleId", id);
      for (const ann of annotations) {
        await remove(STORES.ANNOTATIONS, ann.id);
      }
    },

    async getPhoto(sampleId) {
      try {
        const photo = await getById(STORES.PHOTOS, sampleId);
        return photo ? photo.data : null;
      } catch {
        return null;
      }
    },

    async getWithPhoto(id) {
      const sample = await this.getById(id);
      if (!sample) return null;
      const photo = await this.getPhoto(id);
      const annotations = await getByIndex(STORES.ANNOTATIONS, "sampleId", id);
      return { ...sample, photo: photo || "", annotations };
    },

    async getAllWithPhotos() {
      const samples = await this.getAll();
      const allAnnotations = await getAll(STORES.ANNOTATIONS);
      const result = [];
      for (const sample of samples) {
        const photo = await this.getPhoto(sample.id);
        const annotations = allAnnotations.filter(a => a.sampleId === sample.id);
        result.push({ ...sample, photo: photo || "", annotations });
      }
      return result;
    },

    async bulkAdd(samples) {
      const sampleDataList = [];
      const photoDataList = [];
      const annotationList = [];

      samples.forEach((sample) => {
        const s = { ...sample };
        if (s.photo) {
          photoDataList.push({ sampleId: s.id, data: s.photo });
          delete s.photo;
        }
        if (s.annotations && s.annotations.length > 0) {
          s.annotations.forEach(a => annotationList.push({ ...a, sampleId: s.id }));
          delete s.annotations;
        }
        sampleDataList.push(s);
      });

      await bulkPut(STORES.SAMPLES, sampleDataList);
      if (photoDataList.length > 0) {
        await bulkPut(STORES.PHOTOS, photoDataList);
      }
      if (annotationList.length > 0) {
        await bulkPut(STORES.ANNOTATIONS, annotationList);
      }
    },

    async clearAll() {
      await clearStore(STORES.SAMPLES);
      await clearStore(STORES.PHOTOS);
      await clearStore(STORES.ANNOTATIONS);
    }
  };

  const AnnotationStore = {
    async getBySampleId(sampleId) {
      return getByIndex(STORES.ANNOTATIONS, "sampleId", sampleId);
    },

    async add(annotation) {
      return put(STORES.ANNOTATIONS, annotation);
    },

    async bulkAdd(annotations) {
      return bulkPut(STORES.ANNOTATIONS, annotations);
    },

    async update(id, updates) {
      const existing = await getById(STORES.ANNOTATIONS, id);
      if (!existing) throw new Error("Annotation not found");
      const updated = { ...existing, ...updates };
      return put(STORES.ANNOTATIONS, updated);
    },

    async remove(id) {
      return remove(STORES.ANNOTATIONS, id);
    },

    async removeBySampleId(sampleId) {
      const annotations = await this.getBySampleId(sampleId);
      for (const ann of annotations) {
        await remove(STORES.ANNOTATIONS, ann.id);
      }
    }
  };

  const TaskStore = {
    async getAll() {
      const tasks = await getAll(STORES.TASKS);
      return tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getById(id) {
      return getById(STORES.TASKS, id);
    },

    async add(task) {
      return put(STORES.TASKS, task);
    },

    async update(id, updates) {
      const existing = await this.getById(id);
      if (!existing) throw new Error("Task not found");
      const updated = { ...existing, ...updates };
      return put(STORES.TASKS, updated);
    },

    async remove(id) {
      return remove(STORES.TASKS, id);
    },

    async clearAll() {
      return clearStore(STORES.TASKS);
    }
  };

  const AnswerStore = {
    async getAll() {
      const answers = await getAll(STORES.STUDENT_ANSWERS);
      return answers.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },

    async getById(id) {
      return getById(STORES.STUDENT_ANSWERS, id);
    },

    async getByLessonPackageId(lessonPackageId) {
      return getByIndex(STORES.STUDENT_ANSWERS, "lessonPackageId", lessonPackageId);
    },

    async getByTaskId(taskId) {
      return getByIndex(STORES.STUDENT_ANSWERS, "taskId", taskId);
    },

    async getBySampleId(sampleId) {
      return getByIndex(STORES.STUDENT_ANSWERS, "sampleId", sampleId);
    },

    async save(answer) {
      const existing = await this.getById(answer.id);
      const data = {
        ...answer,
        updatedAt: new Date().toISOString()
      };
      if (!existing) {
        data.createdAt = data.updatedAt;
      }
      return put(STORES.STUDENT_ANSWERS, data);
    },

    async bulkSave(answers) {
      const items = answers.map(a => ({
        ...a,
        updatedAt: new Date().toISOString(),
        createdAt: a.createdAt || new Date().toISOString()
      }));
      return bulkPut(STORES.STUDENT_ANSWERS, items);
    },

    async remove(id) {
      return remove(STORES.STUDENT_ANSWERS, id);
    },

    async removeByTaskId(taskId) {
      const answers = await this.getByTaskId(taskId);
      for (const a of answers) {
        await remove(STORES.STUDENT_ANSWERS, a.id);
      }
    },

    async clearAll() {
      return clearStore(STORES.STUDENT_ANSWERS);
    }
  };

  const AppStateStore = {
    async getCompareList() {
      return getAppState("compareList", []);
    },

    async setCompareList(list) {
      return setAppState("compareList", list);
    },

    async getMigrationStatus() {
      return getAppState("migrationDone", false);
    },

    async setMigrationStatus(done) {
      return setAppState("migrationDone", done);
    },

    async getSchemaVersion() {
      return getAppState("schemaVersion", 0);
    },

    async setSchemaVersion(version) {
      return setAppState("schemaVersion", version);
    }
  };

  async function exportAllData() {
    await initDB();

    const samples = await SampleStore.getAll();
    const photos = await getAll(STORES.PHOTOS);
    const tasks = await TaskStore.getAll();
    const annotations = await getAll(STORES.ANNOTATIONS);

    const samplesWithPhotos = samples.map(s => {
      const photo = photos.find(p => p.sampleId === s.id);
      const sampleAnnotations = annotations.filter(a => a.sampleId === s.id);
      return {
        ...s,
        photo: photo ? photo.data : "",
        annotations: sampleAnnotations
      };
    });

    const compareList = await AppStateStore.getCompareList();

    return {
      version: DB_VERSION,
      exportDate: new Date().toISOString(),
      samples: samplesWithPhotos,
      tasks: tasks,
      appState: {
        compareList
      }
    };
  }

  async function importAllData(data, options = {}) {
    const { merge = false } = options;

    await initDB();

    if (!merge) {
      await SampleStore.clearAll();
      await TaskStore.clearAll();
      await clearStore(STORES.APP_STATE);
    }

    if (data.samples && Array.isArray(data.samples)) {
      await SampleStore.bulkAdd(data.samples);
    }

    if (data.tasks && Array.isArray(data.tasks)) {
      await bulkPut(STORES.TASKS, data.tasks);
    }

    if (data.appState) {
      if (data.appState.compareList) {
        await AppStateStore.setCompareList(data.appState.compareList);
      }
    }

    return true;
  }

  async function clearAllData() {
    await initDB();
    await SampleStore.clearAll();
    await TaskStore.clearAll();
    await AnswerStore.clearAll();
    await clearStore(STORES.APP_STATE);
  }

  global.StorageLayer = {
    initDB,
    STORES,
    DB_NAME,
    DB_VERSION,
    getAppState,
    setAppState,
    SampleStore,
    AnnotationStore,
    AnswerStore,
    TaskStore,
    AppStateStore,
    exportAllData,
    importAllData,
    clearAllData
  };

})(window);
