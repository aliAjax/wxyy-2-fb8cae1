(function (global) {
  "use strict";

  const REVIEW_STATUS = {
    INCOMPLETE: "incomplete",
    PENDING: "pending",
    CONFIRMED: "confirmed"
  };

  const REVIEW_STATUS_LABELS = {
    incomplete: "未完善",
    pending: "待复核",
    confirmed: "已确认"
  };

  const COMPLETENESS_FIELDS = [
    { key: "code", label: "样本编号", weight: 20 },
    { key: "photo", label: "照片", weight: 25 },
    { key: "minerals", label: "主要矿物", weight: 20 },
    { key: "texture", label: "颗粒结构", weight: 15 },
    { key: "comment", label: "老师批注", weight: 10 },
    { key: "location", label: "采样地点", weight: 5 },
    { key: "magnification", label: "放大倍数", weight: 5 }
  ];

  let stateRef = null;
  let saveFn = null;
  let renderAllFn = null;

  function calcCompleteness(sample) {
    if (!sample) return { score: 0, percent: 0, missing: [], filled: [] };
    let score = 0;
    const missing = [];
    const filled = [];

    COMPLETENESS_FIELDS.forEach((field) => {
      const value = sample[field.key];
      const hasValue = value && String(value).trim().length > 0;
      if (hasValue) {
        score += field.weight;
        filled.push(field.key);
      } else {
        missing.push(field.key);
      }
    });

    return {
      score,
      percent: Math.round(score),
      missing,
      filled
    };
  }

  function getReviewStatus(sample) {
    if (!sample) return REVIEW_STATUS.INCOMPLETE;
    if (sample.reviewStatus) return sample.reviewStatus;
    const { percent } = calcCompleteness(sample);
    return percent < 60 ? REVIEW_STATUS.INCOMPLETE : REVIEW_STATUS.PENDING;
  }

  function getReviewStatusLabel(sample) {
    const status = getReviewStatus(sample);
    return REVIEW_STATUS_LABELS[status] || "未完善";
  }

  function getReviewStatusClass(sample) {
    return getReviewStatus(sample);
  }

  function setReviewStatus(sampleId, status, comment) {
    const sample = stateRef.samples.find((s) => s.id === sampleId);
    if (!sample) return;
    sample.reviewStatus = status;
    sample.reviewComment = comment || sample.reviewComment || "";
    sample.reviewedAt = new Date().toISOString();
    saveFn();
    renderAllFn();
  }

  function reviewStatusBadgeHTML(sample) {
    const status = getReviewStatus(sample);
    const label = REVIEW_STATUS_LABELS[status];
    return `<span class="review-badge ${status}">${label}</span>`;
  }

  function completenessBarHTML(sample) {
    const { percent, missing } = calcCompleteness(sample);
    const missingLabels = missing
      .map((k) => {
        const f = COMPLETENESS_FIELDS.find((x) => x.key === k);
        return f ? f.label : k;
      })
      .join("、");
    return `
      <div class="completeness-bar">
        <div class="completeness-track">
          <div class="completeness-fill" style="width:${percent}%"></div>
        </div>
        <div class="completeness-meta">
          <span class="completeness-percent">${percent}%</span>
          ${missingLabels ? `<span class="completeness-missing" title="缺少：${missingLabels}">缺${missingLabels}</span>` : '<span class="completeness-ok">资料完整</span>'}
        </div>
      </div>
    `;
  }

  function reviewCardHTML(sample) {
    const annSummary = window.AnnotationView ? window.AnnotationView.annotationSummaryHTML(sample) : "";
    return `
      <article class="review-card" data-sample-id="${sample.id}">
        <div class="review-card-head">
          <h3>${sample.code || "未编号"}</h3>
          ${reviewStatusBadgeHTML(sample)}
        </div>
        ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}显微照片" class="review-card-photo">` : '<div class="photo-placeholder">暂无照片</div>'}
        ${completenessBarHTML(sample)}
        <div class="review-card-body">
          <p>${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}</p>
          <p>矿物：${sample.minerals || "未记录"}</p>
          <p>结构：${sample.texture || "未记录"}</p>
          ${sample.comment ? `<p class="review-comment">批注：${sample.comment}</p>` : ""}
          ${sample.reviewComment ? `<p class="review-note">复核意见：${sample.reviewComment}</p>` : ""}
          ${annSummary}
        </div>
        <div class="review-card-actions">
          <button type="button" class="ghost review-detail-btn" data-review-id="${sample.id}">审核</button>
        </div>
      </article>
    `;
  }

  function ensureReviewModal() {
    if (document.getElementById("reviewModal")) return;
    const modal = document.createElement("div");
    modal.id = "reviewModal";
    modal.className = "review-modal-overlay hidden";
    modal.innerHTML = `
      <div class="review-modal">
        <header class="review-modal-header">
          <div>
            <h2 id="reviewModalTitle">样本审核</h2>
            <p id="reviewModalSubtitle" class="review-modal-subtitle"></p>
          </div>
          <button type="button" id="closeReviewModalBtn" class="review-modal-close">关闭</button>
        </header>
        <div class="review-modal-body">
          <div class="review-modal-left">
            <div id="reviewModalPhoto" class="review-modal-photo"></div>
            <div id="reviewModalCompleteness"></div>
          </div>
          <div class="review-modal-right">
            <div class="review-field-group">
              <label>审核状态</label>
              <div class="review-status-selector">
                <button type="button" class="status-option" data-status="incomplete">
                  <span class="status-dot incomplete"></span>未完善
                </button>
                <button type="button" class="status-option" data-status="pending">
                  <span class="status-dot pending"></span>待复核
                </button>
                <button type="button" class="status-option" data-status="confirmed">
                  <span class="status-dot confirmed"></span>已确认
                </button>
              </div>
            </div>
            <div class="review-field-group">
              <label>基本信息</label>
              <div class="review-info-list" id="reviewInfoList"></div>
            </div>
            <div class="review-field-group">
              <label>原批注</label>
              <p id="reviewOriginalComment" class="review-original-comment"></p>
            </div>
            <div class="review-field-group">
              <label for="reviewCommentInput">复核意见</label>
              <textarea id="reviewCommentInput" rows="4" placeholder="请输入复核意见..."></textarea>
            </div>
          </div>
        </div>
        <footer class="review-modal-footer">
          <button type="button" class="ghost" id="reviewCancelBtn">取消</button>
          <button type="button" class="primary" id="reviewSaveBtn">保存审核</button>
        </footer>
      </div>
    `;
    document.body.appendChild(modal);
    bindReviewModalEvents();
  }

  let currentReviewSampleId = null;
  let selectedStatus = null;

  function bindReviewModalEvents() {
    const modal = document.getElementById("reviewModal");
    document.getElementById("closeReviewModalBtn").addEventListener("click", closeReviewModal);
    document.getElementById("reviewCancelBtn").addEventListener("click", closeReviewModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeReviewModal();
    });

    modal.querySelectorAll(".status-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedStatus = btn.dataset.status;
        modal.querySelectorAll(".status-option").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    document.getElementById("reviewSaveBtn").addEventListener("click", () => {
      if (!currentReviewSampleId || !selectedStatus) return;
      const comment = document.getElementById("reviewCommentInput").value.trim();
      setReviewStatus(currentReviewSampleId, selectedStatus, comment);
      closeReviewModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) {
        closeReviewModal();
      }
    });
  }

  function openReviewModal(sampleId) {
    ensureReviewModal();
    const sample = stateRef.samples.find((s) => s.id === sampleId);
    if (!sample) return;

    currentReviewSampleId = sampleId;
    selectedStatus = getReviewStatus(sample);

    const modal = document.getElementById("reviewModal");
    document.getElementById("reviewModalTitle").textContent = `审核：${sample.code || "未编号"}`;
    document.getElementById("reviewModalSubtitle").textContent =
      `${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}`;

    const photoEl = document.getElementById("reviewModalPhoto");
    photoEl.innerHTML = sample.photo
      ? `<img src="${sample.photo}" alt="${sample.code}">`
      : '<div class="photo-placeholder" style="height:240px;">暂无照片</div>';

    document.getElementById("reviewModalCompleteness").innerHTML = completenessBarHTML(sample);

    const infoList = document.getElementById("reviewInfoList");
    infoList.innerHTML = `
      <div class="review-info-item"><span class="info-label">样本编号</span><span class="info-value">${sample.code || "-"}</span></div>
      <div class="review-info-item"><span class="info-label">采样地点</span><span class="info-value">${sample.location || "-"}</span></div>
      <div class="review-info-item"><span class="info-label">放大倍数</span><span class="info-value">${sample.magnification || "-"}</span></div>
      <div class="review-info-item"><span class="info-label">偏光类型</span><span class="info-value">${sample.polarization || "-"}</span></div>
      <div class="review-info-item"><span class="info-label">主要矿物</span><span class="info-value">${sample.minerals || "-"}</span></div>
      <div class="review-info-item"><span class="info-label">颗粒结构</span><span class="info-value">${sample.texture || "-"}</span></div>
    `;

    document.getElementById("reviewOriginalComment").textContent = sample.comment || "（无原批注）";
    document.getElementById("reviewCommentInput").value = sample.reviewComment || "";

    modal.querySelectorAll(".status-option").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.status === selectedStatus);
    });

    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeReviewModal() {
    const modal = document.getElementById("reviewModal");
    if (modal) modal.classList.add("hidden");
    document.body.style.overflow = "";
    currentReviewSampleId = null;
    selectedStatus = null;
  }

  function getSamplesByStatus() {
    const result = { incomplete: [], pending: [], confirmed: [] };
    stateRef.samples.forEach((sample) => {
      const status = getReviewStatus(sample);
      if (result[status]) result[status].push(sample);
    });
    return result;
  }

  function renderReviewBoard() {
    const boardEl = document.getElementById("reviewBoard");
    if (!boardEl) return;

    const { incomplete, pending, confirmed } = getSamplesByStatus();

    const columns = [
      { key: "incomplete", label: "未完善", samples: incomplete, desc: "资料不完整，需要补充" },
      { key: "pending", label: "待复核", samples: pending, desc: "资料完整，等待老师审核" },
      { key: "confirmed", label: "已确认", samples: confirmed, desc: "已通过审核确认" }
    ];

    boardEl.innerHTML = columns.map((col) => `
      <section class="review-column ${col.key}">
        <header class="review-column-head">
          <div class="review-column-title">
            <span class="review-column-dot ${col.key}"></span>
            <h3>${col.label}</h3>
            <span class="review-column-count">${col.samples.length}</span>
          </div>
          <p class="review-column-desc">${col.desc}</p>
        </header>
        <div class="review-column-body" data-status="${col.key}">
          ${col.samples.length ? col.samples.map((s) => reviewCardHTML(s)).join("") : '<div class="review-empty">暂无样本</div>'}
        </div>
      </section>
    `).join("");

    boardEl.querySelectorAll(".review-detail-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        openReviewModal(btn.dataset.reviewId);
      });
    });
  }

  function init(refs) {
    stateRef = refs.state;
    saveFn = refs.save;
    renderAllFn = refs.renderAll;
  }

  global.ReviewModule = {
    init,
    calcCompleteness,
    getReviewStatus,
    getReviewStatusLabel,
    getReviewStatusClass,
    setReviewStatus,
    reviewStatusBadgeHTML,
    completenessBarHTML,
    reviewCardHTML,
    renderReviewBoard,
    openReviewModal,
    closeReviewModal,
    REVIEW_STATUS,
    REVIEW_STATUS_LABELS
  };

})(window);
