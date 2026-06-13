(function (global) {
  "use strict";

  const TRACKED_FIELDS = [
    { key: "code", label: "样本编号" },
    { key: "location", label: "采样地点" },
    { key: "magnification", label: "放大倍数" },
    { key: "polarization", label: "偏光类型" },
    { key: "minerals", label: "主要矿物" },
    { key: "texture", label: "颗粒结构" },
    { key: "comment", label: "老师批注" },
    { key: "observationFeatures", label: "观察特征" },
    { key: "reviewStatus", label: "审核状态" },
    { key: "reviewComment", label: "复核意见" }
  ];

  const CHANGE_TYPE_LABELS = {
    create: "创建样本",
    update: "修改字段",
    review: "审核变更",
    rollback: "回滚操作",
    restore: "从回收站恢复"
  };

  function buildSnapshot(sample) {
    const snapshot = {};
    TRACKED_FIELDS.forEach(f => {
      const val = sample[f.key];
      snapshot[f.key] = Array.isArray(val) ? [...val] : (val ?? "");
    });
    snapshot.photo = sample.photo ? String(sample.photo) : "";
    snapshot.hasPhoto = snapshot.photo.trim().length > 0;
    if (Array.isArray(sample.annotations)) {
      snapshot.annotations = sample.annotations.map(a => ({ ...a }));
      snapshot.annotationCount = sample.annotations.length;
    } else {
      snapshot.annotations = [];
      snapshot.annotationCount = 0;
    }
    return snapshot;
  }

  function detectChanges(oldSnapshot, newSnapshot) {
    const changed = [];
    TRACKED_FIELDS.forEach(f => {
      const oldVal = normalizeValue(oldSnapshot[f.key]);
      const newVal = normalizeValue(newSnapshot[f.key]);
      if (oldVal !== newVal) {
        changed.push(f.key);
      }
    });
    const oldPhoto = String(oldSnapshot.photo || "").trim();
    const newPhoto = String(newSnapshot.photo || "").trim();
    if (oldPhoto !== newPhoto) {
      changed.push("photo");
    } else if (oldSnapshot.hasPhoto !== newSnapshot.hasPhoto) {
      changed.push("hasPhoto");
    }
    const oldAnnJson = JSON.stringify(oldSnapshot.annotations || []);
    const newAnnJson = JSON.stringify(newSnapshot.annotations || []);
    if (oldAnnJson !== newAnnJson) {
      changed.push("annotations");
    } else if (oldSnapshot.annotationCount !== newSnapshot.annotationCount) {
      changed.push("annotationCount");
    }
    return changed;
  }

  function normalizeValue(val) {
    if (val === null || val === undefined) return "";
    if (Array.isArray(val)) return val.join(";");
    return String(val).trim();
  }

  function buildChangeSummary(changedFields) {
    if (!changedFields || changedFields.length === 0) return "无变更";
    const labels = changedFields.map(key => {
      const tracked = TRACKED_FIELDS.find(f => f.key === key);
      if (tracked) return tracked.label;
      if (key === "photo" || key === "hasPhoto") return "照片";
      if (key === "annotations" || key === "annotationCount") return "标注";
      return key;
    });
    const unique = [];
    labels.forEach(l => { if (!unique.includes(l)) unique.push(l); });
    return "变更：" + unique.join("、");
  }

  function detectChangeType(changedFields) {
    if (!changedFields || changedFields.length === 0) return "update";
    const reviewFields = changedFields.every(f => f === "reviewStatus" || f === "reviewComment");
    if (reviewFields) return "review";
    return "update";
  }

  async function recordVersion(sampleId, sample, changeType, previousSnapshot) {
    if (!window.StorageLayer || !window.StorageLayer.VersionStore) return;

    const newSnapshot = buildSnapshot(sample);
    let changedFields = [];

    if (previousSnapshot) {
      changedFields = detectChanges(previousSnapshot, newSnapshot);
      if (changedFields.length === 0 && changeType !== "create") return;
    } else if (changeType !== "create") {
      const existingVersions = await window.StorageLayer.VersionStore.getBySampleId(sampleId);
      if (existingVersions.length > 0) {
        previousSnapshot = existingVersions[existingVersions.length - 1].snapshot;
        changedFields = detectChanges(previousSnapshot, newSnapshot);
        if (changedFields.length === 0) return;
      }
    }

    if (changeType !== "create" && changedFields.length === 0) return;

    const versionNum = (await window.StorageLayer.VersionStore.getBySampleId(sampleId)).length + 1;

    const record = {
      id: crypto.randomUUID(),
      sampleId,
      version: versionNum,
      snapshot: newSnapshot,
      changedFields,
      changeType,
      summary: buildChangeSummary(changedFields),
      timestamp: new Date().toISOString()
    };

    await window.StorageLayer.VersionStore.add(record);
    return record;
  }

  async function getHistory(sampleId) {
    if (!window.StorageLayer || !window.StorageLayer.VersionStore) return [];
    return window.StorageLayer.VersionStore.getBySampleId(sampleId);
  }

  function diffTwoVersions(v1, v2) {
    const result = [];
    TRACKED_FIELDS.forEach(f => {
      const oldVal = normalizeValue(v1.snapshot[f.key]);
      const newVal = normalizeValue(v2.snapshot[f.key]);
      if (oldVal !== newVal) {
        result.push({
          field: f.key,
          label: f.label,
          oldValue: v1.snapshot[f.key],
          newValue: v2.snapshot[f.key]
        });
      }
    });
    const oldPhoto = String(v1.snapshot.photo || "").trim();
    const newPhoto = String(v2.snapshot.photo || "").trim();
    if (oldPhoto !== newPhoto) {
      result.push({
        field: "photo",
        label: "照片",
        oldValue: { __type: "photo", data: oldPhoto },
        newValue: { __type: "photo", data: newPhoto }
      });
    } else if (v1.snapshot.hasPhoto !== v2.snapshot.hasPhoto) {
      result.push({
        field: "hasPhoto",
        label: "照片",
        oldValue: v1.snapshot.hasPhoto ? "有" : "无",
        newValue: v2.snapshot.hasPhoto ? "有" : "无"
      });
    }
    const oldAnn = v1.snapshot.annotations || [];
    const newAnn = v2.snapshot.annotations || [];
    if (JSON.stringify(oldAnn) !== JSON.stringify(newAnn)) {
      result.push({
        field: "annotations",
        label: "标注",
        oldValue: { __type: "annotations", data: oldAnn },
        newValue: { __type: "annotations", data: newAnn }
      });
    } else if (v1.snapshot.annotationCount !== v2.snapshot.annotationCount) {
      result.push({
        field: "annotationCount",
        label: "标注",
        oldValue: v1.snapshot.annotationCount + " 个",
        newValue: v2.snapshot.annotationCount + " 个"
      });
    }
    return result;
  }

  async function rollbackToVersion(sampleId, targetVersion) {
    if (!window.StorageLayer) return null;

    const versions = await getHistory(sampleId);
    const target = versions.find(v => v.version === targetVersion || v.id === targetVersion);
    if (!target) throw new Error("目标版本不存在");

    const currentSample = await window.StorageLayer.SampleStore.getWithPhoto(sampleId);
    if (!currentSample) throw new Error("样本不存在");

    const currentSnapshot = buildSnapshot(currentSample);
    const targetSnapshot = target.snapshot;

    const updates = {};
    TRACKED_FIELDS.forEach(f => {
      const oldVal = normalizeValue(currentSnapshot[f.key]);
      const newVal = normalizeValue(targetSnapshot[f.key]);
      if (oldVal !== newVal) {
        if (f.key === "observationFeatures") {
          updates[f.key] = Array.isArray(targetSnapshot[f.key]) ? [...targetSnapshot[f.key]] : [];
        } else {
          updates[f.key] = targetSnapshot[f.key];
        }
      }
    });

    const curPhoto = String(currentSnapshot.photo || "").trim();
    const tgtPhoto = String(targetSnapshot.photo || "").trim();
    if (curPhoto !== tgtPhoto) {
      updates.photo = targetSnapshot.photo || "";
    }

    const curAnnJson = JSON.stringify(currentSnapshot.annotations || []);
    const tgtAnnJson = JSON.stringify(targetSnapshot.annotations || []);
    if (curAnnJson !== tgtAnnJson) {
      updates.annotations = Array.isArray(targetSnapshot.annotations)
        ? targetSnapshot.annotations.map(a => ({ ...a }))
        : [];
    }

    if (Object.keys(updates).length === 0) return null;

    return {
      sampleId,
      updates,
      targetVersion: target.version,
      targetSnapshot
    };
  }

  async function moveToRecycleBin(sample) {
    if (!window.StorageLayer || !window.StorageLayer.RecycleStore) return;

    const record = {
      id: crypto.randomUUID(),
      sampleId: sample.id,
      sampleSnapshot: { ...sample },
      code: sample.code || "",
      deletedAt: new Date().toISOString()
    };

    await window.StorageLayer.RecycleStore.add(record);
    return record;
  }

  async function getRecycleBin() {
    if (!window.StorageLayer || !window.StorageLayer.RecycleStore) return [];
    return window.StorageLayer.RecycleStore.getAll();
  }

  async function restoreFromRecycleBin(recycleId) {
    if (!window.StorageLayer) return null;

    const recycleItem = await window.StorageLayer.RecycleStore.getById(recycleId);
    if (!recycleItem) throw new Error("回收站中未找到该记录");

    await window.StorageLayer.RecycleStore.remove(recycleId);

    return recycleItem.sampleSnapshot;
  }

  async function permanentlyDelete(recycleId) {
    if (!window.StorageLayer) return;

    const recycleItem = await window.StorageLayer.RecycleStore.getById(recycleId);
    if (recycleItem) {
      await window.StorageLayer.VersionStore.removeBySampleId(recycleItem.sampleId);
    }
    await window.StorageLayer.RecycleStore.remove(recycleId);
  }

  async function emptyRecycleBin() {
    if (!window.StorageLayer) return;

    const items = await window.StorageLayer.RecycleStore.getAll();
    for (const item of items) {
      await window.StorageLayer.VersionStore.removeBySampleId(item.sampleId);
    }
    await window.StorageLayer.RecycleStore.clearAll();
  }

  async function ensureInitialVersion(sampleId, sample) {
    if (!window.StorageLayer || !window.StorageLayer.VersionStore) return;

    const existing = await window.StorageLayer.VersionStore.getBySampleId(sampleId);
    if (existing.length === 0) {
      const snapshot = buildSnapshot(sample);
      const record = {
        id: crypto.randomUUID(),
        sampleId,
        version: 1,
        snapshot,
        changedFields: Object.keys(snapshot),
        changeType: "create",
        summary: "初始版本（兼容旧数据）",
        timestamp: sample.createdAt || new Date().toISOString()
      };
      await window.StorageLayer.VersionStore.add(record);
    }
  }

  function formatFieldValue(field, value) {
    if (value === null || value === undefined || value === "") return "—";
    if (value && typeof value === "object" && value.__type === "photo") {
      const data = value.data || "";
      if (!data) return '<span class="vh-photo-empty">（无照片）</span>';
      if (data.startsWith("data:image/")) {
        return `<img src="${data}" class="vh-diff-photo" alt="照片">`;
      }
      return `<a href="${escapeHtml(data)}" target="_blank" class="vh-photo-link">📷 查看照片</a>`;
    }
    if (value && typeof value === "object" && value.__type === "annotations") {
      const arr = value.data || [];
      if (!arr.length) return '<span class="vh-photo-empty">（无标注）</span>';
      return arr.map((a, i) => {
        const label = a.label || `标注${i + 1}`;
        const coords = a.x !== undefined && a.y !== undefined ? `（x:${Math.round(a.x)}, y:${Math.round(a.y)}）` : "";
        const text = a.text ? `：${String(a.text).slice(0, 40)}` : "";
        return `<div class="vh-ann-item">${escapeHtml(label)}${coords}${escapeHtml(text)}</div>`;
      }).join("");
    }
    if (Array.isArray(value)) return value.join("；") || "—";
    return String(value);
  }

  function versionTimelineHTML(versions, currentSampleId) {
    if (!versions || versions.length === 0) {
      return '<p class="vh-empty">暂无版本历史记录</p>';
    }

    const reversed = [...versions].reverse();

    return `
      <div class="vh-timeline">
        ${reversed.map((v, idx) => {
          const typeLabel = CHANGE_TYPE_LABELS[v.changeType] || v.changeType;
          const isLatest = idx === 0;
          const versionDate = new Date(v.timestamp);
          const dateStr = `${versionDate.getFullYear()}-${String(versionDate.getMonth() + 1).padStart(2, "0")}-${String(versionDate.getDate()).padStart(2, "0")} ${String(versionDate.getHours()).padStart(2, "0")}:${String(versionDate.getMinutes()).padStart(2, "0")}:${String(versionDate.getSeconds()).padStart(2, "0")}`;
          return `
            <div class="vh-timeline-item ${isLatest ? "latest" : ""}" data-version-id="${v.id}" data-version-num="${v.version}">
              <div class="vh-timeline-dot"></div>
              <div class="vh-timeline-content">
                <div class="vh-timeline-header">
                  <span class="vh-version-badge">v${v.version}</span>
                  <span class="vh-change-type ${v.changeType}">${typeLabel}</span>
                  ${isLatest ? '<span class="vh-current-badge">当前</span>' : ""}
                </div>
                <p class="vh-summary">${escapeHtml(v.summary)}</p>
                <p class="vh-timestamp">${dateStr}</p>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function diffTableHTML(diff) {
    if (!diff || diff.length === 0) {
      return '<p class="vh-no-diff">两个版本完全一致，没有差异</p>';
    }

    return `
      <table class="vh-diff-table">
        <thead>
          <tr>
            <th>字段</th>
            <th>旧值</th>
            <th>新值</th>
          </tr>
        </thead>
        <tbody>
          ${diff.map(d => {
            const isRich = d.field === "photo" || d.field === "annotations";
            const oldHtml = isRich ? formatFieldValue(d.field, d.oldValue) : escapeHtml(formatFieldValue(d.field, d.oldValue));
            const newHtml = isRich ? formatFieldValue(d.field, d.newValue) : escapeHtml(formatFieldValue(d.field, d.newValue));
            return `
            <tr class="vh-diff-row">
              <td class="vh-diff-field">${escapeHtml(d.label)}</td>
              <td class="vh-diff-old">${oldHtml}</td>
              <td class="vh-diff-new">${newHtml}</td>
            </tr>
          `}).join("")}
        </tbody>
      </table>
    `;
  }

  function recycleBinListHTML(items) {
    if (!items || items.length === 0) {
      return '<p class="vh-empty">回收站为空</p>';
    }

    return `
      <div class="vh-recycle-list">
        ${items.map(item => {
          const sample = item.sampleSnapshot || {};
          const deletedDate = new Date(item.deletedAt);
          const dateStr = `${deletedDate.getFullYear()}-${String(deletedDate.getMonth() + 1).padStart(2, "0")}-${String(deletedDate.getDate()).padStart(2, "0")} ${String(deletedDate.getHours()).padStart(2, "0")}:${String(deletedDate.getMinutes()).padStart(2, "0")}`;
          return `
            <div class="vh-recycle-item" data-recycle-id="${item.id}" data-sample-id="${item.sampleId}">
              <div class="vh-recycle-info">
                <h4>${escapeHtml(item.code || sample.code || "未编号")}</h4>
                <p>${escapeHtml(sample.location || "未记录地点")} · ${escapeHtml(sample.minerals || "未记录矿物")}</p>
                <p class="vh-recycle-date">删除于 ${dateStr}</p>
              </div>
              <div class="vh-recycle-actions">
                <button type="button" class="primary vh-restore-btn" data-restore-id="${item.id}">恢复</button>
                <button type="button" class="danger vh-permanent-delete-btn" data-delete-id="${item.id}">彻底删除</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  global.VersionHistory = {
    TRACKED_FIELDS,
    CHANGE_TYPE_LABELS,
    buildSnapshot,
    detectChanges,
    buildChangeSummary,
    detectChangeType,
    recordVersion,
    getHistory,
    diffTwoVersions,
    rollbackToVersion,
    moveToRecycleBin,
    getRecycleBin,
    restoreFromRecycleBin,
    permanentlyDelete,
    emptyRecycleBin,
    ensureInitialVersion,
    formatFieldValue,
    versionTimelineHTML,
    diffTableHTML,
    recycleBinListHTML
  };

})(window);
