(function (global) {
  "use strict";

  const COLORS = [
    "#e74c3c", "#e67e22", "#f1c40f", "#27ae60",
    "#2980b9", "#8e44ad", "#16a085", "#c0392b"
  ];

  let getState = null;
  let saveFn = null;
  let renderAllFn = null;

  function getStateRef() {
    return getState ? getState() : null;
  }

  let currentSampleId = null;
  let currentTool = "point";
  let currentColor = COLORS[0];
  let selectedAnnotationId = null;
  let isDrawing = false;
  let drawStart = null;
  let previewEl = null;

  function ensureContainer() {
    if (document.getElementById("annotationOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "annotationOverlay";
    overlay.className = "annotation-overlay hidden";
    overlay.innerHTML = `
      <div class="annotation-modal">
        <header class="annotation-header">
          <div>
            <h2 id="annotationTitle">显微照片标注</h2>
            <p id="annotationSubtitle" class="annotation-subtitle"></p>
          </div>
          <button type="button" id="closeAnnotationBtn" class="annotation-close-btn">关闭</button>
        </header>

        <div class="annotation-toolbar">
          <div class="tool-group">
            <label class="tool-label">工具：</label>
            <div class="tool-buttons">
              <button type="button" class="tool-btn active" data-tool="point" title="点位">
                <span class="tool-icon">●</span><span>点位</span>
              </button>
              <button type="button" class="tool-btn" data-tool="rect" title="矩形区域">
                <span class="tool-icon">▭</span><span>矩形</span>
              </button>
              <button type="button" class="tool-btn" data-tool="text" title="文字标签">
                <span class="tool-icon">T</span><span>文字</span>
              </button>
              <button type="button" class="tool-btn" data-tool="select" title="选择/删除">
                <span class="tool-icon">✥</span><span>选择</span>
              </button>
            </div>
          </div>
          <div class="tool-group">
            <label class="tool-label">颜色：</label>
            <div class="color-palette"></div>
          </div>
          <div class="tool-group tool-actions">
            <button type="button" id="deleteSelectedBtn" class="danger" disabled>删除选中</button>
            <button type="button" id="clearAllBtn" class="ghost">清空全部</button>
          </div>
        </div>

        <div class="annotation-workspace">
          <div class="annotation-canvas-wrap">
            <div class="annotation-canvas" id="annotationCanvas">
              <img id="annotationImg" alt="待标注照片">
              <div class="annotation-layer" id="annotationLayer"></div>
            </div>
          </div>
          <aside class="annotation-side">
            <div class="annotation-side-header">
              <h3>标注列表</h3>
              <span id="annotationCount" class="annotation-count">0 条</span>
            </div>
            <div id="annotationList" class="annotation-list"></div>
            <div class="annotation-legend">
              <h4>标注类型图例</h4>
              <ul>
                <li><span class="legend-dot" style="background:#e74c3c"></span> 点位：标记矿物、包裹体等单点</li>
                <li><span class="legend-rect" style="border-color:#f39c12"></span> 矩形：圈定裂隙、蚀变带等区域</li>
                <li><span class="legend-text" style="color:#2980b9"></span> 文字：添加颗粒边界等说明标签</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    bindOverlayEvents();
    renderColorPalette();
  }

  function renderColorPalette() {
    const palette = document.querySelector(".color-palette");
    if (!palette) return;
    palette.innerHTML = COLORS.map((c) => `
      <button type="button" class="color-swatch ${c === currentColor ? "active" : ""}"
              style="background:${c}" data-color="${c}" title="${c}"></button>
    `).join("");
    palette.querySelectorAll(".color-swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentColor = btn.dataset.color;
        palette.querySelectorAll(".color-swatch").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  function bindOverlayEvents() {
    const overlay = document.getElementById("annotationOverlay");

    document.getElementById("closeAnnotationBtn").addEventListener("click", closeAnnotation);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeAnnotation();
    });

    document.querySelectorAll(".tool-btn", overlay).forEach((btn) => {
      btn.addEventListener("click", () => {
        currentTool = btn.dataset.tool;
        document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        updateCanvasCursor();
        clearSelection();
      });
    });

    document.getElementById("deleteSelectedBtn").addEventListener("click", () => {
      if (selectedAnnotationId) deleteAnnotation(selectedAnnotationId);
    });

    document.getElementById("clearAllBtn").addEventListener("click", () => {
      const sample = getCurrentSample();
      if (!sample || !sample.annotations || sample.annotations.length === 0) return;
      if (!confirm(`确定清空该样本的全部 ${sample.annotations.length} 条标注？此操作不可撤销。`)) return;
      sample.annotations = [];
      if (window.DataManager) {
        window.DataManager.save();
      } else {
        saveFn();
      }
      renderAnnotations();
      renderAnnotationList();
      renderAllFn();
    });

    const canvas = document.getElementById("annotationCanvas");

    canvas.addEventListener("mousedown", handleCanvasMouseDown);
    canvas.addEventListener("mousemove", handleCanvasMouseMove);
    canvas.addEventListener("mouseup", handleCanvasMouseUp);
    canvas.addEventListener("mouseleave", handleCanvasMouseUp);

    document.addEventListener("keydown", (e) => {
      if (overlay.classList.contains("hidden")) return;
      if (e.key === "Escape") closeAnnotation();
      if ((e.key === "Delete" || e.key === "Backspace") && selectedAnnotationId && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        deleteAnnotation(selectedAnnotationId);
      }
    });
  }

  function updateCanvasCursor() {
    const canvas = document.getElementById("annotationCanvas");
    if (!canvas) return;
    const cursors = {
      point: "crosshair",
      rect: "crosshair",
      text: "text",
      select: "default"
    };
    canvas.style.cursor = cursors[currentTool] || "default";
  }

  function getCurrentSample() {
    const state = getStateRef();
    if (!state || !currentSampleId) return null;
    return state.samples.find((s) => s.id === currentSampleId);
  }

  function canvasToPct(clientX, clientY) {
    const canvas = document.getElementById("annotationCanvas");
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }

  function handleCanvasMouseDown(e) {
    const canvas = document.getElementById("annotationCanvas");
    if (e.target.tagName === "INPUT" || !canvas.contains(e.target)) return;

    const pos = canvasToPct(e.clientX, e.clientY);

    if (currentTool === "select") {
      const hit = findAnnotationAt(pos);
      if (hit) {
        setSelection(hit.id);
      } else {
        clearSelection();
      }
      return;
    }

    if (currentTool === "point") {
      const label = prompt("输入点位标签（例如：石英、黑云母）：", "矿物点");
      if (label === null) return;
      addAnnotation({
        type: "point",
        x: pos.x,
        y: pos.y,
        label: label.trim() || "未命名",
        color: currentColor
      });
      return;
    }

    if (currentTool === "text") {
      const content = prompt("输入文字标签内容：", "文字说明");
      if (content === null) return;
      addAnnotation({
        type: "text",
        x: pos.x,
        y: pos.y,
        content: content.trim() || "文字",
        color: currentColor
      });
      return;
    }

    if (currentTool === "rect") {
      isDrawing = true;
      drawStart = pos;
      previewEl = document.createElement("div");
      previewEl.className = "annotation-rect-preview";
      previewEl.style.background = currentColor + "33";
      previewEl.style.borderColor = currentColor;
      previewEl.style.left = pos.x + "%";
      previewEl.style.top = pos.y + "%";
      previewEl.style.width = "0";
      previewEl.style.height = "0";
      document.getElementById("annotationLayer").appendChild(previewEl);
    }
  }

  function handleCanvasMouseMove(e) {
    if (!isDrawing || !drawStart || !previewEl) return;
    const pos = canvasToPct(e.clientX, e.clientY);
    const x = Math.min(drawStart.x, pos.x);
    const y = Math.min(drawStart.y, pos.y);
    const w = Math.abs(pos.x - drawStart.x);
    const h = Math.abs(pos.y - drawStart.y);
    previewEl.style.left = x + "%";
    previewEl.style.top = y + "%";
    previewEl.style.width = w + "%";
    previewEl.style.height = h + "%";
  }

  function handleCanvasMouseUp(e) {
    if (!isDrawing || !drawStart || !previewEl) return;
    const pos = canvasToPct(e.clientX, e.clientY);
    isDrawing = false;
    const x = Math.min(drawStart.x, pos.x);
    const y = Math.min(drawStart.y, pos.y);
    const w = Math.abs(pos.x - drawStart.x);
    const h = Math.abs(pos.y - drawStart.y);
    if (previewEl) previewEl.remove();
    previewEl = null;
    drawStart = null;

    if (w < 1 || h < 1) return;

    const label = prompt("输入矩形区域标签（例如：裂隙带、蚀变区）：", "观察区域");
    if (label === null) return;
    addAnnotation({
      type: "rect",
      x, y, width: w, height: h,
      label: label.trim() || "未命名区域",
      color: currentColor
    });
  }

  function findAnnotationAt(pos) {
    const sample = getCurrentSample();
    if (!sample || !sample.annotations) return null;
    for (let i = sample.annotations.length - 1; i >= 0; i--) {
      const a = sample.annotations[i];
      if (a.type === "point") {
        const dx = pos.x - a.x;
        const dy = pos.y - a.y;
        if (Math.sqrt(dx * dx + dy * dy) < 3) return a;
      } else if (a.type === "rect") {
        if (pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height) return a;
      } else if (a.type === "text") {
        const dx = pos.x - a.x;
        const dy = pos.y - a.y;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 2) return a;
      }
    }
    return null;
  }

  function addAnnotation(partial) {
    const sample = getCurrentSample();
    if (!sample) return;
    sample.annotations = sample.annotations || [];
    const annotation = Object.assign({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sampleId: sample.id
    }, partial);
    sample.annotations.push(annotation);
    if (window.DataManager) {
      window.DataManager.save();
    } else {
      saveFn();
    }
    renderAnnotations();
    renderAnnotationList();
    renderAllFn();
  }

  function deleteAnnotation(id) {
    const sample = getCurrentSample();
    if (!sample || !sample.annotations) return;
    sample.annotations = sample.annotations.filter((a) => a.id !== id);
    if (selectedAnnotationId === id) clearSelection();
    if (window.DataManager) {
      window.DataManager.save();
    } else {
      saveFn();
    }
    renderAnnotations();
    renderAnnotationList();
    renderAllFn();
  }

  function setSelection(id) {
    selectedAnnotationId = id;
    document.getElementById("deleteSelectedBtn").disabled = !id;
    renderAnnotations();
    renderAnnotationList();
  }

  function clearSelection() {
    setSelection(null);
  }

  function renderAnnotations() {
    const layer = document.getElementById("annotationLayer");
    const sample = getCurrentSample();
    if (!layer) return;
    layer.innerHTML = "";
    if (!sample || !sample.annotations) return;

    sample.annotations.forEach((a) => {
      const selected = a.id === selectedAnnotationId;
      if (a.type === "point") {
        const el = document.createElement("div");
        el.className = "ann-point" + (selected ? " selected" : "");
        el.style.left = a.x + "%";
        el.style.top = a.y + "%";
        el.style.background = a.color;
        el.style.boxShadow = `0 0 0 2px white, 0 0 0 4px ${a.color}`;
        el.innerHTML = `<span class="ann-point-label" style="background:${a.color}">${escapeHtml(a.label)}</span>`;
        el.addEventListener("click", (e) => {
          if (currentTool === "select") {
            e.stopPropagation();
            setSelection(a.id);
          }
        });
        layer.appendChild(el);
      } else if (a.type === "rect") {
        const el = document.createElement("div");
        el.className = "ann-rect" + (selected ? " selected" : "");
        el.style.left = a.x + "%";
        el.style.top = a.y + "%";
        el.style.width = a.width + "%";
        el.style.height = a.height + "%";
        el.style.borderColor = a.color;
        el.style.background = a.color + "1f";
        el.innerHTML = `<span class="ann-rect-label" style="background:${a.color}">${escapeHtml(a.label)}</span>`;
        el.addEventListener("click", (e) => {
          if (currentTool === "select") {
            e.stopPropagation();
            setSelection(a.id);
          }
        });
        layer.appendChild(el);
      } else if (a.type === "text") {
        const el = document.createElement("div");
        el.className = "ann-text" + (selected ? " selected" : "");
        el.style.left = a.x + "%";
        el.style.top = a.y + "%";
        el.style.color = a.color;
        el.textContent = a.content;
        el.addEventListener("click", (e) => {
          if (currentTool === "select") {
            e.stopPropagation();
            setSelection(a.id);
          }
        });
        layer.appendChild(el);
      }
    });
  }

  function renderAnnotationList() {
    const list = document.getElementById("annotationList");
    const countEl = document.getElementById("annotationCount");
    const sample = getCurrentSample();
    if (!list) return;
    const items = sample && sample.annotations ? sample.annotations : [];
    countEl.textContent = items.length + " 条";
    if (items.length === 0) {
      list.innerHTML = `<div class="annotation-empty">暂无标注，选择工具后在照片上点击或拖拽添加。</div>`;
      return;
    }
    const typeLabel = { point: "点位", rect: "矩形", text: "文字" };
    list.innerHTML = items.map((a) => {
      const title = a.type === "text" ? a.content : (a.label || "未命名");
      const selected = a.id === selectedAnnotationId ? " selected" : "";
      return `
        <div class="annotation-item${selected}" data-id="${a.id}">
          <span class="ann-item-color" style="background:${a.color}"></span>
          <div class="ann-item-body">
            <div class="ann-item-title">
              <span class="ann-type-tag">${typeLabel[a.type] || a.type}</span>
              <span>${escapeHtml(title)}</span>
            </div>
            <div class="ann-item-meta">位置：${a.x.toFixed(1)}%, ${a.y.toFixed(1)}%</div>
          </div>
          <button type="button" class="ann-item-del" data-del-id="${a.id}" title="删除">✕</button>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".annotation-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.closest("[data-del-id]")) return;
        setSelection(item.dataset.id);
      });
    });
    list.querySelectorAll("[data-del-id]").forEach((btn) => {
      btn.addEventListener("click", () => deleteAnnotation(btn.dataset.delId));
    });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function openAnnotation(sampleId) {
    ensureContainer();
    const state = getStateRef();
    if (!state) {
      console.error("AnnotationView: 未初始化，请先调用 init()");
      return;
    }
    const sample = state.samples.find((s) => s.id === sampleId);
    if (!sample) {
      alert("未找到该样本。");
      return;
    }
    if (!sample.photo) {
      alert("该样本没有显微照片，无法标注。");
      return;
    }
    currentSampleId = sampleId;
    currentTool = "point";
    selectedAnnotationId = null;

    document.getElementById("annotationTitle").textContent = `标注：${sample.code}`;
    document.getElementById("annotationSubtitle").textContent =
      `${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}`;
    document.getElementById("annotationImg").src = sample.photo;
    document.getElementById("deleteSelectedBtn").disabled = true;

    document.querySelectorAll(".tool-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === currentTool);
    });

    renderAnnotations();
    renderAnnotationList();
    updateCanvasCursor();

    document.getElementById("annotationOverlay").classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeAnnotation() {
    const overlay = document.getElementById("annotationOverlay");
    if (overlay) overlay.classList.add("hidden");
    document.body.style.overflow = "";
    currentSampleId = null;
    clearSelection();
  }

  function getAnnotationSummary(sample) {
    if (!sample || !sample.annotations || sample.annotations.length === 0) return null;
    const counts = { point: 0, rect: 0, text: 0 };
    const labels = [];
    sample.annotations.forEach((a) => {
      counts[a.type] = (counts[a.type] || 0) + 1;
      const tag = a.type === "text" ? a.content : a.label;
      if (tag && !labels.includes(tag)) labels.push(tag);
    });
    const parts = [];
    if (counts.point) parts.push(`${counts.point} 点`);
    if (counts.rect) parts.push(`${counts.rect} 矩形`);
    if (counts.text) parts.push(`${counts.text} 文字`);
    return {
      total: sample.annotations.length,
      summaryText: parts.join(" · "),
      labels: labels.slice(0, 4),
      counts
    };
  }

  function annotationSummaryHTML(sample) {
    const info = getAnnotationSummary(sample);
    if (!info) return "";
    const labelsHTML = info.labels.length
      ? `<div class="ann-summary-labels">${info.labels.map((l) => `<span class="ann-label-chip">${escapeHtml(l)}</span>`).join("")}</div>`
      : "";
    return `
      <div class="ann-summary">
        <div class="ann-summary-head">
          <span class="ann-summary-icon">✎</span>
          <span>标注 ${info.total} 条 · ${info.summaryText}</span>
        </div>
        ${labelsHTML}
      </div>
    `;
  }

  function init(refs) {
    getState = refs.getState || (() => refs.state);
    saveFn = refs.save;
    renderAllFn = refs.renderAll;
  }

  global.AnnotationView = {
    init,
    openAnnotation,
    closeAnnotation,
    getAnnotationSummary,
    annotationSummaryHTML
  };

})(window);
