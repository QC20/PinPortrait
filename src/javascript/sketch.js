/*
  PinPortrait: A 3D Webcam Pixelation Experiment
  Author: Johan Karlsson (DonKarlssonSan)
  Year: 2018
  Dependencies: three.js, THREE.OrbitControls
*/

// 2D canvas and webcam variables
let canvas, ctx, w, h;
const size = 8; // Size of each pixel/cube
let video;

// Three.js variables
let colors, scene, camera, renderer, cubes;
let nrOfCubesX, nrOfCubesY;

function setup() {
  console.log("Setting up...");
  setupColors();
  setupScene();  
  setupRenderer();
  setupEventListeners();
  setupCanvas();
  
  setupWebCamera().then(() => {
    // Initialize after webcam setup to get correct dimensions
    reset();
    setupCamera();
    setupCubes();
    setupLights();
    draw();
  }).catch(error => {
    console.error("Error setting up webcam:", error);
  });
}

function setupCanvas() {
  canvas = document.querySelector("#canvas");
  ctx = canvas.getContext("2d");
  console.log("Canvas setup complete");
}

function reset() {
  // Set canvas dimensions based on video feed
  w = canvas.width = video.videoWidth;
  h = canvas.height = video.videoHeight;
  nrOfCubesX = w / size;
  nrOfCubesY = h / size;
  console.log(`Reset dimensions: ${w}x${h}, Cubes: ${nrOfCubesX}x${nrOfCubesY}`);
}

function setupWebCamera() {
  return new Promise((resolve, reject) => {
    const constraints = { audio: false, video: true };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(mediaStream => {
        video = document.querySelector("video");
        video.srcObject = mediaStream;
        video.onloadedmetadata = () => {
          video.play();
          console.log("Webcam setup complete");
          resolve();
        };
      })
      .catch(err => {
        console.error(`Webcam setup error: ${err.name}: ${err.message}`);
        reject(err);
      }); 
  });
}

// Create a lookup table for grayscale colors
function setupColors() {
  colors = new Map();
  for (let i = 0; i < 256; i++) {
    let c = new THREE.Color(`rgb(${i}, ${i}, ${i})`);
    colors.set(i, c);
  }
  console.log("Colors setup complete");
}

function setupScene() {
  scene = new THREE.Scene();
  console.log("Scene setup complete");
}

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  console.log("Renderer setup complete");
}

function setupCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const z = Math.max(nrOfCubesX, nrOfCubesY) * 1.5;
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
  camera.position.set(nrOfCubesX / 2, nrOfCubesY / 2, z);
  
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(nrOfCubesX / 2, nrOfCubesY / 2, 0);
  controls.update();
  console.log("Camera setup complete");
}

function setupCubes() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  cubes = [];
  const defaultColor = new THREE.Color(`rgb(128, 128, 128)`);
  
  for (let x = 0; x < nrOfCubesX; x++) {
    for (let y = 0; y < nrOfCubesY; y++) {
      const material = new THREE.MeshStandardMaterial({
        roughness: 0.5,
        color: defaultColor,
      });   
      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(x, y, 0);
      scene.add(cube);
      cubes.push(cube);
    }
  }
  console.log(`Created ${cubes.length} cubes`);
}

function setupLights() {
  const ambientLight = new THREE.AmbientLight(0x777777);
  scene.add(ambientLight);
  
  const spotLight = new THREE.SpotLight(0xbbbbbb);
  spotLight.position.set(0, nrOfCubesY, 100);
  spotLight.castShadow = true;
  scene.add(spotLight);
  console.log("Lights setup complete");
}

function draw() {
  console.log("Drawing frame");
  requestAnimationFrame(draw);	
  ctx.drawImage(video, 0, 0, w, h);
  pixelate();
  renderer.render(scene, camera);
}

function pixelate() {
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;
  
  // Draw a red rectangle on the 2D canvas for debugging
  ctx.fillStyle = 'red';
  ctx.fillRect(0, 0, 50, 50);
  
  cubes.forEach(cube => {
    const x = cube.position.x;
    const y = cube.position.y;
    const col = getAverage(pixels, w - x * size, h - y * size);
    const c = Math.round(col);
    cube.material.color = colors.get(c);
    const z = col / 10 + 0.01;
    cube.scale.z = z;
    cube.position.z = z / 2; 
  });
}

function getAverage(pixels, x0, y0) {
  let r = 0, g = 0, b = 0;

  for (let x = x0; x < x0 + size; x += 1) {
    for (let y = y0; y < y0 + size; y += 1) {
      const index = (x + w * y) * 4;
      r += pixels[index];
      g += pixels[index + 1];
      b += pixels[index + 2];
    }
  }
  const val = (0.2126 * r + 0.7152 * g + 0.0722 * b) / (size * size);
  return isNaN(val) ? 1 : val;
}

function setupEventListeners() {
  window.addEventListener("resize", onWindowResize);
  console.log("Event listeners setup complete");
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  console.log("Window resized");
}

console.log("Starting setup...");
setup();