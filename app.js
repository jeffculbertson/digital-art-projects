"use strict";

const canvas = document.getElementById("artCanvas");
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Canvas 2D context not available.");
}

const controls = {
  uploadInput: document.getElementById("uploadInput"),
  baseSize: document.getElementById("baseSize"),
  shapeDistribution: document.getElementById("shapeDistribution"),
  sizeDistribution: document.getElementById("sizeDistribution"),
  layerCount: document.getElementById("layerCount"),
  randomizeButton: document.getElementById("randomizeButton"),
  saveButton: document.getElementById("saveButton"),
  display: {
    baseSize: document.getElementById("baseSizeValue"),
    shapeDistribution: document.getElementById("shapeDistributionValue"),
    sizeDistribution: document.getElementById("sizeDistributionValue"),
    layerCount: document.getElementById("layerCountValue"),
  },
};

const placeholder = document.getElementById("placeholder");

const dependentControls = [
  controls.baseSize,
  controls.shapeDistribution,
  controls.sizeDistribution,
  controls.layerCount,
  controls.randomizeButton,
  controls.saveButton,
];

const sliderFormatters = {
  baseSize: (value) => `${value}px`,
  shapeDistribution: (value) => `${value}%`,
  sizeDistribution: (value) => `${value}%`,
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

["baseSize", "shapeDistribution", "sizeDistribution", "layerCount"].forEach((key) => {
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
    image.onload = () => {
      prepareSourceImage(image);
      enableControls();
      state.randomSeed = Math.random();
      renderArtwork();
    };
    image.onerror = () => {
      showTemporaryMessage("Unable to load that file. Try a different PNG.");
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function prepareSourceImage(image) {
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

  const random = seededRandom(state.randomSeed);

  const baseSize = parseInt(controls.baseSize.value, 10);
  const shapeDistribution = parseInt(controls.shapeDistribution.value, 10) / 100;
  const sizeDistribution = parseInt(controls.sizeDistribution.value, 10) / 100;
  const layers = parseInt(controls.layerCount.value, 10);

  const { width, height } = canvas;

  drawCornerGradient(width, height, state.cornerColors);

  const layerOpacity = (index) => (index === 0 ? 1 : 0.5);

  for (let layerIndex = 0; layerIndex < layers; layerIndex += 1) {
    const cells = generateMasonryLayer({
      width,
      height,
      baseSize,
      shapeDistribution,
      sizeDistribution,
      random,
    });
    drawMasonryLayer(cells, layerOpacity(layerIndex));
  }
}

function drawCornerGradient(width, height, colors) {
  const gradientCanvas = createCornerGradient(width, height, colors);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(gradientCanvas, 0, 0, gradientCanvas.width, gradientCanvas.height, 0, 0, width, height);
}

function generateMasonryLayer({ width, height, baseSize, shapeDistribution, sizeDistribution, random }) {
  const cols = Math.max(1, Math.floor(width / baseSize));
  const rows = Math.max(1, Math.floor(height / baseSize));
  const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));
  const cells = [];

  const probabilities = getSizeProbabilities(sizeDistribution);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (occupied[row][col]) continue;

      let size = chooseSize(probabilities, random);
      size = adjustSizeForBounds(size, row, col, rows, cols, occupied);
      markOccupied(occupied, row, col, size);

      const px = col * baseSize;
      const py = row * baseSize;
      const cellWidth = baseSize * size;
      const cellHeight = baseSize * size;
      const shape = random() < shapeDistribution ? "circle" : "square";
      const color = sampleRandomColor(px, py, cellWidth, cellHeight, width, height, random);

      cells.push({ x: px, y: py, width: cellWidth, height: cellHeight, shape, color });
    }
  }

  return cells;
}

function getSizeProbabilities(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const p1 = 1 - 0.75 * clamped;
  const pRest = 0.25 * clamped;
  return [
    { size: 1, weight: p1 },
    { size: 2, weight: pRest },
    { size: 3, weight: pRest },
    { size: 4, weight: pRest },
  ];
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

function adjustSizeForBounds(size, startRow, startCol, rows, cols, occupied) {
  const maxSize = Math.min(4, rows - startRow, cols - startCol);
  const bounded = Math.min(size, maxSize);
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

function drawMasonryLayer(cells, opacity) {
  ctx.save();
  ctx.globalAlpha = opacity;
  cells.forEach((cell) => {
    ctx.fillStyle = cell.color;
    if (cell.shape === "circle") {
      const radiusX = cell.width / 2;
      const radiusY = cell.height / 2;
      ctx.beginPath();
      ctx.ellipse(cell.x + radiusX, cell.y + radiusY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
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

function saveAsPng() {
  if (!state.sourceImage) return;
  const dataURL = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = dataURL;
  link.download = `digital-art-playground-${timestamp}.png`;
  link.click();
}

// Initialize slider labels.
updateSliderDisplay("baseSize", controls.baseSize.value);
updateSliderDisplay("shapeDistribution", controls.shapeDistribution.value);
updateSliderDisplay("sizeDistribution", controls.sizeDistribution.value);
updateSliderDisplay("layerCount", controls.layerCount.value);

function seededRandom(seed) {
  let state = Math.floor(seed * 0x7fffffff) || 1;
  return function next() {
    state = (1103515245 * state + 12345) % 0x80000000;
    return state / 0x80000000;
  };
}
