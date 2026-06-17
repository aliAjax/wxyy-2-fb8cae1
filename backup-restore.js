(function (global) {
  "use strict";

  const BACKUP_FORMAT_VERSION = 3;

  async function computeContentHash(data) {
    try {
      const cleanData = (obj) => {
        if (Array.isArray(obj)) {
          return obj.map(cleanData);
        }
        if (obj && typeof obj === "object") {
          const result = {};
          for (const key of Object.keys(obj).sort()) {
            if (key === "contentHash") continue;
            result[key] = cleanData(obj[key]);
          }
          return result;
        }
        return obj;
      };
      const stableObj = cleanData(data);
      const stableStr = JSON.stringify(stableObj);
      let hash = 0;
      for (let i = 0; i < stableStr.length; i++) {
        const char = stableStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
        try {
          const encoder = new TextEncoder();
          const buffer = encoder.encode(stableStr);
          const hashBuffer = await window.crypto.subtle.digest("SHA-1", buffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        } catch (e) {}
      }
      return Math.abs(hash).toString(16);
    } catch (e) {
      return "unknown";
    }
  }

  function normalizeBackupData(data) {
    if (!data) return null;

    const isProjectBackup = data.format === "wxyy-thin-section-project-backup" && data.project;
    const isFullBackup = data.format === "wxyy-thin-section-full-backup" && data.projects;
    const isLegacyFormat = Array.isArray(data) || (data.samples && !data.format);

    if (isLegacyFormat) {
      const normalized = normalizeLegacyFormat(data);
      return {
        format: "wxyy-thin-section-backup",
        version: 0,
        isLegacy: true,
        ...normalized
      };
    }

    return data;
  }

  function getBackupFormatInfo(data) {
    if (!data) return { type: "invalid" };
    const format = data.format;
    if (data.project && (format === "wxyy-thin-section-project-backup" || format === "wxyy-thin-section-backup")) {
      return { type: "project", project: data.project };
    }
    if (data.projects && (format === "wxyy-thin-section-full-backup" || format === "wxyy-thin-section-backup")) {
      return { type: "full", projectCount: data.projects.length };
    }
    if (Array.isArray(data) || (data.samples && !format)) {
      return { type: "legacy" };
    }
    if (format === "wxyy-thin-section-backup" || data.samples) {
      return { type: "standard" };
    }
    return { type: "unknown" };
  }

  function getLessonPackageInfo(data) {
    const lessonTasks = [];
    const gradingSubmissions = [];

    if (data.tasks && Array.isArray(data.tasks)) {
      data.tasks.forEach(t => {
        if (t.lessonPackageId) {
          lessonTasks.push({
            id: t.id,
            lessonPackageId: t.lessonPackageId,
            title: t.title || t.name,
            sampleCount: (t.sampleIds || []).length
          });
        }
      });
    }

    if (data.projects && Array.isArray(data.projects)) {
      data.projects.forEach(p => {
        const pName = p.project?.name;
        if (p.tasks && Array.isArray(p.tasks)) {
          p.tasks.forEach(t => {
            if (t.lessonPackageId) {
              lessonTasks.push({
                projectName: pName,
                id: t.id,
                lessonPackageId: t.lessonPackageId,
                title: t.title || t.name,
                sampleCount: (t.sampleIds || []).length
              });
            }
          });
        }
        if (p.studentAnswers && Array.isArray(p.studentAnswers)) {
          p.studentAnswers.forEach(sa => {
            gradingSubmissions.push({
              projectName: pName,
              ...sa
            });
          });
        }
      });
    }

    if (data.studentAnswers && Array.isArray(data.studentAnswers)) {
      gradingSubmissions.push(...data.studentAnswers);
    }

    const lessonGrading = data.lessonGrading || {};
    let rubricCount = (lessonGrading.rubrics || []).length;
    let submissionCount = (lessonGrading.submissions || []).length;
    let lessonMetaCount = Object.keys(lessonGrading.lessonMetas || {}).length;

    if (data.projects && Array.isArray(data.projects)) {
      data.projects.forEach(p => {
        const pg = p.lessonGrading || {};
        rubricCount += (pg.rubrics || []).length;
        submissionCount += (pg.submissions || []).length;
        lessonMetaCount += Object.keys(pg.lessonMetas || {}).length;
      });
    }

    return {
      lessonTaskCount: lessonTasks.length,
      lessonTasks,
      gradingSubmissionCount: gradingSubmissions.length,
      rubricCount,
      submissionCount,
      lessonMetaCount
    };
  }

  async function analyzeBackupForPreview(fileOrData) {
    let data;
    let fileName = null;

    if (fileOrData instanceof File) {
      fileName = fileOrData.name;
      data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            resolve(JSON.parse(e.target.result));
          } catch (err) {
            reject(new Error("文件格式错误，不是有效的 JSON"));
          }
        };
        reader.onerror = () => reject(new Error("文件读取失败"));
        reader.readAsText(fileOrData, "UTF-8");
      });
    } else {
      data = fileOrData;
    }

    const normalized = normalizeBackupData(data);
    const formatInfo = getBackupFormatInfo(data);

    if (formatInfo.type === "invalid" || formatInfo.type === "unknown") {
      throw new Error("无效的备份文件格式");
    }

    const summary = getBackupSummary(normalized);
    const lessonInfo = getLessonPackageInfo(normalized);
    const contentHash = await computeContentHash(data);

    const sampleCodes = [];
    const duplicateSampleCodes = [];
    const codeCount = new Map();

    if (normalized.samples && Array.isArray(normalized.samples)) {
      normalized.samples.forEach(s => {
        if (s.code) {
          sampleCodes.push(s.code);
          codeCount.set(s.code, (codeCount.get(s.code) || 0) + 1);
        }
      });
    }

    if (normalized.projects && Array.isArray(normalized.projects)) {
      normalized.projects.forEach(p => {
        if (p.samples && Array.isArray(p.samples)) {
          p.samples.forEach(s => {
            if (s.code) {
              sampleCodes.push(s.code);
              codeCount.set(s.code, (codeCount.get(s.code) || 0) + 1);
            }
          });
        }
      });
    }

    codeCount.forEach((count, code) => {
      if (count > 1) {
        duplicateSampleCodes.push({ code, count });
      }
    });

    let currentProjectNames = [];
    try {
      if (window.ProjectManager && window.ProjectManager.getProjects) {
        currentProjectNames = window.ProjectManager.getProjects().map(p => p.name);
      } else if (window.StorageLayer && window.StorageLayer.ProjectStore) {
        const allProjects = await window.StorageLayer.ProjectStore.getAll(true);
        currentProjectNames = allProjects.map(p => p.name);
      }
    } catch (e) {}

    const risks = [];
    const warnings = [];

    if (normalized.version && normalized.version > BACKUP_FORMAT_VERSION) {
      risks.push({
        type: "version_too_high",
        severity: "error",
        title: "备份版本过高",
        message: `该备份文件版本为 v${normalized.version}，当前应用仅支持到 v${BACKUP_FORMAT_VERSION}，请更新应用后再尝试恢复。`
      });
    }

    if (data.contentHash && data.contentHash !== contentHash) {
      risks.push({
        type: "hash_mismatch",
        severity: "warning",
        title: "内容哈希异常",
        message: "备份文件内容与记录的哈希值不一致，文件可能已损坏或被篡改。建议谨慎恢复。"
      });
    }

    if (data.contentHash && data.contentHash === contentHash) {
      warnings.push({
        type: "hash_valid",
        severity: "info",
        title: "内容哈希校验通过",
        message: "备份文件完整性校验通过，数据未被篡改。"
      });
    }

    if (duplicateSampleCodes.length > 0) {
      warnings.push({
        type: "duplicate_sample_codes",
        severity: "warning",
        title: "样本编号重复",
        message: `备份中存在 ${duplicateSampleCodes.length} 组重复的样本编号：${duplicateSampleCodes.map(d => `${d.code}(${d.count}次)`).join("、")}。导入后可能需要手动处理。`,
        details: duplicateSampleCodes
      });
    }

    let conflictingProjects = [];
    if (formatInfo.type === "project" && formatInfo.project) {
      const projectName = formatInfo.project.name;
      if (currentProjectNames.includes(projectName)) {
        conflictingProjects.push(projectName);
        risks.push({
          type: "project_name_conflict",
          severity: "warning",
          title: "项目名称冲突",
          message: `已存在同名项目「${projectName}」，需要选择新建、重命名或覆盖策略。`,
          projectName
        });
      }
    } else if (formatInfo.type === "full" && normalized.projects) {
      normalized.projects.forEach(p => {
        const pName = p.project?.name;
        if (pName && currentProjectNames.includes(pName)) {
          conflictingProjects.push(pName);
        }
      });
      if (conflictingProjects.length > 0) {
        risks.push({
          type: "project_name_conflict",
          severity: "warning",
          title: "项目名称冲突",
          message: `有 ${conflictingProjects.length} 个项目名称与现有项目冲突：${conflictingProjects.join("、")}。导入时将自动重命名。`,
          projectNames: conflictingProjects
        });
      }
    } else if (normalized.isLegacy) {
      const legacyDefaultName = summary.projectName || "旧版导入项目";
      if (currentProjectNames.includes(legacyDefaultName)) {
        conflictingProjects.push(legacyDefaultName);
        risks.push({
          type: "project_name_conflict",
          severity: "warning",
          title: "项目名称冲突",
          message: `已存在同名项目「${legacyDefaultName}」，建议重命名导入。`,
          projectName: legacyDefaultName
        });
      }
    }

    if (normalized.isLegacy) {
      warnings.push({
        type: "legacy_format",
        severity: "info",
        title: "旧版备份格式",
        message: "该备份文件为旧版格式，将自动转换后导入。部分高级功能数据可能不完整。"
      });
    }

    return {
      fileName,
      formatInfo,
      summary,
      lessonInfo,
      contentHash,
      sampleCodes,
      duplicateSampleCodes,
      conflictingProjects,
      currentProjectNames,
      risks,
      warnings,
      normalizedData: normalized,
      rawData: data,
      hasErrors: risks.some(r => r.severity === "error"),
      hasWarnings: risks.length > 0 || warnings.length > 0
    };
  }

  async function importBackupWithStrategy(file, strategy, options = {}) {
    const { renameProject = null, overwriteProjectId = null, onProgress = null } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const normalized = normalizeBackupData(data);

          if (onProgress) onProgress(0.1, "验证数据格式");

          if (normalized.version && normalized.version > BACKUP_FORMAT_VERSION) {
            throw new Error(`备份文件版本过高 (v${normalized.version})，请更新应用`);
          }

          const formatInfo = getBackupFormatInfo(data);
          let result;

          if (formatInfo.type === "project") {
            if (strategy === "overwrite" && overwriteProjectId) {
              if (onProgress) onProgress(0.15, "删除同名项目数据");
              try {
                if (window.ProjectManager && window.ProjectManager.deleteProject) {
                  await window.ProjectManager.deleteProject(overwriteProjectId);
                } else if (window.StorageLayer && window.StorageLayer.ProjectStore) {
                  await window.StorageLayer.ProjectStore.remove(overwriteProjectId);
                }
              } catch (e) {
                console.warn("删除旧项目失败，将继续导入:", e);
              }
            }

            const importOptions = {};
            if (strategy === "rename" && renameProject) {
              importOptions.renameProject = renameProject;
            }

            if (onProgress) onProgress(0.3, "导入项目数据");
            result = await window.StorageLayer.importProjectData(data, importOptions);

            if (window.ProjectManager && window.ProjectManager.refreshProjectsCache) {
              await window.ProjectManager.refreshProjectsCache();
            }

            if (onProgress) onProgress(1.0, "导入完成");
            resolve({
              success: true,
              sampleCount: result.sampleCount,
              taskCount: result.taskCount,
              project: result.project,
              strategy,
              renamedTo: strategy === "rename" ? renameProject : null
            });
            return;
          }

          if (formatInfo.type === "full" && data.projects) {
            const totalProjects = data.projects.length;
            for (let i = 0; i < totalProjects; i++) {
              if (onProgress) onProgress(0.2 + (i / totalProjects) * 0.7, `导入项目 ${i + 1}/${totalProjects}`);
              const projData = data.projects[i];
              const projName = projData.project?.name;
              let importOptions = {};

              if (projName && options.conflictingProjectNames?.includes(projName)) {
                if (strategy === "overwrite") {
                  const existingProject = (window.ProjectManager?.getProjects?.() || []).find(p => p.name === projName);
                  if (existingProject) {
                    try {
                      if (window.ProjectManager?.deleteProject) {
                        await window.ProjectManager.deleteProject(existingProject.id);
                      }
                    } catch (e) {}
                  }
                } else if (strategy === "rename") {
                  importOptions.renameProject = `${projName} (导入-${new Date().toLocaleDateString()})`;
                }
              }

              await window.StorageLayer.importProjectData(projData, importOptions);
            }
            if (window.ProjectManager?.refreshProjectsCache) {
              await window.ProjectManager.refreshProjectsCache();
            }
            if (onProgress) onProgress(1.0, "导入完成");
            resolve({
              success: true,
              projectCount: totalProjects,
              strategy
            });
            return;
          }

          if (window.ProjectManager) {
            const customName = strategy === "rename" ? renameProject : null;
            if (onProgress) onProgress(0.3, "导入为新项目");
            result = await importAsNewProject(normalized, customName);
            if (onProgress) onProgress(1.0, "导入完成");
            resolve({ ...result, strategy });
            return;
          }

          if (onProgress) onProgress(0.4, "准备导入数据");
          await window.StorageLayer.importAllData(normalized, { merge: strategy === "merge" });
          if (onProgress) onProgress(1.0, "导入完成");
          resolve({
            success: true,
            sampleCount: normalized.samples?.length || 0,
            taskCount: normalized.tasks?.length || 0,
            strategy
          });

        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsText(file, "UTF-8");
    });
  }

  async function exportBackup(options = {}) {
    const { includePhotos = true, includeHistory = true } = options;

    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    const projectId = window.ProjectManager
      ? window.ProjectManager.getCurrentProjectId()
      : window.StorageLayer.DEFAULT_PROJECT_ID;

    let backupData;

    if (projectId && window.ProjectManager) {
      const data = await window.ProjectManager.exportProjectBackup(projectId);
      if (!includePhotos) {
        data.samples = (data.samples || []).map(s => ({ ...s, photo: "" }));
      }
      backupData = {
        ...data,
        format: "wxyy-thin-section-backup",
        version: BACKUP_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        includeHistory
      };
    } else {
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

      backupData = {
        format: "wxyy-thin-section-backup",
        version: BACKUP_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        includeHistory,
        ...allData
      };
    }

    const contentHash = await computeContentHash(backupData);
    backupData.contentHash = contentHash;

    return backupData;
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
    let samplesWithNewIds = [];

    const projectName = customName || `导入项目-${new Date().toLocaleDateString()}`;

    const projectRecord = await window.StorageLayer.ProjectStore.add({
      id: newProjectId,
      name: projectName,
      description: "从备份文件导入",
      createdAt: new Date().toISOString(),
      meta: { importedFromBackup: true, importedAt: new Date().toISOString() }
    });

    if (data.samples && Array.isArray(data.samples)) {
      samplesWithNewIds = data.samples.map(s => {
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
    const format = data?.format;
    if (data.project && (format === "wxyy-thin-section-project-backup" || format === "wxyy-thin-section-backup")) {
      const samples = data.samples || [];
      const tasks = data.tasks || [];
      let photosCount = 0;
      let annotationsCount = 0;
      let reviewedCount = 0;
      samples.forEach(s => {
        if (s.photo) photosCount++;
        if (s.annotations) annotationsCount += s.annotations.length;
        if (s.reviewStatus && s.reviewStatus !== "pending" && s.reviewStatus !== null) reviewedCount++;
      });
      return {
        isProjectBackup: true,
        projectName: data.project.name,
        projectDescription: data.project.description || "",
        sampleCount: samples.length,
        taskCount: tasks.length,
        photosCount,
        annotationsCount,
        reviewedCount,
        sampleGroupCount: (data.sampleGroups || []).length,
        versionHistoryCount: (data.versionHistory || []).length,
        recycleBinCount: (data.recycleBin || []).length,
        studentAnswerCount: (data.studentAnswers || []).length,
        createdAt: data.createdAt || data.exportDate || null,
        version: data.version || null,
        includeHistory: data.includeHistory !== false
      };
    }

    if (data.projects && (format === "wxyy-thin-section-full-backup" || format === "wxyy-thin-section-backup")) {
      let totalSamples = 0;
      let totalTasks = 0;
      let totalPhotos = 0;
      let totalAnnotations = 0;
      let totalReviewed = 0;
      let totalVersionHistory = 0;
      let totalRecycleBin = 0;
      let totalSampleGroups = 0;
      let totalStudentAnswers = 0;
      const projectNames = [];
      data.projects.forEach(p => {
        projectNames.push(p.project?.name || "(未命名项目)");
        const pSamples = p.samples || [];
        totalSamples += pSamples.length;
        totalTasks += (p.tasks || []).length;
        totalSampleGroups += (p.sampleGroups || []).length;
        totalVersionHistory += (p.versionHistory || []).length;
        totalRecycleBin += (p.recycleBin || []).length;
        totalStudentAnswers += (p.studentAnswers || []).length;
        pSamples.forEach(s => {
          if (s.photo) totalPhotos++;
          if (s.annotations) totalAnnotations += s.annotations.length;
          if (s.reviewStatus && s.reviewStatus !== "pending" && s.reviewStatus !== null) totalReviewed++;
        });
      });
      return {
        isFullBackup: true,
        projectCount: data.projects.length,
        projectNames,
        sampleCount: totalSamples,
        taskCount: totalTasks,
        photosCount: totalPhotos,
        annotationsCount: totalAnnotations,
        reviewedCount: totalReviewed,
        sampleGroupCount: totalSampleGroups,
        versionHistoryCount: totalVersionHistory,
        recycleBinCount: totalRecycleBin,
        studentAnswerCount: totalStudentAnswers,
        createdAt: data.createdAt || data.exportDate || null,
        version: data.version || null,
        includeHistory: data.includeHistory !== false
      };
    }

    const samples = data.samples || [];
    const tasks = data.tasks || [];
    const versionHistory = data.versionHistory || [];
    const recycleBin = data.recycleBin || [];
    const sampleGroups = data.sampleGroups || [];
    const studentAnswers = data.studentAnswers || [];

    let photosCount = 0;
    let annotationsCount = 0;
    let reviewedCount = 0;

    samples.forEach(s => {
      if (s.photo) photosCount++;
      if (s.annotations) annotationsCount += s.annotations.length;
      if (s.reviewStatus && s.reviewStatus !== "pending" && s.reviewStatus !== null) reviewedCount++;
    });

    const projectName = data.project?.name
      || (data.isLegacy ? "旧版导入项目" : null);
    const projectDescription = data.project?.description || "";

    return {
      isLegacy: !!data.isLegacy,
      projectName,
      projectDescription,
      sampleCount: samples.length,
      taskCount: tasks.length,
      photosCount,
      annotationsCount,
      reviewedCount,
      sampleGroupCount: sampleGroups.length,
      versionHistoryCount: versionHistory.length,
      recycleBinCount: recycleBin.length,
      studentAnswerCount: studentAnswers.length,
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
    getStorageStats,
    computeContentHash,
    normalizeBackupData,
    getBackupFormatInfo,
    getLessonPackageInfo,
    analyzeBackupForPreview,
    importBackupWithStrategy
  };

})(window);
