(function (global) {
  "use strict";

  const BACKUP_FORMAT_VERSION = 3;

  async function exportBackup(options = {}) {
    const { includePhotos = true, includeHistory = true } = options;

    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    const projectId = window.ProjectManager
      ? window.ProjectManager.getCurrentProjectId()
      : window.StorageLayer.DEFAULT_PROJECT_ID;

    if (projectId && window.ProjectManager) {
      const data = await window.ProjectManager.exportProjectBackup(projectId);
      if (!includePhotos) {
        data.samples = (data.samples || []).map(s => ({ ...s, photo: "" }));
      }
      return {
        ...data,
        format: "wxyy-thin-section-backup",
        version: BACKUP_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        includeHistory
      };
    }

    const allData = await window.StorageLayer.exportAllData({
      includeHistory,
      includeRecycleBin: includeHistory
    });

    if (!includePhotos && allData.projects) {
      allData.projects = allData.projects.map(p => ({
        ...p,
        samples: (p.samples || []).map(s => ({ ...s, photo: "" }))
      }));
    }

    return {
      format: "wxyy-thin-section-backup",
      version: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      includeHistory,
      ...allData
    };
  }

  async function downloadBackup(filename = null) {
    const backup = await exportBackup();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });

    const dateStr = new Date().toISOString().slice(0, 10);
    let actualFilename = filename;

    if (!actualFilename && window.ProjectManager) {
      const project = await window.ProjectManager.getCurrentProject();
      if (project) {
        const safeName = (project.name || "project").replace(/[^\w\u4e00-\u9fa5-]/g, "_");
        actualFilename = `project-${safeName}-${dateStr}.json`;
      }
    }

    if (!actualFilename) {
      actualFilename = `thin-section-backup-${dateStr}.json`;
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = actualFilename;
    link.click();
    URL.revokeObjectURL(link.href);

    if (window.ProjectManager && window.ProjectManager.updateLastBackupTime) {
      const projectId = window.ProjectManager.getCurrentProjectId();
      if (projectId) {
        try {
          await window.ProjectManager.updateLastBackupTime(projectId);
        } catch (e) {
          console.warn("更新备份时间失败:", e);
        }
      }
    }

    return backup;
  }

  async function importBackupFile(file, options = {}) {
    const { merge = false, onProgress = null, renameProject = null } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const result = await validateAndImport(data, { merge, onProgress, renameProject });
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsText(file, "UTF-8");
    });
  }

  async function validateAndImport(data, options = {}) {
    const { merge = false, onProgress = null, renameProject = null } = options;

    if (!data) {
      throw new Error("备份数据为空");
    }

    const isProjectBackup = data.format === "wxyy-thin-section-project-backup" && data.project;
    const isFullBackup = data.format === "wxyy-thin-section-full-backup" && data.projects;
    const isLegacyFormat = Array.isArray(data) || (data.samples && !data.format);

    if (onProgress) onProgress(0.1, "验证数据格式");

    if (isProjectBackup) {
      if (window.ProjectManager && window.StorageLayer) {
        const result = await window.StorageLayer.importProjectData(data, { renameProject });
        if (window.ProjectManager.refreshProjectsCache) {
          await window.ProjectManager.refreshProjectsCache();
        }
        if (onProgress) onProgress(1.0, "导入完成");
        return {
          success: true,
          sampleCount: result.sampleCount,
          taskCount: result.taskCount,
          project: result.project,
          merged: merge
        };
      }
    }

    if (isFullBackup && data.projects) {
      const totalProjects = data.projects.length;
      for (let i = 0; i < totalProjects; i++) {
        if (onProgress) onProgress(0.2 + (i / totalProjects) * 0.7, `导入项目 ${i + 1}/${totalProjects}`);
        await window.StorageLayer.importProjectData(data.projects[i], {});
      }
      if (window.ProjectManager.refreshProjectsCache) {
        await window.ProjectManager.refreshProjectsCache();
      }
      if (onProgress) onProgress(1.0, "导入完成");
      return {
        success: true,
        projectCount: totalProjects,
        merged: merge
      };
    }

    let normalizedData = data;
    if (isLegacyFormat) {
      normalizedData = normalizeLegacyFormat(data);
    } else {
      if (data.format && data.format !== "wxyy-thin-section-backup" && data.format !== "wxyy-thin-section-project-backup") {
        throw new Error("无效的备份文件格式");
      }
      if (data.version > BACKUP_FORMAT_VERSION) {
        throw new Error("备份文件版本过高，请更新应用");
      }
    }

    if (!normalizedData.samples && !normalizedData.projects) {
      throw new Error("备份文件缺少样本数据");
    }

    if (onProgress) onProgress(0.2, "验证数据格式");

    if (window.ProjectManager) {
      const result = await importAsNewProject(normalizedData, renameProject);
      if (onProgress) onProgress(1.0, "导入完成");
      return result;
    }

    const sampleCount = normalizedData.samples?.length || 0;
    const taskCount = normalizedData.tasks?.length || 0;

    if (onProgress) onProgress(0.4, `准备导入 ${sampleCount} 个样本、${taskCount} 个任务`);

    await window.StorageLayer.importAllData(normalizedData, { merge });

    if (onProgress) onProgress(1.0, "导入完成");

    return {
      success: true,
      sampleCount,
      taskCount,
      merged: merge
    };
  }

  async function importAsNewProject(data, customName) {
    const DEFAULT_PROJECT_ID = window.StorageLayer.DEFAULT_PROJECT_ID;
    const newProjectId = crypto.randomUUID();
    const idMapping = {};

    const projectName = customName || `导入项目-${new Date().toLocaleDateString()}`;

    const projectRecord = await window.StorageLayer.ProjectStore.add({
      id: newProjectId,
      name: projectName,
      description: "从备份文件导入",
      createdAt: new Date().toISOString(),
      meta: { importedFromBackup: true, importedAt: new Date().toISOString() }
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

      if (data.versionHistory && Array.isArray(data.versionHistory)) {
        const historyWithNewIds = data.versionHistory
          .filter(v => idMapping[v.sampleId])
          .map(v => ({
            ...v,
            id: crypto.randomUUID(),
            sampleId: idMapping[v.sampleId]
          }));
        if (historyWithNewIds.length > 0) {
          await window.StorageLayer.VersionStore.bulkAdd(historyWithNewIds);
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
          await window.StorageLayer.RecycleStore.bulkAdd(recycleWithNewIds);
        }
      }
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
          s.groupId = groupIdMapping[oldGroupId];
          await window.StorageLayer.SampleStore.update(s.id, { groupId: groupIdMapping[oldGroupId] });
        } else if (s.groupId && !groupIdMapping[s.groupId]) {
          s.groupId = "";
          await window.StorageLayer.SampleStore.update(s.id, { groupId: "" });
        }
      }

      if (mappedGroups.length > 0) {
        await window.StorageLayer.AppStateStore.setSampleGroups(mappedGroups, newProjectId);
      }
    }

    if (data.appState && data.appState.compareList) {
      const mappedCompare = data.appState.compareList.map(id => idMapping[id]).filter(Boolean);
      await window.StorageLayer.AppStateStore.setCompareList(mappedCompare, newProjectId);
    }

    if (data.studentAnswers && Array.isArray(data.studentAnswers)) {
      for (const ans of data.studentAnswers) {
        await window.StorageLayer.AnswerStore.save({
          ...ans,
          id: crypto.randomUUID(),
          projectId: newProjectId,
          taskId: idMapping[ans.taskId] || ans.taskId,
          sampleId: idMapping[ans.sampleId] || ans.sampleId
        });
      }
    }

    if (window.ProjectManager && window.ProjectManager.refreshProjectsCache) {
      await window.ProjectManager.refreshProjectsCache();
    }

    return {
      success: true,
      project: projectRecord,
      sampleCount: (data.samples || []).length,
      taskCount: (data.tasks || []).length,
      merged: false
    };
  }

  function normalizeLegacyFormat(data) {
    let samples = [];
    let tasks = [];
    let compareList = [];
    let sampleGroups = [];

    if (Array.isArray(data)) {
      samples = data.map((s, i) => ({
        id: s.id || `legacy-${i}-${Date.now()}`,
        code: s.code || s["样本编号"] || "",
        location: s.location || s["采样地点"] || "",
        magnification: s.magnification || s["放大倍数"] || "",
        polarization: s.polarization || s["偏光类型"] || "单偏光",
        minerals: s.minerals || s["主要矿物"] || "",
        texture: s.texture || s["颗粒结构"] || "",
        comment: s.comment || s["老师批注"] || "",
        photo: s.photo || s["照片"] || "",
        annotations: s.annotations || [],
        reviewStatus: s.reviewStatus || null,
        reviewComment: s.reviewComment || s["复核意见"] || "",
        reviewedAt: s.reviewedAt || null,
        groupId: s.groupId || "",
        createdAt: s.createdAt || new Date().toISOString()
      }));
    } else {
      samples = (data.samples || []).map((s, i) => ({
        id: s.id || `legacy-${i}-${Date.now()}`,
        ...s,
        groupId: s.groupId || "",
        annotations: s.annotations || []
      }));
      tasks = data.tasks || [];
      compareList = data.compare || [];
      sampleGroups = data.sampleGroups || [];
    }

    const codeGroups = new Map();
    samples.forEach(s => {
      if (!s.code || s.groupId) return;
      if (!codeGroups.has(s.code)) codeGroups.set(s.code, []);
      codeGroups.get(s.code).push(s.id);
    });

    for (const [code, ids] of codeGroups) {
      if (ids.length < 2) continue;
      const related = samples.filter(s => ids.includes(s.id));
      const polars = new Set(related.map(s => s.polarization));
      if (polars.size < 2) continue;
      const groupId = crypto.randomUUID();
      related.forEach(s => { s.groupId = groupId; });
      sampleGroups.push({
        id: groupId,
        name: code,
        sampleIds: ids,
        createdAt: new Date().toISOString()
      });
    }

    return {
      samples,
      tasks,
      sampleGroups,
      appState: {
        compareList
      }
    };
  }

  function getBackupSummary(data) {
    if (data.project && data.format === "wxyy-thin-section-project-backup") {
      const samples = data.samples || [];
      const tasks = data.tasks || [];
      let photosCount = 0;
      let annotationsCount = 0;
      samples.forEach(s => {
        if (s.photo) photosCount++;
        if (s.annotations) annotationsCount += s.annotations.length;
      });
      return {
        isProjectBackup: true,
        projectName: data.project.name,
        projectDescription: data.project.description,
        sampleCount: samples.length,
        taskCount: tasks.length,
        photosCount,
        annotationsCount,
        versionHistoryCount: (data.versionHistory || []).length,
        recycleBinCount: (data.recycleBin || []).length,
        createdAt: data.createdAt || data.exportDate || null,
        version: data.version || null,
        includeHistory: data.includeHistory !== false
      };
    }

    if (data.projects && data.format === "wxyy-thin-section-full-backup") {
      let totalSamples = 0;
      let totalTasks = 0;
      data.projects.forEach(p => {
        totalSamples += (p.samples || []).length;
        totalTasks += (p.tasks || []).length;
      });
      return {
        isFullBackup: true,
        projectCount: data.projects.length,
        sampleCount: totalSamples,
        taskCount: totalTasks,
        createdAt: data.createdAt || data.exportDate || null,
        version: data.version || null
      };
    }

    const samples = data.samples || [];
    const tasks = data.tasks || [];
    const versionHistory = data.versionHistory || [];
    const recycleBin = data.recycleBin || [];

    let photosCount = 0;
    let annotationsCount = 0;

    samples.forEach(s => {
      if (s.photo) photosCount++;
      if (s.annotations) annotationsCount += s.annotations.length;
    });

    return {
      sampleCount: samples.length,
      taskCount: tasks.length,
      photosCount,
      annotationsCount,
      versionHistoryCount: versionHistory.length,
      recycleBinCount: recycleBin.length,
      createdAt: data.createdAt || null,
      version: data.version || null,
      includeHistory: data.includeHistory !== false
    };
  }

  async function getStorageStats() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    const projectId = window.ProjectManager
      ? window.ProjectManager.getCurrentProjectId()
      : window.StorageLayer.DEFAULT_PROJECT_ID;

    const samples = await window.StorageLayer.SampleStore.getAll(projectId);
    const tasks = await window.StorageLayer.TaskStore.getAll(projectId);
    const compareList = await window.StorageLayer.AppStateStore.getCompareList(projectId);

    const approxSize = estimateSize(samples);

    return {
      sampleCount: samples.length,
      taskCount: tasks.length,
      compareCount: compareList.length,
      approxSizeBytes: approxSize,
      approxSizeKB: Math.round(approxSize / 1024),
      approxSizeMB: Math.round((approxSize / (1024 * 1024)) * 100) / 100
    };
  }

  function estimateSize(samples) {
    let size = 0;
    samples.forEach(s => {
      size += JSON.stringify(s).length;
    });
    return size;
  }

  global.BackupRestore = {
    BACKUP_FORMAT_VERSION,
    exportBackup,
    downloadBackup,
    importBackupFile,
    validateAndImport,
    getBackupSummary,
    getStorageStats
  };

})(window);
