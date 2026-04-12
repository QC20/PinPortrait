// ============================================================
// Constants
// ============================================================
const SIZE_MIN      = 2;
const SIZE_MAX      = 32;
const SIZE_STEP     = 2;
const THRESH_MIN    = 0;
const THRESH_MAX    = 100;
const THRESH_STEP   = 5;
const LERP_FACTOR   = 0.15;   // 0 = no smoothing, 1 = instant snap

// ============================================================
// State
// ============================================================
let size      = 8;
let threshold = 10;

// ============================================================
// Canvas / webcam
// ============================================================
let canvas, ctx, w, h, video;

// ============================================================
// Three.js
// ============================================================
let colors;          // Map<int, THREE.Color> grayscale lookup table
let scene, camera, renderer, controls;
let instancedMesh;
let nrOfCubesX, nrOfCubesY, totalCubes;
let currentZ;        // Float32Array - smoothed z values (lerped)
let targetZ;         // Float32Array - raw target z values

// Reusable objects to avoid per-frame allocation
let dummy;
let colorScratch;

// ============================================================
// Loop control
// ============================================================
let loopStarted  = false;
let lastTs       = 0;
let fps          = 0;

// ============================================================
// DOM refs (cached once)
// ============================================================
let hudFps, hudSize, hudThreshold, flashEl;


// ============================================================
// Entry point
// ============================================================
function setup() {
    dummy        = new THREE.Object3D();
    colorScratch = new THREE.Color();

    cacheDOMRefs();
    setupColors();
    setupScene();
    setupRenderer();
    setupEventListeners();
    setupCanvas();

    setupWebCamera()
        .then(() => {
            reset();
            setupCamera();
            setupInstancedMesh();
            startLoop();
        })
        .catch(showWebcamError);
}


// ============================================================
// DOM
// ============================================================
function cacheDOMRefs() {
    hudFps       = document.getElementById('hud-fps');
    hudSize      = document.getElementById('hud-size');
    hudThreshold = document.getElementById('hud-threshold');
    flashEl      = document.getElementById('flash');
}

function updateHUD() {
    hudFps.textContent       = `FPS: ${fps}`;
    hudSize.textContent      = `Size: ${size}px`;
    hudThreshold.textContent = `Threshold: ${threshold}`;
}


// ============================================================
// Canvas (2D sampling surface, hidden)
// ============================================================
function setupCanvas() {
    canvas = document.querySelector('#canvas');
    ctx    = canvas.getContext('2d');
}

function reset() {
    w          = canvas.width  = video.videoWidth;
    h          = canvas.height = video.videoHeight;
    nrOfCubesX = Math.floor(w / size);
    nrOfCubesY = Math.floor(h / size);
    totalCubes = nrOfCubesX * nrOfCubesY;
}


// ============================================================
// Webcam
// ============================================================
function setupWebCamera() {
    return new Promise((resolve, reject) => {
        navigator.mediaDevices
            .getUserMedia({ audio: false, video: true })
            .then(stream => {
                video           = document.querySelector('video');
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    video.play();
                    resolve();
                };
            })
            .catch(reject);
    });
}

function showWebcamError(err) {
    const overlay = document.getElementById('error-overlay');
    const msgEl   = document.getElementById('error-msg');
    msgEl.textContent = (err && err.message)
        ? err.message
        : 'Camera access was denied or is unavailable.';
    overlay.style.display = 'flex';

    document.getElementById('retry-btn').onclick = () => {
        overlay.style.display = 'none';
        setupWebCamera()
            .then(() => {
                reset();
                rebuildGrid();
                startLoop();
            })
            .catch(showWebcamError);
    };
}


// ============================================================
// Colors - grayscale lookup table (avoids per-frame allocation)
// ============================================================
function setupColors() {
    colors = new Map();
    for (let i = 0; i < 256; i++) {
        const v = i / 255;
        colors.set(i, new THREE.Color(v, v, v));
    }
}


// ============================================================
// Scene
// ============================================================
function setupScene() {
    scene            = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
}


// ============================================================
// Renderer
// ============================================================
function setupRenderer() {
    renderer = new THREE.WebGLRenderer({
        antialias:             true,
        preserveDrawingBuffer: true   // required for toDataURL screenshot
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
}


// ============================================================
// Camera
// ============================================================
function setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const z      = (1 / size) * 500;

    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.set(nrOfCubesX / 2, nrOfCubesY / 2, z);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(nrOfCubesX / 2, nrOfCubesY / 2, 0);
    controls.update();
}

function repositionCamera() {
    const z = (1 / size) * 500;
    camera.position.set(nrOfCubesX / 2, nrOfCubesY / 2, z);
    controls.target.set(nrOfCubesX / 2, nrOfCubesY / 2, 0);
    controls.update();
}


// ============================================================
// Instanced mesh
// MeshBasicMaterial is used intentionally: it ignores all
// lighting, so cube color is purely driven by webcam brightness
// with no angular shading artifacts from light direction.
// ============================================================
function setupInstancedMesh() {
    if (instancedMesh) {
        scene.remove(instancedMesh);
        instancedMesh.geometry.dispose();
        instancedMesh.material.dispose();
        instancedMesh = null;
    }

    currentZ = new Float32Array(totalCubes).fill(0.1);
    targetZ  = new Float32Array(totalCubes).fill(0.1);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();

    instancedMesh = new THREE.InstancedMesh(geometry, material, totalCubes);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    let i = 0;
    for (let x = 0; x < nrOfCubesX; x++) {
        for (let y = 0; y < nrOfCubesY; y++) {
            dummy.position.set(x, y, 0.05);
            dummy.scale.set(1, 1, 0.1);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);

            colorScratch.setRGB(0.5, 0.5, 0.5);
            instancedMesh.setColorAt(i, colorScratch);
            i++;
        }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
    }

    scene.add(instancedMesh);
}


// ============================================================
// Rebuild after pixel size change
// ============================================================
function rebuildGrid() {
    reset();
    setupInstancedMesh();
    repositionCamera();
    updateHUD();
}


// ============================================================
// Render loop
// ============================================================
function startLoop() {
    if (!loopStarted) {
        loopStarted = true;
        requestAnimationFrame(draw);
    }
}

function draw(timestamp) {
    requestAnimationFrame(draw);

    if (lastTs > 0) {
        fps = Math.round(1000 / (timestamp - lastTs));
    }
    lastTs = timestamp;

    ctx.drawImage(video, 0, 0, w, h);
    pixelate();
    renderer.render(scene, camera);
    updateHUD();
}


// ============================================================
// Core: sample webcam, lerp heights, update instanced mesh
// ============================================================
function pixelate() {
    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels    = imageData.data;

    let i = 0;
    for (let x = 0; x < nrOfCubesX; x++) {
        for (let y = 0; y < nrOfCubesY; y++) {

            // Corrected sampling: mirrors x, fixes y off-by-one
            const brightness = getAverage(
                pixels,
                (nrOfCubesX - 1 - x) * size,
                h - (y + 1) * size
            );

            // Threshold: cubes below it stay flat
            const effective = brightness < threshold ? 0 : brightness;

            // Lerp toward target z for smooth ripple effect
            targetZ[i]   = effective / 10 + 0.01;
            currentZ[i] += (targetZ[i] - currentZ[i]) * LERP_FACTOR;
            const z = currentZ[i];

            dummy.position.set(x, y, z / 2);
            dummy.scale.set(1, 1, z);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);

            const c = Math.max(0, Math.min(255, Math.round(brightness)));
            instancedMesh.setColorAt(i, colors.get(c));

            i++;
        }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
    }
}


// ============================================================
// Pixel sampling: weighted RGB to luminance
// ============================================================
function getAverage(pixels, x0, y0) {
    let r = 0, g = 0, b = 0;

    for (let x = x0; x < x0 + size; x++) {
        for (let y = y0; y < y0 + size; y++) {
            const idx = (x + w * y) * 4;
            r += pixels[idx];
            g += pixels[idx + 1];
            b += pixels[idx + 2];
        }
    }

    // ITU-R BT.709 luminance coefficients
    const val = (0.2126 * r + 0.7152 * g + 0.0722 * b) / (size * size);
    return isNaN(val) ? 1 : val;
}


// ============================================================
// Screenshot
// ============================================================
function takeScreenshot() {
    renderer.render(scene, camera);

    const url = renderer.domElement.toDataURL('image/png');
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `pinportrait-${Date.now()}.png`;
    a.click();

    flashEl.style.opacity    = '0.6';
    flashEl.style.transition = 'none';
    requestAnimationFrame(() => {
        flashEl.style.transition = 'opacity 0.4s ease';
        flashEl.style.opacity    = '0';
    });
}


// ============================================================
// Event listeners
// ============================================================
function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(e) {
    switch (e.key) {
        case '+':
        case '=':
            if (size < SIZE_MAX) {
                size = Math.min(SIZE_MAX, size + SIZE_STEP);
                rebuildGrid();
            }
            break;
        case '-':
            if (size > SIZE_MIN) {
                size = Math.max(SIZE_MIN, size - SIZE_STEP);
                rebuildGrid();
            }
            break;
        case ']':
            threshold = Math.min(THRESH_MAX, threshold + THRESH_STEP);
            updateHUD();
            break;
        case '[':
            threshold = Math.max(THRESH_MIN, threshold - THRESH_STEP);
            updateHUD();
            break;
        case 's':
        case 'S':
            takeScreenshot();
            break;
    }
}


// ============================================================
// Init
// ============================================================
setup();