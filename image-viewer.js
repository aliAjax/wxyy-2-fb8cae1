(function (global) {
  "use strict";

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 10;
  const SCALE_STEP = 0.1;
  const WHEEL_SCALE_FACTOR = 0.0015;
  const SYNC_THROTTLE_MS = 16;

  let getState = null;
  let saveFn = null;
  let renderAllFn = null;

  const viewers = new Map();
  let compareViewer = null;

  function getStateRef() {
    return getState ? getState() : null;
  }

  class ImageViewer {
    constructor(container, options = {}) {
      this.container = container;
      this.options = Object.assign({
        enableSync: false,
        syncGroup: null,
        enableTools: true,
        enableMeasure: true,
        standalone: true
      }, options);

      this.imageSrc = "";
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.brightness = 100;
      this.contrast = 100;

      this.isDragging = false;
      this.dragStartX = 0;
      this.dragStartY = 0;
      this.startTranslateX = 0;
      this.startTranslateY = 0;

      this.isMeasuring = false;
      this.measureStart = null;
      this.measureEnd = null;
      this.measureLineEl = null;
      this.measureLabelEl = null;

      this.scaleBar = null;
      this.scaleBarUnit = "μm";
      this.scaleBarPixels = 0;
      this.scaleBarLength = 0;

      this.pinching = false;
      this.pinchStartDistance = 0;
      this.pinchStartScale = 1;
      this.pinchStartX = 0;
      this.pinchStartY = 0;

      this.syncEnabled = false;
      this.syncPartner = null;
      this.isSyncing = false;
      this.syncTimer = null;
      this.lastSyncAt = 0;

      this.sampleId = null;
      this.calibrating = false;

      this.init();
    }

    init() {
      this.render();
      this.bindEvents();
    }

    render() {
      this.container.innerHTML = `
        <div class="iv-wrapper">
          <div class="iv-toolbar">
            <div class="iv-tool-group">
              <button type="button" class="iv-tool-btn" data-action="zoomIn" title="放大">
                <span class="iv-icon">🔍+</span>
              </button>
              <button type="button" class="iv-tool-btn" data-action="zoomOut" title="缩小">
                <span class="iv-icon">🔍-</span>
              </button>
              <button type="button" class="iv-tool-btn" data-action="fit" title="适配窗口">
                <span class="iv-icon">⬜</span>
              </button>
              <button type="button" class="iv-tool-btn" data-action="reset" title="重置视图">
                <span class="iv-icon">↺</span>
              </button>
              <span class="iv-scale-display"><span class="iv-scale-value">100</span>%</span>
            </div>
            ${this.options.enableTools ? `
            <div class="iv-tool-group">
              <label class="iv-tool-label">亮度</label>
              <input type="range" class="iv-slider" data-adjust="brightness" min="0" max="200" value="100">
              <span class="iv-slider-value"><span data-brightness>100</span>%</span>
            </div>
            <div class="iv-tool-group">
              <label class="iv-tool-label">对比度</label>
              <input type="range" class="iv-slider" data-adjust="contrast" min="0" max="200" value="100">
              <span class="iv-slider-value"><span data-contrast>100</span>%</span>
            </div>
            ` : ""}
            ${this.options.enableMeasure ? `
            <div class="iv-tool-group">
              <button type="button" class="iv-tool-btn" data-action="measure" title="距离测量">
                <span class="iv-icon">📏</span><span>测量</span>
              </button>
              <button type="button" class="iv-tool-btn" data-action="calibrate" title="比例尺校准">
                <span class="iv-icon">⚙</span><span>校准</span>
              </button>
              <button type="button" class="iv-tool-btn iv-hidden" data-action="clearMeasure" title="清除测量">
                <span class="iv-icon">✕</span>
              </button>
            </div>
            ` : ""}
            ${this.options.enableSync ? `
            <div class="iv-tool-group">
              <label class="iv-sync-toggle">
                <input type="checkbox" data-sync>
                <span>同步缩放平移</span>
              </label>
            </div>
            ` : ""}
          </div>
          <div class="iv-canvas-container" tabindex="0">
            <div class="iv-canvas">
              <img class="iv-image" alt="显微照片">
              <div class="iv-overlay"></div>
              <div class="iv-scale-bar-container">
                <div class="iv-scale-bar"></div>
                <div class="iv-scale-bar-label">请先校准比例尺</div>
              </div>
              <div class="iv-measure-layer"></div>
            </div>
          </div>
        </div>
      `;

      this.wrapper = this.container.querySelector(".iv-wrapper");
      this.canvasContainer = this.container.querySelector(".iv-canvas-container");
      this.canvas = this.container.querySelector(".iv-canvas");
      this.image = this.container.querySelector(".iv-image");
      this.overlay = this.container.querySelector(".iv-overlay");
      this.scaleBarEl = this.container.querySelector(".iv-scale-bar");
      this.scaleBarLabelEl = this.container.querySelector(".iv-scale-bar-label");
      this.measureLayer = this.container.querySelector(".iv-measure-layer");
      this.scaleDisplay = this.container.querySelector(".iv-scale-value");
      this.brightnessDisplay = this.container.querySelector("[data-brightness]");
      this.contrastDisplay = this.container.querySelector("[data-contrast]");
      this.measureBtn = this.container.querySelector('[data-action="measure"]');
      this.clearMeasureBtn = this.container.querySelector('[data-action="clearMeasure"]');
      this.syncCheckbox = this.container.querySelector('[data-sync]');
    }

    bindEvents() {
      this.container.querySelectorAll(".iv-tool-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const action = btn.dataset.action;
          this.handleToolbarAction(action, e);
        });
      });

      this.container.querySelectorAll(".iv-slider").forEach(slider => {
        slider.addEventListener("input", (e) => {
          const adjust = e.target.dataset.adjust;
          const value = parseInt(e.target.value, 10);
          this.handleAdjust(adjust, value);
        });
      });

      if (this.syncCheckbox) {
        this.syncCheckbox.addEventListener("change", (e) => {
          this.syncEnabled = e.target.checked;
          if (this.syncEnabled && this.syncPartner) {
            this.syncPartner.syncEnabled = true;
            if (this.syncPartner.syncCheckbox) {
              this.syncPartner.syncCheckbox.checked = true;
            }
            this.syncToPartner();
          }
        });
      }

      this.canvasContainer.addEventListener("wheel", (e) => {
        e.preventDefault();
        const rect = this.canvasContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const delta = -e.deltaY * WHEEL_SCALE_FACTOR;
        this.zoomAtPoint(mouseX, mouseY, delta);
      }, { passive: false });

      this.canvasContainer.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;

        if (this.isMeasuring) {
          this.handleMeasureStart(e);
          return;
        }

        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.startTranslateX = this.translateX;
        this.startTranslateY = this.translateY;
        this.canvasContainer.style.cursor = "grabbing";
      });

      document.addEventListener("mousemove", (e) => {
        if (this.isDragging) {
          e.preventDefault();
          const dx = e.clientX - this.dragStartX;
          const dy = e.clientY - this.dragStartY;
          this.translateX = this.startTranslateX + dx;
          this.translateY = this.startTranslateY + dy;
          this.updateTransform();
          this.syncToPartner();
        }

        if (this.isMeasuring && this.measureStart) {
          this.handleMeasureMove(e);
        }
      });

      document.addEventListener("mouseup", (e) => {
        if (this.isDragging) {
          this.isDragging = false;
          this.canvasContainer.style.cursor = "";
        }

        if (this.isMeasuring && this.measureStart) {
          this.handleMeasureEnd(e);
        }
      });

      this.canvasContainer.addEventListener("touchstart", (e) => {
        if (this.calibrating) return;
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          if (this.isMeasuring) {
            this.handleMeasureStart(touch);
            return;
          }
          this.isDragging = true;
          this.dragStartX = touch.clientX;
          this.dragStartY = touch.clientY;
          this.startTranslateX = this.translateX;
          this.startTranslateY = this.translateY;
        } else if (e.touches.length === 2) {
          e.preventDefault();
          this.pinching = true;
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          this.pinchStartDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          this.pinchStartScale = this.scale;
          this.pinchStartX = (t1.clientX + t2.clientX) / 2;
          this.pinchStartY = (t1.clientY + t2.clientY) / 2;
        }
      }, { passive: false });

      this.canvasContainer.addEventListener("touchmove", (e) => {
        if (this.calibrating) return;
        if (e.touches.length === 1 && this.isDragging) {
          e.preventDefault();
          const touch = e.touches[0];
          const dx = touch.clientX - this.dragStartX;
          const dy = touch.clientY - this.dragStartY;
          this.translateX = this.startTranslateX + dx;
          this.translateY = this.startTranslateY + dy;
          this.updateTransform();
          this.syncToPartner();
        } else if (e.touches.length === 2 && this.pinching) {
          e.preventDefault();
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          const scaleDelta = currentDistance / this.pinchStartDistance;
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.pinchStartScale * scaleDelta));

          const rect = this.canvasContainer.getBoundingClientRect();
          const centerX = (t1.clientX + t2.clientX) / 2 - rect.left;
          const centerY = (t1.clientY + t2.clientY) / 2 - rect.top;

          this.zoomAtPoint(centerX, centerY, 0, newScale);
        }

        if (this.isMeasuring && this.measureStart && e.touches.length === 1) {
          this.handleMeasureMove(e.touches[0]);
        }
      }, { passive: false });

      this.canvasContainer.addEventListener("touchend", (e) => {
        if (this.calibrating) return;
        if (e.touches.length === 0) {
          this.isDragging = false;
          this.pinching = false;
        }

        if (this.isMeasuring && this.measureStart && e.touches.length === 0 && e.changedTouches.length > 0) {
          const touch = e.changedTouches[0];
          this.handleMeasureEnd(touch);
        }
      });

      this.image.addEventListener("load", () => {
        this.fitToWindow();
        this.updateScaleBar();
      });
    }

    handleToolbarAction(action, event) {
      switch (action) {
        case "zoomIn":
          this.zoomBy(SCALE_STEP * 5);
          break;
        case "zoomOut":
          this.zoomBy(-SCALE_STEP * 5);
          break;
        case "fit":
          this.fitToWindow();
          break;
        case "reset":
          this.resetView();
          break;
        case "measure":
          this.toggleMeasureMode();
          break;
        case "calibrate":
          this.showCalibrationDialog();
          break;
        case "clearMeasure":
          this.clearMeasurements();
          break;
      }
    }

    handleAdjust(type, value) {
      if (type === "brightness") {
        this.brightness = value;
        if (this.brightnessDisplay) this.brightnessDisplay.textContent = value;
      } else if (type === "contrast") {
        this.contrast = value;
        if (this.contrastDisplay) this.contrastDisplay.textContent = value;
      }
      this.updateImageFilters();
    }

    zoomAtPoint(containerX, containerY, delta, targetScale = null) {
      const oldScale = this.scale;
      const newScale = targetScale !== null
        ? targetScale
        : Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * (1 + delta)));

      if (newScale === oldScale) return;

      const imgRect = this.image.getBoundingClientRect();
      const containerRect = this.canvasContainer.getBoundingClientRect();

      const imgX = containerX - (imgRect.left - containerRect.left);
      const imgY = containerY - (imgRect.top - containerRect.top);

      const scaleRatio = newScale / oldScale;

      this.translateX = containerX - (imgX * scaleRatio) - (containerRect.width / 2 - imgRect.width / 2 * scaleRatio);
      this.translateY = containerY - (imgY * scaleRatio) - (containerRect.height / 2 - imgRect.height / 2 * scaleRatio);

      this.scale = newScale;
      this.updateTransform();
      this.syncToPartner();
    }

    zoomBy(delta) {
      const rect = this.canvasContainer.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      this.zoomAtPoint(centerX, centerY, delta);
    }

    fitToWindow() {
      if (!this.image || !this.image.naturalWidth) return;

      const containerRect = this.canvasContainer.getBoundingClientRect();
      const padding = 40;
      const availableWidth = containerRect.width - padding * 2;
      const availableHeight = containerRect.height - padding * 2;

      const imgRatio = this.image.naturalWidth / this.image.naturalHeight;
      const containerRatio = availableWidth / availableHeight;

      if (imgRatio > containerRatio) {
        this.scale = availableWidth / this.image.naturalWidth;
      } else {
        this.scale = availableHeight / this.image.naturalHeight;
      }

      this.translateX = 0;
      this.translateY = 0;
      this.updateTransform();
      this.syncToPartner();
    }

    resetView() {
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.brightness = 100;
      this.contrast = 100;

      const brightnessSlider = this.container.querySelector('[data-adjust="brightness"]');
      const contrastSlider = this.container.querySelector('[data-adjust="contrast"]');
      if (brightnessSlider) brightnessSlider.value = 100;
      if (contrastSlider) contrastSlider.value = 100;
      if (this.brightnessDisplay) this.brightnessDisplay.textContent = "100";
      if (this.contrastDisplay) this.contrastDisplay.textContent = "100";

      this.updateTransform();
      this.updateImageFilters();
      this.syncToPartner();
    }

    updateTransform() {
      if (!this.canvas) return;
      this.canvas.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
      if (this.scaleDisplay) {
        this.scaleDisplay.textContent = Math.round(this.scale * 100);
      }
      this.updateScaleBar();
    }

    updateImageFilters() {
      if (!this.image) return;
      this.image.style.filter = `brightness(${this.brightness}%) contrast(${this.contrast}%)`;
    }

    toggleMeasureMode() {
      this.isMeasuring = !this.isMeasuring;
      if (this.measureBtn) {
        this.measureBtn.classList.toggle("active", this.isMeasuring);
      }
      if (this.clearMeasureBtn) {
        this.clearMeasureBtn.classList.toggle("iv-hidden", !this.isMeasuring && this.measureLayer.children.length === 0);
      }
      this.canvasContainer.style.cursor = this.isMeasuring ? "crosshair" : "";

      if (!this.isMeasuring) {
        this.measureStart = null;
        if (this.measureLineEl) {
          this.measureLineEl.remove();
          this.measureLineEl = null;
        }
        if (this.measureLabelEl) {
          this.measureLabelEl.remove();
          this.measureLabelEl = null;
        }
      }
    }

    getImageCoords(clientX, clientY) {
      const rect = this.image.getBoundingClientRect();
      const x = (clientX - rect.left) / this.scale;
      const y = (clientY - rect.top) / this.scale;
      return { x, y };
    }

    handleMeasureStart(event) {
      const coords = this.getImageCoords(event.clientX, event.clientY);
      this.measureStart = coords;

      this.measureLineEl = document.createElement("div");
      this.measureLineEl.className = "iv-measure-line";
      this.measureLineEl.style.display = "none";
      this.measureLayer.appendChild(this.measureLineEl);

      this.measureLabelEl = document.createElement("div");
      this.measureLabelEl.className = "iv-measure-label";
      this.measureLabelEl.style.display = "none";
      this.measureLayer.appendChild(this.measureLabelEl);
    }

    handleMeasureMove(event) {
      if (!this.measureStart || !this.measureLineEl) return;

      const coords = this.getImageCoords(event.clientX, event.clientY);
      this.updateMeasureLine(this.measureStart, coords);
    }

    handleMeasureEnd(event) {
      if (!this.measureStart) return;

      let endCoords;
      if (event) {
        endCoords = this.getImageCoords(event.clientX, event.clientY);
      } else {
        endCoords = this.measureEnd || this.measureStart;
      }

      const distance = Math.hypot(endCoords.x - this.measureStart.x, endCoords.y - this.measureStart.y);

      if (distance < 5) {
        if (this.measureLineEl) {
          this.measureLineEl.remove();
          this.measureLineEl = null;
        }
        if (this.measureLabelEl) {
          this.measureLabelEl.remove();
          this.measureLabelEl = null;
        }
        this.measureStart = null;
        return;
      }

      this.updateMeasureLine(this.measureStart, endCoords);

      const realDistance = this.calculateRealDistance(distance);
      if (this.measureLabelEl) {
        this.measureLabelEl.textContent = realDistance;
        this.measureLabelEl.style.display = "block";
      }

      this.measureStart = null;
      this.measureLineEl = null;
      this.measureLabelEl = null;

      if (this.clearMeasureBtn) {
        this.clearMeasureBtn.classList.remove("iv-hidden");
      }
    }

    updateMeasureLine(start, end) {
      if (!this.measureLineEl) return;

      const left = Math.min(start.x, end.x) * this.scale;
      const top = Math.min(start.y, end.y) * this.scale;
      const width = Math.abs(end.x - start.x) * this.scale;
      const height = Math.abs(end.y - start.y) * this.scale;
      const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;

      const lineLength = Math.sqrt(width * width + height * height);

      this.measureLineEl.style.left = left + "px";
      this.measureLineEl.style.top = top + "px";
      this.measureLineEl.style.width = lineLength + "px";
      this.measureLineEl.style.transform = `rotate(${angle}deg)`;
      this.measureLineEl.style.transformOrigin = "0 50%";
      this.measureLineEl.style.display = "block";

      if (this.measureLabelEl) {
        const midX = (start.x + end.x) / 2 * this.scale;
        const midY = (start.y + end.y) / 2 * this.scale - 20;
        this.measureLabelEl.style.left = midX + "px";
        this.measureLabelEl.style.top = midY + "px";
        this.measureLabelEl.style.display = "block";
        this.measureLabelEl.textContent = this.calculateRealDistance(
          Math.hypot(end.x - start.x, end.y - start.y)
        );
      }
    }

    calculateRealDistance(pixelDistance) {
      if (this.scaleBarPixels <= 0 || this.scaleBarLength <= 0) {
        return `${pixelDistance.toFixed(1)} px`;
      }
      const distance = (pixelDistance / this.scaleBarPixels) * this.scaleBarLength;
      return `${distance.toFixed(2)} ${this.scaleBarUnit}`;
    }

    showCalibrationDialog() {
      const unit = prompt("请输入比例尺单位（例如 μm、mm）：", this.scaleBarUnit);
      if (unit === null) return;

      const lengthStr = prompt("请输入实际长度（" + (unit.trim() || this.scaleBarUnit) + "）：", String(this.scaleBarLength || 100));
      if (lengthStr === null) return;

      const length = parseFloat(lengthStr);
      if (isNaN(length) || length <= 0) {
        alert("请输入有效的长度值。");
        return;
      }

      this.scaleBarUnit = unit.trim() || this.scaleBarUnit;
      this.scaleBarLength = length;

      alert("现在请在图片上拖拽绘制一条线，长度对应实际长度 " + length + " " + this.scaleBarUnit);

      const self = this;
      const originalMeasureMode = this.isMeasuring;
      const originalCalibrating = this.calibrating;
      this.isMeasuring = true;
      this.calibrating = true;
      this.canvasContainer.style.cursor = "crosshair";
      let tempLineEl = null;
      let startCoords = null;
      let pointerActive = false;

      function getPointFromEvent(e) {
        if (e.touches && e.touches.length > 0) {
          return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
        }
        return { clientX: e.clientX, clientY: e.clientY };
      }

      function onPointerDown(e) {
        if (e.type === "mousedown" && e.button !== 0) return;
        if (pointerActive) return;
        pointerActive = true;
        e.preventDefault();
        const pt = getPointFromEvent(e);
        startCoords = self.getImageCoords(pt.clientX, pt.clientY);
        if (e.type === "mousedown") {
          document.addEventListener("mousemove", onPointerMove);
          document.addEventListener("mouseup", onPointerUp);
        } else {
          document.addEventListener("touchmove", onPointerMove, { passive: false });
          document.addEventListener("touchend", onPointerUp);
          document.addEventListener("touchcancel", onPointerUp);
        }
      }

      function onPointerMove(e) {
        if (!startCoords || !pointerActive) return;
        e.preventDefault();
        if (!tempLineEl) {
          tempLineEl = document.createElement("div");
          tempLineEl.className = "iv-measure-line iv-calibration-line";
          self.measureLayer.appendChild(tempLineEl);
        }
        const pt = getPointFromEvent(e);
        const endCoords = self.getImageCoords(pt.clientX, pt.clientY);
        const left = Math.min(startCoords.x, endCoords.x) * self.scale;
        const top = Math.min(startCoords.y, endCoords.y) * self.scale;
        const width = Math.abs(endCoords.x - startCoords.x) * self.scale;
        const height = Math.abs(endCoords.y - startCoords.y) * self.scale;
        const angle = Math.atan2(endCoords.y - startCoords.y, endCoords.x - startCoords.x) * 180 / Math.PI;
        const lineLength = Math.sqrt(width * width + height * height);

        tempLineEl.style.left = left + "px";
        tempLineEl.style.top = top + "px";
        tempLineEl.style.width = lineLength + "px";
        tempLineEl.style.transform = "rotate(" + angle + "deg)";
        tempLineEl.style.transformOrigin = "0 50%";
        tempLineEl.style.display = "block";
      }

      function finishCalibration(endPt) {
        if (!startCoords) return;

        const endCoords = self.getImageCoords(endPt.clientX, endPt.clientY);
        const pixelDistance = Math.hypot(endCoords.x - startCoords.x, endCoords.y - startCoords.y);

        if (tempLineEl) {
          tempLineEl.remove();
          tempLineEl = null;
        }

        if (pixelDistance < 5) {
          alert("绘制的线段太短，请重新校准。");
          self.isMeasuring = originalMeasureMode;
          self.calibrating = originalCalibrating;
          self.canvasContainer.style.cursor = self.isMeasuring ? "crosshair" : "";
          return;
        }

        self.scaleBarPixels = pixelDistance;
        self.isMeasuring = originalMeasureMode;
        self.calibrating = originalCalibrating;
        self.canvasContainer.style.cursor = self.isMeasuring ? "crosshair" : "";

        self.updateScaleBar();
        self.saveCalibrationToSample();
        alert("比例尺已校准：" + self.scaleBarPixels.toFixed(1) + " 像素 = " + self.scaleBarLength + " " + self.scaleBarUnit);
      }

      function onPointerUp(e) {
        document.removeEventListener("mousemove", onPointerMove);
        document.removeEventListener("mouseup", onPointerUp);
        document.removeEventListener("touchmove", onPointerMove);
        document.removeEventListener("touchend", onPointerUp);
        document.removeEventListener("touchcancel", onPointerUp);
        self.canvasContainer.removeEventListener("mousedown", onPointerDown);
        self.canvasContainer.removeEventListener("touchstart", onPointerDown);

        if (!pointerActive) return;
        pointerActive = false;

        let endPt;
        if (e.changedTouches && e.changedTouches.length > 0) {
          endPt = { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
        } else {
          endPt = { clientX: e.clientX, clientY: e.clientY };
        }
        finishCalibration(endPt);
      }

      this.canvasContainer.addEventListener("mousedown", onPointerDown);
      this.canvasContainer.addEventListener("touchstart", onPointerDown, { passive: false });
    }

    saveCalibrationToSample() {
      if (!this.sampleId) return;
      const state = getStateRef();
      if (!state) return;
      const sample = state.samples.find(s => s.id === this.sampleId);
      if (!sample) return;

      sample.scaleBar = {
        unit: this.scaleBarUnit,
        length: this.scaleBarLength,
        pixels: this.scaleBarPixels
      };

      if (typeof saveFn === "function") {
        try { saveFn(); } catch (e) {}
      }
    }

    updateScaleBar() {
      if (!this.scaleBarEl || !this.scaleBarLabelEl) return;

      if (this.scaleBarPixels <= 0 || this.scaleBarLength <= 0) {
        this.scaleBarEl.style.display = "none";
        this.scaleBarLabelEl.textContent = "请先校准比例尺";
        return;
      }

      const targetLengths = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
      let displayLength = this.scaleBarLength;
      let displayPixels = this.scaleBarPixels;

      for (const len of targetLengths) {
        if (len <= this.scaleBarLength) {
          displayLength = len;
          displayPixels = (len / this.scaleBarLength) * this.scaleBarPixels;
        } else {
          break;
        }
      }

      const barWidth = displayPixels * this.scale;
      if (barWidth < 20) {
        this.scaleBarEl.style.display = "none";
        this.scaleBarLabelEl.textContent = "请放大后查看";
        return;
      }

      this.scaleBarEl.style.display = "block";
      this.scaleBarEl.style.width = barWidth + "px";
      this.scaleBarLabelEl.textContent = `${displayLength} ${this.scaleBarUnit}`;
    }

    clearMeasurements() {
      this.measureLayer.innerHTML = "";
      this.measureStart = null;
      this.measureEnd = null;
      this.measureLineEl = null;
      this.measureLabelEl = null;
      if (this.clearMeasureBtn) {
        this.clearMeasureBtn.classList.add("iv-hidden");
      }
    }

    syncToPartner() {
      if (!this.syncEnabled || !this.syncPartner || !this.syncPartner.syncEnabled) return;
      if (this.isSyncing) return;

      const now = Date.now();
      if (now - this.lastSyncAt < SYNC_THROTTLE_MS) {
        if (this.syncTimer) return;
        this.syncTimer = setTimeout(() => {
          this.syncTimer = null;
          this.doSyncToPartner();
        }, SYNC_THROTTLE_MS);
        return;
      }
      this.doSyncToPartner();
    }

    doSyncToPartner() {
      if (!this.syncEnabled || !this.syncPartner || !this.syncPartner.syncEnabled) return;
      if (this.isSyncing) return;

      this.isSyncing = true;
      this.lastSyncAt = Date.now();

      try {
        this.syncPartner.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale));
        this.syncPartner.translateX = this.translateX;
        this.syncPartner.translateY = this.translateY;

        this.syncPartner.updateTransform();
      } finally {
        this.syncPartner.isSyncing = true;
        setTimeout(() => {
          this.isSyncing = false;
          if (this.syncPartner) this.syncPartner.isSyncing = false;
        }, SYNC_THROTTLE_MS * 2);
      }
    }

    setImage(src) {
      this.imageSrc = src;
      this.image.src = src;
      this.clearMeasurements();
      this.resetView();
    }

    setScaleBar(unit, length, pixels) {
      this.scaleBarUnit = unit;
      this.scaleBarLength = length;
      this.scaleBarPixels = pixels;
      this.updateScaleBar();
    }

    setSyncPartner(partner) {
      this.syncPartner = partner;
    }

    destroy() {
      this.container.innerHTML = "";
    }
  }

  function createViewer(container, options = {}) {
    const viewer = new ImageViewer(container, options);
    viewers.set(container, viewer);
    return viewer;
  }

  function getViewer(container) {
    return viewers.get(container);
  }

  function destroyViewer(container) {
    const viewer = viewers.get(container);
    if (viewer) {
      viewer.destroy();
      viewers.delete(container);
    }
  }

  let singleViewerOverlay = null;

  function ensureSingleViewerOverlay() {
    if (singleViewerOverlay) return;

    singleViewerOverlay = document.createElement("div");
    singleViewerOverlay.id = "imageViewerOverlay";
    singleViewerOverlay.className = "iv-overlay-modal hidden";
    singleViewerOverlay.innerHTML = `
      <div class="iv-modal iv-modal-wide">
        <header class="iv-modal-header">
          <div>
            <h2 id="ivModalTitle">显微照片深度查看</h2>
            <p id="ivModalSubtitle" class="iv-modal-subtitle"></p>
          </div>
          <button type="button" id="ivModalCloseBtn" class="iv-close-btn">关闭</button>
        </header>
        <div class="iv-modal-split">
          <div id="ivModalViewer" class="iv-modal-body iv-viewer-pane"></div>
          <aside class="iv-assistant-pane">
            <div class="iv-assistant-header">
              <h3>🔬 矿物鉴定辅助</h3>
              <button type="button" id="ivToggleFeatures" class="iv-toggle-features">勾选观察特征</button>
            </div>
            <div id="ivAssistantInfo" class="iv-assistant-info"></div>
            <div id="ivFeaturesPanel" class="iv-features-panel hidden">
              <div id="ivFeaturesList"></div>
              <div class="iv-features-actions">
                <button type="button" id="ivClearFeatures" class="ghost">清空选择</button>
                <button type="button" id="ivSaveFeatures" class="primary">保存特征</button>
              </div>
            </div>
            <div id="ivAssistantResults" class="iv-assistant-results"></div>
          </aside>
        </div>
      </div>
    `;
    document.body.appendChild(singleViewerOverlay);

    singleViewerOverlay.addEventListener("click", (e) => {
      if (e.target === singleViewerOverlay) closeSingleViewer();
    });

    document.getElementById("ivModalCloseBtn").addEventListener("click", closeSingleViewer);

    document.getElementById("ivToggleFeatures").addEventListener("click", () => {
      document.getElementById("ivFeaturesPanel").classList.toggle("hidden");
    });

    document.getElementById("ivClearFeatures").addEventListener("click", () => {
      const panel = document.getElementById("ivFeaturesPanel");
      panel.querySelectorAll(".ma-feature-checkbox").forEach((cb) => { cb.checked = false; });
      updateViewerAssistantResults();
    });

    document.getElementById("ivSaveFeatures").addEventListener("click", async () => {
      if (!currentSingleViewer || !currentSingleViewer.sampleId) return;
      const selected = Array.from(
        document.querySelectorAll("#ivFeaturesPanel .ma-feature-checkbox:checked")
      ).map((cb) => cb.value);
      if (window.DataManager) {
        window.DataManager.updateSample(currentSingleViewer.sampleId, { observationFeatures: selected });
      }
      alert("观察特征已保存！");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !singleViewerOverlay.classList.contains("hidden")) {
        closeSingleViewer();
      }
    });
  }

  function updateViewerAssistantResults() {
    if (!currentSingleViewer || !currentSingleViewer.sampleId || !window.MineralAssistant || !window.DataManager) return;
    const state = window.DataManager.getState();
    const sample = state.samples.find((s) => s.id === currentSingleViewer.sampleId);
    if (!sample) return;

    const selectedFeatures = Array.from(
      document.querySelectorAll("#ivFeaturesPanel .ma-feature-checkbox:checked")
    ).map((cb) => cb.value);

    const tempSample = { ...sample, observationFeatures: selectedFeatures };
    const analysis = window.MineralAssistant.analyzeSample(tempSample);
    document.getElementById("ivAssistantResults").innerHTML =
      window.MineralAssistant.getMineralSuggestionHTML(analysis);
  }

  let currentSingleViewer = null;

  function openSingleViewer(sampleId) {
    const state = getStateRef();
    if (!state) return;

    const sample = state.samples.find(s => s.id === sampleId);
    if (!sample || !sample.photo) {
      alert("未找到样本或样本没有照片。");
      return;
    }

    ensureSingleViewerOverlay();

    document.getElementById("ivModalTitle").textContent = `深度查看：${sample.code}`;
    document.getElementById("ivModalSubtitle").textContent =
      `${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}`;

    const infoEl = document.getElementById("ivAssistantInfo");
    infoEl.innerHTML = `
      <div class="iv-info-row"><span class="iv-info-label">偏光：</span><span>${sample.polarization || "未记录"}</span></div>
      <div class="iv-info-row"><span class="iv-info-label">矿物：</span><span>${sample.minerals || "未记录"}</span></div>
      <div class="iv-info-row"><span class="iv-info-label">结构：</span><span>${sample.texture || "未记录"}</span></div>
      ${sample.comment ? `<div class="iv-info-row iv-info-comment"><span class="iv-info-label">批注：</span><span>${sample.comment}</span></div>` : ""}
    `;

    const featuresListEl = document.getElementById("ivFeaturesList");
    const selectedFeatures = sample.observationFeatures || [];
    featuresListEl.innerHTML = window.MineralAssistant
      ? window.MineralAssistant.getObservationFeaturesHTML(selectedFeatures, sample.polarization)
      : "";

    featuresListEl.querySelectorAll(".ma-feature-checkbox").forEach((cb) => {
      cb.addEventListener("change", updateViewerAssistantResults);
    });

    const container = document.getElementById("ivModalViewer");
    container.innerHTML = "";

    currentSingleViewer = createViewer(container, {
      standalone: true,
      enableTools: true,
      enableMeasure: true,
      enableSync: false
    });

    currentSingleViewer.sampleId = sampleId;

    if (sample.scaleBar) {
      currentSingleViewer.setScaleBar(
        sample.scaleBar.unit,
        sample.scaleBar.length,
        sample.scaleBar.pixels
      );
    }

    currentSingleViewer.setImage(sample.photo);

    singleViewerOverlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      currentSingleViewer.fitToWindow();
      updateViewerAssistantResults();
    }, 50);
  }

  function closeSingleViewer() {
    if (!singleViewerOverlay) return;

    if (currentSingleViewer) {
      const container = document.getElementById("ivModalViewer");
      destroyViewer(container);
      currentSingleViewer = null;
    }

    groupViewers.forEach(v => destroyViewer(v.container));
    groupViewers.length = 0;

    singleViewerOverlay.classList.add("hidden");
    document.body.style.overflow = "";
  }

  let compareViewerLeft = null;
  let compareViewerRight = null;

  const groupViewers = [];

  function openGroupViewer(groupId) {
    const state = getStateRef();
    if (!state) return;

    const group = (state.sampleGroups || []).find(g => g.id === groupId);
    if (!group) return;

    const groupSamples = (group.sampleIds || [])
      .map(sid => state.samples.find(s => s.id === sid))
      .filter(Boolean);

    if (groupSamples.length === 0) {
      alert("该样本组没有照片。");
      return;
    }

    ensureSingleViewerOverlay();

    document.getElementById("ivModalTitle").textContent = `样本组对比：${group.name || groupSamples[0]?.code || "未命名"}`;
    document.getElementById("ivModalSubtitle").textContent =
      `${groupSamples.length} 张偏光照片 · ${groupSamples.map(s => s.polarization).join(" / ")}`;

    const infoEl = document.getElementById("ivAssistantInfo");
    infoEl.innerHTML = `
      <div class="iv-info-row"><span class="iv-info-label">样本组：</span><span>${escapeHtml(group.name || "未命名")}</span></div>
      ${groupSamples.map(s => `<div class="iv-info-row"><span class="iv-info-label">${s.polarization}：</span><span>${s.code}</span></div>`).join("")}
    `;

    const featuresListEl = document.getElementById("ivFeaturesList");
    featuresListEl.innerHTML = "";

    const container = document.getElementById("ivModalViewer");
    container.innerHTML = "";

    groupViewers.forEach(v => destroyViewer(v.container));
    groupViewers.length = 0;

    const gridEl = document.createElement("div");
    gridEl.className = "iv-group-grid";
    gridEl.style.display = "grid";
    gridEl.style.gridTemplateColumns = `repeat(${Math.min(groupSamples.length, 3)}, 1fr)`;
    gridEl.style.gap = "8px";
    gridEl.style.height = "100%";
    container.appendChild(gridEl);

    const polarOrder = ["单偏光", "正交偏光", "反射光"];
    const sortedSamples = [...groupSamples].sort(
      (a, b) => polarOrder.indexOf(a.polarization) - polarOrder.indexOf(b.polarization)
    );

    sortedSamples.forEach(sample => {
      const pane = document.createElement("div");
      pane.className = "iv-group-pane";
      pane.style.position = "relative";
      pane.style.overflow = "hidden";
      pane.style.minHeight = "300px";

      const label = document.createElement("div");
      label.className = "iv-group-pane-label";
      label.style.position = "absolute";
      label.style.top = "8px";
      label.style.left = "8px";
      label.style.zIndex = "10";
      label.style.background = "rgba(0,0,0,0.6)";
      label.style.color = "#fff";
      label.style.padding = "4px 8px";
      label.style.borderRadius = "4px";
      label.style.fontSize = "13px";
      label.textContent = `${sample.code} · ${sample.polarization}`;
      pane.appendChild(label);

      gridEl.appendChild(pane);

      const viewer = createViewer(pane, {
        standalone: false,
        enableTools: true,
        enableMeasure: true,
        enableSync: true
      });

      viewer.sampleId = sample.id;
      if (sample.scaleBar) {
        viewer.setScaleBar(sample.scaleBar.unit, sample.scaleBar.length, sample.scaleBar.pixels);
      }
      viewer.setImage(sample.photo);

      groupViewers.push(viewer);
    });

    for (let i = 0; i < groupViewers.length; i++) {
      for (let j = 0; j < groupViewers.length; j++) {
        if (i !== j) {
          groupViewers[i].syncPartner = null;
        }
      }
    }

    groupViewers.forEach((viewer, idx) => {
      viewer._syncGroup = groupViewers;
      const origSync = viewer.syncToPartner.bind(viewer);
      viewer.syncToPartner = function() {
        if (!viewer.syncEnabled) return;
        if (viewer.isSyncing) return;
        const now = Date.now();
        if (now - viewer.lastSyncAt < SYNC_THROTTLE_MS) return;
        viewer.lastSyncAt = now;
        viewer.isSyncing = true;
        try {
          (viewer._syncGroup || []).forEach((partner, pIdx) => {
            if (pIdx === idx) return;
            partner.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewer.scale));
            partner.translateX = viewer.translateX;
            partner.translateY = viewer.translateY;
            partner.updateTransform();
          });
        } finally {
          setTimeout(() => {
            (viewer._syncGroup || []).forEach(v => { v.isSyncing = false; });
          }, SYNC_THROTTLE_MS * 2);
        }
      };

      if (viewer.syncCheckbox) {
        viewer.syncCheckbox.checked = true;
        viewer.syncEnabled = true;
      }
    });

    singleViewerOverlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      groupViewers.forEach(v => v.fitToWindow());
    }, 50);
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

  function renderCompareWithViewer() {
    const state = getStateRef();
    const comparePane = document.getElementById("comparePane");
    if (!state || !comparePane) return;

    const compareSamples = state.compare
      .map(id => state.samples.find(s => s.id === id))
      .filter(Boolean)
      .slice(0, 2);

    if (compareSamples.length < 2) {
      if (compareViewerLeft) {
        const leftContainer = document.querySelector(".iv-compare-left");
        const rightContainer = document.querySelector(".iv-compare-right");
        if (leftContainer) destroyViewer(leftContainer);
        if (rightContainer) destroyViewer(rightContainer);
        compareViewerLeft = null;
        compareViewerRight = null;
      }

      comparePane.innerHTML = compareSamples.length ? compareSamples.map(sample => {
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
          <button type="button" class="iv-compare-upgrade-btn" data-viewer="${sample.id}">🔬 深度对比查看</button>
        </article>
      `;
      }).join("") : "<p>勾选两张样本卡片后可并排对比。</p>";

      comparePane.querySelectorAll(".iv-compare-upgrade-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          openSingleViewer(btn.dataset.viewer);
        });
      });

      return;
    }

    const [leftSample, rightSample] = compareSamples;

    comparePane.innerHTML = `
      <div class="iv-compare-container">
        <div class="iv-compare-item">
          <div class="iv-compare-header">
            <h3>${leftSample.code}</h3>
            <span class="iv-compare-polar">${leftSample.polarization}</span>
          </div>
          <div class="iv-compare-left"></div>
        </div>
        <div class="iv-compare-item">
          <div class="iv-compare-header">
            <h3>${rightSample.code}</h3>
            <span class="iv-compare-polar">${rightSample.polarization}</span>
          </div>
          <div class="iv-compare-right"></div>
        </div>
      </div>
    `;

    const leftContainer = comparePane.querySelector(".iv-compare-left");
    const rightContainer = comparePane.querySelector(".iv-compare-right");

    compareViewerLeft = createViewer(leftContainer, {
      standalone: false,
      enableTools: true,
      enableMeasure: true,
      enableSync: true
    });

    compareViewerRight = createViewer(rightContainer, {
      standalone: false,
      enableTools: true,
      enableMeasure: true,
      enableSync: true
    });

    compareViewerLeft.sampleId = leftSample.id;
    compareViewerRight.sampleId = rightSample.id;

    compareViewerLeft.setSyncPartner(compareViewerRight);
    compareViewerRight.setSyncPartner(compareViewerLeft);

    if (leftSample.scaleBar) {
      compareViewerLeft.setScaleBar(
        leftSample.scaleBar.unit,
        leftSample.scaleBar.length,
        leftSample.scaleBar.pixels
      );
    }

    if (rightSample.scaleBar) {
      compareViewerRight.setScaleBar(
        rightSample.scaleBar.unit,
        rightSample.scaleBar.length,
        rightSample.scaleBar.pixels
      );
    }

    compareViewerLeft.setImage(leftSample.photo);
    compareViewerRight.setImage(rightSample.photo);
  }

  function init(refs) {
    getState = refs.getState || (() => refs.state);
    saveFn = refs.save;
    renderAllFn = refs.renderAll;
  }

  global.ImageViewerModule = {
    init,
    createViewer,
    getViewer,
    destroyViewer,
    openSingleViewer,
    closeSingleViewer,
    openGroupViewer,
    renderCompareWithViewer,
    ImageViewer
  };

})(window);
