(function (global) {
  "use strict";

  const DB_NAME = "wxyy-thin-section-db";
  const DB_VERSION = 7;
  const DEFAULT_PROJECT_ID = "default-project";
  const SCHEMA_LAYER_VERSION = 2;
  const RESOURCE_MODEL_VERSION = 1;

  const STORES = {
    PROJECTS: "projects",
    SAMPLES: "samples",
    PHOTOS: "photos",
    PHOTO_RESOURCES: "photoResources",
    ANNOTATION_RESOURCES: "annotationResources",
    TASKS: "tasks",
    APP_STATE: "appState",
    ANNOTATIONS: "annotations",
    STUDENT_ANSWERS: "studentAnswers",
    VERSION_HISTORY: "versionHistory",
    RECYCLE_BIN: "recycleBin",
    MIGRATION_STATE: "migrationState",
    VERSION_SNAPSHOTS: "versionSnapshots"
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
        const oldVersion = event.oldVersion || 0;

        if (!database.objectStoreNames.contains(STORES.PROJECTS)) {
          const projectStore = database.createObjectStore(STORES.PROJECTS, { keyPath: "id" });
          projectStore.createIndex("createdAt", "createdAt", { unique: false });
          projectStore.createIndex("isArchived", "isArchived", { unique: false });
        }

        if (!database.objectStoreNames.contains(STORES.SAMPLES)) {
          const sampleStore = database.createObjectStore(STORES.SAMPLES, { keyPath: "id" });
          sampleStore.createIndex("code", "code", { unique: false });
          sampleStore.createIndex("createdAt", "createdAt", { unique: false });
          sampleStore.createIndex("polarization", "polarization", { unique: false });
          sampleStore.createIndex("projectId", "projectId", { unique: false });
          sampleStore.createIndex("groupId", "groupId", { unique: false });
          sampleStore.createIndex("photoResourceId", "photoResourceId", { unique: false });
          sampleStore.createIndex("annotationResourceId", "annotationResourceId", { unique: false });
        } else if (oldVersion < 4) {
          const sampleStore = event.target.transaction.objectStore(STORES.SAMPLES);
          if (!sampleStore.indexNames.contains("projectId")) {
            sampleStore.createIndex("projectId", "projectId", { unique: false });
          }
        }

        if (oldVersion < 5) {
          let sampleStore;
          if (database.objectStoreNames.contains(STORES.SAMPLES)) {
            sampleStore = event.target.transaction.objectStore(STORES.SAMPLES);
            if (!sampleStore.indexNames.contains("groupId")) {
              sampleStore.createIndex("groupId", "groupId", { unique: false });
            }
          }
        }

        if (oldVersion < 6) {
          if (database.objectStoreNames.contains(STORES.SAMPLES)) {
            const sampleStore = event.target.transaction.objectStore(STORES.SAMPLES);
            if (!sampleStore.indexNames.contains("photoResourceId")) {
              sampleStore.createIndex("photoResourceId", "photoResourceId", { unique: false });
            }
            if (!sampleStore.indexNames.contains("annotationResourceId")) {
              sampleStore.createIndex("annotationResourceId", "annotationResourceId", { unique: false });
            }
          }
        }

        if (oldVersion < 7) {
          if (!database.objectStoreNames.contains(STORES.VERSION_SNAPSHOTS)) {
            const snapshotStore = database.createObjectStore(STORES.VERSION_SNAPSHOTS, { keyPath: "id" });
            snapshotStore.createIndex("sampleId", "sampleId", { unique: false });
            snapshotStore.createIndex("resourceType", "resourceType", { unique: false });
            snapshotStore.createIndex("createdAt", "createdAt", { unique: false });
          }
        }

        if (!database.objectStoreNames.contains(STORES.PHOTOS)) {
          const photoStore = database.createObjectStore(STORES.PHOTOS, { keyPath: "sampleId" });
          photoStore.createIndex("sampleId", "sampleId", { unique: true });
        }

        if (!database.objectStoreNames.contains(STORES.PHOTO_RESOURCES)) {
          const photoResStore = database.createObjectStore(STORES.PHOTO_RESOURCES, { keyPath: "id" });
          photoResStore.createIndex("sampleId", "sampleId", { unique: false });
          photoResStore.createIndex("createdAt", "createdAt", { unique: false });
          photoResStore.createIndex("checksum", "checksum", { unique: false });
        }

        if (!database.objectStoreNames.contains(STORES.ANNOTATION_RESOURCES)) {
          const annResStore = database.createObjectStore(STORES.ANNOTATION_RESOURCES, { keyPath: "id" });
          annResStore.createIndex("sampleId", "sampleId", { unique: false });
          annResStore.createIndex("createdAt", "createdAt", { unique: false });
        }

        if (!database.objectStoreNames.contains(STORES.MIGRATION_STATE)) {
          database.createObjectStore(STORES.MIGRATION_STATE, { keyPath: "id" });
        }

        if (!database.objectStoreNames.contains(STORES.TASKS)) {
          const taskStore = database.createObjectStore(STORES.TASKS, { keyPath: "id" });
          taskStore.createIndex("createdAt", "createdAt", { unique: false });
          taskStore.createIndex("projectId", "projectId", { unique: false });
        } else if (oldVersion < 4) {
          const taskStore = event.target.transaction.objectStore(STORES.TASKS);
          if (!taskStore.indexNames.contains("projectId")) {
            taskStore.createIndex("projectId", "projectId", { unique: false });
          }
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
          ansStore.createIndex("projectId", "projectId", { unique: false });
        } else if (oldVersion < 4) {
          const ansStore = event.target.transaction.objectStore(STORES.STUDENT_ANSWERS);
          if (!ansStore.indexNames.contains("projectId")) {
            ansStore.createIndex("projectId", "projectId", { unique: false });
          }
        }

        if (!database.objectStoreNames.contains(STORES.VERSION_HISTORY)) {
          const vhStore = database.createObjectStore(STORES.VERSION_HISTORY, { keyPath: "id" });
          vhStore.createIndex("sampleId", "sampleId", { unique: false });
          vhStore.createIndex("timestamp", "timestamp", { unique: false });
          vhStore.createIndex("sampleId_timestamp", ["sampleId", "timestamp"], { unique: false });
        }

        if (!database.objectStoreNames.contains(STORES.RECYCLE_BIN)) {
          const rbStore = database.createObjectStore(STORES.RECYCLE_BIN, { keyPath: "id" });
          rbStore.createIndex("sampleId", "sampleId", { unique: false });
          rbStore.createIndex("deletedAt", "deletedAt", { unique: false });
          rbStore.createIndex("projectId", "projectId", { unique: false });
        } else if (oldVersion < 4) {
          const rbStore = event.target.transaction.objectStore(STORES.RECYCLE_BIN);
          if (!rbStore.indexNames.contains("projectId")) {
            rbStore.createIndex("projectId", "projectId", { unique: false });
          }
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

  const ProjectStore = {
    async getAll(includeArchived = false) {
      await initDB();
      const all = await getAll(STORES.PROJECTS);
      const sorted = all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (includeArchived) return sorted;
      return sorted.filter(p => !p.isArchived);
    },

    async getById(id) {
      return getById(STORES.PROJECTS, id);
    },

    async add(project) {
      const projectData = {
        id: project.id || crypto.randomUUID(),
        name: project.name,
        description: project.description || "",
        createdAt: project.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isArchived: project.isArchived || false,
        archivedAt: project.archivedAt || null,
        meta: project.meta || {}
      };
      await put(STORES.PROJECTS, projectData);
      return projectData;
    },

    async update(id, updates) {
      const existing = await this.getById(id);
      if (!existing) throw new Error("Project not found");
      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      await put(STORES.PROJECTS, updated);
      return updated;
    },

    async remove(id) {
      const samples = await getByIndex(STORES.SAMPLES, "projectId", id);
      for (const sample of samples) {
        try { await remove(STORES.PHOTOS, sample.id); } catch (e) {}
        const annotations = await getByIndex(STORES.ANNOTATIONS, "sampleId", sample.id);
        for (const ann of annotations) {
          await remove(STORES.ANNOTATIONS, ann.id);
        }
        const versions = await getByIndex(STORES.VERSION_HISTORY, "sampleId", sample.id);
        for (const v of versions) {
          await remove(STORES.VERSION_HISTORY, v.id);
        }
      }
      await this.clearProjectSamples(id);
      const tasks = await getByIndex(STORES.TASKS, "projectId", id);
      for (const task of tasks) {
        await remove(STORES.TASKS, task.id);
      }
      const answers = await getByIndex(STORES.STUDENT_ANSWERS, "projectId", id);
      for (const ans of answers) {
        await remove(STORES.STUDENT_ANSWERS, ans.id);
      }
      const recycleItems = await getByIndex(STORES.RECYCLE_BIN, "projectId", id);
      for (const item of recycleItems) {
        await remove(STORES.RECYCLE_BIN, item.id);
      }
      await remove(STORES.PROJECTS, id);
    },

    async clearProjectSamples(projectId) {
      await initDB();
      const store = getStore(STORES.SAMPLES, "readwrite");
      const index = store.index("projectId");
      return new Promise((resolve, reject) => {
        const request = index.openCursor(projectId);
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    }
  };

  async function getPhotoBySampleId(sampleId) {
    const sample = await getById(STORES.SAMPLES, sampleId);
    if (sample && sample.photoResourceId) {
      const resource = await PhotoResourceStore.getById(sample.photoResourceId);
      if (resource) return resource.data;
    }
    try {
      const photo = await getById(STORES.PHOTOS, sampleId);
      return photo ? photo.data : null;
    } catch {
      return null;
    }
  }

  async function getAnnotationsBySampleId(sampleId) {
    const sample = await getById(STORES.SAMPLES, sampleId);
    if (sample && sample.annotationResourceId) {
      const resource = await AnnotationResourceStore.getById(sample.annotationResourceId);
      if (resource) return resource.annotations || [];
    }
    return getByIndex(STORES.ANNOTATIONS, "sampleId", sampleId);
  }

  async function hydrateSampleWithResources(sample) {
    if (!sample) return null;
    const photo = await getPhotoBySampleId(sample.id);
    const annotations = await getAnnotationsBySampleId(sample.id);
    return { ...sample, photo: photo || "", annotations };
  }

  const SampleStore = {
    async getAll(projectId = null) {
      await initDB();
      let samples;
      if (projectId) {
        samples = await getByIndex(STORES.SAMPLES, "projectId", projectId);
      } else {
        samples = await getAll(STORES.SAMPLES);
      }
      return samples.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getById(id) {
      return getById(STORES.SAMPLES, id);
    },

    async add(sample) {
      const sampleData = { ...sample };
      if (!sampleData.projectId) {
        sampleData.projectId = DEFAULT_PROJECT_ID;
      }

      const photoData = sampleData.photo;
      const annotationsData = sampleData.annotations;
      delete sampleData.photo;
      delete sampleData.annotations;

      if (photoData) {
        const photoResource = await PhotoResourceStore.add(sampleData.id, photoData);
        if (photoResource) {
          sampleData.photoResourceId = photoResource.id;
        }
      }

      if (annotationsData && annotationsData.length > 0) {
        const annResource = await AnnotationResourceStore.add(sampleData.id, annotationsData);
        if (annResource) {
          sampleData.annotationResourceId = annResource.id;
        }
      }

      await put(STORES.SAMPLES, sampleData);

      if (photoData) {
        try { await put(STORES.PHOTOS, { sampleId: sample.id, data: photoData }); } catch (e) {}
      }

      if (annotationsData && annotationsData.length > 0) {
        try { await bulkPut(STORES.ANNOTATIONS, annotationsData.map(a => ({ ...a, sampleId: sample.id }))); } catch (e) {}
      }

      return { ...sampleData, photo: photoData || "", annotations: annotationsData || [] };
    },

    async update(id, updates) {
      const existing = await this.getById(id);
      if (!existing) throw new Error("Sample not found");

      const updated = { ...existing, ...updates };
      const photoData = updated.photo;
      const annotationsData = updated.annotations;
      delete updated.photo;
      delete updated.annotations;

      if (photoData !== undefined) {
        if (photoData) {
          if (existing.photoResourceId) {
            await PhotoResourceStore.update(existing.photoResourceId, { data: photoData });
          } else {
            const photoResource = await PhotoResourceStore.add(id, photoData);
            if (photoResource) {
              updated.photoResourceId = photoResource.id;
            }
          }
        } else {
          if (existing.photoResourceId) {
            await PhotoResourceStore.remove(existing.photoResourceId);
            delete updated.photoResourceId;
          }
        }
        try {
          if (photoData) {
            await put(STORES.PHOTOS, { sampleId: id, data: photoData });
          } else {
            await remove(STORES.PHOTOS, id);
          }
        } catch (e) {}
      }

      if (annotationsData !== undefined) {
        if (existing.annotationResourceId) {
          await AnnotationResourceStore.update(existing.annotationResourceId, { annotations: annotationsData });
        } else {
          const annResource = await AnnotationResourceStore.add(id, annotationsData);
          if (annResource) {
            updated.annotationResourceId = annResource.id;
          }
        }
        try {
          const oldAnns = await getByIndex(STORES.ANNOTATIONS, "sampleId", id);
          for (const ann of oldAnns) {
            await remove(STORES.ANNOTATIONS, ann.id);
          }
          if (annotationsData && annotationsData.length > 0) {
            await bulkPut(STORES.ANNOTATIONS, annotationsData.map(a => ({ ...a, sampleId: id })));
          }
        } catch (e) {}
      }

      await put(STORES.SAMPLES, updated);
      return updated;
    },

    async remove(id) {
      const sample = await this.getById(id);
      if (sample) {
        if (sample.photoResourceId) {
          try { await PhotoResourceStore.remove(sample.photoResourceId); } catch (e) {}
        }
        if (sample.annotationResourceId) {
          try { await AnnotationResourceStore.remove(sample.annotationResourceId); } catch (e) {}
        }
      }
      await remove(STORES.SAMPLES, id);
      try { await remove(STORES.PHOTOS, id); } catch (e) {}

      const annotations = await getByIndex(STORES.ANNOTATIONS, "sampleId", id);
      for (const ann of annotations) {
        await remove(STORES.ANNOTATIONS, ann.id);
      }

      try { await PhotoResourceStore.removeBySampleId(id); } catch (e) {}
      try { await AnnotationResourceStore.removeBySampleId(id); } catch (e) {}
      try { await VersionSnapshotStore.removeBySampleId(id); } catch (e) {}
    },

    async getPhoto(sampleId) {
      return getPhotoBySampleId(sampleId);
    },

    async getWithPhoto(id) {
      const sample = await this.getById(id);
      return hydrateSampleWithResources(sample);
    },

    async getAllWithPhotos(projectId = null) {
      const samples = await this.getAll(projectId);
      const result = [];
      for (const sample of samples) {
        const hydrated = await hydrateSampleWithResources(sample);
        if (hydrated) result.push(hydrated);
      }
      return result;
    },

    async bulkAdd(samples) {
      const sampleDataList = [];
      const photoDataList = [];
      const annotationList = [];
      const photoResources = [];
      const annotationResources = [];

      for (const sample of samples) {
        const s = { ...sample };
        if (!s.projectId) {
          s.projectId = DEFAULT_PROJECT_ID;
        }

        if (s.photo) {
          photoDataList.push({ sampleId: s.id, data: s.photo });
          const checksum = await computeChecksum(s.photo);
          const photoRes = {
            id: crypto.randomUUID(),
            sampleId: s.id,
            data: s.photo,
            checksum,
            createdAt: new Date().toISOString()
          };
          photoResources.push(photoRes);
          s.photoResourceId = photoRes.id;
          delete s.photo;
        }

        if (s.annotations && s.annotations.length > 0) {
          s.annotations.forEach(a => annotationList.push({ ...a, sampleId: s.id }));
          const annRes = {
            id: crypto.randomUUID(),
            sampleId: s.id,
            annotations: s.annotations,
            checksum: await computeChecksum(s.annotations),
            createdAt: new Date().toISOString()
          };
          annotationResources.push(annRes);
          s.annotationResourceId = annRes.id;
          delete s.annotations;
        }

        sampleDataList.push(s);
      }

      await bulkPut(STORES.SAMPLES, sampleDataList);
      if (photoResources.length > 0) {
        await bulkPut(STORES.PHOTO_RESOURCES, photoResources);
      }
      if (annotationResources.length > 0) {
        await bulkPut(STORES.ANNOTATION_RESOURCES, annotationResources);
      }
      if (photoDataList.length > 0) {
        try { await bulkPut(STORES.PHOTOS, photoDataList); } catch (e) {}
      }
      if (annotationList.length > 0) {
        try { await bulkPut(STORES.ANNOTATIONS, annotationList); } catch (e) {}
      }
    },

    async clearAll(projectId = null) {
      let sampleIds = [];
      if (projectId) {
        await initDB();
        const store = getStore(STORES.SAMPLES, "readwrite");
        const index = store.index("projectId");
        await new Promise((resolve, reject) => {
          const request = index.openCursor(projectId);
          request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              sampleIds.push(cursor.value.id);
              if (cursor.value.photoResourceId) {
                PhotoResourceStore.remove(cursor.value.photoResourceId).catch(() => {});
              }
              if (cursor.value.annotationResourceId) {
                AnnotationResourceStore.remove(cursor.value.annotationResourceId).catch(() => {});
              }
              cursor.delete();
              cursor.continue();
            } else {
              resolve();
            }
          };
          request.onerror = () => reject(request.error);
        });
        for (const sid of sampleIds) {
          try { await remove(STORES.PHOTOS, sid); } catch (e) {}
          const annotations = await getByIndex(STORES.ANNOTATIONS, "sampleId", sid);
          for (const ann of annotations) {
            await remove(STORES.ANNOTATIONS, ann.id);
          }
          try { await PhotoResourceStore.removeBySampleId(sid); } catch (e) {}
          try { await AnnotationResourceStore.removeBySampleId(sid); } catch (e) {}
          try { await VersionSnapshotStore.removeBySampleId(sid); } catch (e) {}
        }
      } else {
        const allSamples = await getAll(STORES.SAMPLES);
        for (const s of allSamples) {
          if (s.photoResourceId) {
            try { await PhotoResourceStore.remove(s.photoResourceId); } catch (e) {}
          }
          if (s.annotationResourceId) {
            try { await AnnotationResourceStore.remove(s.annotationResourceId); } catch (e) {}
          }
        }
        await clearStore(STORES.SAMPLES);
        await clearStore(STORES.PHOTOS);
        await clearStore(STORES.ANNOTATIONS);
        await clearStore(STORES.PHOTO_RESOURCES);
        await clearStore(STORES.ANNOTATION_RESOURCES);
        await clearStore(STORES.VERSION_SNAPSHOTS);
      }
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
    async getAll(projectId = null) {
      let tasks;
      if (projectId) {
        tasks = await getByIndex(STORES.TASKS, "projectId", projectId);
      } else {
        tasks = await getAll(STORES.TASKS);
      }
      return tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getById(id) {
      return getById(STORES.TASKS, id);
    },

    async add(task) {
      const taskData = { ...task };
      if (!taskData.projectId) {
        taskData.projectId = DEFAULT_PROJECT_ID;
      }
      return put(STORES.TASKS, taskData);
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

    async clearAll(projectId = null) {
      if (projectId) {
        await initDB();
        const store = getStore(STORES.TASKS, "readwrite");
        const index = store.index("projectId");
        return new Promise((resolve, reject) => {
          const request = index.openCursor(projectId);
          request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            } else {
              resolve();
            }
          };
          request.onerror = () => reject(request.error);
        });
      } else {
        return clearStore(STORES.TASKS);
      }
    }
  };

  const AnswerStore = {
    async getAll(projectId = null) {
      let answers;
      if (projectId) {
        answers = await getByIndex(STORES.STUDENT_ANSWERS, "projectId", projectId);
      } else {
        answers = await getAll(STORES.STUDENT_ANSWERS);
      }
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
        projectId: answer.projectId || DEFAULT_PROJECT_ID,
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
        projectId: a.projectId || DEFAULT_PROJECT_ID,
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

    async clearAll(projectId = null) {
      if (projectId) {
        await initDB();
        const store = getStore(STORES.STUDENT_ANSWERS, "readwrite");
        const index = store.index("projectId");
        return new Promise((resolve, reject) => {
          const request = index.openCursor(projectId);
          request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            } else {
              resolve();
            }
          };
          request.onerror = () => reject(request.error);
        });
      } else {
        return clearStore(STORES.STUDENT_ANSWERS);
      }
    }
  };

  const VersionStore = {
    async getBySampleId(sampleId) {
      const versions = await getByIndex(STORES.VERSION_HISTORY, "sampleId", sampleId);
      return versions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    },

    async add(versionRecord) {
      return put(STORES.VERSION_HISTORY, versionRecord);
    },

    async bulkAdd(records) {
      return bulkPut(STORES.VERSION_HISTORY, records);
    },

    async remove(id) {
      return remove(STORES.VERSION_HISTORY, id);
    },

    async removeBySampleId(sampleId) {
      const records = await this.getBySampleId(sampleId);
      for (const r of records) {
        await remove(STORES.VERSION_HISTORY, r.id);
      }
    },

    async getAll() {
      const all = await getAll(STORES.VERSION_HISTORY);
      return all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },

    async clearAll() {
      return clearStore(STORES.VERSION_HISTORY);
    }
  };

  const RecycleStore = {
    async getAll(projectId = null) {
      let items;
      if (projectId) {
        items = await getByIndex(STORES.RECYCLE_BIN, "projectId", projectId);
      } else {
        items = await getAll(STORES.RECYCLE_BIN);
      }
      return items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    },

    async getById(id) {
      return getById(STORES.RECYCLE_BIN, id);
    },

    async add(item) {
      const itemData = { ...item };
      if (!itemData.projectId) {
        itemData.projectId = DEFAULT_PROJECT_ID;
      }
      return put(STORES.RECYCLE_BIN, itemData);
    },

    async bulkAdd(items) {
      const itemDataList = items.map(item => ({
        ...item,
        projectId: item.projectId || DEFAULT_PROJECT_ID
      }));
      return bulkPut(STORES.RECYCLE_BIN, itemDataList);
    },

    async remove(id) {
      return remove(STORES.RECYCLE_BIN, id);
    },

    async removeBySampleId(sampleId) {
      const items = await getByIndex(STORES.RECYCLE_BIN, "sampleId", sampleId);
      for (const item of items) {
        await remove(STORES.RECYCLE_BIN, item.id);
      }
    },

    async clearAll(projectId = null) {
      if (projectId) {
        await initDB();
        const store = getStore(STORES.RECYCLE_BIN, "readwrite");
        const index = store.index("projectId");
        return new Promise((resolve, reject) => {
          const request = index.openCursor(projectId);
          request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            } else {
              resolve();
            }
          };
          request.onerror = () => reject(request.error);
        });
      } else {
        return clearStore(STORES.RECYCLE_BIN);
      }
    }
  };

  async function computeChecksum(data) {
    if (!data) return "empty";
    try {
      if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(typeof data === "string" ? data : JSON.stringify(data));
        const hashBuffer = await window.crypto.subtle.digest("SHA-1", buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) {}
    let hash = 0;
    const str = typeof data === "string" ? data : JSON.stringify(data);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  const PhotoResourceStore = {
    async getAll() {
      return getAll(STORES.PHOTO_RESOURCES);
    },

    async getById(id) {
      return getById(STORES.PHOTO_RESOURCES, id);
    },

    async getBySampleId(sampleId) {
      return getByIndex(STORES.PHOTO_RESOURCES, "sampleId", sampleId);
    },

    async getByChecksum(checksum) {
      return getByIndex(STORES.PHOTO_RESOURCES, "checksum", checksum);
    },

    async add(sampleId, photoData) {
      if (!photoData) return null;
      const checksum = await computeChecksum(photoData);
      const existingByChecksum = await this.getByChecksum(checksum);
      if (existingByChecksum.length > 0) {
        return existingByChecksum[0];
      }
      const resource = {
        id: crypto.randomUUID(),
        sampleId,
        data: photoData,
        checksum,
        createdAt: new Date().toISOString()
      };
      await put(STORES.PHOTO_RESOURCES, resource);
      return resource;
    },

    async update(id, updates) {
      const existing = await this.getById(id);
      if (!existing) throw new Error("Photo resource not found");
      const updated = { ...existing, ...updates };
      if (updates.data !== undefined) {
        updated.checksum = await computeChecksum(updates.data);
      }
      await put(STORES.PHOTO_RESOURCES, updated);
      return updated;
    },

    async remove(id) {
      return remove(STORES.PHOTO_RESOURCES, id);
    },

    async removeBySampleId(sampleId) {
      const resources = await this.getBySampleId(sampleId);
      for (const r of resources) {
        await this.remove(r.id);
      }
    }
  };

  const AnnotationResourceStore = {
    async getAll() {
      return getAll(STORES.ANNOTATION_RESOURCES);
    },

    async getById(id) {
      return getById(STORES.ANNOTATION_RESOURCES, id);
    },

    async getBySampleId(sampleId) {
      return getByIndex(STORES.ANNOTATION_RESOURCES, "sampleId", sampleId);
    },

    async add(sampleId, annotations) {
      const annArray = Array.isArray(annotations) ? annotations : [];
      const resource = {
        id: crypto.randomUUID(),
        sampleId,
        annotations: annArray,
        checksum: await computeChecksum(annArray),
        createdAt: new Date().toISOString()
      };
      await put(STORES.ANNOTATION_RESOURCES, resource);
      return resource;
    },

    async update(id, updates) {
      const existing = await this.getById(id);
      if (!existing) throw new Error("Annotation resource not found");
      const updated = { ...existing, ...updates };
      if (updates.annotations !== undefined) {
        updated.checksum = await computeChecksum(updates.annotations);
      }
      await put(STORES.ANNOTATION_RESOURCES, updated);
      return updated;
    },

    async remove(id) {
      return remove(STORES.ANNOTATION_RESOURCES, id);
    },

    async removeBySampleId(sampleId) {
      const resources = await this.getBySampleId(sampleId);
      for (const r of resources) {
        await this.remove(r.id);
      }
    }
  };

  const VersionSnapshotStore = {
    async getAll() {
      return getAll(STORES.VERSION_SNAPSHOTS);
    },

    async getById(id) {
      return getById(STORES.VERSION_SNAPSHOTS, id);
    },

    async getBySampleId(sampleId) {
      return getByIndex(STORES.VERSION_SNAPSHOTS, "sampleId", sampleId);
    },

    async add(snapshot) {
      const record = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...snapshot
      };
      await put(STORES.VERSION_SNAPSHOTS, record);
      return record;
    },

    async remove(id) {
      return remove(STORES.VERSION_SNAPSHOTS, id);
    },

    async removeBySampleId(sampleId) {
      const snapshots = await this.getBySampleId(sampleId);
      for (const s of snapshots) {
        await this.remove(s.id);
      }
    }
  };

  const AppStateStore = {
    async getCompareList(projectId = DEFAULT_PROJECT_ID) {
      return getAppState(`compareList_${projectId}`, []);
    },

    async setCompareList(list, projectId = DEFAULT_PROJECT_ID) {
      return setAppState(`compareList_${projectId}`, list);
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
    },

    async getProjectMigrationStatus() {
      return getAppState("projectMigrationDone", false);
    },

    async setProjectMigrationStatus(done) {
      return setAppState("projectMigrationDone", done);
    },

    async getResourceMigrationStatus() {
      return getAppState("resourceMigrationDone", false);
    },

    async setResourceMigrationStatus(done) {
      return setAppState("resourceMigrationDone", done);
    },

    async getResourceMigrationProgress() {
      return getAppState("resourceMigrationProgress", { processed: 0, total: 0, phase: "idle" });
    },

    async setResourceMigrationProgress(progress) {
      return setAppState("resourceMigrationProgress", progress);
    },

    async getCurrentProjectId() {
      return getAppState("currentProjectId", DEFAULT_PROJECT_ID);
    },

    async setCurrentProjectId(projectId) {
      return setAppState("currentProjectId", projectId);
    },

    async getFilterViews(projectId = DEFAULT_PROJECT_ID) {
      return getAppState(`filterViews_${projectId}`, []);
    },

    async setFilterViews(views, projectId = DEFAULT_PROJECT_ID) {
      return setAppState(`filterViews_${projectId}`, views);
    },

    async addFilterView(view, projectId = DEFAULT_PROJECT_ID) {
      const views = await this.getFilterViews(projectId);
      views.push({
        id: view.id || crypto.randomUUID(),
        name: view.name,
        mineral: view.mineral || "",
        polarization: view.polarization || "",
        reviewStatus: view.reviewStatus || "",
        createdAt: new Date().toISOString()
      });
      return this.setFilterViews(views, projectId);
    },

    async deleteFilterView(viewId, projectId = DEFAULT_PROJECT_ID) {
      const views = await this.getFilterViews(projectId);
      const filtered = views.filter(v => v.id !== viewId);
      return this.setFilterViews(filtered, projectId);
    },

    async getSampleGroups(projectId = DEFAULT_PROJECT_ID) {
      return getAppState(`sampleGroups_${projectId}`, []);
    },

    async setSampleGroups(groups, projectId = DEFAULT_PROJECT_ID) {
      return setAppState(`sampleGroups_${projectId}`, groups);
    },

    async addSampleGroup(group, projectId = DEFAULT_PROJECT_ID) {
      const groups = await this.getSampleGroups(projectId);
      const groupId = group.id || crypto.randomUUID();
      const existingIdx = groups.findIndex(g => g.id === groupId);
      const newGroup = {
        id: groupId,
        name: group.name || "",
        sampleIds: group.sampleIds || [],
        createdAt: group.createdAt || new Date().toISOString()
      };
      if (existingIdx !== -1) {
        const mergedSampleIds = [...new Set([...(groups[existingIdx].sampleIds || []), ...(newGroup.sampleIds || [])])];
        groups[existingIdx] = { ...groups[existingIdx], ...newGroup, sampleIds: mergedSampleIds };
        await this.setSampleGroups(groups, projectId);
        return groups[existingIdx];
      }
      groups.push(newGroup);
      await this.setSampleGroups(groups, projectId);
      return newGroup;
    },

    async updateSampleGroup(groupId, updates, projectId = DEFAULT_PROJECT_ID) {
      const groups = await this.getSampleGroups(projectId);
      const idx = groups.findIndex(g => g.id === groupId);
      if (idx === -1) return null;
      groups[idx] = { ...groups[idx], ...updates };
      await this.setSampleGroups(groups, projectId);
      return groups[idx];
    },

    async deleteSampleGroup(groupId, projectId = DEFAULT_PROJECT_ID) {
      const groups = await this.getSampleGroups(projectId);
      const filtered = groups.filter(g => g.id !== groupId);
      await this.setSampleGroups(filtered, projectId);
    }
  };

  async function exportProjectData(projectId, options = {}) {
    const { includeHistory = true, includeRecycleBin = true } = options;

    await initDB();

    const project = await ProjectStore.getById(projectId);
    if (!project) throw new Error("Project not found");

    const samples = await SampleStore.getAll(projectId);
    const tasks = await TaskStore.getAll(projectId);
    const photoResources = await PhotoResourceStore.getAll();
    const annotationResources = await AnnotationResourceStore.getAll();
    const oldPhotos = await getAll(STORES.PHOTOS);
    const oldAnnotations = await getAll(STORES.ANNOTATIONS);

    const sampleIds = new Set(samples.map(s => s.id));

    const samplesWithPhotos = [];
    for (const s of samples) {
      let photoData = "";
      let annotationsData = [];

      if (s.photoResourceId) {
        const pr = photoResources.find(p => p.id === s.photoResourceId);
        if (pr) photoData = pr.data;
      }
      if (!photoData) {
        const oldPhoto = oldPhotos.find(p => p.sampleId === s.id);
        if (oldPhoto) photoData = oldPhoto.data;
      }

      if (s.annotationResourceId) {
        const ar = annotationResources.find(a => a.id === s.annotationResourceId);
        if (ar) annotationsData = ar.annotations || [];
      }
      if (!annotationsData || annotationsData.length === 0) {
        annotationsData = oldAnnotations.filter(a => a.sampleId === s.id);
      }

      const sampleExport = { ...s };
      if (includeHistory) {
        sampleExport.photo = photoData;
        sampleExport.annotations = annotationsData;
      } else {
        sampleExport.photo = "";
        sampleExport.annotations = [];
      }
      samplesWithPhotos.push(sampleExport);
    }

    const compareList = await AppStateStore.getCompareList(projectId);
    const filteredCompare = compareList.filter(id => sampleIds.has(id));
    const filterViews = await AppStateStore.getFilterViews(projectId);
    const sampleGroups = await AppStateStore.getSampleGroups(projectId);

    const submissions = await getAppState(`submissions_${projectId}`, []);
    const rubrics = await getAppState(`rubrics_${projectId}`, []);
    const lessonMetas = await getAppState(`lessonMetas_${projectId}`, {});

    const result = {
      format: "wxyy-thin-section-project-backup",
      version: 2,
      exportDate: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        meta: project.meta || {}
      },
      samples: samplesWithPhotos,
      tasks: tasks,
      sampleGroups: sampleGroups,
      appState: {
        compareList: filteredCompare,
        filterViews: filterViews
      }
    };

    if (includeHistory) {
      const allHistory = await VersionStore.getAll();
      result.versionHistory = allHistory.filter(v => sampleIds.has(v.sampleId));
    }

    if (includeRecycleBin) {
      result.recycleBin = await RecycleStore.getAll(projectId);
    }

    const answers = await AnswerStore.getAll(projectId);
    if (answers.length > 0) {
      result.studentAnswers = answers;
    }

    if (submissions.length > 0 || rubrics.length > 0 || Object.keys(lessonMetas).length > 0) {
      result.lessonGrading = {
        submissions,
        rubrics,
        lessonMetas
      };
    }

    return result;
  }

  async function importProjectData(data, options = {}) {
    await initDB();

    if (!data.project) {
      throw new Error("Invalid project backup: missing project info");
    }

    const newProjectId = options.newProjectId || crypto.randomUUID();
    const idMapping = {};

    const projectRecord = await ProjectStore.add({
      id: newProjectId,
      name: options.renameProject || data.project.name,
      description: data.project.description || "",
      createdAt: new Date().toISOString(),
      meta: {
        ...(data.project.meta || {}),
        importedFrom: data.project.id,
        importedAt: new Date().toISOString()
      }
    });

    const importedSampleIds = [];

    if (data.samples && Array.isArray(data.samples)) {
      const samplesWithNewIds = data.samples.map(s => {
        const oldId = s.id;
        const newId = crypto.randomUUID();
        idMapping[oldId] = newId;
        importedSampleIds.push(newId);
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
      await SampleStore.bulkAdd(samplesWithNewIds);

      if (data.versionHistory && Array.isArray(data.versionHistory)) {
        const historyWithNewIds = data.versionHistory
          .filter(v => idMapping[v.sampleId])
          .map(v => ({
            ...v,
            id: crypto.randomUUID(),
            sampleId: idMapping[v.sampleId]
          }));
        if (historyWithNewIds.length > 0) {
          await VersionStore.bulkAdd(historyWithNewIds);
        }
      }

      if (data.recycleBin && Array.isArray(data.recycleBin)) {
        const recycleWithNewIds = data.recycleBin.map(r => ({
          ...r,
          id: crypto.randomUUID(),
          projectId: newProjectId,
          sampleId: idMapping[r.sampleId] || crypto.randomUUID()
        }));
        if (recycleWithNewIds.length > 0) {
          await RecycleStore.bulkAdd(recycleWithNewIds);
        }
      }
    }

    if (data.tasks && Array.isArray(data.tasks)) {
      for (const task of data.tasks) {
        const newTaskId = crypto.randomUUID();
        idMapping[task.id] = newTaskId;
        await TaskStore.add({
          ...task,
          id: newTaskId,
          projectId: newProjectId,
          sampleIds: (task.sampleIds || []).map(id => idMapping[id] || id),
          completedSamples: (task.completedSamples || []).map(id => idMapping[id] || id)
        });
      }
    }

    if (data.studentAnswers && Array.isArray(data.studentAnswers)) {
      for (const ans of data.studentAnswers) {
        await AnswerStore.save({
          ...ans,
          id: crypto.randomUUID(),
          projectId: newProjectId,
          taskId: idMapping[ans.taskId] || ans.taskId,
          sampleId: idMapping[ans.sampleId] || ans.sampleId
        });
      }
    }

    if (data.lessonGrading) {
      const { submissions, rubrics, lessonMetas } = data.lessonGrading;

      const mappedLessonMetas = {};
      if (lessonMetas && typeof lessonMetas === "object") {
        Object.entries(lessonMetas).forEach(([pkgId, meta]) => {
          const mappedRefAnswers = {};
          if (meta.referenceAnswers && typeof meta.referenceAnswers === "object") {
            Object.entries(meta.referenceAnswers).forEach(([oldSampleId, ref]) => {
              const newSampleId = idMapping[oldSampleId] || oldSampleId;
              mappedRefAnswers[newSampleId] = ref;
            });
          }
          mappedLessonMetas[pkgId] = {
            ...meta,
            referenceAnswers: mappedRefAnswers
          };
        });
        await setAppState(`lessonMetas_${newProjectId}`, mappedLessonMetas);
      }

      if (Array.isArray(rubrics)) {
        await setAppState(`rubrics_${newProjectId}`, rubrics);
      }

      if (Array.isArray(submissions)) {
        const mappedSubmissions = submissions.map(sub => {
          const mappedAnswers = {};
          if (sub.answers && typeof sub.answers === "object") {
            Object.entries(sub.answers).forEach(([oldSampleId, answer]) => {
              const newSampleId = idMapping[oldSampleId] || oldSampleId;
              mappedAnswers[newSampleId] = answer;
            });
          }
          const mappedScores = {};
          if (sub.scores && typeof sub.scores === "object") {
            Object.entries(sub.scores).forEach(([oldSampleId, score]) => {
              const newSampleId = idMapping[oldSampleId] || oldSampleId;
              mappedScores[newSampleId] = score;
            });
          }
          const mappedTasks = (sub.tasks || []).map(task => ({
            ...task,
            id: idMapping[task.id] || task.id,
            sampleIds: (task.sampleIds || []).map(sid => idMapping[sid] || sid),
            completedSamples: (task.completedSamples || []).map(sid => idMapping[sid] || sid)
          }));
          const mappedTaskProgress = {};
          if (sub.taskProgress && typeof sub.taskProgress === "object") {
            Object.entries(sub.taskProgress).forEach(([oldTaskId, progress]) => {
              const newTaskId = idMapping[oldTaskId] || oldTaskId;
              mappedTaskProgress[newTaskId] = {
                ...progress,
                taskId: newTaskId,
                completedSamples: (progress.completedSamples || []).map(sid => idMapping[sid] || sid)
              };
            });
          }
          return {
            ...sub,
            id: sub.id || crypto.randomUUID(),
            answers: mappedAnswers,
            scores: mappedScores,
            tasks: mappedTasks,
            taskProgress: mappedTaskProgress
          };
        });
        await setAppState(`submissions_${newProjectId}`, mappedSubmissions);
      }
    }

    if (data.appState && data.appState.compareList) {
      const mappedCompare = data.appState.compareList.map(id => idMapping[id]).filter(Boolean);
      await AppStateStore.setCompareList(mappedCompare, newProjectId);
    }

    if (data.appState && data.appState.filterViews) {
      const viewsWithNewIds = data.appState.filterViews.map(v => ({
        ...v,
        id: crypto.randomUUID()
      }));
      await AppStateStore.setFilterViews(viewsWithNewIds, newProjectId);
    }

    if (data.sampleGroups && Array.isArray(data.sampleGroups)) {
      const groupIdMapping = {};
      const importedSampleNewIds = new Set(samplesWithNewIds.map(s => s.id));
      const mappedGroups = data.sampleGroups
        .map(g => {
          const newGroupId = g.id || crypto.randomUUID();
          groupIdMapping[g.id] = newGroupId;
          const mappedSampleIds = (g.sampleIds || [])
            .map(sid => idMapping[sid])
            .filter(sid => sid && importedSampleNewIds.has(sid));
          return {
            ...g,
            id: newGroupId,
            sampleIds: mappedSampleIds
          };
        })
        .filter(g => g.sampleIds.length > 0);

      const newIdToOldGroupId = {};
      (data.samples || []).forEach(ds => {
        if (ds.groupId && idMapping[ds.id]) {
          newIdToOldGroupId[idMapping[ds.id]] = ds.groupId;
        }
      });

      for (const s of samplesWithNewIds) {
        const oldGroupId = newIdToOldGroupId[s.id];
        if (oldGroupId && groupIdMapping[oldGroupId]) {
          await SampleStore.update(s.id, { groupId: groupIdMapping[oldGroupId] });
        } else if (s.groupId && !groupIdMapping[s.groupId]) {
          await SampleStore.update(s.id, { groupId: "" });
        }
      }

      if (mappedGroups.length > 0) {
        await AppStateStore.setSampleGroups(mappedGroups, newProjectId);
      }
    }

    if (importedSampleIds.length > 0 && window.DataMigration) {
      try {
        for (const sampleId of importedSampleIds) {
          const sample = await SampleStore.getById(sampleId);
          if (!sample) continue;

          if (!sample.photoResourceId && sample.photo) {
            const photoResource = await PhotoResourceStore.add(sampleId, sample.photo);
            if (photoResource) {
              await SampleStore.update(sampleId, { photoResourceId: photoResource.id });
            }
          }

          if (!sample.annotationResourceId && sample.annotations && sample.annotations.length > 0) {
            const annResource = await AnnotationResourceStore.add(sampleId, sample.annotations);
            if (annResource) {
              await SampleStore.update(sampleId, { annotationResourceId: annResource.id });
            }
          }
        }
      } catch (e) {
        console.warn("导入后资源迁移失败:", e);
      }
    }

    return {
      project: projectRecord,
      sampleCount: (data.samples || []).length,
      taskCount: (data.tasks || []).length
    };
  }

  async function exportAllData(options = {}) {
    const { includeHistory = true, includeRecycleBin = true } = options;

    await initDB();

    const projects = await ProjectStore.getAll(true);
    const allResult = { projects: [] };

    for (const project of projects) {
      const projectData = await exportProjectData(project.id, options);
      allResult.projects.push(projectData);
    }

    return {
      version: DB_VERSION,
      exportDate: new Date().toISOString(),
      format: "wxyy-thin-section-full-backup",
      ...allResult
    };
  }

  async function importAllData(data, options = {}) {
    const { merge = false } = options;

    await initDB();

    if (!merge) {
      await clearAllData();
    }

    if (data.format === "wxyy-thin-section-project-backup" && data.project) {
      await importProjectData(data, options);
      return true;
    }

    if (data.format === "wxyy-thin-section-full-backup" && data.projects) {
      for (const projData of data.projects) {
        await importProjectData(projData, options);
      }
      return true;
    }

    if (data.samples && Array.isArray(data.samples)) {
      const defaultProject = await ProjectStore.getById(DEFAULT_PROJECT_ID);
      if (!defaultProject) {
        await ProjectStore.add({
          id: DEFAULT_PROJECT_ID,
          name: "默认项目",
          description: "自动创建的默认项目",
          createdAt: new Date().toISOString()
        });
      }
      const samplesWithProject = data.samples.map(s => ({
        ...s,
        projectId: DEFAULT_PROJECT_ID
      }));
      await SampleStore.bulkAdd(samplesWithProject);
    }

    if (data.tasks && Array.isArray(data.tasks)) {
      for (const task of data.tasks) {
        await TaskStore.add({ ...task, projectId: DEFAULT_PROJECT_ID });
      }
    }

    if (data.versionHistory && Array.isArray(data.versionHistory)) {
      await VersionStore.bulkAdd(data.versionHistory);
    }

    if (data.recycleBin && Array.isArray(data.recycleBin)) {
      const recycleWithProject = data.recycleBin.map(r => ({
        ...r,
        projectId: DEFAULT_PROJECT_ID
      }));
      await RecycleStore.bulkAdd(recycleWithProject);
    }

    if (data.appState) {
      if (data.appState.compareList) {
        await AppStateStore.setCompareList(data.appState.compareList, DEFAULT_PROJECT_ID);
      }
      if (data.appState.filterViews) {
        await AppStateStore.setFilterViews(data.appState.filterViews, DEFAULT_PROJECT_ID);
      }
    }

    return true;
  }

  async function clearAllData() {
    await initDB();
    await clearStore(STORES.PROJECTS);
    await clearStore(STORES.SAMPLES);
    await clearStore(STORES.PHOTOS);
    await clearStore(STORES.PHOTO_RESOURCES);
    await clearStore(STORES.ANNOTATION_RESOURCES);
    await clearStore(STORES.TASKS);
    await clearStore(STORES.ANNOTATIONS);
    await clearStore(STORES.STUDENT_ANSWERS);
    await clearStore(STORES.VERSION_HISTORY);
    await clearStore(STORES.VERSION_SNAPSHOTS);
    await clearStore(STORES.RECYCLE_BIN);
    await clearStore(STORES.APP_STATE);
  }

  global.StorageLayer = {
    DEFAULT_PROJECT_ID,
    initDB,
    STORES,
    DB_NAME,
    DB_VERSION,
    RESOURCE_MODEL_VERSION,
    getAppState,
    setAppState,
    computeChecksum,
    ProjectStore,
    SampleStore,
    PhotoResourceStore,
    AnnotationResourceStore,
    VersionSnapshotStore,
    AnnotationStore,
    AnswerStore,
    TaskStore,
    VersionStore,
    RecycleStore,
    AppStateStore,
    hydrateSampleWithResources,
    exportProjectData,
    importProjectData,
    exportAllData,
    importAllData,
    clearAllData
  };

})(window);
