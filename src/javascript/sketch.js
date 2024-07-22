// 2d and web cam stuff
let canvas;
let ctx;
let w;
let h;
let size = 8;
let video;

// three.js stuff
let colors;
let scene;
let camera;
let renderer;
let cubes;
let nrOfCubesX;
let nrOfCubesY;

function setup() {
  setupColors();
  setupScene();  
  setupRenderer();
  setupEventListeners();

  setupCanvas();
  setupWebCamera().then(() => {
    // We need to call these after 
    // the web cam is setup so we 
    // know the width and height 
    // of the video feed
    reset();
    setupCamera();
    setupCubes();
    setupLights();
    draw();
  });
}

function setupCanvas() {
  canvas = document.querySelector("#canvas");
  ctx = canvas.getContext("2d");
}

function reset() {
  w = canvas.width = video.videoWidth;
  h = canvas.height = video.videoHeight;
  nrOfCubesX = w / size;
  nrOfCubesY = h / size;
}

function setupWebCamera() {
  return new Promise((resolve, reject) => {
    let constraints = { audio: false, video: true };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(mediaStream => {
        video = document.querySelector("video");
        video.srcObject = mediaStream;
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      })
      .catch(err => {
        console.log(err.name + ": " + err.message);
        reject(err);
      }); 
  });
}

// Trying to be clever and keep all grayscale colors
// in a lookup table. Will we avoid some GCs?
function setupColors() {
  colors = new Map();
  for(let i = 0; i < 256; i++) {
    let c = new THREE.Color(`rgb(${i}, ${i}, ${i})`);
    colors.set(i, c);
  }
}

function setupScene() {
  scene = new THREE.Scene();
}

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ 
    antialias: true 
  });
  renderer.setSize(
    window.innerWidth, 
    window.innerHeight);
  document.body.appendChild(renderer.domElement);
}

function setupCamera() {
  let res = window.innerWidth / window.innerHeight;
  let z = 1/size*500;
  camera = new THREE.PerspectiveCamera(
    75, 
    res, 
    0.1, 
    1000);
  camera.position.set(nrOfCubesX/2, nrOfCubesY/2, z);
  
  let controls = new THREE.OrbitControls(camera);
  controls.target.set(nrOfCubesX/2, nrOfCubesY/2, 0);
  controls.update();
}

function setupCubes() {
  let geometry = new THREE.BoxGeometry(1, 1, 1);
  cubes = [];
  let color = new THREE.Color(`rgb(128, 128, 128)`);
  for(let x = 0; x < nrOfCubesX; x++) {
    for(let y = 0; y < nrOfCubesY; y++) {
      let material = new THREE.MeshStandardMaterial({
        roughness: 0.5,
        color: color,
      });   
      let cube = new THREE.Mesh(geometry, material);
      cube.position.set(x, y, 0);
      scene.add(cube);
      cubes.push(cube);
    }
  }
}

function setupLights() {
  let ambientLight = new THREE.AmbientLight(0x777777);
  scene.add(ambientLight);
  
  let spotLight = new THREE.SpotLight(0xbbbbbb);
  spotLight.position.set(0, nrOfCubesY, 100);
  spotLight.castShadow = true;
  scene.add(spotLight);
}

function draw() {
  requestAnimationFrame(draw);	
  ctx.drawImage(video, 0, 0, w, h);
  pixelate();
  renderer.render(scene, camera);
}

function pixelate() {
  let imageData = ctx.getImageData(0, 0, w, h);
  let pixels = imageData.data;
  
  cubes.forEach(cube => {
    let x = cube.position.x;
    let y = cube.position.y;
    let col = getAverage(pixels, w-x*size, h-y*size);
    let c = Math.round(col);
    cube.material.color = colors.get(c);
    let z = col/10 + 0.01;
    cube.scale.z = z;
    cube.position.z = z / 2; 
  });
}

function getAverage(pixels, x0, y0) {
  let r = 0;
  let g = 0;
  let b = 0;

  for(let x = x0; x < x0 + size; x += 1) {
    for(let y = y0; y < y0 + size; y += 1) {
      let index = (x + w*y) * 4;
      r += pixels[index];
      g += pixels[index + 1];
      b += pixels[index + 2];
    }
  }
  let val = (0.2126*r + 0.7152*g + 0.0722*b)/(size*size)
  return isNaN(val) ? 1 : val;
}

function setupEventListeners() {
  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = 
    window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(
    window.innerWidth, 
    window.innerHeight);
}

setup();
