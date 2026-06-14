let state = null;
let showArchivedProjects = false;
let currentProjectFormMode = "create";
let currentEditingProjectId = null;

const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

const projectSelector = $("#projectSelector");
const appShell = $("#appShell");
const projectGrid = $("#projectGrid");
const projectEmpty = $("#projectEmpty");
const showArchivedToggle = $("#showArchivedToggle");
const createProjectBtn = $("#createProjectBtn");
const importProjectBtn = $("#importProjectBtn");
const importProjectBackupBtn = $("#importProjectBackupBtn");
const importProjectBackupInput = $("#importProjectBackupInput");
const currentProjectBtn = $("#currentProjectBtn");
const currentProjectName = $("#currentProjectName");
const projectDropdown = $("#projectDropdown");
const projectDropdownList = $("#projectDropdownList");
const dropdownCreateBtn = $("#dropdownCreateBtn");
const dropdownImportBtn = $("#dropdownImportBtn");
const manageProjectsBtn = $("#manageProjectsBtn");
const openProjectManagerBtn = $("#openProjectManagerBtn");
const projectManagerModal = $("#projectManagerModal");
const projectManagerClose = $("#projectManagerClose");
const projectManagerList = $("#projectManagerList");
const projectManagerNewBtn = $("#projectManagerNewBtn");
const projectManagerImportBtn = $("#projectManagerImportBtn");
const projectManagerImportInput = $("#projectManagerImportInput");
const projectFormModal = $("#projectFormModal");
const projectForm = $("#projectForm");
const projectFormClose = $("#projectFormClose");
const projectFormCancel = $("#projectFormCancel");
const projectFormSubmit = $("#projectFormSubmit");
const projectFormTitle = $("#projectFormTitle");
const projectFormName = $("#projectFormName");
const projectFormDesc = $("#projectFormDescription");
const projectFormStats = $("#projectFormStats");

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
            <button type="button" data-view="${sample.id}" class="view-btn">🔬查看</button>
            <button type="button" data-annotate="${sample.id}">标注</button>
            <button type="button" data-review-card="${sample.id}">审核</button>
            <button type="button" data-history="${sample.id}">历史</button>
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
  if (window.ImageViewerModule) {
    window.ImageViewerModule.renderCompareWithViewer();
    return;
  }
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
  if (tabName === "lesson") renderLessonPage();
  if (tabName === "grading") renderGradingPage();
  if (tabName === "recycle") renderRecycleBin();
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

function getEntrySelectedFeatures() {
  const panel = document.getElementById("entryFeaturesPanel");
  if (!panel) return [];
  return Array.from(panel.querySelectorAll(".ma-feature-checkbox:checked")).map((cb) => cb.value);
}

function refreshEntryFeaturesList() {
  const listEl = document.getElementById("entryFeaturesList");
  const polarEl = document.getElementById("entryPolarization");
  if (!listEl || !window.MineralAssistant) return;
  const polarization = polarEl?.value || "";
  const currentSelected = getEntrySelectedFeatures();
  listEl.innerHTML = window.MineralAssistant.getObservationFeaturesHTML(currentSelected, polarization);
  listEl.querySelectorAll(".ma-feature-checkbox").forEach((cb) => {
    cb.addEventListener("change", updateEntryAssistant);
  });
  updateEntryAssistant();
}

function updateEntryAssistant() {
  const resultsEl = document.getElementById("entryAssistantResults");
  if (!resultsEl || !window.MineralAssistant) return;

  const polarization = document.getElementById("entryPolarization")?.value || "";
  const minerals = document.getElementById("entryMinerals")?.value || "";
  const texture = document.getElementById("entryTexture")?.value || "";
  const comment = document.getElementById("entryComment")?.value || "";
  const selectedFeatures = getEntrySelectedFeatures();

  const tempSample = {
    polarization,
    minerals,
    texture,
    comment,
    observationFeatures: selectedFeatures
  };

  const analysis = window.MineralAssistant.analyzeSample(tempSample);
  resultsEl.innerHTML = window.MineralAssistant.getMineralSuggestionHTML(analysis);
}

function initEntryAssistant() {
  const toggleBtn = document.getElementById("entryToggleFeatures");
  const featuresPanel = document.getElementById("entryFeaturesPanel");
  toggleBtn?.addEventListener("click", () => {
    featuresPanel?.classList.toggle("hidden");
    if (!featuresPanel.classList.contains("hidden")) {
      refreshEntryFeaturesList();
    }
  });

  ["entryPolarization", "entryMinerals", "entryTexture", "entryComment"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", updateEntryAssistant);
    el.addEventListener("change", () => {
      if (id === "entryPolarization") refreshEntryFeaturesList();
      updateEntryAssistant();
    });
  });

  updateEntryAssistant();
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (!pendingPhoto && photoInput?.files?.[0]) {
    pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
  }
  const observationFeatures = getEntrySelectedFeatures();
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
    observationFeatures,
    annotations: [],
    createdAt: new Date().toISOString()
  };
  await window.DataManager.addSample(newSample);
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
  if (document.getElementById("entryFeaturesPanel")) {
    document.getElementById("entryFeaturesPanel").classList.add("hidden");
    document.getElementById("entryFeaturesList").innerHTML = "";
  }
  renderAll();
  updateEntryAssistant();
});

async function handleSampleGridClick(gridEl, event) {
  const deleteId = event.target.dataset.delete;
  const annotateId = event.target.dataset.annotate;
  const reviewId = event.target.dataset.reviewCard;
  const viewId = event.target.dataset.view;
  if (viewId) {
    if (window.ImageViewerModule) window.ImageViewerModule.openSingleViewer(viewId);
    return;
  }
  if (annotateId) {
    if (window.AnnotationView) window.AnnotationView.openAnnotation(annotateId);
    return;
  }
  if (reviewId) {
    if (window.ReviewModule) window.ReviewModule.openReviewModal(reviewId);
    return;
  }
  const historyId = event.target.dataset.history;
  if (historyId) {
    openVersionHistoryModal(historyId);
    return;
  }
  if (deleteId) {
    if (!confirm("确定删除该样本？删除后可在回收站中恢复。")) return;
    await window.DataManager.deleteSample(deleteId);
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

    let possibleMinerals = "";
    let suggestedObservations = "";
    if (window.MineralAssistant) {
      const analysis = window.MineralAssistant.analyzeSample(sample);
      possibleMinerals = (analysis.inferredMinerals || [])
        .filter((m) => m.confidence >= 20)
        .map((m) => `${m.name}(${Math.round(m.confidence)}%)`)
        .join("; ");
      suggestedObservations = (analysis.suggestions || [])
        .map((s) => (typeof s === "string" ? s : s.text || ""))
        .filter(Boolean)
        .join("; ");
    }

    return {
      样本编号: sample.code,
      采样地点: sample.location,
      放大倍数: sample.magnification,
      偏光类型: sample.polarization,
      主要矿物: sample.minerals,
      颗粒结构: sample.texture,
      老师批注: sample.comment,
      观察特征: (sample.observationFeatures || []).join("; "),
      可能矿物_辅助: possibleMinerals,
      待观察项_辅助: suggestedObservations,
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

async function confirmImport() {
  if (!importPreviewData || !importAnalysis) return;

  const skipDup = importSkipDup?.checked ?? true;
  let imported = 0;
  let skipped = 0;

  const existingCodes = new Set(state.samples.map((s) => s.code));
  const importedCodes = new Set();

  for (const { sample } of importAnalysis.validRows) {
    if (skipDup) {
      if (existingCodes.has(sample.code) || importedCodes.has(sample.code)) {
        skipped++;
        continue;
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

    await window.DataManager.addSample(newSample);
    importedCodes.add(sample.code);
    imported++;
  }

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

let lessonState = {
  selectedTaskIds: new Set(),
  selectedAnswerTaskIds: new Set(),
  currentAnswers: {},
  selectedSubmissionId: null,
  studentInfo: { name: "", studentId: "", className: "" },
  gradingView: "student"
};

let lessonModuleState = null;

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

let conflictResolve = null;
let duplicateResolve = null;

function showConflictModal(conflicts) {
  return new Promise((resolve) => {
    const modal = $("#conflictModal");
    const list = $("#conflictList");

    list.innerHTML = conflicts.slice(0, 20).map(c => `
      <div class="conflict-item">
        <span class="conflict-code">${escapeHtml(c.code)}</span>
        <span class="conflict-label">与已有样本编号重复</span>
      </div>
    `).join("") + (conflicts.length > 20 ? `<div class="conflict-more">... 还有 ${conflicts.length - 20} 个重复</div>` : "");

    $$('input[name="conflictStrategy"]', modal).forEach(r => { r.checked = r.value === "skip"; });

    modal.classList.remove("hidden");
    conflictResolve = resolve;
  });
}

function initConflictModalEvents() {
  $("#conflictModalClose")?.addEventListener("click", () => {
    $("#conflictModal")?.classList.add("hidden");
    if (conflictResolve) { conflictResolve(null); conflictResolve = null; }
  });
  $("#conflictCancelBtn")?.addEventListener("click", () => {
    $("#conflictModal")?.classList.add("hidden");
    if (conflictResolve) { conflictResolve(null); conflictResolve = null; }
  });
  $("#conflictConfirmBtn")?.addEventListener("click", () => {
    const selected = $('input[name="conflictStrategy"]:checked', $("#conflictModal"));
    const strategy = selected ? selected.value : "skip";
    $("#conflictModal")?.classList.add("hidden");
    if (conflictResolve) { conflictResolve(strategy); conflictResolve = null; }
  });
  $("#conflictModal")?.addEventListener("click", (e) => {
    if (e.target.id === "conflictModal") {
      $("#conflictModal")?.classList.add("hidden");
      if (conflictResolve) { conflictResolve(null); conflictResolve = null; }
    }
  });
}

function showDuplicateModal(studentInfo, existingSubmission) {
  return new Promise((resolve) => {
    const modal = $("#duplicateModal");
    const desc = $("#duplicateDesc");
    desc.innerHTML = `学号 <strong>${escapeHtml(studentInfo.studentId)}</strong>（${escapeHtml(studentInfo.name)}）的作答已存在（提交于 ${formatDateTime(existingSubmission.importedAt)}），是否覆盖？`;
    modal.classList.remove("hidden");
    duplicateResolve = resolve;
  });
}

function initDuplicateModalEvents() {
  $("#duplicateModalClose")?.addEventListener("click", () => {
    $("#duplicateModal")?.classList.add("hidden");
    if (duplicateResolve) { duplicateResolve(null); duplicateResolve = null; }
  });
  $("#duplicateSkipBtn")?.addEventListener("click", () => {
    $("#duplicateModal")?.classList.add("hidden");
    if (duplicateResolve) { duplicateResolve(false); duplicateResolve = null; }
  });
  $("#duplicateOverwriteBtn")?.addEventListener("click", () => {
    $("#duplicateModal")?.classList.add("hidden");
    if (duplicateResolve) { duplicateResolve(true); duplicateResolve = null; }
  });
  $("#duplicateModal")?.addEventListener("click", (e) => {
    if (e.target.id === "duplicateModal") {
      $("#duplicateModal")?.classList.add("hidden");
      if (duplicateResolve) { duplicateResolve(null); duplicateResolve = null; }
    }
  });
}

function initLessonUI() {
  if (!window.LessonPackage) return;

  const exportLessonBtn = $("#exportLessonBtn");
  const importLessonBtn = $("#importLessonBtn");
  const exportAnswerBtn = $("#exportAnswerBtn");
  const lessonFileInput = $("#lessonFileInput");
  const answerFileInput = $("#answerFileInput");
  const importAnswerBtn = $("#importAnswerBtn");

  exportLessonBtn?.addEventListener("click", showExportLessonModal);
  importLessonBtn?.addEventListener("click", () => lessonFileInput?.click());
  exportAnswerBtn?.addEventListener("click", showExportAnswerModal);
  importAnswerBtn?.addEventListener("click", () => answerFileInput?.click());

  lessonFileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await window.LessonPackage.importLessonPackage(file, {
        conflictStrategy: window.LessonPackage.CONFLICT_STRATEGIES.SKIP,
        onConflict: showConflictModal
      });
      alert(`导入成功！\n导入了 ${result.sampleCount} 个样本、${result.taskCount} 个任务${result.skippedCount > 0 ? `\n跳过了 ${result.skippedCount} 个重复样本` : ""}`);
      state = window.DataManager.getState();
      renderAll();
      renderLessonPage();
    } catch (err) {
      if (err.message !== "用户取消导入") {
        alert("导入失败：" + err.message);
      }
    } finally {
      lessonFileInput.value = "";
    }
  });

  answerFileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await window.LessonPackage.importAnswerPackage(file, {
        onDuplicate: showDuplicateModal
      });
      alert(result.isUpdate ? "作答包已更新！" : "作答包导入成功！");
      renderGradingPage();
    } catch (err) {
      if (err.message !== "用户取消导入") {
        alert("导入失败：" + err.message);
      }
    } finally {
      answerFileInput.value = "";
    }
  });

  $("#lessonModalClose")?.addEventListener("click", closeLessonModal);
  $("#answerModalClose")?.addEventListener("click", closeAnswerModal);

  $("#lessonModal")?.addEventListener("click", (e) => {
    if (e.target.id === "lessonModal") closeLessonModal();
  });
  $("#answerModal")?.addEventListener("click", (e) => {
    if (e.target.id === "answerModal") closeAnswerModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("#lessonModal")?.classList.contains("hidden")) closeLessonModal();
      if (!$("#answerModal")?.classList.contains("hidden")) closeAnswerModal();
      if (!$("#conflictModal")?.classList.contains("hidden")) {
        $("#conflictModal")?.classList.add("hidden");
        if (conflictResolve) { conflictResolve(null); conflictResolve = null; }
      }
      if (!$("#duplicateModal")?.classList.contains("hidden")) {
        $("#duplicateModal")?.classList.add("hidden");
        if (duplicateResolve) { duplicateResolve(null); duplicateResolve = null; }
      }
      if (!document.getElementById("versionHistoryModal")?.classList.contains("hidden")) {
        closeVersionHistoryModal();
      }
    }
  });

  initConflictModalEvents();
  initDuplicateModalEvents();
  initGradingFilters();
}

function renderLessonPage() {
  if (!window.LessonPackage) return;
  renderImportedPackages();
  renderLessonTaskList();
  renderAnswerList();
}

function renderImportedPackages() {
  const container = $("#importedPackageList");
  if (!container) return;

  const packages = window.LessonPackage.getImportedLessonPackages();

  if (packages.length === 0) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:var(--muted);">还没有导入课堂包，点击上方「导入课堂包」开始</p>';
    return;
  }

  container.innerHTML = packages.map(pkg => {
    const lessonTasks = state.tasks.filter(t => t.lessonPackageId === pkg.packageId);
    const sampleCount = new Set(lessonTasks.flatMap(t => t.sampleIds)).size;
    return `
      <div class="imported-package-card">
        <div class="imported-package-header">
          <h4>${escapeHtml(pkg.title)}</h4>
          <span class="badge lesson-badge">${pkg.submissionCount} 份提交</span>
        </div>
        ${pkg.description ? `<p class="imported-package-desc">${escapeHtml(pkg.description)}</p>` : ""}
        <div class="imported-package-meta">
          <span>${lessonTasks.length} 个任务</span>
          <span>${sampleCount} 个样本</span>
          <span>${pkg.rubrics.length} 个评分项</span>
          <span>导入于 ${formatDateTime(pkg.importedAt)}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderLessonTaskList() {
  const container = $("#lessonTaskList");
  if (!container) return;

  if (state.tasks.length === 0) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:var(--muted);">还没有观察任务，请先到「观察任务」页创建</p>';
    return;
  }

  const lessonTasks = state.tasks.filter(t => t.lessonPackageId);
  const regularTasks = state.tasks.filter(t => !t.lessonPackageId);

  let html = "";

  if (lessonTasks.length > 0) {
    html += `<h4 style="margin:16px 0 8px;color:var(--primary);">📦 导入的课堂任务</h4>`;
    html += lessonTasks.map(task => renderLessonTaskCard(task, true)).join("");
  }

  if (regularTasks.length > 0) {
    html += `<h4 style="margin:16px 0 8px;color:var(--muted);">📝 我的任务（可用于导出课堂包）</h4>`;
    html += regularTasks.map(task => renderLessonTaskCard(task, false)).join("");
  }

  container.innerHTML = html;

  $$('[data-answer-task]', container).forEach(btn => {
    btn.addEventListener("click", (e) => {
      const taskId = e.currentTarget.dataset.answerTask;
      openAnswerModal(taskId);
    });
  });
}

function renderLessonTaskCard(task, isImported) {
  const progress = getTaskProgress(task);
  return `
    <div class="lesson-task-card ${isImported ? "imported" : ""}">
      <div class="lesson-task-header">
        <h4>${escapeHtml(task.title)}</h4>
        ${isImported ? '<span class="badge lesson-badge">课堂任务</span>' : ""}
      </div>
      <p class="lesson-task-desc">${escapeHtml(task.objective || "").slice(0, 100)}</p>
      <div class="lesson-task-meta">
        <span>关联 ${task.sampleIds.length} 个样本</span>
        <span>完成 ${progress.completed}/${progress.total}</span>
      </div>
      <div class="lesson-task-actions">
        ${isImported ? `<button type="button" class="primary" data-answer-task="${task.id}">✍️ 填写作答</button>` : ""}
      </div>
    </div>
  `;
}

function renderAnswerList() {
  const container = $("#answerList");
  if (!container) return;

  const sampleIds = new Set();
  state.tasks.forEach(t => t.sampleIds.forEach(sid => sampleIds.add(sid)));

  const answeredCount = Object.keys(lessonState.currentAnswers).length;

  if (sampleIds.size === 0) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:var(--muted);">导入课堂包后即可开始作答</p>';
    return;
  }

  container.innerHTML = `
    <div class="answer-summary">
      <div class="answer-stat">
        <span class="stat-label">待作答样本</span>
        <span class="stat-value">${sampleIds.size}</span>
      </div>
      <div class="answer-stat">
        <span class="stat-label">已作答</span>
        <span class="stat-value success">${answeredCount}</span>
      </div>
      <div class="answer-stat">
        <span class="stat-label">完成进度</span>
        <span class="stat-value">${sampleIds.size > 0 ? Math.round((answeredCount / sampleIds.size) * 100) : 0}%</span>
      </div>
    </div>
  `;
}

function showExportLessonModal() {
  lessonState.selectedTaskIds.clear();

  const modal = $("#lessonModal");
  const title = $("#lessonModalTitle");
  const body = $("#lessonModalBody");
  const footer = $("#lessonModalFooter");

  const defaultRubrics = window.LessonPackage.getRubrics();

  title.textContent = "📦 导出课堂包";

  body.innerHTML = `
    <div class="form-group">
      <label>课堂包标题 <span style="color:var(--danger);">*</span></label>
      <input type="text" id="lessonTitleInput" placeholder="例如：第三章 沉积岩结构观察作业" required>
    </div>
    <div class="form-group">
      <label>课堂说明</label>
      <textarea id="lessonDescInput" rows="3" placeholder="描述本次课堂的要求和说明..."></textarea>
    </div>
    <div class="form-group">
      <label>选择要导出的任务 <span style="color:var(--danger);">*</span></label>
      <div class="task-picker-list" id="exportTaskPicker">
        ${state.tasks.length === 0 ? '<p style="padding:20px;text-align:center;color:var(--muted);">还没有任务，请先创建</p>' :
          state.tasks.map(task => `
            <label class="picker-checkbox">
              <input type="checkbox" value="${task.id}">
              <span class="picker-label">
                <strong>${escapeHtml(task.title)}</strong>
                <small>（${task.sampleIds.length} 个样本）</small>
              </span>
            </label>
          `).join("")
        }
      </div>
    </div>
    <div class="form-group">
      <label>评分项配置</label>
      <div id="rubricEditor" class="rubric-editor">
        ${defaultRubrics.map((r, i) => `
          <div class="rubric-row" data-rubric-index="${i}">
            <input type="text" class="rubric-name" value="${escapeHtml(r.name)}" placeholder="评分项名称">
            <input type="number" class="rubric-score" value="${r.maxScore}" min="0" placeholder="满分">
            <input type="text" class="rubric-desc" value="${escapeHtml(r.description)}" placeholder="评分说明">
            <button type="button" class="ghost rubric-remove" data-remove-rubric="${i}">✕</button>
          </div>
        `).join("")}
      </div>
      <button type="button" class="ghost" id="addRubricBtn">+ 添加评分项</button>
    </div>
    <div class="form-group">
      <label class="inline-label">
        <input type="checkbox" id="includePhotos" checked>
        包含照片数据（文件会较大，但学生可离线查看）
      </label>
    </div>
  `;

  footer.innerHTML = `
    <button type="button" class="ghost" onclick="closeLessonModal()">取消</button>
    <button type="button" class="primary" id="confirmExportLessonBtn" disabled>导出课堂包</button>
  `;

  $$('input[type="checkbox"]', body).forEach(cb => {
    cb.addEventListener("change", () => {
      const checked = $$('input[type="checkbox"]:not(#includePhotos):checked', body);
      $("#confirmExportLessonBtn").disabled = checked.length === 0;
    });
  });

  let rubricIndex = defaultRubrics.length;
  $("#addRubricBtn")?.addEventListener("click", () => {
    const editor = $("#rubricEditor");
    const row = document.createElement("div");
    row.className = "rubric-row";
    row.dataset.rubricIndex = rubricIndex;
    row.innerHTML = `
      <input type="text" class="rubric-name" value="" placeholder="评分项名称">
      <input type="number" class="rubric-score" value="10" min="0" placeholder="满分">
      <input type="text" class="rubric-desc" value="" placeholder="评分说明">
      <button type="button" class="ghost rubric-remove" data-remove-rubric="${rubricIndex}">✕</button>
    `;
    editor.appendChild(row);
    rubricIndex++;
    bindRubricRemoveButtons();
  });

  function bindRubricRemoveButtons() {
    $$('[data-remove-rubric]', body).forEach(btn => {
      btn.onclick = () => {
        const row = btn.closest(".rubric-row");
        if (row) row.remove();
      };
    });
  }
  bindRubricRemoveButtons();

  $("#confirmExportLessonBtn").addEventListener("click", async () => {
    const title = $("#lessonTitleInput").value.trim();
    const description = $("#lessonDescInput").value.trim();
    const includePhotos = $("#includePhotos").checked;
    const taskIds = $$('input[type="checkbox"]:not(#includePhotos):checked', body).map(cb => cb.value);

    if (!title || taskIds.length === 0) return;

    const rubricRows = $$(".rubric-row", body);
    const rubrics = [];
    rubricRows.forEach(row => {
      const name = row.querySelector(".rubric-name").value.trim();
      const maxScore = parseInt(row.querySelector(".rubric-score").value, 10) || 0;
      const desc = row.querySelector(".rubric-desc").value.trim();
      if (name && maxScore > 0) {
        rubrics.push({ id: crypto.randomUUID(), name, maxScore, description: desc });
      }
    });

    try {
      $("#confirmExportLessonBtn").disabled = true;
      $("#confirmExportLessonBtn").textContent = "导出中...";

      await window.LessonPackage.downloadLessonPackage({
        taskIds,
        title,
        description,
        includePhotos,
        rubrics: rubrics.length > 0 ? rubrics : null
      });

      closeLessonModal();
      alert("课堂包导出成功！");
    } catch (err) {
      alert("导出失败：" + err.message);
    } finally {
      $("#confirmExportLessonBtn").disabled = false;
      $("#confirmExportLessonBtn").textContent = "导出课堂包";
    }
  });

  modal.classList.remove("hidden");
}

function closeLessonModal() {
  $("#lessonModal")?.classList.add("hidden");
  lessonState.selectedTaskIds.clear();
}

function openAnswerModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const modal = $("#answerModal");
  const title = $("#answerModalTitle");
  const body = $("#answerModalBody");
  const footer = $("#answerModalFooter");

  title.textContent = `✍️ 作答：${task.title}`;

  const samples = task.sampleIds
    .map(sid => state.samples.find(s => s.id === sid))
    .filter(Boolean);

  if (samples.length === 0) {
    body.innerHTML = '<p style="padding:40px;text-align:center;color:var(--muted);">该任务没有关联样本</p>';
    footer.innerHTML = '<button type="button" class="ghost" onclick="closeAnswerModal()">关闭</button>';
    modal.classList.remove("hidden");
    return;
  }

  body.innerHTML = `
    <div class="student-info-section">
      <h4>学生信息</h4>
      <div class="student-info-grid">
        <div class="form-group">
          <label>姓名 <span style="color:var(--danger);">*</span></label>
          <input type="text" id="studentName" value="${escapeHtml(lessonState.studentInfo.name)}" placeholder="请输入姓名">
        </div>
        <div class="form-group">
          <label>学号 <span style="color:var(--danger);">*</span></label>
          <input type="text" id="studentId" value="${escapeHtml(lessonState.studentInfo.studentId)}" placeholder="请输入学号">
        </div>
        <div class="form-group">
          <label>班级</label>
          <input type="text" id="studentClass" value="${escapeHtml(lessonState.studentInfo.className)}" placeholder="请输入班级">
        </div>
      </div>
    </div>

    <div class="answer-samples-nav">
      <h4>样本列表</h4>
      <div class="answer-samples-tabs" id="answerSamplesTabs">
        ${samples.map((s, i) => `
          <button type="button" class="answer-tab ${i === 0 ? "active" : ""}" data-answer-tab="${s.id}">
            ${escapeHtml(s.code)}
            ${lessonState.currentAnswers[s.id] ? '<span class="tab-dot done"></span>' : '<span class="tab-dot"></span>'}
          </button>
        `).join("")}
      </div>
    </div>

    <div class="answer-form-container" id="answerFormContainer">
      ${renderAnswerForm(samples[0])}
    </div>
  `;

  footer.innerHTML = `
    <button type="button" class="ghost" onclick="closeAnswerModal()">取消</button>
    <button type="button" class="primary" id="saveAnswerBtn">保存作答</button>
    <button type="button" class="primary" id="exportAnswerBtn2">导出作答包</button>
  `;

  $$('[data-answer-tab]', body).forEach(tab => {
    tab.addEventListener("click", () => {
      saveCurrentAnswer();
      const sampleId = tab.dataset.answerTab;
      const sample = samples.find(s => s.id === sampleId);
      if (sample) {
        $$('[data-answer-tab]', body).forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        $("#answerFormContainer").innerHTML = renderAnswerForm(sample);
        bindAnswerFormEvents(sample);
      }
    });
  });

  $("#saveAnswerBtn").addEventListener("click", () => {
    saveCurrentAnswer();
    alert("作答已保存到本地！");
    renderAnswerList();
    updateAnswerTabs();
  });

  $("#exportAnswerBtn2").addEventListener("click", async () => {
    saveCurrentAnswer();

    const studentInfo = {
      name: $("#studentName").value.trim(),
      studentId: $("#studentId").value.trim(),
      className: $("#studentClass").value.trim()
    };

    if (!studentInfo.name || !studentInfo.studentId) {
      alert("请填写姓名和学号");
      return;
    }

    lessonState.studentInfo = studentInfo;

    try {
      await window.LessonPackage.downloadAnswerPackage({
        lessonPackageId: task.lessonPackageId || "",
        studentInfo,
        taskIds: [taskId],
        answers: lessonState.currentAnswers
      });
      alert("作答包导出成功！请交给老师评分。");
    } catch (err) {
      alert("导出失败：" + err.message);
    }
  });

  bindAnswerFormEvents(samples[0]);

  modal.classList.remove("hidden");
}

function renderAnswerForm(sample) {
  const answer = lessonState.currentAnswers[sample.id] || {};
  return `
    <div class="answer-form">
      <div class="answer-sample-header">
        ${sample.photo ? `<img src="${sample.photo}" alt="${escapeHtml(sample.code)}" class="answer-sample-photo">` : '<div class="photo-placeholder" style="aspect-ratio:4/3;">暂无照片</div>'}
        <div class="answer-sample-info">
          <h4>${escapeHtml(sample.code)}</h4>
          <p>${escapeHtml(sample.location || "未记录地点")} · ${escapeHtml(sample.magnification || "")} · ${escapeHtml(sample.polarization || "")}</p>
        </div>
      </div>

      <div class="form-group">
        <label>观察到的主要矿物</label>
        <input type="text" name="minerals" value="${escapeHtml(answer.minerals || "")}" placeholder="例如：石英、斜长石、黑云母">
      </div>

      <div class="form-group">
        <label>颗粒结构描述</label>
        <input type="text" name="texture" value="${escapeHtml(answer.texture || "")}" placeholder="例如：半自形粒状结构、碎裂结构">
      </div>

      <div class="form-group">
        <label>观察结论与分析 <span style="color:var(--danger);">*</span></label>
        <textarea name="observation" rows="5" placeholder="详细描述你的观察结果和地质分析..." required>${escapeHtml(answer.observation || "")}</textarea>
      </div>

      <div class="form-group">
        <label>备注</label>
        <textarea name="comment" rows="2" placeholder="其他需要说明的内容...">${escapeHtml(answer.comment || "")}</textarea>
      </div>
    </div>
  `;
}

function bindAnswerFormEvents(sample) {
  const container = $("#answerFormContainer");
  if (!container) return;

  let autoSaveTimer = null;

  $$("input, textarea", container).forEach(field => {
    field.addEventListener("input", () => {
      const formData = new FormData();
      $$("input, textarea", container).forEach(f => {
        formData.set(f.name, f.value);
      });
      const answer = {
        id: `answer-${sample.id}`,
        sampleId: sample.id,
        sampleCode: sample.code,
        lessonPackageId: sample.lessonPackageId || "",
        taskId: "",
        minerals: formData.get("minerals") || "",
        texture: formData.get("texture") || "",
        observation: formData.get("observation") || "",
        comment: formData.get("comment") || "",
        answeredAt: new Date().toISOString()
      };
      lessonState.currentAnswers[sample.id] = answer;

      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(async () => {
        if (window.LessonPackage) {
          try {
            await window.LessonPackage.saveLocalAnswer(answer);
          } catch (e) {}
        }
      }, 1000);
    });
  });
}

function saveCurrentAnswer() {
  const activeTab = $(".answer-tab.active");
  if (!activeTab) return;

  const sampleId = activeTab.dataset.answerTab;
  const container = $("#answerFormContainer");
  if (!container || !sampleId) return;

  const formData = new FormData();
  $$("input, textarea", container).forEach(f => {
    formData.set(f.name, f.value);
  });

  const answer = {
    sampleId,
    sampleCode: "",
    minerals: formData.get("minerals") || "",
    texture: formData.get("texture") || "",
    observation: formData.get("observation") || "",
    comment: formData.get("comment") || "",
    answeredAt: new Date().toISOString()
  };

  if (answer.observation || answer.minerals || answer.texture) {
    lessonState.currentAnswers[sampleId] = answer;
  }
}

function updateAnswerTabs() {
  $$('[data-answer-tab]').forEach(tab => {
    const sampleId = tab.dataset.answerTab;
    const dot = tab.querySelector(".tab-dot");
    if (dot) {
      dot.classList.toggle("done", !!lessonState.currentAnswers[sampleId]);
    }
  });
}

function closeAnswerModal() {
  $("#answerModal")?.classList.add("hidden");
}

function showExportAnswerModal() {
  const lessonTasks = state.tasks.filter(t => t.lessonPackageId);

  if (lessonTasks.length === 0) {
    alert("还没有导入的课堂任务，请先导入课堂包");
    return;
  }

  const modal = $("#answerModal");
  const title = $("#answerModalTitle");
  const body = $("#answerModalBody");
  const footer = $("#answerModalFooter");

  title.textContent = "📤 导出作答包";

  body.innerHTML = `
    <div class="student-info-section">
      <h4>学生信息</h4>
      <div class="student-info-grid">
        <div class="form-group">
          <label>姓名 <span style="color:var(--danger);">*</span></label>
          <input type="text" id="exportStudentName" value="${escapeHtml(lessonState.studentInfo.name)}" placeholder="请输入姓名">
        </div>
        <div class="form-group">
          <label>学号 <span style="color:var(--danger);">*</span></label>
          <input type="text" id="exportStudentId" value="${escapeHtml(lessonState.studentInfo.studentId)}" placeholder="请输入学号">
        </div>
        <div class="form-group">
          <label>班级</label>
          <input type="text" id="exportStudentClass" value="${escapeHtml(lessonState.studentInfo.className)}" placeholder="请输入班级">
        </div>
      </div>
    </div>

    <div class="form-group">
      <label>选择要导出的任务 <span style="color:var(--danger);">*</span></label>
      <div class="task-picker-list" id="exportAnswerTaskPicker">
        ${lessonTasks.map(task => `
          <label class="picker-checkbox">
            <input type="checkbox" value="${task.id}">
            <span class="picker-label">
              <strong>${escapeHtml(task.title)}</strong>
              <small>（${task.sampleIds.length} 个样本）</small>
            </span>
          </label>
        `).join("")}
      </div>
    </div>
  `;

  footer.innerHTML = `
    <button type="button" class="ghost" onclick="closeAnswerModal()">取消</button>
    <button type="button" class="primary" id="confirmExportAnswerBtn" disabled>导出作答包</button>
  `;

  $$('input[type="checkbox"]', body).forEach(cb => {
    cb.addEventListener("change", () => {
      const checked = $$('input[type="checkbox"]:checked', body);
      $("#confirmExportAnswerBtn").disabled = checked.length === 0;
    });
  });

  $("#confirmExportAnswerBtn").addEventListener("click", async () => {
    const studentInfo = {
      name: $("#exportStudentName").value.trim(),
      studentId: $("#exportStudentId").value.trim(),
      className: $("#exportStudentClass").value.trim()
    };

    const taskIds = $$('input[type="checkbox"]:checked', body).map(cb => cb.value);

    if (!studentInfo.name || !studentInfo.studentId || taskIds.length === 0) {
      alert("请填写学生信息并选择任务");
      return;
    }

    lessonState.studentInfo = studentInfo;

    try {
      $("#confirmExportAnswerBtn").disabled = true;
      $("#confirmExportAnswerBtn").textContent = "导出中...";

      await window.LessonPackage.downloadAnswerPackage({
        lessonPackageId: lessonTasks[0]?.lessonPackageId || "",
        studentInfo,
        taskIds,
        answers: lessonState.currentAnswers
      });

      closeAnswerModal();
      alert("作答包导出成功！请交给老师评分。");
    } catch (err) {
      alert("导出失败：" + err.message);
    } finally {
      $("#confirmExportAnswerBtn").disabled = false;
      $("#confirmExportAnswerBtn").textContent = "导出作答包";
    }
  });

  modal.classList.remove("hidden");
}

let gradingFilters = {
  lessonPackageId: "",
  studentId: "",
  taskId: "",
  graded: undefined,
  studentName: ""
};

let gradingState = {
  selectedSubmissionId: null,
  selectedSampleId: null,
  currentScores: {}
};

function initGradingFilters() {
  $("#filterLesson")?.addEventListener("change", (e) => {
    gradingFilters.lessonPackageId = e.target.value;
    renderGradingPage();
  });

  $("#filterStudent")?.addEventListener("change", (e) => {
    gradingFilters.studentId = e.target.value;
    renderGradingPage();
  });

  $("#filterTask")?.addEventListener("change", (e) => {
    gradingFilters.taskId = e.target.value;
    renderGradingPage();
  });

  $("#filterGraded")?.addEventListener("change", (e) => {
    const val = e.target.value;
    gradingFilters.graded = val === "" ? undefined : val === "true";
    renderGradingPage();
  });

  $("#searchStudent")?.addEventListener("input", (e) => {
    gradingFilters.studentName = e.target.value.trim();
    renderGradingPage();
  });

  $$('[data-grading-view]').forEach(btn => {
    btn.addEventListener("click", () => {
      lessonState.gradingView = btn.dataset.gradingView;
      $$('[data-grading-view]').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderGradingPage();
    });
  });

  $("#batchImportAnswerBtn")?.addEventListener("click", () => {
    $("#batchAnswerFileInput")?.click();
  });

  $("#batchAnswerFileInput")?.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    try {
      const result = await window.LessonPackage.batchImportAnswerPackages(files, {
        onDuplicate: showDuplicateModal
      });

      let msg = `批量导入完成！\n成功：${result.totalSuccess} 份\n失败：${result.totalErrors} 份`;
      if (result.errors.length > 0) {
        msg += "\n\n失败详情：\n";
        result.errors.slice(0, 5).forEach(err => {
          msg += `  - ${err.file}: ${err.cancelled ? "已跳过" : err.error}\n`;
        });
        if (result.errors.length > 5) {
          msg += `  ... 还有 ${result.errors.length - 5} 个错误`;
        }
      }
      alert(msg);
      renderGradingPage();
    } catch (err) {
      alert("批量导入失败：" + err.message);
    } finally {
      e.target.value = "";
    }
  });

  $("#exportGradingBtn")?.addEventListener("click", async () => {
    if (!gradingFilters.lessonPackageId) {
      alert("请先选择一个课堂包");
      return;
    }

    try {
      await window.LessonPackage.downloadGradingResults(gradingFilters.lessonPackageId);
      alert("评分结果导出成功！");
    } catch (err) {
      alert("导出失败：" + err.message);
    }
  });
}

function renderGradingPage() {
  if (!window.LessonPackage) return;

  updateGradingFilterOptions();
  updateGradingStats();

  const view = lessonState.gradingView || "student";

  if (view === "student") {
    renderSubmissionList();
    renderGradingDetail();
    $("#gradingMainContent")?.classList.remove("hidden");
    $("#gradingAggregate")?.classList.add("hidden");
  } else if (view === "task") {
    renderAggregateByTask();
    $("#gradingMainContent")?.classList.add("hidden");
    $("#gradingAggregate")?.classList.remove("hidden");
  } else if (view === "sample") {
    renderAggregateBySample();
    $("#gradingMainContent")?.classList.add("hidden");
    $("#gradingAggregate")?.classList.remove("hidden");
  }
}

function updateGradingFilterOptions() {
  const lessons = window.LessonPackage.getUniqueLessons();
  const students = window.LessonPackage.getUniqueStudents();

  const lessonSelect = $("#filterLesson");
  if (lessonSelect) {
    const currentVal = lessonSelect.value;
    lessonSelect.innerHTML = '<option value="">全部课堂包</option>' +
      lessons.map(l => `<option value="${l.lessonPackageId}">${escapeHtml(l.title)} (${l.submissionCount}份)</option>`).join("");
    lessonSelect.value = currentVal;
  }

  const studentSelect = $("#filterStudent");
  if (studentSelect) {
    const currentVal = studentSelect.value;
    studentSelect.innerHTML = '<option value="">全部学生</option>' +
      students.map(s => `<option value="${s.studentId}">${escapeHtml(s.name)} (${s.studentId})</option>`).join("");
    studentSelect.value = currentVal;
  }

  const taskSelect = $("#filterTask");
  if (taskSelect) {
    const currentVal = taskSelect.value;
    const allTasks = new Set();
    window.LessonPackage.getAllSubmissions().forEach(sub => {
      sub.tasks.forEach(t => allTasks.add(t.title));
    });
    taskSelect.innerHTML = '<option value="">全部任务</option>' +
      Array.from(allTasks).map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    taskSelect.value = currentVal;
  }
}

function updateGradingStats() {
  const submissions = window.LessonPackage.getAllSubmissions();
  const graded = submissions.filter(s => Object.keys(s.scores || {}).length > 0);
  const ungraded = submissions.filter(s => Object.keys(s.scores || {}).length === 0);
  const scored = submissions.filter(s => s.finalScore !== null);
  const avg = scored.length > 0
    ? Math.round(scored.reduce((sum, s) => sum + (s.finalScore || 0), 0) / scored.length)
    : 0;

  if ($("#statTotal")) $("#statTotal").textContent = submissions.length;
  if ($("#statGraded")) $("#statGraded").textContent = graded.length;
  if ($("#statUngraded")) $("#statUngraded").textContent = ungraded.length;
  if ($("#statAvg")) $("#statAvg").textContent = avg;
}

function renderSubmissionList() {
  const container = $("#submissionList");
  if (!container) return;

  const submissions = window.LessonPackage.getFilteredSubmissions(gradingFilters);

  if (submissions.length === 0) {
    container.innerHTML = '<p style="padding:40px;text-align:center;color:var(--muted);">暂无提交记录</p>';
    return;
  }

  container.innerHTML = submissions.map(sub => {
    const isGraded = Object.keys(sub.scores || {}).length > 0;
    const sampleCount = Object.keys(sub.answers || {}).length;
    return `
      <div class="submission-card ${sub.id === gradingState.selectedSubmissionId ? "active" : ""}" data-submission-id="${sub.id}">
        <div class="submission-header">
          <h4>${escapeHtml(sub.studentInfo.name)}</h4>
          <span class="badge ${isGraded ? "completed" : "pending"}">${isGraded ? "已评分" : "待评分"}</span>
        </div>
        <div class="submission-meta">
          <span>学号：${escapeHtml(sub.studentInfo.studentId)}</span>
          ${sub.studentInfo.className ? `<span>班级：${escapeHtml(sub.studentInfo.className)}</span>` : ""}
        </div>
        <div class="submission-stats">
          <span>作答 ${sampleCount} 个样本</span>
          ${sub.finalScore !== null ? `<span class="score">${sub.finalScore} 分</span>` : ""}
        </div>
        <div class="submission-date">
          提交：${formatDateTime(sub.importedAt)}
        </div>
      </div>
    `;
  }).join("");

  $$('[data-submission-id]', container).forEach(card => {
    card.addEventListener("click", () => {
      gradingState.selectedSubmissionId = card.dataset.submissionId;
      renderSubmissionList();
      renderGradingDetail();
    });
  });
}

function renderGradingDetail() {
  const emptyEl = $("#gradingEmpty");
  const detailEl = $("#gradingDetail");

  if (!gradingState.selectedSubmissionId) {
    emptyEl?.classList.remove("hidden");
    detailEl?.classList.add("hidden");
    return;
  }

  const submission = window.LessonPackage.getSubmissionById(gradingState.selectedSubmissionId);
  if (!submission) {
    emptyEl?.classList.remove("hidden");
    detailEl?.classList.add("hidden");
    return;
  }

  emptyEl?.classList.add("hidden");
  detailEl?.classList.remove("hidden");

  const rubrics = window.LessonPackage.getRubrics();
  const answers = Object.entries(submission.answers || {});

  detailEl.innerHTML = `
    <div class="grading-detail-header">
      <div>
        <h3>${escapeHtml(submission.studentInfo.name)} 的作答</h3>
        <p>学号：${escapeHtml(submission.studentInfo.studentId)}${submission.studentInfo.className ? ` · 班级：${escapeHtml(submission.studentInfo.className)}` : ""}</p>
      </div>
      <div class="grading-detail-actions">
        ${submission.finalScore !== null ? `<span class="final-score">总分：${submission.finalScore} 分</span>` : ""}
        <button type="button" class="danger" id="deleteSubmissionBtn">删除</button>
      </div>
    </div>

    <div class="grading-samples-nav">
      ${answers.map(([sampleId, answer], i) => {
        const score = submission.scores?.[sampleId];
        const isActive = sampleId === gradingState.selectedSampleId || (i === 0 && !gradingState.selectedSampleId);
        if (i === 0 && !gradingState.selectedSampleId) gradingState.selectedSampleId = sampleId;
        return `
          <button type="button" class="grading-tab ${isActive ? "active" : ""}" data-grading-tab="${sampleId}">
            ${escapeHtml(answer.sampleCode || sampleId.slice(0, 8))}
            ${score ? '<span class="tab-dot done"></span>' : '<span class="tab-dot"></span>'}
          </button>
        `;
      }).join("")}
    </div>

    <div class="grading-content" id="gradingContent">
      ${renderGradingSampleContent(submission, gradingState.selectedSampleId || answers[0]?.[0], rubrics)}
    </div>
  `;

  $$('[data-grading-tab]', detailEl).forEach(tab => {
    tab.addEventListener("click", () => {
      saveCurrentScore();
      gradingState.selectedSampleId = tab.dataset.gradingTab;
      renderGradingDetail();
    });
  });

  $("#deleteSubmissionBtn")?.addEventListener("click", async () => {
    if (!confirm("确定删除该学生的作答记录？此操作不可撤销。")) return;
    await window.LessonPackage.deleteSubmission(gradingState.selectedSubmissionId);
    gradingState.selectedSubmissionId = null;
    gradingState.selectedSampleId = null;
    renderGradingPage();
  });

  bindGradingFormEvents(submission, gradingState.selectedSampleId || answers[0]?.[0], rubrics);
}

function renderGradingSampleContent(submission, sampleId, rubrics) {
  const answer = submission.answers?.[sampleId];
  const existingScore = submission.scores?.[sampleId];

  if (!answer) {
    return '<p style="padding:40px;text-align:center;color:var(--muted);">该样本没有作答记录</p>';
  }

  const sample = state.samples.find(s => s.id === sampleId);

  const referenceAnswers = window.LessonPackage.getReferenceAnswersForLesson(submission.lessonPackageId);
  const refAnswer = referenceAnswers[sampleId] || null;

  const lessonMeta = window.LessonPackage.getLessonMeta(submission.lessonPackageId);
  const lessonRubrics = submission.lessonPackageId
    ? window.LessonPackage.getRubricsForLesson(submission.lessonPackageId)
    : rubrics;

  let referenceSection = "";
  if (refAnswer) {
    referenceSection = `
      <div class="reference-section">
        <h4>📋 参考答案</h4>
        <div class="reference-compare">
          <div class="compare-col student-col">
            <h5>学生作答</h5>
            <div class="compare-field">
              <span class="compare-label">主要矿物</span>
              <span class="compare-value ${refAnswer.minerals && !answer.minerals ? 'missing' : ''}">${escapeHtml(answer.minerals || "未填写")}</span>
            </div>
            <div class="compare-field">
              <span class="compare-label">颗粒结构</span>
              <span class="compare-value ${refAnswer.texture && !answer.texture ? 'missing' : ''}">${escapeHtml(answer.texture || "未填写")}</span>
            </div>
            <div class="compare-field">
              <span class="compare-label">观察结论</span>
              <span class="compare-value ${!answer.observation ? 'missing' : ''}">${escapeHtml(answer.observation || "未填写")}</span>
            </div>
          </div>
          <div class="compare-col reference-col">
            <h5>参考答案</h5>
            <div class="compare-field">
              <span class="compare-label">主要矿物</span>
              <span class="compare-value">${escapeHtml(refAnswer.minerals || "—")}</span>
            </div>
            <div class="compare-field">
              <span class="compare-label">颗粒结构</span>
              <span class="compare-value">${escapeHtml(refAnswer.texture || "—")}</span>
            </div>
            <div class="compare-field">
              <span class="compare-label">老师批注</span>
              <span class="compare-value">${escapeHtml(refAnswer.comment || "—")}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="grading-sample-content">
      <div class="answer-sample-header">
        ${sample?.photo ? `<img src="${sample.photo}" alt="${escapeHtml(answer.sampleCode || "")}" class="answer-sample-photo">` : '<div class="photo-placeholder" style="aspect-ratio:4/3;">暂无照片</div>'}
        <div class="answer-sample-info">
          <h4>${escapeHtml(answer.sampleCode || "未知样本")}</h4>
          ${answer.answeredAt ? `<p>作答时间：${formatDateTime(answer.answeredAt)}</p>` : ""}
          ${lessonMeta ? `<p>课堂包：${escapeHtml(lessonMeta.title || "未知")}</p>` : ""}
        </div>
      </div>

      ${!refAnswer ? `
      <div class="answer-display">
        <div class="answer-field">
          <label>主要矿物</label>
          <p>${escapeHtml(answer.minerals || "未填写")}</p>
        </div>
        <div class="answer-field">
          <label>颗粒结构</label>
          <p>${escapeHtml(answer.texture || "未填写")}</p>
        </div>
        <div class="answer-field">
          <label>观察结论与分析</label>
          <p style="white-space:pre-wrap;">${escapeHtml(answer.observation || "未填写")}</p>
        </div>
        ${answer.comment ? `
          <div class="answer-field">
            <label>备注</label>
            <p>${escapeHtml(answer.comment)}</p>
          </div>
        ` : ""}
      </div>
      ` : ""}

      ${referenceSection}

      <div class="scoring-section">
        <h4>评分项${lessonMeta ? `（${escapeHtml(lessonMeta.title)}）` : ""}</h4>
        <div class="scoring-form">
          ${lessonRubrics.map(r => {
            const score = existingScore?.[r.id] ?? "";
            return `
              <div class="scoring-item">
                <label>
                  <span>${escapeHtml(r.name)} <small>（满分 ${r.maxScore} 分）</small></span>
                  <small class="scoring-desc">${escapeHtml(r.description)}</small>
                </label>
                <input type="number" name="${r.id}" min="0" max="${r.maxScore}" value="${score}" placeholder="0-${r.maxScore}">
              </div>
            `;
          }).join("")}
          <div class="scoring-item">
            <label>老师评语</label>
            <textarea name="teacherComment" rows="3" placeholder="给学生的反馈意见...">${existingScore?.comment || ""}</textarea>
          </div>
        </div>
        <div class="scoring-actions">
          <button type="button" class="primary" id="saveScoreBtn">保存评分</button>
        </div>
      </div>
    </div>
  `;
}

function bindGradingFormEvents(submission, sampleId, rubrics) {
  const container = $("#gradingContent");
  if (!container) return;

  $("#saveScoreBtn")?.addEventListener("click", async () => {
    await saveCurrentScore();
    alert("评分已保存！");
    renderGradingPage();
  });
}

async function saveCurrentScore() {
  if (!gradingState.selectedSubmissionId || !gradingState.selectedSampleId) return;

  const container = $("#gradingContent");
  if (!container) return;

  const submission = window.LessonPackage.getSubmissionById(gradingState.selectedSubmissionId);
  const rubrics = submission?.lessonPackageId
    ? window.LessonPackage.getRubricsForLesson(submission.lessonPackageId)
    : window.LessonPackage.getRubrics();

  const scores = {};

  rubrics.forEach(r => {
    const input = container.querySelector(`input[name="${r.id}"]`);
    if (input) {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val >= 0 && val <= r.maxScore) {
        scores[r.id] = val;
      }
    }
  });

  const commentInput = container.querySelector('textarea[name="teacherComment"]');
  const comment = commentInput?.value || "";

  if (Object.keys(scores).length > 0) {
    await window.LessonPackage.saveScore(
      gradingState.selectedSubmissionId,
      gradingState.selectedSampleId,
      scores,
      comment
    );
  }
}

function renderAggregateByTask() {
  const container = $("#gradingAggregate");
  if (!container) return;

  const lessonId = gradingFilters.lessonPackageId;
  if (!lessonId) {
    container.innerHTML = '<div class="aggregate-empty"><p>请先选择一个课堂包查看按任务汇总</p></div>';
    return;
  }

  const tasks = window.LessonPackage.getAggregatedByTask(lessonId);

  if (tasks.length === 0) {
    container.innerHTML = '<div class="aggregate-empty"><p>暂无任务数据</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="aggregate-header">
      <h3>按任务汇总</h3>
      <p class="aggregate-subtitle">共 ${tasks.length} 个任务</p>
    </div>
    <div class="aggregate-tasks">
      ${tasks.map(task => {
        const avgScore = task.students.length > 0
          ? Math.round(task.students.reduce((sum, s) => sum + (s.finalScore || 0), 0) / task.students.length)
          : 0;
        const gradedCount = task.students.filter(s => Object.keys(s.scores || {}).length > 0).length;
        return `
          <div class="aggregate-task-card">
            <div class="aggregate-task-header">
              <h4>${escapeHtml(task.taskTitle)}</h4>
              <span class="badge">${task.sampleIds.length} 个样本</span>
            </div>
            <div class="aggregate-task-stats">
              <div class="stat-mini">
                <span class="stat-mini-label">提交人数</span>
                <span class="stat-mini-value">${task.students.length}</span>
              </div>
              <div class="stat-mini">
                <span class="stat-mini-label">已评分</span>
                <span class="stat-mini-value success">${gradedCount}</span>
              </div>
              <div class="stat-mini">
                <span class="stat-mini-label">平均分</span>
                <span class="stat-mini-value">${avgScore}</span>
              </div>
            </div>
            <div class="aggregate-student-list">
              ${task.students.map(student => {
                const hasScore = Object.keys(student.scores || {}).length > 0;
                return `
                  <div class="aggregate-student-item">
                    <span class="student-name">${escapeHtml(student.studentInfo.name)}</span>
                    <span class="student-id">${escapeHtml(student.studentInfo.studentId)}</span>
                    <span class="student-score ${hasScore ? '' : 'pending'}">
                      ${student.finalScore !== null ? student.finalScore + '分' : '待评分'}
                    </span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderAggregateBySample() {
  const container = $("#gradingAggregate");
  if (!container) return;

  const lessonId = gradingFilters.lessonPackageId;
  if (!lessonId) {
    container.innerHTML = '<div class="aggregate-empty"><p>请先选择一个课堂包查看按样本汇总</p></div>';
    return;
  }

  const samples = window.LessonPackage.getAggregatedBySample(lessonId);
  const referenceAnswers = window.LessonPackage.getReferenceAnswersForLesson(lessonId);

  if (samples.length === 0) {
    container.innerHTML = '<div class="aggregate-empty"><p>暂无样本数据</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="aggregate-header">
      <h3>按样本汇总</h3>
      <p class="aggregate-subtitle">共 ${samples.length} 个样本</p>
    </div>
    <div class="aggregate-samples">
      ${samples.map(sample => {
        const refAnswer = referenceAnswers[sample.sampleId];
        const avgScore = sample.students.length > 0
          ? Math.round(sample.students.reduce((sum, s) => {
              const score = s.score;
              if (!score) return sum;
              const sampleTotal = Object.entries(score)
                .filter(([k]) => k !== "comment" && k !== "scoredAt")
                .reduce((acc, [, v]) => acc + (typeof v === "number" ? v : 0), 0);
              return sum + sampleTotal;
            }, 0) / sample.students.length)
          : 0;
        const sampleInfo = state.samples.find(s => s.id === sample.sampleId);
        return `
          <div class="aggregate-sample-card">
            <div class="aggregate-sample-header">
              <h4>${escapeHtml(sampleInfo?.code || sample.sampleId.slice(0, 8))}</h4>
              <span class="badge">${sample.students.length} 人作答</span>
            </div>
            ${refAnswer ? `
              <div class="aggregate-ref-answer">
                <span class="ref-label">参考答案：</span>
                <span class="ref-value">${escapeHtml(refAnswer.minerals || "—")}</span>
              </div>
            ` : ""}
            <div class="aggregate-sample-stats">
              <span>平均分：${avgScore} 分</span>
            </div>
            <div class="aggregate-student-list">
              ${sample.students.map(student => {
                const score = student.score;
                const hasScore = !!score;
                const scoreTotal = hasScore
                  ? Object.entries(score)
                      .filter(([k]) => k !== "comment" && k !== "scoredAt")
                      .reduce((acc, [, v]) => acc + (typeof v === "number" ? v : 0), 0)
                  : null;
                return `
                  <div class="aggregate-student-item">
                    <span class="student-name">${escapeHtml(student.studentInfo.name)}</span>
                    <span class="student-id">${escapeHtml(student.studentInfo.studentId)}</span>
                    <span class="student-score ${hasScore ? '' : 'pending'}">
                      ${scoreTotal !== null ? scoreTotal + '分' : '待评分'}
                    </span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function initBackupRestoreUI() {
  const backupBtn = $("#backupBtn");
  const restoreBtn = $("#restoreBtn");
  const restoreFileInput = $("#restoreFileInput");

  backupBtn?.addEventListener("click", async () => {
    const includeHistory = confirm("是否包含版本历史记录和回收站数据？\n\n点「确定」= 包含历史记录（文件较大）\n点「取消」= 仅导出当前数据（文件较小）");
    try {
      backupBtn.disabled = true;
      backupBtn.textContent = "导出中...";
      const backup = await window.BackupRestore.exportBackup({ includeHistory });
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const dateStr = new Date().toISOString().slice(0, 10);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `thin-section-backup-${dateStr}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
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
          const parts = [];
          if (result.sampleCount) parts.push(`${result.sampleCount} 个样本`);
          if (result.taskCount) parts.push(`${result.taskCount} 个任务`);
          if (result.submissionCount) parts.push(`${result.submissionCount} 份作答`);
          statusEl.textContent = "迁移完成！" + parts.join("、");
          setTimeout(() => {
            overlay.remove();
            resolve({ migrated: true });
          }, 1500);
        } else {
          statusEl.textContent = "数据结构已更新";
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

    skipBtn.addEventListener("click", async () => {
      try {
        await window.DataMigration.migrateAppStateSchema();
      } catch (e) {
        console.warn("Schema 迁移失败:", e);
      }
      overlay.remove();
      resolve({ migrated: false, skipped: true });
    });
  });
}

async function initApp() {
  try {
    await window.StorageLayer.initDB();

    const needsMigration = await window.DataMigration.checkAndMigrate();
    if (needsMigration) {
      await showMigrationDialog();
    }

    await window.ProjectManager.init();
    initProjectUI();

    window.ProjectManager.onProjectChange(async () => {
      await reloadDataForProject();
    });

    const hasCurrentProject = !!window.ProjectManager.getCurrentProjectId();
    if (!hasCurrentProject) {
      showProjectSelector();
      return;
    }

    await loadProjectDataAndUI();
  } catch (err) {
    console.error("初始化失败:", err);
    alert("应用初始化失败：" + err.message);
  }
}

async function loadProjectDataAndUI() {
  try {
    await window.DataManager.init();

    if (window.LessonPackage) {
      await window.LessonPackage.init();
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

    if (window.ImageViewerModule) {
      window.ImageViewerModule.init({
        getState: () => state,
        save: () => window.DataManager.save(),
        renderAll
      });
    }

    initBackupRestoreUI();
    initLessonUI();
    initEntryAssistant();

    document.getElementById("vhModalClose")?.addEventListener("click", closeVersionHistoryModal);
    document.getElementById("versionHistoryModal")?.addEventListener("click", (e) => {
      if (e.target.id === "versionHistoryModal") closeVersionHistoryModal();
    });

    document.getElementById("emptyRecycleBtn")?.addEventListener("click", async () => {
      if (!confirm("确定清空回收站？所有样本将被彻底删除，此操作不可撤销。")) return;
      try {
        await window.VersionHistory.emptyRecycleBin();
        renderRecycleBin();
      } catch (e) {
        alert("清空失败：" + e.message);
      }
    });

    await window.DataManager.ensureHistoryForExistingSamples();

    updateHeaderProjectName();
    renderAll();
    showAppShell();
  } catch (err) {
    console.error("加载项目数据失败:", err);
    alert("加载项目数据失败：" + err.message);
  }
}

async function reloadDataForProject() {
  try {
    if (window.DataManager) {
      await window.DataManager.reloadForProject();
    }
    state = window.DataManager?.getState?.() || null;
    updateHeaderProjectName();
    if (state) {
      renderAll();
      if ($("#tab-tasks").classList.contains("active")) renderTasks();
      if ($("#tab-review").classList.contains("active") && window.ReviewModule) {
        window.ReviewModule.renderReviewBoard();
        updateReviewStats();
      }
      if ($("#tab-lesson").classList.contains("active")) renderLessonPage();
      if ($("#tab-grading").classList.contains("active")) renderGradingPage();
      if ($("#tab-recycle").classList.contains("active")) renderRecycleBin();
    }
  } catch (e) {
    console.error("切换项目失败:", e);
    alert("切换项目失败：" + e.message);
  }
}

function showProjectSelector() {
  if (projectSelector) projectSelector.classList.remove("hidden");
  if (appShell) appShell.classList.add("hidden");
  renderProjectList();
}

function showAppShell() {
  if (projectSelector) projectSelector.classList.add("hidden");
  if (appShell) appShell.classList.remove("hidden");
  document.body.style.overflow = "";
}

function initProjectUI() {
  createProjectBtn?.addEventListener("click", () => openProjectForm("create"));
  importProjectBtn?.addEventListener("click", () => importProjectBackupInput?.click());
  importProjectBackupBtn?.addEventListener("click", () => importProjectBackupInput?.click());
  importProjectBackupInput?.addEventListener("change", async (e) => {
    await handleImportProjectBackup(e.target.files[0]);
    importProjectBackupInput.value = "";
  });
  showArchivedToggle?.addEventListener("change", (e) => {
    showArchivedProjects = e.target.checked;
    renderProjectList();
  });

  currentProjectBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleProjectDropdown();
  });

  dropdownCreateBtn?.addEventListener("click", () => {
    if (projectDropdown) projectDropdown.classList.add("hidden");
    openProjectForm("create");
  });
  dropdownImportBtn?.addEventListener("click", () => {
    if (projectDropdown) projectDropdown.classList.add("hidden");
    importProjectBackupInput?.click();
  });
  manageProjectsBtn?.addEventListener("click", () => {
    if (projectDropdown) projectDropdown.classList.add("hidden");
    openProjectManager();
  });

  document.addEventListener("click", (e) => {
    if (projectDropdown && !projectDropdown.classList.contains("hidden") && !projectDropdown.contains(e.target) && e.target !== currentProjectBtn) {
      projectDropdown.classList.add("hidden");
    }
  });

  openProjectManagerBtn?.addEventListener("click", () => openProjectManager());

  projectManagerClose?.addEventListener("click", () => closeProjectManager());
  projectManagerModal?.addEventListener("click", (e) => {
    if (e.target === projectManagerModal) closeProjectManager();
  });
  projectManagerNewBtn?.addEventListener("click", () => openProjectForm("create"));
  projectManagerImportBtn?.addEventListener("click", () => projectManagerImportInput?.click());
  projectManagerImportInput?.addEventListener("change", async (e) => {
    await handleImportProjectBackup(e.target.files[0]);
    projectManagerImportInput.value = "";
    renderManagerList();
  });

  projectFormClose?.addEventListener("click", () => closeProjectForm());
  projectFormCancel?.addEventListener("click", () => closeProjectForm());
  projectFormModal?.addEventListener("click", (e) => {
    if (e.target === projectFormModal) closeProjectForm();
  });
  projectForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleProjectFormSubmit();
  });
}

function updateHeaderProjectName() {
  const project = window.ProjectManager?.getCurrentProjectSync?.();
  if (currentProjectName && project) {
    currentProjectName.textContent = project.name;
  }
}

function toggleProjectDropdown() {
  if (!projectDropdown) return;
  const isHidden = projectDropdown.classList.contains("hidden");
  if (isHidden) {
    renderProjectDropdown();
    projectDropdown.classList.remove("hidden");
  } else {
    projectDropdown.classList.add("hidden");
  }
}

function renderProjectDropdown() {
  if (!projectDropdownList) return;
  const allProjects = window.ProjectManager?.getProjects?.() || [];
  const activeProjects = allProjects.filter(p => !p.isArchived);
  const currentId = window.ProjectManager?.getCurrentProjectId();

  let html = "";
  if (activeProjects.length === 0) {
    html = '<div style="padding: 14px; text-align: center; color: var(--muted); font-size: 13px;">暂无项目</div>';
  } else {
    html = activeProjects.map(p => `
      <div class="dropdown-item ${p.id === currentId ? "active" : ""}" data-project-id="${p.id}">
        <span>${p.name}</span>
      </div>
    `).join("");
  }
  projectDropdownList.innerHTML = html;

  projectDropdownList.querySelectorAll(".dropdown-item").forEach(item => {
    item.addEventListener("click", async () => {
      const pid = item.dataset.projectId;
      projectDropdown.classList.add("hidden");
      try {
        await window.ProjectManager.setCurrentProject(pid);
      } catch (e) {
        alert("切换项目失败：" + e.message);
      }
    });
  });
}

function renderProjectList() {
  if (!projectGrid) return;
  const allProjects = window.ProjectManager?.getProjects?.() || [];
  const projects = allProjects.filter(p => showArchivedProjects ? true : !p.isArchived);

  if (projects.length === 0) {
    projectGrid.classList.add("hidden");
    projectEmpty?.classList.remove("hidden");
    return;
  }
  projectGrid.classList.remove("hidden");
  projectEmpty?.classList.add("hidden");

  projectGrid.innerHTML = projects.map(p => {
    const stats = window.ProjectManager?.getProjectStats?.(p.id) || { sampleCount: 0, taskCount: 0 };
    const createdStr = p.createdAt ? formatDateTime(p.createdAt).split(" ")[0] : "";
    const classes = ["project-card"];
    if (p.id === "default-project") classes.push("default-project");
    if (p.isArchived) classes.push("archived");
    return `
      <div class="${classes.join(" ")}" data-project-id="${p.id}">
        <div class="project-card-head">
          <h3 class="project-card-title">${escapeHtml(p.name)}</h3>
          <button type="button" class="project-card-menu-btn" data-project-menu="${p.id}" title="更多操作">⋯</button>
        </div>
        <p class="project-card-desc">${escapeHtml(p.description || "暂无描述")}</p>
        <div class="project-card-stats">
          <span class="project-card-stat">📋 ${stats.sampleCount} 样本</span>
          <span class="project-card-stat">📝 ${stats.taskCount} 任务</span>
        </div>
        <div class="project-card-meta">创建于 ${createdStr}</div>
      </div>
    `;
  }).join("");

  projectGrid.querySelectorAll(".project-card").forEach(card => {
    card.addEventListener("click", async (e) => {
      if (e.target.closest("[data-project-menu]")) return;
      const pid = card.dataset.projectId;
      try {
        await window.ProjectManager.setCurrentProject(pid);
        await loadProjectDataAndUI();
      } catch (err) {
        alert("打开项目失败：" + err.message);
      }
    });
  });

  projectGrid.querySelectorAll("[data-project-menu]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const pid = btn.dataset.projectMenu;
      showProjectQuickMenu(pid, btn);
    });
  });
}

function showProjectQuickMenu(projectId, anchorEl) {
  const project = window.ProjectManager?.getProjectById?.(projectId);
  if (!project) return;

  const isDefault = projectId === "default-project";
  const items = [];
  items.push({ label: "重命名", action: "rename", disabled: false });
  if (project.isArchived) {
    items.push({ label: "取消归档", action: "unarchive", disabled: false });
  } else {
    items.push({ label: "归档", action: "archive", disabled: isDefault });
  }
  items.push({ label: "复制", action: "duplicate", disabled: false });
  items.push({ label: "导出备份", action: "export", disabled: false });
  items.push({ label: "删除", action: "delete", disabled: isDefault });

  const menu = document.createElement("div");
  menu.style.cssText = `
    position: fixed; z-index: 2000; background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; box-shadow: 0 12px 32px rgba(23,32,29,0.18); padding: 4px; min-width: 140px;
  `;
  menu.innerHTML = items.map(it => `
    <button type="button" data-action="${it.action}" ${it.disabled ? "disabled" : ""}
      style="display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:transparent;
      border-radius:6px;font-size:13px;cursor:pointer;${it.disabled ? 'color:var(--muted);cursor:not-allowed;' : 'color:var(--ink);'}
      ${it.action === 'delete' ? 'color:var(--danger);' : ''}">${it.label}</button>
  `).join("");

  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 160)}px`;

  const closeMenu = () => {
    menu.remove();
    document.removeEventListener("click", onDocClick);
  };
  const onDocClick = (e) => {
    if (!menu.contains(e.target)) closeMenu();
  };
  setTimeout(() => document.addEventListener("click", onDocClick), 0);

  menu.querySelectorAll("button[data-action]").forEach(b => {
    b.addEventListener("click", async () => {
      const action = b.dataset.action;
      closeMenu();
      try {
        await handleProjectAction(projectId, action);
      } catch (e) {
        alert("操作失败：" + e.message);
      }
    });
  });
}

async function handleProjectAction(projectId, action) {
  const project = window.ProjectManager?.getProjectById?.(projectId);
  if (!project) return;

  switch (action) {
    case "rename":
      openProjectForm("rename", projectId);
      break;
    case "archive":
      if (confirm(`确定要归档项目「${project.name}」吗？归档后项目将从主列表中隐藏。`)) {
        await window.ProjectManager.archiveProject(projectId);
        if (window.ProjectManager.getCurrentProjectId() === projectId) {
          showProjectSelector();
        } else {
          renderProjectList();
          updateHeaderProjectName();
        }
      }
      break;
    case "unarchive":
      await window.ProjectManager.unarchiveProject(projectId);
      renderProjectList();
      break;
    case "duplicate":
      const newName = prompt(`输入新项目名称：`, `${project.name} (副本)`);
      if (newName?.trim()) {
        await window.ProjectManager.duplicateProject(projectId, newName.trim());
        renderProjectList();
      }
      break;
    case "export":
      await window.ProjectManager.downloadProjectBackup(projectId);
      break;
    case "delete":
      if (confirm(`确定要删除项目「${project.name}」吗？所有数据将被永久删除，此操作不可撤销！`)) {
        await window.ProjectManager.deleteProject(projectId);
        if (window.ProjectManager.getCurrentProjectId() === projectId) {
          showProjectSelector();
        } else {
          renderProjectList();
        }
      }
      break;
  }
}

async function handleImportProjectBackup(file) {
  if (!file) return;
  try {
    const result = await window.ProjectManager.importProjectBackup(file);
    alert(`项目「${result.project.name}」导入成功！包含 ${result.sampleCount || result.stats?.sampleCount || 0} 个样本、${result.taskCount || result.stats?.taskCount || 0} 个任务。`);
    renderProjectList();
  } catch (e) {
    alert("导入失败：" + e.message);
  }
}

function openProjectManager() {
  projectManagerModal?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderManagerList();
}

function closeProjectManager() {
  projectManagerModal?.classList.add("hidden");
  document.body.style.overflow = "";
}

function renderManagerList() {
  if (!projectManagerList) return;
  const projects = window.ProjectManager?.getProjects?.() || [];

  if (projects.length === 0) {
    projectManagerList.innerHTML = '<p class="vh-empty">还没有项目，点击右上角创建。</p>';
    return;
  }

  projectManagerList.innerHTML = projects.map(p => {
    const stats = window.ProjectManager?.getProjectStats?.(p.id) || { sampleCount: 0, taskCount: 0 };
    const isDefault = p.id === "default-project";
    const badges = [];
    if (isDefault) badges.push('<span class="manager-row-badge default-badge">默认</span>');
    if (p.isArchived) badges.push('<span class="manager-row-badge archived-badge">已归档</span>');
    const updatedStr = p.updatedAt ? formatDateTime(p.updatedAt) : "-";
    return `
      <div class="manager-row ${p.isArchived ? "archived" : ""}">
        <div class="manager-row-info">
          <div class="manager-row-name">
            <span>${escapeHtml(p.name)}</span>
            ${badges.join(" ")}
          </div>
          <div class="manager-row-desc">${escapeHtml(p.description || "暂无描述")}</div>
          <div class="manager-row-meta">
            <span>${stats.sampleCount} 样本</span>
            <span>${stats.taskCount} 任务</span>
            <span>更新于 ${updatedStr}</span>
          </div>
        </div>
        <div class="manager-row-actions">
          <button type="button" data-mgr-open="${p.id}">打开</button>
          <button type="button" data-mgr-rename="${p.id}">重命名</button>
          ${p.isArchived
            ? `<button type="button" data-mgr-unarchive="${p.id}">取消归档</button>`
            : `<button type="button" data-mgr-archive="${p.id}" ${isDefault ? "disabled" : ""}>归档</button>`}
          <button type="button" data-mgr-duplicate="${p.id}">复制</button>
          <button type="button" data-mgr-export="${p.id}">导出</button>
          <button type="button" class="danger-btn" data-mgr-delete="${p.id}" ${isDefault ? "disabled" : ""}>删除</button>
        </div>
      </div>
    `;
  }).join("");

  projectManagerList.querySelectorAll("[data-mgr-open]").forEach(b => {
    b.addEventListener("click", async () => {
      const pid = b.dataset.mgrOpen;
      try {
        await window.ProjectManager.setCurrentProject(pid);
        closeProjectManager();
        await loadProjectDataAndUI();
      } catch (e) {
        alert("打开项目失败：" + e.message);
      }
    });
  });
  projectManagerList.querySelectorAll("[data-mgr-rename]").forEach(b => {
    b.addEventListener("click", () => {
      openProjectForm("rename", b.dataset.mgrRename);
    });
  });
  projectManagerList.querySelectorAll("[data-mgr-archive]").forEach(b => {
    b.addEventListener("click", async () => {
      const pid = b.dataset.mgrArchive;
      const p = window.ProjectManager.getProjectById(pid);
      if (confirm(`归档「${p?.name}」？`)) {
        await window.ProjectManager.archiveProject(pid);
        renderManagerList();
      }
    });
  });
  projectManagerList.querySelectorAll("[data-mgr-unarchive]").forEach(b => {
    b.addEventListener("click", async () => {
      await window.ProjectManager.unarchiveProject(b.dataset.mgrUnarchive);
      renderManagerList();
    });
  });
  projectManagerList.querySelectorAll("[data-mgr-duplicate]").forEach(b => {
    b.addEventListener("click", async () => {
      const pid = b.dataset.mgrDuplicate;
      const p = window.ProjectManager.getProjectById(pid);
      const name = prompt("新项目名称：", `${p?.name || "项目"} (副本)`);
      if (name?.trim()) {
        await window.ProjectManager.duplicateProject(pid, name.trim());
        renderManagerList();
      }
    });
  });
  projectManagerList.querySelectorAll("[data-mgr-export]").forEach(b => {
    b.addEventListener("click", async () => {
      await window.ProjectManager.downloadProjectBackup(b.dataset.mgrExport);
    });
  });
  projectManagerList.querySelectorAll("[data-mgr-delete]").forEach(b => {
    b.addEventListener("click", async () => {
      const pid = b.dataset.mgrDelete;
      const p = window.ProjectManager.getProjectById(pid);
      if (confirm(`彻底删除「${p?.name}」？此操作不可撤销！`)) {
        await window.ProjectManager.deleteProject(pid);
        renderManagerList();
        if (window.ProjectManager.getCurrentProjectId() === pid) {
          closeProjectManager();
          showProjectSelector();
        }
      }
    });
  });
}

function openProjectForm(mode, projectId = null) {
  currentProjectFormMode = mode;
  currentEditingProjectId = projectId;

  if (projectFormTitle) {
    projectFormTitle.textContent = mode === "create" ? "新建项目" : "重命名项目";
  }
  if (projectFormStats) projectFormStats.classList.add("hidden");
  if (projectFormName) projectFormName.value = "";
  if (projectFormDesc) projectFormDesc.value = "";

  if (mode === "rename" && projectId) {
    const p = window.ProjectManager?.getProjectById?.(projectId);
    if (p) {
      projectFormName.value = p.name;
      projectFormDesc.value = p.description || "";
      const stats = window.ProjectManager?.getProjectStats?.(projectId);
      if (stats && projectFormStats) {
        projectFormStats.classList.remove("hidden");
        projectFormStats.innerHTML = `
          <div class="project-form-stat">
            <div class="project-form-stat-label">样本</div>
            <div class="project-form-stat-value">${stats.sampleCount}</div>
          </div>
          <div class="project-form-stat">
            <div class="project-form-stat-label">任务</div>
            <div class="project-form-stat-value">${stats.taskCount}</div>
          </div>
          <div class="project-form-stat">
            <div class="project-form-stat-label">答案</div>
            <div class="project-form-stat-value">${stats.answerCount || 0}</div>
          </div>
        `;
      }
    }
  }

  projectFormModal?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => projectFormName?.focus(), 50);
}

function closeProjectForm() {
  projectFormModal?.classList.add("hidden");
  document.body.style.overflow = "";
  currentEditingProjectId = null;
}

async function handleProjectFormSubmit() {
  const name = projectFormName?.value?.trim();
  const description = projectFormDesc?.value?.trim() || "";

  if (!name) {
    alert("请输入项目名称");
    projectFormName?.focus();
    return;
  }

  try {
    if (currentProjectFormMode === "create") {
      const project = await window.ProjectManager.createProject(name, description);
      closeProjectForm();
      await window.ProjectManager.setCurrentProject(project.id);
      await loadProjectDataAndUI();
    } else if (currentProjectFormMode === "rename" && currentEditingProjectId) {
      await window.ProjectManager.renameProject(currentEditingProjectId, name);
      await window.ProjectManager.updateProjectDescription(currentEditingProjectId, description);
      closeProjectForm();
      updateHeaderProjectName();
      renderProjectList();
      renderManagerList();
    }
  } catch (e) {
    alert("保存失败：" + e.message);
  }
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openVersionHistoryModal(sampleId) {
  if (!window.VersionHistory) return;
  const sample = state.samples.find(s => s.id === sampleId);
  if (!sample) return;

  const modal = document.getElementById("versionHistoryModal");
  const title = document.getElementById("vhModalTitle");
  const body = document.getElementById("vhModalBody");
  const footer = document.getElementById("vhModalFooter");

  title.textContent = `版本历史：${sample.code || "未编号"}`;

  body.innerHTML = '<p class="vh-empty">加载中...</p>';
  footer.innerHTML = '<button type="button" class="ghost" id="vhCloseBtn2">关闭</button>';

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  window.VersionHistory.getHistory(sampleId).then(versions => {
    renderVersionHistoryContent(sampleId, sample, versions, body, footer);
  });
}

function renderVersionHistoryContent(sampleId, sample, versions, body, footer) {
  let selectedVersion = null;
  let diffV1 = null;
  let diffV2 = null;

  function render() {
    const timelineHTML = window.VersionHistory.versionTimelineHTML(versions, sampleId);

    let diffSectionHTML = "";
    if (versions.length >= 2) {
      const options = versions.map(v => `<option value="${v.version}">v${v.version} (${formatDateTime(v.timestamp)})</option>`).join("");
      diffSectionHTML = `
        <div class="vh-diff-section">
          <div class="vh-diff-header">
            <h3>版本对比</h3>
            <div class="vh-diff-selectors">
              <select id="vhDiffV1">${options}</select>
              <span>→</span>
              <select id="vhDiffV2">${options}</select>
              <button type="button" class="ghost" id="vhCompareBtn">对比</button>
            </div>
          </div>
          <div id="vhDiffResult"></div>
        </div>
      `;
    }

    let rollbackHTML = "";
    if (selectedVersion && versions.length > 0) {
      const latestVersion = versions[versions.length - 1];
      if (selectedVersion !== latestVersion.version) {
        rollbackHTML = `
          <div class="vh-rollback-bar">
            <p>已选择 v${selectedVersion}，点击回滚将恢复到该版本的字段值</p>
            <button type="button" id="vhRollbackBtn">回滚到此版本</button>
          </div>
        `;
      }
    }

    body.innerHTML = timelineHTML + diffSectionHTML + rollbackHTML;

    const timelineItems = body.querySelectorAll(".vh-timeline-item");
    timelineItems.forEach(item => {
      item.addEventListener("click", () => {
        timelineItems.forEach(i => i.classList.remove("vh-version-selected"));
        item.classList.add("vh-version-selected");
        selectedVersion = parseInt(item.dataset.versionNum, 10);
        render();
      });
    });

    if (selectedVersion) {
      const selItem = body.querySelector(`.vh-timeline-item[data-version-num="${selectedVersion}"]`);
      if (selItem) selItem.classList.add("vh-version-selected");
    }

    const diffV1Select = document.getElementById("vhDiffV1");
    const diffV2Select = document.getElementById("vhDiffV2");
    if (diffV1Select && diffV2Select && versions.length >= 2) {
      diffV1Select.value = String(versions[0].version);
      diffV2Select.value = String(versions[versions.length - 1].version);
    }

    const compareBtn = document.getElementById("vhCompareBtn");
    if (compareBtn) {
      compareBtn.addEventListener("click", () => {
        const v1Num = parseInt(diffV1Select.value, 10);
        const v2Num = parseInt(diffV2Select.value, 10);
        const v1 = versions.find(v => v.version === v1Num);
        const v2 = versions.find(v => v.version === v2Num);
        const resultEl = document.getElementById("vhDiffResult");
        if (v1 && v2 && resultEl) {
          const diff = window.VersionHistory.diffTwoVersions(v1, v2);
          resultEl.innerHTML = window.VersionHistory.diffTableHTML(diff);
        }
      });
    }

    const rollbackBtn = document.getElementById("vhRollbackBtn");
    if (rollbackBtn) {
      rollbackBtn.addEventListener("click", async () => {
        if (!confirm(`确定要回滚到 v${selectedVersion} 吗？当前字段值将被替换。`)) return;
        try {
          const result = await window.VersionHistory.rollbackToVersion(sampleId, selectedVersion);
          if (!result) {
            alert("当前数据已是该版本，无需回滚。");
            return;
          }
          await window.DataManager.updateSample(sampleId, result.updates);
          await window.VersionHistory.recordVersion(sampleId, window.DataManager.getSampleById(sampleId), "rollback", result.targetSnapshot);
          state = window.DataManager.getState();
          renderAll();
          closeVersionHistoryModal();
          alert("已成功回滚到 v" + selectedVersion);
        } catch (e) {
          alert("回滚失败：" + e.message);
        }
      });
    }
  }

  footer.innerHTML = '<button type="button" class="ghost" id="vhCloseBtn2">关闭</button>';
  document.getElementById("vhCloseBtn2")?.addEventListener("click", closeVersionHistoryModal);

  render();
}

function closeVersionHistoryModal() {
  const modal = document.getElementById("versionHistoryModal");
  if (modal) modal.classList.add("hidden");
  document.body.style.overflow = "";
}

function renderRecycleBin() {
  if (!window.VersionHistory) return;

  const container = document.getElementById("recycleBinList");
  if (!container) return;

  container.innerHTML = '<p class="vh-empty">加载中...</p>';

  window.VersionHistory.getRecycleBin().then(items => {
    container.innerHTML = window.VersionHistory.recycleBinListHTML(items);

    container.querySelectorAll(".vh-restore-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const recycleId = btn.dataset.restoreId;
        if (!confirm("确定恢复该样本？")) return;
        try {
          const sample = await window.VersionHistory.restoreFromRecycleBin(recycleId);
          if (sample) {
            await window.DataManager.restoreSample(sample);
            state = window.DataManager.getState();
            renderAll();
            renderRecycleBin();
            alert("样本已恢复！");
          }
        } catch (e) {
          alert("恢复失败：" + e.message);
        }
      });
    });

    container.querySelectorAll(".vh-permanent-delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const deleteId = btn.dataset.deleteId;
        if (!confirm("彻底删除该样本？此操作不可撤销，版本历史也将被清除。")) return;
        try {
          await window.VersionHistory.permanentlyDelete(deleteId);
          renderRecycleBin();
        } catch (e) {
          alert("删除失败：" + e.message);
        }
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", initApp);
