const storageKey = "wxyy-2-thin-section-index";
const defaultState = { samples: [], compare: [], tasks: [] };
const state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(defaultState), parsed);
  } catch {
    return structuredClone(defaultState);
  }
}

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

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

const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

const form = $("#sampleForm");
const photoInput = $("#photoInput");
const sampleGrid = $("#sampleGrid");
const sampleGridFull = $("#sampleGridFull");
const comparePane = $("#comparePane");
const mineralFilter = $("#mineralFilter");
const polarFilter = $("#polarFilter");

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

function filteredSamples() {
  const mineral = mineralFilter?.value?.trim() || "";
  const polarization = polarFilter?.value || "";
  return state.samples.filter((sample) => {
    const mineralMatch = !mineral || sample.minerals.includes(mineral);
    const polarMatch = !polarization || sample.polarization === polarization;
    return mineralMatch && polarMatch;
  });
}

function sampleCardHTML(sample, showActions = true) {
  const annSummary = window.AnnotationView ? window.AnnotationView.annotationSummaryHTML(sample) : "";
  return `
    <article class="sample-card">
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}显微照片">` : '<div class="photo-placeholder">暂无照片</div>'}
      <div class="sample-body">
        <h3>${sample.code}</h3>
        <p>${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}</p>
        <p>矿物：${sample.minerals || "未记录"}</p>
        <p>结构：${sample.texture || "未记录"}</p>
        <p>${sample.comment || "未填写批注"}</p>
        ${annSummary}
        ${showActions ? `
        <div class="card-actions">
          <label><input type="checkbox" data-compare="${sample.id}" ${state.compare.includes(sample.id) ? "checked" : ""}>对比</label>
          <div class="card-action-btns">
            <button type="button" data-annotate="${sample.id}">标注</button>
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
    return `
    <article class="compare-item">
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}对比图">` : ""}
      <h3>${sample.code}</h3>
      <p>${sample.polarization} · ${sample.minerals || "未记录矿物"}</p>
      <p>${sample.texture || "未记录结构"}</p>
      ${annSummary}
    </article>
  `;}).join("") : "<p>勾选两张样本卡片后可并排对比。</p>";
}

function switchTab(tabName) {
  tabBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tabName}`));
  if (tabName === "tasks") renderTasks();
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
  state.samples.unshift({
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
  });
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
  save();
  renderAll();
});

function handleSampleGridClick(gridEl, event) {
  const deleteId = event.target.dataset.delete;
  const annotateId = event.target.dataset.annotate;
  if (annotateId) {
    if (window.AnnotationView) window.AnnotationView.openAnnotation(annotateId);
    return;
  }
  if (deleteId) {
    if (!confirm("确定删除该样本？此操作不可撤销。")) return;
    state.samples = state.samples.filter((sample) => sample.id !== deleteId);
    state.compare = state.compare.filter((id) => id !== deleteId);
    state.tasks.forEach((task) => {
      task.sampleIds = task.sampleIds.filter((id) => id !== deleteId);
      task.completedSamples = (task.completedSamples || []).filter((id) => id !== deleteId);
    });
    save();
    renderAll();
  }
}

sampleGrid?.addEventListener("click", (e) => handleSampleGridClick(sampleGrid, e));
sampleGridFull?.addEventListener("click", (e) => handleSampleGridClick(sampleGridFull, e));

function handleSampleGridChange(gridEl, event) {
  const id = event.target.dataset.compare;
  if (!id) return;
  if (event.target.checked) {
    state.compare = [id, ...state.compare.filter((item) => item !== id)].slice(0, 2);
  } else {
    state.compare = state.compare.filter((item) => item !== id);
  }
  save();
  renderSamples();
  renderCompare();
}

sampleGrid?.addEventListener("change", (e) => handleSampleGridChange(sampleGrid, e));
sampleGridFull?.addEventListener("change", (e) => handleSampleGridChange(sampleGridFull, e));

[mineralFilter, polarFilter].forEach((field) => field?.addEventListener("input", renderSamples));

$("#exportBtn")?.addEventListener("click", () => {
  const checklist = state.samples.map((sample) => ({
    样本编号: sample.code,
    采样地点: sample.location,
    放大倍数: sample.magnification,
    偏光类型: sample.polarization,
    主要矿物: sample.minerals,
    颗粒结构: sample.texture,
    老师批注: sample.comment
  }));
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
      save();
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
      save();
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
  save();
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
  state.tasks = state.tasks.filter((t) => t.id !== selectedTaskId);
  selectedTaskId = null;
  save();
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
    state.tasks.unshift(newTask);
    selectedTaskId = newTask.id;
  } else {
    const task = state.tasks.find((t) => t.id === editingTaskId);
    if (task) {
      task.title = title;
      task.objective = objective;
      task.deadline = deadline;
      task.sampleIds = sampleIds;
      task.completedSamples = (task.completedSamples || []).filter((id) => sampleIds.includes(id));
      selectedTaskId = task.id;
    }
  }

  editingTaskId = null;
  pickerSelectedIds.clear();
  save();
  renderAll();
});

function renderAll() {
  renderSamples();
  renderCompare();
  if ($("#tab-tasks").classList.contains("active")) renderTasks();
}

if (window.AnnotationView) {
  window.AnnotationView.init({ state, save, renderAll });
}

renderAll();
