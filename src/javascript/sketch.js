/**
 * Global variables for managing the 2D canvas and webcam
 */
let canvas;        // Canvas element for processing webcam feed
let ctx;           // 2D rendering context
let w;             // Canvas width
let h;             // Canvas height
let size = 8;      // Size of each pixel/cube
let video;         // Webcam video element

/**
 * Global variables for Three.js 3D rendering
 */
let colors;        // Map to store grayscale colors for performance
let scene;         // Three.js scene
let camera;        // Three.js camera
let renderer;      // Three.js renderer
let cubes;         // Array to store all cube meshes
let nrOfCubesX;    // Number of cubes in X direction
let nrOfCubesY;    // Number of cubes in Y direction

/**
 * Main setup function that initializes everything
 * Called when the page loads
 */
function setup() {
    setupColors();      // Initialize color lookup table
    setupScene();       // Create Three.js scene
    setupRenderer();    // Setup WebGL renderer
    setupEventListeners(); // Setup window resize handler

    setupCanvas();      // Initialize 2D canvas
    setupWebCamera().then(() => {
        // These functions need webcam dimensions, so they run after webcam setup
        reset();        // Set canvas dimensions
        setupCamera();  // Setup Three.js camera
        setupCubes();   // Create cube grid
        setupLights();  // Add lighting to scene
        draw();         // Start render loop
    });
}

/**
 * Sets up the 2D canvas used for processing webcam feed
 */
function setupCanvas() {
    canvas = document.querySelector("#canvas");
    ctx = canvas.getContext("2d");
}

/**
 * Resets canvas dimensions based on webcam feed
 * and calculates number of cubes needed
 */
function reset() {
    w = canvas.width = video.videoWidth;
    h = canvas.height = video.videoHeight;
    nrOfCubesX = w / size;
    nrOfCubesY = h / size;
}

/**
 * Sets up webcam access and video element
 * Returns a promise that resolves when webcam is ready
 */
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

/**
 * Creates a lookup table for grayscale colors
 * This improves performance by reusing color objects
 */
function setupColors() {
    colors = new Map();
    for(let i = 0; i < 256; i++) {
        let c = new THREE.Color(`rgb(${i}, ${i}, ${i})`);
        colors.set(i, c);
    }
}

/**
 * Initializes the Three.js scene
 */
function setupScene() {
    scene = new THREE.Scene();
}

/**
 * Sets up the WebGL renderer with antialiasing
 */
function setupRenderer() {
    renderer = new THREE.WebGLRenderer({ 
        antialias: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
}

/**
 * Sets up the Three.js camera and orbit controls
 * Positions camera to view the cube grid without the first column
 */
function setupCamera() {
    let res = window.innerWidth / window.innerHeight;
    let z = 1/size*500;
    camera = new THREE.PerspectiveCamera(75, res, 0.1, 1000);
    
    // Position camera to view grid without first column
    camera.position.set((nrOfCubesX-1)/2 + 1, nrOfCubesY/2, z);
    
    // Setup orbit controls for interactive viewing
    let controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set((nrOfCubesX-1)/2 + 1, nrOfCubesY/2, 0);
    controls.update();
}

/**
 * Creates the grid of cubes, skipping the first column
 * This avoids the problematic leftmost column that was freezing
 */
function setupCubes() {
    let geometry = new THREE.BoxGeometry(1, 1, 1);
    cubes = [];
    let color = new THREE.Color(`rgb(128, 128, 128)`);
    
    // Start from x=1 to skip the problematic first column
    for(let x = 1; x < nrOfCubesX; x++) {
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

/**
 * Sets up scene lighting with ambient and spot lights
 */
function setupLights() {
    // Add ambient light for general illumination
    let ambientLight = new THREE.AmbientLight(0x777777);
    scene.add(ambientLight);
    
    // Add spot light for dramatic shadows
    let spotLight = new THREE.SpotLight(0xbbbbbb);
    spotLight.position.set(0, nrOfCubesY, 100);
    spotLight.castShadow = true;
    scene.add(spotLight);
}

/**
 * Main render loop
 * Updates webcam feed and 3D visualization each frame
 */
function draw() {
    requestAnimationFrame(draw);	
    ctx.drawImage(video, 0, 0, w, h);
    pixelate();
    renderer.render(scene, camera);
}

/**
 * Processes webcam feed and updates cube properties
 * Each cube's color and height is based on pixel brightness
 */
function pixelate() {
    let imageData = ctx.getImageData(0, 0, w, h);
    let pixels = imageData.data;
    
    cubes.forEach(cube => {
        let x = cube.position.x;
        let y = cube.position.y;
        let col = getAverage(pixels, x*size, h-y*size);
        let c = Math.round(col);
        cube.material.color = colors.get(c);
        
        // Set cube height based on brightness
        let z = col/10 + 0.01;
        cube.scale.z = z;
        cube.position.z = z / 2; 
    });
}

/**
 * Calculates average brightness of a pixel block
 * Uses weighted RGB values for accurate brightness
 */
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
    // Convert RGB to brightness using standard weights
    let val = (0.2126*r + 0.7152*g + 0.0722*b)/(size*size);
    return isNaN(val) ? 1 : val;
}

/**
 * Sets up window resize handler
 */
function setupEventListeners() {
    window.addEventListener("resize", onWindowResize);
}

/**
 * Handles window resize events
 * Updates camera and renderer to maintain proper aspect ratio
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize everything
setup();