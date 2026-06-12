(function (global) {
  "use strict";

  const BACKUP_FORMAT_VERSION = 1;

  async function exportBackup(options = {}) {
    const { includePhotos = true } = options;

    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    const allData = await window.StorageLayer.exportAllData();

    if (!includePhotos) {
      allData.samples = allData.samples.map(s => ({ ...s, photo: "" }));
    }

    const backup = {
      format: "wxyy-thin-section-backup",
      version: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      ...allData
    };

    return backup;
  }

  async function downloadBackup(filename = null) {
    const backup = await exportBackup();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });

    const dateStr = new Date().toISOString().slice(0, 10);
    const actualFilename = filename || `thin-section-backup-${dateStr}.json`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = actualFilename;
    link.click();
    URL.revokeObjectURL(link.href);

    return backup;
  }

  async function importBackupFile(file, options = {}) {
    const { merge = false, onProgress = null } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const result = await validateAndImport(data, { merge, onProgress });
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
    const { merge = false, onProgress = null } = options;

    if (!data) {
      throw new Error("备份数据为空");
    }

    const isLegacyFormat = Array.isArray(data) || (data.samples && !data.format);
    let normalizedData = data;

    if (isLegacyFormat) {
      normalizedData = normalizeLegacyFormat(data);
    } else {
      if (data.format !== "wxyy-thin-section-backup") {
        throw new Error("无效的备份文件格式");
      }
      if (data.version > BACKUP_FORMAT_VERSION) {
        throw new Error("备份文件版本过高，请更新应用");
      }
    }

    if (!normalizedData.samples || !Array.isArray(normalizedData.samples)) {
      throw new Error("备份文件缺少样本数据");
    }

    if (onProgress) onProgress(0.2, "验证数据格式");

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

  function normalizeLegacyFormat(data) {
    let samples = [];
    let tasks = [];
    let compareList = [];

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
        createdAt: s.createdAt || new Date().toISOString()
      }));
    } else {
      samples = (data.samples || []).map((s, i) => ({
        id: s.id || `legacy-${i}-${Date.now()}`,
        ...s,
        annotations: s.annotations || []
      }));
      tasks = data.tasks || [];
      compareList = data.compare || [];
    }

    return {
      samples,
      tasks,
      appState: {
        compareList
      }
    };
  }

  function getBackupSummary(data) {
    const samples = data.samples || [];
    const tasks = data.tasks || [];

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
      createdAt: data.createdAt || null,
      version: data.version || null
    };
  }

  async function getStorageStats() {
    if (!window.StorageLayer) {
      throw new Error("StorageLayer 未加载");
    }

    const samples = await window.StorageLayer.SampleStore.getAll();
    const tasks = await window.StorageLayer.TaskStore.getAll();
    const compareList = await window.StorageLayer.AppStateStore.getCompareList();

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
