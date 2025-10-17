"use strict";

const canvas = document.getElementById("artCanvas");
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Canvas 2D context not available.");
}

const imagePreview = {
  group: document.getElementById("imagePreviewGroup"),
  frame: document.querySelector(".image-preview__frame"),
  image: document.getElementById("imageThumbnail"),
};

if (!imagePreview.group || !imagePreview.frame || !imagePreview.image) {
  throw new Error("Image preview elements missing.");
}

hideImagePreview();

const controls = {
  uploadInput: document.getElementById("uploadInput"),
  baseSize: document.getElementById("baseSize"),
  shapeDistribution: document.getElementById("shapeDistribution"),
  outlineProbability: document.getElementById("outlineProbability"),
  strokeSize: document.getElementById("strokeSize"),
  sizeDistribution: document.getElementById("sizeDistribution"),
  maxSize: document.getElementById("maxSize"),
  layerCount: document.getElementById("layerCount"),
  randomizeButton: document.getElementById("randomizeButton"),
  saveButton: document.getElementById("saveButton"),
  display: {
    baseSize: document.getElementById("baseSizeValue"),
    shapeDistribution: document.getElementById("shapeDistributionValue"),
    outlineProbability: document.getElementById("outlineProbabilityValue"),
    strokeSize: document.getElementById("strokeSizeValue"),
    sizeDistribution: document.getElementById("sizeDistributionValue"),
    maxSize: document.getElementById("maxSizeValue"),
    layerCount: document.getElementById("layerCountValue"),
  },
};

const placeholder = document.getElementById("placeholder");

const dependentControls = [
  controls.baseSize,
  controls.shapeDistribution,
  controls.outlineProbability,
  controls.strokeSize,
  controls.sizeDistribution,
  controls.maxSize,
  controls.layerCount,
  controls.randomizeButton,
  controls.saveButton,
];

const sliderFormatters = {
  baseSize: (value) => `${value}px`,
  shapeDistribution: (value) => `${value}%`,
  outlineProbability: (value) => `${value}%`,
  strokeSize: (value) => `${value}px`,
  sizeDistribution: (value) => `${value}%`,
  maxSize: (value) => `${value}x`,
  layerCount: (value) => value,
};

const SUPPORTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const state = {
  sourceImage: null,
  sourceCanvas: document.createElement("canvas"),
  sourceCtx: null,
  sourceData: null,
  cornerColors: null,
  randomSeed: Math.random(),
};

state.sourceCtx = state.sourceCanvas.getContext("2d");
if (!state.sourceCtx) {
  throw new Error("Offscreen 2D context not available.");
}

controls.uploadInput.addEventListener("change", handleFileSelection);
controls.randomizeButton.addEventListener("click", () => {
  state.randomSeed = Math.random();
  renderArtwork();
});
controls.saveButton.addEventListener("click", saveAsPng);

["baseSize", "shapeDistribution", "outlineProbability", "strokeSize", "sizeDistribution", "maxSize", "layerCount"].forEach((key) => {
  const control = controls[key];
  control.addEventListener("input", () => {
    updateSliderDisplay(key, control.value);
    renderArtwork();
  });
});

function handleFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type || !SUPPORTED_TYPES.includes(file.type)) {
    showTemporaryMessage("Unsupported file type. Try PNG, JPG, or WebP.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const dataURL = typeof reader.result === "string" ? reader.result : "";
    image.onload = () => {
      prepareSourceImage(image, dataURL);
      enableControls();
      state.randomSeed = Math.random();
      renderArtwork();
    };
    image.onerror = () => {
      showTemporaryMessage("Unable to load that file. Try a different image.");
    };
    image.src = dataURL;
  };
  reader.readAsDataURL(file);
}

function prepareSourceImage(image, dataURL) {
  const { width, height } = image;
  if (!width || !height) {
    throw new Error("Image dimensions unavailable.");
  }
  state.sourceCanvas.width = width;
  state.sourceCanvas.height = height;
  state.sourceCtx.clearRect(0, 0, width, height);
  state.sourceCtx.drawImage(image, 0, 0);
  state.sourceData = state.sourceCtx.getImageData(0, 0, width, height);
  state.cornerColors = getCornerColors(state.sourceData, width, height);
  state.sourceImage = image;
  showImagePreview(dataURL || state.sourceCanvas.toDataURL("image/png"), width, height);
  setCanvasSize(width, height);
  hidePlaceholder();
}

function setCanvasSize(width, height) {
  canvas.width = width;
  canvas.height = height;
}

function enableControls() {
  dependentControls.forEach((control) => {
    control.disabled = false;
  });
}

function updateSliderDisplay(key, value) {
  const formatter = sliderFormatters[key];
  controls.display[key].textContent = formatter ? formatter(value) : value;
}

function renderArtwork() {
  if (!state.sourceImage || !state.sourceData) return;

  const baseSize = parseInt(controls.baseSize.value, 10);
  const shapeDistribution = clamp01(parseInt(controls.shapeDistribution.value, 10) / 100);
  const outlineProbability = clamp01(parseInt(controls.outlineProbability.value, 10) / 100);
  const strokeSize = Math.max(1, parseInt(controls.strokeSize.value, 10) || 1);
  const sizeDistribution = clamp01(parseInt(controls.sizeDistribution.value, 10) / 100);
  const maxSize = Math.min(12, Math.max(2, parseInt(controls.maxSize.value, 10) || 2));
  const layers = parseInt(controls.layerCount.value, 10);

  const { width, height } = canvas;

  drawCornerGradient(width, height, state.cornerColors);

  const layerOpacity = (index) => (index === 0 ? 1 : 0.5);
  const masterRandom = seededRandom(state.randomSeed);
  const offsetSeed = masterRandom();
  const offsetRandom = seededRandom(offsetSeed);
  const offsets = getGridOffsets({
    baseSize,
    width,
    height,
    random: offsetRandom,
  });

  for (let layerIndex = 0; layerIndex < layers; layerIndex += 1) {
    const layerSeed = masterRandom();
    const layerRandom = seededRandom(layerSeed);
    const cells = generateMasonryLayer({
      width,
      height,
      baseSize,
      shapeDistribution,
      outlineProbability,
      sizeDistribution,
      maxSize,
      offsets,
      random: layerRandom,
    });
    drawMasonryLayer(cells, layerOpacity(layerIndex), strokeSize);
  }
}

function drawCornerGradient(width, height, colors) {
  const gradientCanvas = createCornerGradient(width, height, colors);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(gradientCanvas, 0, 0, gradientCanvas.width, gradientCanvas.height, 0, 0, width, height);
}

function generateMasonryLayer({
  width,
  height,
  baseSize,
  shapeDistribution,
  outlineProbability,
  sizeDistribution,
  maxSize,
  offsets,
  random,
}) {
  const maxMultiplier = Math.max(2, Math.min(12, Math.floor(maxSize)));
  const probabilities = getSizeProbabilities(sizeDistribution, maxMultiplier);
  const offsetX = offsets?.x ?? 0;
  const offsetY = offsets?.y ?? 0;
  const paddingCols = Math.max(2, maxMultiplier);
  const paddingRows = Math.max(2, maxMultiplier);
  const cols = Math.max(1, Math.ceil((width + offsetX) / baseSize) + paddingCols);
  const rows = Math.max(1, Math.ceil((height + offsetY) / baseSize) + paddingRows);
  const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (occupied[row][col]) continue;

      const desiredSize = chooseSize(probabilities, random);
      const boundedSize = adjustSizeForBounds(desiredSize, row, col, rows, cols, occupied, maxMultiplier);
      markOccupied(occupied, row, col, boundedSize);

      const px = col * baseSize - offsetX;
      const py = row * baseSize - offsetY;
      const cellSize = baseSize * boundedSize;
      if (px >= width || py >= height || px + cellSize <= 0 || py + cellSize <= 0) {
        continue;
      }

      const shape = random() < shapeDistribution ? "circle" : "square";
      const color = sampleRandomColor(px, py, cellSize, cellSize, width, height, random);
      const outline = random() < outlineProbability;

      cells.push({
        x: px,
        y: py,
        width: cellSize,
        height: cellSize,
        shape,
        color,
        outline,
      });
    }
  }

  return cells;
}

function getSizeProbabilities(t, maxSize) {
  const clamped = Math.max(0, Math.min(1, t));
  const maxMultiplier = Math.max(2, maxSize);
  const probabilities = [{ size: 1, weight: 1 - 0.75 * clamped }];
  const extraCount = maxMultiplier - 1;
  const extraWeightTotal = 0.75 * clamped;
  const perExtraWeight = extraCount > 0 ? extraWeightTotal / extraCount : 0;
  for (let size = 2; size <= maxMultiplier; size += 1) {
    probabilities.push({ size, weight: perExtraWeight });
  }
  return probabilities;
}

function chooseSize(probabilities, random) {
  const total = probabilities.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return 1;
  let threshold = random() * total;
  for (const entry of probabilities) {
    threshold -= entry.weight;
    if (threshold <= 0) {
      return entry.size;
    }
  }
  return probabilities[probabilities.length - 1].size;
}

function adjustSizeForBounds(size, startRow, startCol, rows, cols, occupied, maxSize) {
  const maxCandidate = Math.min(maxSize, rows - startRow, cols - startCol);
  const bounded = Math.min(size, maxCandidate);
  for (let candidate = bounded; candidate >= 1; candidate -= 1) {
    if (canPlace(candidate, startRow, startCol, occupied)) {
      return candidate;
    }
  }
  return 1;
}
function canPlace(size, startRow, startCol, occupied) {
  for (let row = startRow; row < startRow + size; row += 1) {
    for (let col = startCol; col < startCol + size; col += 1) {
      if (occupied[row]?.[col]) {
        return false;
      }
    }
  }
  return true;
}

function markOccupied(occupied, startRow, startCol, size) {
  for (let row = startRow; row < startRow + size; row += 1) {
    for (let col = startCol; col < startCol + size; col += 1) {
      occupied[row][col] = true;
    }
  }
}

function getGridOffsets({ baseSize, width, height, random }) {
  const safeBase = Math.max(1, baseSize);
  const horizontalLimit = Math.min(safeBase, Math.max(0, width - safeBase)) || safeBase;
  const verticalLimit = Math.min(safeBase, Math.max(0, height - safeBase)) || safeBase;
  return {
    x: random() * horizontalLimit,
    y: random() * verticalLimit,
  };
}

function sampleRandomColor(px, py, cellWidth, cellHeight, width, height, random) {
  const sampleX = Math.min(width - 1, Math.max(0, Math.floor(px + random() * cellWidth)));
  const sampleY = Math.min(height - 1, Math.max(0, Math.floor(py + random() * cellHeight)));
  const { r, g, b } = getPixelColor(sampleX, sampleY);
  return `rgb(${r}, ${g}, ${b})`;
}

function getPixelColor(x, y) {
  const { data, width } = state.sourceData;
  const index = (y * width + x) * 4;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
  };
}

function drawMasonryLayer(cells, opacity, strokeSize) {
  ctx.save();
  ctx.globalAlpha = opacity;
  cells.forEach((cell) => {
    const minDimension = Math.min(cell.width, cell.height);
    const maxStroke = minDimension / 2;
    const lineWidth = cell.outline && maxStroke > 0 ? Math.min(strokeSize, maxStroke) : 0;
    const shouldStroke = cell.outline && lineWidth > 0;

    if (cell.shape === "circle") {
      const centerX = cell.x + cell.width / 2;
      const centerY = cell.y + cell.height / 2;
      const diameter = minDimension;
      const radius = shouldStroke ? Math.max(0, diameter / 2 - lineWidth / 2) : diameter / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      if (shouldStroke) {
        ctx.strokeStyle = cell.color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      } else {
        ctx.fillStyle = cell.color;
        ctx.fill();
      }
    } else if (shouldStroke) {
      const side = minDimension;
      const offsetX = (cell.width - side) / 2;
      const offsetY = (cell.height - side) / 2;
      ctx.strokeStyle = cell.color;
      ctx.lineWidth = lineWidth;
      const inset = lineWidth / 2;
      const size = Math.max(0, side - lineWidth);
      ctx.strokeRect(cell.x + offsetX + inset, cell.y + offsetY + inset, size, size);
    } else {
      const side = minDimension;
      const offsetX = (cell.width - side) / 2;
      const offsetY = (cell.height - side) / 2;
      ctx.fillStyle = cell.color;
      ctx.fillRect(cell.x + offsetX, cell.y + offsetY, side, side);
    }
  });
  ctx.restore();
}

function createCornerGradient(width, height, colors) {
  const sampleWidth = Math.max(2, Math.min(256, width));
  const sampleHeight = Math.max(2, Math.min(256, height));
  const gradientCanvas = document.createElement("canvas");
  gradientCanvas.width = sampleWidth;
  gradientCanvas.height = sampleHeight;
  const gradientCtx = gradientCanvas.getContext("2d");
  if (!gradientCtx) {
    throw new Error("Gradient context not available.");
  }
  const imageData = gradientCtx.createImageData(sampleWidth, sampleHeight);
  const { data } = imageData;

  for (let y = 0; y < sampleHeight; y += 1) {
    const v = sampleHeight > 1 ? y / (sampleHeight - 1) : 0;

    for (let x = 0; x < sampleWidth; x += 1) {
      const u = sampleWidth > 1 ? x / (sampleWidth - 1) : 0;
      const top = lerpColor(colors.topLeft, colors.topRight, u);
      const bottom = lerpColor(colors.bottomLeft, colors.bottomRight, u);
      const color = lerpColor(top, bottom, v);
      const idx = (y * sampleWidth + x) * 4;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 255;
    }
  }

  gradientCtx.putImageData(imageData, 0, 0);
  return gradientCanvas;
}

function lerpColor(a, b, t) {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * clamped),
    g: Math.round(a.g + (b.g - a.g) * clamped),
    b: Math.round(a.b + (b.b - a.b) * clamped),
  };
}

function getCornerColors(imageData, width, height) {
  const tl = getColorFromData(imageData, 0, 0);
  const tr = getColorFromData(imageData, width - 1, 0);
  const bl = getColorFromData(imageData, 0, height - 1);
  const br = getColorFromData(imageData, width - 1, height - 1);
  return {
    topLeft: tl,
    topRight: tr,
    bottomLeft: bl,
    bottomRight: br,
  };
}

function getColorFromData(imageData, x, y) {
  const { data, width } = imageData;
  const index = (y * width + x) * 4;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
  };
}

function hidePlaceholder() {
  placeholder.classList.add("hidden");
}

function showTemporaryMessage(message) {
  placeholder.textContent = message;
  placeholder.classList.remove("hidden");
  setTimeout(() => {
    if (state.sourceImage) {
      placeholder.classList.add("hidden");
    } else {
      placeholder.textContent = "Upload an image (PNG, JPG, or WebP) to generate art.";
    }
  }, 2400);
}

function showImagePreview(dataURL, width, height) {
  if (!dataURL) return;
  imagePreview.image.src = dataURL;
  if (width && height) {
    imagePreview.image.alt = `Original upload thumbnail (${width}x${height})`;
    imagePreview.frame.style.aspectRatio = `${width} / ${height}`;
  } else {
    imagePreview.image.alt = "Original upload thumbnail";
    imagePreview.frame.style.removeProperty("aspect-ratio");
  }
  imagePreview.group.classList.remove("hidden");
}

function hideImagePreview() {
  imagePreview.group.classList.add("hidden");
  imagePreview.image.removeAttribute("src");
  imagePreview.image.alt = "Original upload thumbnail";
  imagePreview.frame.style.removeProperty("aspect-ratio");
}

function saveAsPng() {
  if (!state.sourceImage) return;
  const dataURL = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = dataURL;
  link.download = `digital-art-playground-${timestamp}.png`;
  link.click();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// Initialize slider labels.
updateSliderDisplay("baseSize", controls.baseSize.value);
updateSliderDisplay("shapeDistribution", controls.shapeDistribution.value);
updateSliderDisplay("outlineProbability", controls.outlineProbability.value);
updateSliderDisplay("strokeSize", controls.strokeSize.value);
updateSliderDisplay("sizeDistribution", controls.sizeDistribution.value);
updateSliderDisplay("maxSize", controls.maxSize.value);
updateSliderDisplay("layerCount", controls.layerCount.value);

function seededRandom(seed) {
  let state = Math.floor(seed * 0x7fffffff) || 1;
  return function next() {
    state = (1103515245 * state + 12345) % 0x80000000;
    return state / 0x80000000;
  };
}
