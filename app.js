let state = null;

const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

const form = $("#sampleForm");
const photoInput = $("#photoInput");
const sampleGrid = $("#sampleGrid");
const sampleGridFull = $("#sampleGridFull");
const comparePane = $("#comparePane");
const mineralFilter = $("#mineralFilter");
const polarFilter = $("#polarFilter");
const reviewFilter = $("#reviewFilter");

const tabBtns = $$(".tab-btn");
const tabPanels = $$(".tab-panel");

const taskList = $("#taskList");
const newTaskBtn = $("#newTaskBtn");
const taskEditorEmpty = $("#taskEditorEmpty");
const taskForm = $("#taskForm");
const taskFormTitle = $("#taskEditorTitle");
const cancelTaskBtn = $("#cancelTaskBtn");
const taskSamplePicker = $("#taskSamplePicker");
const selectedCountEl = $("#selectedCount");
const taskDetail = $("#taskDetail");
const editTaskBtn = $("#editTaskBtn");
const deleteTaskBtn = $("#deleteTaskBtn");
const detailTitle = $("#detailTitle");
const detailDeadline = $("#detailDeadline");
const detailStatus = $("#detailStatus");
const detailObjective = $("#detailObjective");
const progressFill = $("#progressFill");
const progressText = $("#progressText");
const detailSamples = $("#detailSamples");
const taskComments = $("#taskComments");
const commentInput = $("#commentInput");
const addCommentBtn = $("#addCommentBtn");

let pendingPhoto = "";
let editingTaskId = null;
let selectedTaskId = null;
let pickerSelectedIds = new Set();

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDeadlineStatus(deadline) {
  if (!deadline) return { label: "无截止日期", class: "" };
  const now = Date.now();
  const dl = new Date(deadline).getTime();
  const diffDays = (dl - now) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return { label: "已逾期", class: "overdue" };
  if (diffDays <= 3) return { label: `截止:${formatDateTime(deadline)}`, class: "due-soon" };
  return { label: `截止:${formatDateTime(deadline)}`, class: "" };
}

function getTaskProgress(task) {
  const total = task.sampleIds.length;
  if (total === 0) return { completed: 0, total: 0, percent: 0 };
  const completed = task.sampleIds.filter((id) => task.completedSamples?.includes(id)).length;
  return { completed, total, percent: Math.round((completed / total) * 100) };
}

function getTaskStatus(task) {
  const { completed, total } = getTaskProgress(task);
  if (total === 0) return "未开始";
  if (completed === 0) return "未开始";
  if (completed === total) return "已完成";
  return "进行中";
}

function getTaskStatusClass(task) {
  const status = getTaskStatus(task);
  if (status === "已完成") return "completed";
  if (status === "进行中") return "in-progress";
  return "not-started";
}

function filteredSamples() {
  const mineral = mineralFilter?.value?.trim() || "";
  const polarization = polarFilter?.value || "";
  const reviewStatus = reviewFilter?.value || "";
  return state.samples.filter((sample) => {
    const mineralMatch = !mineral || sample.minerals.includes(mineral);
    const polarMatch = !polarization || sample.polarization === polarization;
    let reviewMatch = true;
    if (reviewStatus && window.ReviewModule) {
      reviewMatch = window.ReviewModule.getReviewStatus(sample) === reviewStatus;
    }
    return mineralMatch && polarMatch && reviewMatch;
  });
}

function sampleCardHTML(sample, showActions = true) {
  const annSummary = window.AnnotationView ? window.AnnotationView.annotationSummaryHTML(sample) : "";
  const reviewBadge = window.ReviewModule ? window.ReviewModule.reviewStatusBadgeHTML(sample) : "";
  const completenessBar = window.ReviewModule ? window.ReviewModule.completenessBarHTML(sample) : "";
  return `
    <article class="sample-card ${window.ReviewModule ? "review-" + window.ReviewModule.getReviewStatusClass(sample) : ""}">
      <div class="sample-card-badges">
        ${reviewBadge}
      </div>
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}显微照片">` : '<div class="photo-placeholder">暂无照片</div>'}
      <div class="sample-body">
        <h3>${sample.code}</h3>
        <p>${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}</p>
        <p>矿物：${sample.minerals || "未记录"}</p>
        <p>结构：${sample.texture || "未记录"}</p>
        <p>${sample.comment || "未填写批注"}</p>
        ${sample.reviewComment ? `<p class="card-review-note">复核：${sample.reviewComment}</p>` : ""}
        ${completenessBar}
        ${annSummary}
        ${showActions ? `
        <div class="card-actions">
          <label><input type="checkbox" data-compare="${sample.id}" ${state.compare.includes(sample.id) ? "checked" : ""}>对比</label>
          <div class="card-action-btns">
            <button type="button" data-annotate="${sample.id}">标注</button>
            <button type="button" data-review-card="${sample.id}">审核</button>
            <button type="button" data-delete="${sample.id}">删除</button>
          </div>
        </div>` : ""}
      </div>
    </article>
  `;
}

function renderSamples() {
  const rows = filteredSamples();
  const emptyHTML = "<p style=\"grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);\">还没有样本，先从左侧录入一张薄片照片。</p>";

  if (sampleGrid) {
    const recent = state.samples.slice(0, 12);
    sampleGrid.innerHTML = recent.length ? recent.map((s) => sampleCardHTML(s, true)).join("") : emptyHTML;
  }

  if (sampleGridFull) {
    sampleGridFull.innerHTML = rows.length ? rows.map((s) => sampleCardHTML(s, true)).join("") : emptyHTML;
  }
}

function renderCompare() {
  if (!comparePane) return;
  const compareSamples = state.compare
    .map((id) => state.samples.find((sample) => sample.id === id))
    .filter(Boolean)
    .slice(0, 2);

  comparePane.innerHTML = compareSamples.length ? compareSamples.map((sample) => {
    const annSummary = window.AnnotationView ? window.AnnotationView.annotationSummaryHTML(sample) : "";
    const reviewBadge = window.ReviewModule ? window.ReviewModule.reviewStatusBadgeHTML(sample) : "";
    const completenessBar = window.ReviewModule ? window.ReviewModule.completenessBarHTML(sample) : "";
    return `
    <article class="compare-item ${window.ReviewModule ? "compare-review-" + window.ReviewModule.getReviewStatusClass(sample) : ""}">
      <div class="compare-item-head">
        <h3>${sample.code}</h3>
        ${reviewBadge}
      </div>
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}对比图">` : ""}
      ${completenessBar}
      <p>${sample.polarization} · ${sample.minerals || "未记录矿物"}</p>
      <p>${sample.texture || "未记录结构"}</p>
      ${sample.reviewComment ? `<p class="compare-review-note">复核意见：${sample.reviewComment}</p>` : ""}
      ${annSummary}
    </article>
  `;}).join("") : "<p>勾选两张样本卡片后可并排对比。</p>";
}

function switchTab(tabName) {
  tabBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tabName}`));
  if (tabName === "tasks") renderTasks();
  if (tabName === "review" && window.ReviewModule) {
    window.ReviewModule.renderReviewBoard();
    updateReviewStats();
  }
}

function updateReviewStats() {
  if (!window.ReviewModule) return;
  const { incomplete, pending, confirmed } = getReviewCounts();
  const elInc = $("#statIncomplete");
  const elPen = $("#statPending");
  const elCon = $("#statConfirmed");
  if (elInc) elInc.textContent = incomplete;
  if (elPen) elPen.textContent = pending;
  if (elCon) elCon.textContent = confirmed;
}

function getReviewCounts() {
  let incomplete = 0, pending = 0, confirmed = 0;
  state.samples.forEach((sample) => {
    const status = window.ReviewModule.getReviewStatus(sample);
    if (status === "incomplete") incomplete++;
    else if (status === "pending") pending++;
    else if (status === "confirmed") confirmed++;
  });
  return { incomplete, pending, confirmed };
}

tabBtns.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

photoInput?.addEventListener("change", async () => {
  pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (!pendingPhoto && photoInput?.files?.[0]) {
    pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
  }
  const newSample = {
    id: crypto.randomUUID(),
    photo: pendingPhoto,
    code: data.get("code").trim(),
    location: data.get("location").trim(),
    magnification: data.get("magnification").trim(),
    polarization: data.get("polarization"),
    minerals: data.get("minerals").trim(),
    texture: data.get("texture").trim(),
    comment: data.get("comment").trim(),
    annotations: [],
    createdAt: new Date().toISOString()
  };
  window.DataManager.addSample(newSample);
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
  renderAll();
});

function handleSampleGridClick(gridEl, event) {
  const deleteId = event.target.dataset.delete;
  const annotateId = event.target.dataset.annotate;
  const reviewId = event.target.dataset.reviewCard;
  if (annotateId) {
    if (window.AnnotationView) window.AnnotationView.openAnnotation(annotateId);
    return;
  }
  if (reviewId) {
    if (window.ReviewModule) window.ReviewModule.openReviewModal(reviewId);
    return;
  }
  if (deleteId) {
    if (!confirm("确定删除该样本？此操作不可撤销。")) return;
    window.DataManager.deleteSample(deleteId);
    renderAll();
  }
}

sampleGrid?.addEventListener("click", (e) => handleSampleGridClick(sampleGrid, e));
sampleGridFull?.addEventListener("click", (e) => handleSampleGridClick(sampleGridFull, e));

function handleSampleGridChange(gridEl, event) {
  const id = event.target.dataset.compare;
  if (!id) return;
  window.DataManager.toggleCompare(id);
  renderSamples();
  renderCompare();
}

sampleGrid?.addEventListener("change", (e) => handleSampleGridChange(sampleGrid, e));
sampleGridFull?.addEventListener("change", (e) => handleSampleGridChange(sampleGridFull, e));

[mineralFilter, polarFilter, reviewFilter].forEach((field) => field?.addEventListener("input", renderSamples));
[reviewFilter].forEach((field) => field?.addEventListener("change", renderSamples));

$("#exportBtn")?.addEventListener("click", () => {
  const checklist = state.samples.map((sample) => {
    const reviewStatus = window.ReviewModule ? window.ReviewModule.getReviewStatusLabel(sample) : "";
    const completeness = window.ReviewModule ? window.ReviewModule.calcCompleteness(sample).percent + "%" : "";
    return {
      样本编号: sample.code,
      采样地点: sample.location,
      放大倍数: sample.magnification,
      偏光类型: sample.polarization,
      主要矿物: sample.minerals,
      颗粒结构: sample.texture,
      老师批注: sample.comment,
      资料完整度: completeness,
      审核状态: reviewStatus,
      复核意见: sample.reviewComment || "",
      照片: sample.photo && sample.photo.startsWith("data:") ? "" : sample.photo
    };
  });
  const blob = new Blob([JSON.stringify(checklist, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "thin-section-checklist.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

function renderTasks() {
  renderTaskList();
  if (selectedTaskId) {
    showTaskDetail(selectedTaskId);
  } else if (editingTaskId) {
    showTaskEditor(editingTaskId);
  } else {
    showTaskEmpty();
  }
}

function renderTaskList() {
  if (!taskList) return;
  if (state.tasks.length === 0) {
    taskList.innerHTML = `<div class="task-list-empty">还没有观察任务<br>点击右上角「+ 新建任务」创建</div>`;
    return;
  }

  const sorted = [...state.tasks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  taskList.innerHTML = sorted.map((task) => {
    const progress = getTaskProgress(task);
    const status = getTaskStatus(task);
    const dlStatus = getDeadlineStatus(task.deadline);
    return `
      <article class="task-card ${task.id === selectedTaskId ? "active" : ""}" data-task-id="${task.id}">
        <h3>${task.title}</h3>
        <div class="task-card-meta">
          <span>关联样本 ${task.sampleIds.length} 个 · 完成 ${progress.completed}/${progress.total}</span>
          <span>
            ${status === "已完成" ? '<span class="badge completed">已完成</span>' : ""}
            ${dlStatus.class ? `<span class="badge ${dlStatus.class}">${dlStatus.label}</span>` : (task.deadline ? `<span>${dlStatus.label}</span>` : "")}
          </span>
        </div>
      </article>
    `;
  }).join("");

  $$(".task-card", taskList).forEach((card) => {
    card.addEventListener("click", () => {
      selectedTaskId = card.dataset.taskId;
      editingTaskId = null;
      renderTasks();
    });
  });
}

function showTaskEmpty() {
  taskEditorEmpty.classList.remove("hidden");
  taskForm.classList.add("hidden");
  taskDetail.classList.add("hidden");
}

function showTaskDetail(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) {
    selectedTaskId = null;
    renderTasks();
    return;
  }

  taskEditorEmpty.classList.add("hidden");
  taskForm.classList.add("hidden");
  taskDetail.classList.remove("hidden");

  detailTitle.textContent = task.title;
  detailObjective.textContent = task.objective || "";

  const dlStatus = getDeadlineStatus(task.deadline);
  detailDeadline.textContent = task.deadline ? `📅 ${formatDateTime(task.deadline)}` : "";
  detailDeadline.className = `task-deadline ${dlStatus.class === "overdue" ? "badge overdue" : ""}`;

  const status = getTaskStatus(task);
  const statusClass = getTaskStatusClass(task);
  detailStatus.textContent = status;
  detailStatus.className = `task-status ${statusClass}`;

  const progress = getTaskProgress(task);
  progressFill.style.width = `${progress.percent}%`;
  progressText.textContent = progress.total === 0
    ? "尚未关联任何样本"
    : `已完成 ${progress.completed} / ${progress.total} 个样本观察（${progress.percent}%）`;

  renderDetailSamples(task);
  renderTaskComments(task);
}

function renderDetailSamples(task) {
  if (!detailSamples) return;
  const samples = task.sampleIds
    .map((id) => state.samples.find((s) => s.id === id))
    .filter(Boolean);

  if (samples.length === 0) {
    detailSamples.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:20px;color:var(--muted);">暂未关联样本，点击「编辑」添加样本</p>`;
    return;
  }

  detailSamples.innerHTML = samples.map((sample) => {
    const completed = task.completedSamples?.includes(sample.id);
    return `
      <article class="detail-sample ${completed ? "completed-flag" : ""}">
        <div class="detail-sample-header">
          <h4>${sample.code}</h4>
          <label>
            <input type="checkbox" data-complete-sample="${sample.id}" ${completed ? "checked" : ""}>
            完成
          </label>
        </div>
        ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}">` : '<div class="photo-placeholder">暂无照片</div>'}
        <div class="detail-sample-body">
          <p>${sample.location || "未记录地点"} · ${sample.magnification || ""} · ${sample.polarization}</p>
          <p>矿物：${sample.minerals || "未记录"}</p>
          <p>结构：${sample.texture || "未记录"}</p>
        </div>
      </article>
    `;
  }).join("");

  $$('[data-complete-sample]', detailSamples).forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const sid = e.target.dataset.completeSample;
      task.completedSamples = task.completedSamples || [];
      if (e.target.checked) {
        if (!task.completedSamples.includes(sid)) task.completedSamples.push(sid);
      } else {
        task.completedSamples = task.completedSamples.filter((x) => x !== sid);
      }
      window.DataManager.updateTask(task.id, { completedSamples: task.completedSamples });
      renderTasks();
    });
  });
}

function renderTaskComments(task) {
  if (!taskComments) return;
  const comments = task.comments || [];
  if (comments.length === 0) {
    taskComments.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:6px 2px;">暂无批注，在下方添加第一条批注</p>`;
    return;
  }
  taskComments.innerHTML = [...comments].reverse().map((c) => `
    <div class="comment-item">
      <div class="comment-header">
        <span>${formatDateTime(c.createdAt)}</span>
        <button type="button" data-delete-comment="${c.id}">删除</button>
      </div>
      <p class="comment-text">${c.text}</p>
    </div>
  `).join("");

  $$('[data-delete-comment]', taskComments).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (!confirm("删除这条批注？")) return;
      const cid = e.target.dataset.deleteComment;
      task.comments = (task.comments || []).filter((c) => c.id !== cid);
      window.DataManager.updateTask(task.id, { comments: task.comments });
      renderTaskComments(task);
    });
  });
}

addCommentBtn?.addEventListener("click", () => {
  const task = state.tasks.find((t) => t.id === selectedTaskId);
  if (!task) return;
  const text = commentInput.value.trim();
  if (!text) return;
  task.comments = task.comments || [];
  task.comments.push({
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toISOString()
  });
  commentInput.value = "";
  window.DataManager.updateTask(task.id, { comments: task.comments });
  renderTaskComments(task);
});

editTaskBtn?.addEventListener("click", () => {
  if (!selectedTaskId) return;
  editingTaskId = selectedTaskId;
  selectedTaskId = null;
  showTaskEditor(editingTaskId);
});

deleteTaskBtn?.addEventListener("click", () => {
  if (!selectedTaskId) return;
  if (!confirm("确定删除该观察任务？此操作不可撤销。")) return;
  window.DataManager.deleteTask(selectedTaskId);
  selectedTaskId = null;
  renderTasks();
});

newTaskBtn?.addEventListener("click", () => {
  editingTaskId = "new";
  selectedTaskId = null;
  showTaskEditor("new");
});

cancelTaskBtn?.addEventListener("click", () => {
  editingTaskId = null;
  pickerSelectedIds.clear();
  if (selectedTaskId) {
    showTaskDetail(selectedTaskId);
  } else {
    showTaskEmpty();
  }
  renderTaskList();
});

function showTaskEditor(taskId) {
  taskEditorEmpty.classList.add("hidden");
  taskDetail.classList.add("hidden");
  taskForm.classList.remove("hidden");

  const isEdit = taskId !== "new";
  const task = isEdit ? state.tasks.find((t) => t.id === taskId) : null;

  taskFormTitle.textContent = isEdit ? "编辑观察任务" : "新建观察任务";
  taskForm.reset();

  if (task) {
    taskForm.title.value = task.title;
    taskForm.objective.value = task.objective;
    if (task.deadline) taskForm.deadline.value = formatDateTimeLocal(task.deadline);
    pickerSelectedIds = new Set(task.sampleIds);
  } else {
    pickerSelectedIds = new Set();
  }

  renderSamplePicker();
}

function renderSamplePicker() {
  if (!taskSamplePicker) return;
  if (state.samples.length === 0) {
    taskSamplePicker.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:20px;color:var(--muted);font-size:13px;">暂无可选样本，请先到「样本录入」页添加</p>`;
  } else {
    taskSamplePicker.innerHTML = state.samples.map((sample) => `
      <div class="picker-item ${pickerSelectedIds.has(sample.id) ? "selected" : ""}" data-sample-id="${sample.id}">
        ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}">` : '<div class="photo-placeholder" style="aspect-ratio:4/3;border-radius:6px;margin-bottom:6px;">暂无</div>'}
        <div class="picker-code">${sample.code}</div>
      </div>
    `).join("");

    $$(".picker-item", taskSamplePicker).forEach((item) => {
      item.addEventListener("click", () => {
        const id = item.dataset.sampleId;
        if (pickerSelectedIds.has(id)) pickerSelectedIds.delete(id);
        else pickerSelectedIds.add(id);
        item.classList.toggle("selected");
        updateSelectedCount();
      });
    });
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  if (selectedCountEl) selectedCountEl.textContent = `已选 ${pickerSelectedIds.size} 个`;
}

taskForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(taskForm);
  const title = data.get("title").trim();
  const objective = data.get("objective").trim();
  const deadlineRaw = data.get("deadline");
  const deadline = deadlineRaw ? new Date(deadlineRaw).toISOString() : "";

  if (!title || !objective) return;

  const sampleIds = Array.from(pickerSelectedIds);

  if (editingTaskId === "new" || !editingTaskId) {
    const newTask = {
      id: crypto.randomUUID(),
      title,
      objective,
      deadline,
      sampleIds,
      completedSamples: sampleIds.length === 0 ? [] : (sampleIds.filter(() => false)),
      comments: [],
      createdAt: new Date().toISOString()
    };
    window.DataManager.addTask(newTask);
    selectedTaskId = newTask.id;
  } else {
    const task = state.tasks.find((t) => t.id === editingTaskId);
    if (task) {
      window.DataManager.updateTask(editingTaskId, {
        title,
        objective,
        deadline,
        sampleIds,
        completedSamples: (task.completedSamples || []).filter((id) => sampleIds.includes(id))
      });
      selectedTaskId = task.id;
    }
  }

  editingTaskId = null;
  pickerSelectedIds.clear();
  renderAll();
});

function renderAll() {
  renderSamples();
  renderCompare();
  if ($("#tab-tasks").classList.contains("active")) renderTasks();
  if ($("#tab-review").classList.contains("active") && window.ReviewModule) {
    window.ReviewModule.renderReviewBoard();
    updateReviewStats();
  }
}

const FIELD_ALIASES = {
  code: ["样本编号", "编号", "sampleCode", "sample_code", "code", "编号代码"],
  location: ["采样地点", "地点", "位置", "location", "取样地点"],
  magnification: ["放大倍数", "倍数", "倍率", "magnification"],
  polarization: ["偏光类型", "偏光", "偏振光", "polarization"],
  minerals: ["主要矿物", "矿物", "矿物成分", "minerals"],
  texture: ["颗粒结构", "结构", "构造", "texture"],
  comment: ["老师批注", "批注", "备注", "说明", "comment"],
  photo: ["照片", "图片", "显微照片", "照片URL", "photo", "image"]
};

const REQUIRED_FIELDS = ["code"];

const FIELD_LABELS = {
  code: "样本编号",
  location: "采样地点",
  magnification: "放大倍数",
  polarization: "偏光类型",
  minerals: "主要矿物",
  texture: "颗粒结构",
  comment: "老师批注",
  photo: "照片"
};

let importPreviewData = null;
let importAnalysis = null;

const importOverlay = $("#importOverlay");
const importBtn = $("#importBtn");
const closeImportBtn = $("#closeImportBtn");
const importCancelBtn = $("#importCancelBtn");
const importSelectBtn = $("#importSelectBtn");
const importFileInput = $("#importFileInput");
const importDropZone = $("#importDropZone");
const importStepUpload = $("#importStepUpload");
const importStepPreview = $("#importStepPreview");
const importConfirmBtn = $("#importConfirmBtn");
const importSkipDup = $("#importSkipDup");

function openImportModal() {
  importOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  resetImportState();
}

function closeImportModal() {
  importOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  resetImportState();
}

function resetImportState() {
  importPreviewData = null;
  importAnalysis = null;
  importStepUpload.classList.remove("hidden");
  importStepPreview.classList.add("hidden");
  importConfirmBtn.disabled = true;
  if (importFileInput) importFileInput.value = "";
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] !== undefined ? values[idx] : "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);

  return result.map((s) => s.trim());
}

function detectFileFormat(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  return null;
}

function mapFields(headers) {
  const fieldMap = {};
  const matchedFields = new Set();
  const missingFields = [];

  for (const [targetField, aliases] of Object.entries(FIELD_ALIASES)) {
    let matched = null;
    for (const header of headers) {
      const lowerHeader = header.trim().toLowerCase();
      if (aliases.some((a) => a.toLowerCase() === lowerHeader)) {
        matched = header;
        break;
      }
    }
    if (matched) {
      fieldMap[targetField] = matched;
      matchedFields.add(targetField);
    }
  }

  for (const field of Object.keys(FIELD_ALIASES)) {
    if (!matchedFields.has(field)) {
      missingFields.push(field);
    }
  }

  return { fieldMap, matchedFields: Array.from(matchedFields), missingFields };
}

function analyzeImportData(rows, fieldMap) {
  const validRows = [];
  const warningRows = [];
  const errorRows = [];
  const warnings = [];
  const errors = [];
  const duplicateCodes = [];
  const seenCodes = new Set();
  const codeCount = {};

  const existingCodes = new Set(state.samples.map((s) => s.code));

  rows.forEach((row, rowIndex) => {
    const rowNum = rowIndex + 2;
    const sample = {};
    const rowErrors = [];
    const rowWarnings = [];

    for (const [targetField, sourceField] of Object.entries(fieldMap)) {
      let value = row[sourceField];
      if (value === undefined || value === null) {
        value = "";
      }
      sample[targetField] = String(value).trim();
    }

    if (!sample.code) {
      rowErrors.push("缺少样本编号");
    } else {
      if (!codeCount[sample.code]) {
        codeCount[sample.code] = 0;
      }
      codeCount[sample.code]++;

      if (existingCodes.has(sample.code)) {
        if (!duplicateCodes.some((d) => d.code === sample.code)) {
          duplicateCodes.push({ code: sample.code, rows: [] });
        }
        const dup = duplicateCodes.find((d) => d.code === sample.code);
        if (dup && !dup.rows.includes(rowNum)) {
          dup.rows.push(rowNum);
        }
        rowWarnings.push(`样本编号「${sample.code}」已存在于库中`);
      }

      if (codeCount[sample.code] > 1) {
        if (!duplicateCodes.some((d) => d.code === sample.code)) {
          duplicateCodes.push({ code: sample.code, rows: [] });
        }
        const dup = duplicateCodes.find((d) => d.code === sample.code);
        if (dup && !dup.rows.includes(rowNum)) {
          dup.rows.push(rowNum);
        }
        if (!rowWarnings.some((w) => w.includes("导入文件内重复"))) {
          rowWarnings.push("导入文件内存在重复编号");
        }
      }

      seenCodes.add(sample.code);
    }

    if (sample.photo && !isValidPhotoUrl(sample.photo)) {
      rowWarnings.push("照片字段仅支持URL或留空，当前值可能无效");
    }

    if (sample.polarization) {
      const validPolar = ["单偏光", "正交偏光", "反射光"];
      if (!validPolar.includes(sample.polarization)) {
        rowWarnings.push(`偏光类型「${sample.polarization}」不在标准选项中`);
      }
    }

    if (rowErrors.length > 0) {
      errorRows.push({ rowNum, sample, errors: rowErrors });
      errors.push({ rowNum, errors: rowErrors });
    } else if (rowWarnings.length > 0) {
      warningRows.push({ rowNum, sample, warnings: rowWarnings });
      warnings.push({ rowNum, warnings: rowWarnings });
      validRows.push({ rowNum, sample, warnings: rowWarnings });
    } else {
      validRows.push({ rowNum, sample, warnings: [] });
    }
  });

  const internalDups = duplicateCodes.filter((d) => {
    const codeRows = rows.filter((r, i) => {
      const code = r[fieldMap.code]?.trim();
      return code === d.code;
    });
    return codeRows.length > 1;
  });

  const externalDups = duplicateCodes.filter((d) => existingCodes.has(d.code));

  return {
    total: rows.length,
    validCount: validRows.length,
    warningCount: warningRows.length,
    errorCount: errorRows.length,
    validRows,
    warningRows,
    errorRows,
    warnings,
    errors,
    duplicateCodes,
    internalDuplicates: internalDups,
    externalDuplicates: externalDups
  };
}

function isValidPhotoUrl(value) {
  if (!value) return true;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return true;
  }
  if (value.startsWith("data:image/")) {
    return true;
  }
  return false;
}

function renderFieldMap(fieldMap, missingFields) {
  const container = $("#importFieldMap");
  if (!container) return;

  const allFields = Object.keys(FIELD_ALIASES);
  const html = allFields
    .map((field) => {
      const isMissing = missingFields.includes(field);
      const isRequired = REQUIRED_FIELDS.includes(field);
      const icon = isMissing ? "✗" : "✓";
      const label = FIELD_LABELS[field];
      const sourceField = fieldMap[field];

      return `
        <div class="field-map-item ${isMissing ? "missing" : ""}">
          <span class="field-icon">${icon}</span>
          <span class="field-name">${label}${isRequired ? " *" : ""}</span>
          ${sourceField ? `<span style="color:var(--muted);font-size:12px;">← ${sourceField}</span>` : ""}
        </div>
      `;
    })
    .join("");

  container.innerHTML = html;
}

function renderWarnings(warnings) {
  const section = $("#importWarningsSection");
  const container = $("#importWarnings");
  if (!section || !container) return;

  if (warnings.length === 0) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = warnings
    .slice(0, 20)
    .map((w) => {
      const msg = w.warnings.join("；");
      return `<div class="warning-item"><span class="row-num">第${w.rowNum}行:</span>${msg}</div>`;
    })
    .join("");

  if (warnings.length > 20) {
    container.innerHTML += `<div class="warning-item" style="text-align:center;color:var(--muted);">... 还有 ${warnings.length - 20} 条警告</div>`;
  }
}

function renderDuplicates(duplicates) {
  const section = $("#importDuplicatesSection");
  const container = $("#importDuplicates");
  if (!section || !container) return;

  if (duplicates.length === 0) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = duplicates
    .slice(0, 15)
    .map((d) => {
      const rowStr = d.rows.length > 0 ? `（第 ${d.rows.join("、")} 行）` : "";
      return `<div class="duplicate-item"><span class="row-num">${d.code}</span>${rowStr}</div>`;
    })
    .join("");

  if (duplicates.length > 15) {
    container.innerHTML += `<div class="duplicate-item" style="text-align:center;color:var(--muted);">... 还有 ${duplicates.length - 15} 个重复编号</div>`;
  }
}

function renderErrors(errors) {
  const section = $("#importErrorsSection");
  const container = $("#importErrors");
  if (!section || !container) return;

  if (errors.length === 0) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = errors
    .slice(0, 15)
    .map((e) => {
      const msg = e.errors.join("；");
      return `<div class="error-item"><span class="row-num">第${e.rowNum}行:</span>${msg}</div>`;
    })
    .join("");

  if (errors.length > 15) {
    container.innerHTML += `<div class="error-item" style="text-align:center;color:var(--muted);">... 还有 ${errors.length - 15} 条错误</div>`;
  }
}

function renderPreviewTable(validRows, warningRows, errorRows) {
  const container = $("#importPreviewTable");
  if (!container) return;

  const allRows = [
    ...errorRows.map((r) => ({ ...r, status: "error" })),
    ...warningRows.map((r) => ({ ...r, status: "warning" })),
    ...validRows.filter((r) => r.warnings.length === 0).map((r) => ({ ...r, status: "ok" }))
  ].slice(0, 10);

  if (allRows.length === 0) {
    container.innerHTML = "<p style='padding:20px;text-align:center;color:var(--muted);'>暂无数据</p>";
    return;
  }

  const fields = Object.keys(FIELD_LABELS);

  let html = "<table><thead><tr>";
  html += "<th>行号</th>";
  fields.forEach((f) => {
    html += `<th>${FIELD_LABELS[f]}</th>`;
  });
  html += "</tr></thead><tbody>";

  allRows.forEach((row) => {
    const rowClass = row.status === "error" ? "error-row" : row.status === "warning" ? "warning-row" : "";
    html += `<tr class="${rowClass}">`;
    html += `<td>${row.rowNum}</td>`;
    fields.forEach((f) => {
      const value = row.sample[f] || "";
      const displayValue = value.length > 30 ? value.slice(0, 30) + "..." : value;
      html += `<td title="${escapeHtml(value)}">${escapeHtml(displayValue) || "-"}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function updateImportStats(analysis) {
  const totalEl = $("#importStatTotal");
  const validEl = $("#importStatValid");
  const warningEl = $("#importStatWarning");
  const errorEl = $("#importStatError");

  if (totalEl) totalEl.textContent = analysis.total;
  if (validEl) validEl.textContent = analysis.validCount;
  if (warningEl) warningEl.textContent = analysis.warningCount;
  if (errorEl) errorEl.textContent = analysis.errorCount;
}

function handleFile(file) {
  const format = detectFileFormat(file.name);

  if (!format) {
    alert("不支持的文件格式，请上传 CSV 或 JSON 文件。");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let parsedData;

      if (format === "json") {
        const json = JSON.parse(e.target.result);
        parsedData = parseJSONImport(json);
      } else {
        parsedData = parseCSV(e.target.result);
      }

      if (!parsedData.rows || parsedData.rows.length === 0) {
        alert("文件中没有找到有效数据行。");
        return;
      }

      const { fieldMap, matchedFields, missingFields } = mapFields(parsedData.headers);

      const analysis = analyzeImportData(parsedData.rows, fieldMap);

      importPreviewData = {
        rows: parsedData.rows,
        fieldMap,
        matchedFields,
        missingFields,
        format
      };
      importAnalysis = analysis;

      showImportPreview();
    } catch (err) {
      console.error("导入解析失败:", err);
      alert("文件解析失败：" + (err.message || "未知错误"));
    }
  };

  reader.onerror = () => {
    alert("文件读取失败，请重试。");
  };

  if (format === "csv") {
    reader.readAsText(file, "UTF-8");
  } else {
    reader.readAsText(file, "UTF-8");
  }
}

function parseJSONImport(json) {
  let rows = [];
  let headers = [];

  if (Array.isArray(json)) {
    rows = json;
  } else if (json.samples && Array.isArray(json.samples)) {
    rows = json.samples;
  } else if (json.data && Array.isArray(json.data)) {
    rows = json.data;
  } else {
    throw new Error("JSON 格式不正确，应为数组或包含 samples/data 数组");
  }

  if (rows.length > 0) {
    headers = Object.keys(rows[0]);
  }

  return { headers, rows };
}

function showImportPreview() {
  if (!importPreviewData || !importAnalysis) return;

  importStepUpload.classList.add("hidden");
  importStepPreview.classList.remove("hidden");

  updateImportStats(importAnalysis);
  renderFieldMap(importPreviewData.fieldMap, importPreviewData.missingFields);
  renderWarnings(importAnalysis.warnings);
  renderDuplicates(importAnalysis.duplicateCodes);
  renderErrors(importAnalysis.errors);
  renderPreviewTable(
    importAnalysis.validRows.filter((r) => r.warnings.length === 0),
    importAnalysis.warningRows,
    importAnalysis.errorRows
  );

  importConfirmBtn.disabled = importAnalysis.validCount === 0;
}

function confirmImport() {
  if (!importPreviewData || !importAnalysis) return;

  const skipDup = importSkipDup?.checked ?? true;
  let imported = 0;
  let skipped = 0;

  const existingCodes = new Set(state.samples.map((s) => s.code));
  const importedCodes = new Set();

  importAnalysis.validRows.forEach(({ sample }) => {
    if (skipDup) {
      if (existingCodes.has(sample.code) || importedCodes.has(sample.code)) {
        skipped++;
        return;
      }
    }

    const newSample = {
      id: crypto.randomUUID(),
      photo: sample.photo || "",
      code: sample.code,
      location: sample.location || "",
      magnification: sample.magnification || "",
      polarization: sample.polarization || "单偏光",
      minerals: sample.minerals || "",
      texture: sample.texture || "",
      comment: sample.comment || "",
      annotations: [],
      createdAt: new Date().toISOString()
    };

    window.DataManager.addSample(newSample);
    importedCodes.add(sample.code);
    imported++;
  });

  renderAll();

  closeImportModal();

  setTimeout(() => {
    alert(`导入完成！\n成功导入 ${imported} 条记录${skipDup && skipped > 0 ? `\n跳过重复 ${skipped} 条` : ""}`);
  }, 100);
}

importBtn?.addEventListener("click", openImportModal);
closeImportBtn?.addEventListener("click", closeImportModal);
importCancelBtn?.addEventListener("click", closeImportModal);

importOverlay?.addEventListener("click", (e) => {
  if (e.target === importOverlay) closeImportModal();
});

importSelectBtn?.addEventListener("click", () => {
  importFileInput?.click();
});

importFileInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

importDropZone?.addEventListener("click", () => {
  importFileInput?.click();
});

importDropZone?.addEventListener("dragover", (e) => {
  e.preventDefault();
  importDropZone.classList.add("drag-over");
});

importDropZone?.addEventListener("dragleave", () => {
  importDropZone.classList.remove("drag-over");
});

importDropZone?.addEventListener("drop", (e) => {
  e.preventDefault();
  importDropZone.classList.remove("drag-over");

  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

importConfirmBtn?.addEventListener("click", confirmImport);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !importOverlay?.classList.contains("hidden")) {
    closeImportModal();
  }
});

function initBackupRestoreUI() {
  const backupBtn = $("#backupBtn");
  const restoreBtn = $("#restoreBtn");
  const restoreFileInput = $("#restoreFileInput");

  backupBtn?.addEventListener("click", async () => {
    try {
      backupBtn.disabled = true;
      backupBtn.textContent = "导出中...";
      await window.BackupRestore.downloadBackup();
      backupBtn.disabled = false;
      backupBtn.textContent = "数据备份";
    } catch (err) {
      console.error("备份失败:", err);
      alert("备份失败：" + err.message);
      backupBtn.disabled = false;
      backupBtn.textContent = "数据备份";
    }
  });

  restoreBtn?.addEventListener("click", () => {
    restoreFileInput?.click();
  });

  restoreFileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`确定要导入备份文件「${file.name}」吗？\n这将覆盖当前所有数据！`)) {
      e.target.value = "";
      return;
    }

    try {
      restoreBtn.disabled = true;
      restoreBtn.textContent = "恢复中...";

      const result = await window.BackupRestore.importBackupFile(file, { merge: false });

      await window.DataManager.reload();
      state = window.DataManager.getState();
      renderAll();

      alert(`恢复成功！\n导入了 ${result.sampleCount} 个样本、${result.taskCount} 个任务`);
    } catch (err) {
      console.error("恢复失败:", err);
      alert("恢复失败：" + err.message);
    } finally {
      restoreBtn.disabled = false;
      restoreBtn.textContent = "数据恢复";
      e.target.value = "";
    }
  });
}

async function showMigrationDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "migrationOverlay";
    overlay.className = "migration-overlay";
    overlay.innerHTML = `
      <div class="migration-modal">
        <div class="migration-icon">📦</div>
        <h2>数据迁移</h2>
        <p class="migration-desc">检测到旧版本数据，需要迁移到新的存储系统。</p>
        <div class="migration-status" id="migrationStatus">点击「开始迁移」继续</div>
        <div class="migration-progress hidden" id="migrationProgress">
          <div class="migration-progress-bar">
            <div class="migration-progress-fill" id="migrationProgressFill"></div>
          </div>
        </div>
        <div class="migration-actions">
          <button type="button" id="migrationStartBtn" class="primary">开始迁移</button>
          <button type="button" id="migrationSkipBtn" class="ghost">跳过</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const startBtn = $("#migrationStartBtn");
    const skipBtn = $("#migrationSkipBtn");
    const statusEl = $("#migrationStatus");
    const progressEl = $("#migrationProgress");
    const progressFill = $("#migrationProgressFill");

    startBtn.addEventListener("click", async () => {
      startBtn.disabled = true;
      skipBtn.disabled = true;
      statusEl.textContent = "正在迁移数据...";
      progressEl.classList.remove("hidden");
      progressFill.style.width = "30%";

      try {
        const result = await window.DataMigration.runMigration();
        progressFill.style.width = "100%";

        if (result.migrated) {
          statusEl.textContent = `迁移完成！${result.sampleCount} 个样本、${result.taskCount} 个任务`;
          setTimeout(() => {
            overlay.remove();
            resolve({ migrated: true });
          }, 1500);
        } else {
          statusEl.textContent = "无需迁移";
          setTimeout(() => {
            overlay.remove();
            resolve({ migrated: false });
          }, 1000);
        }
      } catch (err) {
        console.error("迁移失败:", err);
        statusEl.textContent = "迁移失败：" + err.message;
        startBtn.disabled = false;
        skipBtn.disabled = false;
      }
    });

    skipBtn.addEventListener("click", () => {
      overlay.remove();
      resolve({ migrated: false, skipped: true });
    });
  });
}

async function initApp() {
  try {
    await window.StorageLayer.initDB();
    await window.DataManager.init();

    const needsMigration = await window.DataMigration.checkAndMigrate();
    if (needsMigration) {
      await showMigrationDialog();
      await window.DataManager.reload();
    }

    state = window.DataManager.getState();

    if (window.AnnotationView) {
      window.AnnotationView.init({
        getState: () => state,
        save: () => window.DataManager.save(),
        renderAll
      });
    }

    if (window.ReviewModule) {
      window.ReviewModule.init({
        getState: () => state,
        save: () => window.DataManager.save(),
        renderAll
      });
    }

    initBackupRestoreUI();

    renderAll();
  } catch (err) {
    console.error("初始化失败:", err);
    alert("应用初始化失败：" + err.message);
  }
}

document.addEventListener("DOMContentLoaded", initApp);
