import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { BONES_DATA } from './data.js';

// Polyfill for CanvasRenderingContext2D.prototype.roundRect for older VR headset/mobile browsers
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (typeof r === 'number') {
      r = [r];
    }
    if (Array.isArray(r)) {
      if (r.length === 1) r = [r[0], r[0], r[0], r[0]];
      else if (r.length === 2) r = [r[0], r[1], r[0], r[1]];
      else if (r.length === 3) r = [r[0], r[1], r[2], r[1]];
    } else {
      r = [0, 0, 0, 0];
    }

    const rLT = r[0];
    const rRT = r[1];
    const rRB = r[2];
    const rLB = r[3];

    this.moveTo(x + rLT, y);
    this.lineTo(x + w - rRT, y);
    this.quadraticCurveTo(x + w, y, x + w, y + rRT);
    this.lineTo(x + w, y + h - rRB);
    this.quadraticCurveTo(x + w, y + h, x + w - rRB, y + h);
    this.lineTo(x + rLB, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - rLB);
    this.lineTo(x, y + rLT);
    this.quadraticCurveTo(x, y, x + rLT, y);
    this.closePath();
    return this;
  };
}

// DOM Elements
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const infoPlaceholder = document.getElementById('info-placeholder');
const infoContent = document.getElementById('info-content');
const subViewport = document.getElementById('dossier-panel');
const labelsContainer = document.getElementById('labels-container');

// HUD Information Elements
const hudBoneName = document.getElementById('hud-bone-name');
const hudBonePronunciation = document.getElementById('hud-bone-pronunciation');
const hudBoneSystem = document.getElementById('hud-bone-system');
const hudBoneFunction = document.getElementById('hud-bone-function');
const hudBoneClinical = document.getElementById('hud-bone-clinical');
const hudBoneFact = document.getElementById('hud-bone-fact');

// WebXR Elements
const btnVR = document.getElementById('btn-vr');
const btnAR = document.getElementById('btn-ar');
const xrInstruction = document.getElementById('xr-instruction');
const xrMessage = document.getElementById('xr-message');
const xrClose = document.getElementById('xr-close');
const vrFallbackModal = document.getElementById('vr-fallback-modal');
const btnEnterSimulator = document.getElementById('btn-enter-simulator');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnExitSimulator = document.getElementById('btn-exit-simulator');
let isVRSimulatorActive = false;

// Global Application State
let mainScene, mainCamera, mainRenderer, mainControls;
let isolatedScene, isolatedCamera, isolatedRenderer, isolatedControls;
let skeletonMesh = null; // The loaded Mesh Object_2
let skeletonGroup = null; // Group containing the GLB scene
let skeletonStandGroup = null; // Group containing the IV pole stand
let highlightedBoneMesh = null; // Mesh overlay showing active selection
let currentSelectedBone = null;
let currentHoveredBone = null;
let bonePins = [];
let xrSession = null;
let loadedSkullModel = null;
let isSkullLoading = false;
let gridHelper = null;
let floorPlane = null;
let dolly = null; // Camera rig group for WebXR locomotion
let cameraPitchGroup = null; // Intermediate group for looking up/down
let controller1 = null, controller2 = null; // 6DoF WebXR controllers (for Zapbox)
let controllerGrip1 = null, controllerGrip2 = null; // Visual models for controller grips
const clock = new THREE.Clock(); // Locomotion delta time tracker
let operatingRoomGroup = null; // Group containing the GLB scene
let operatingRoomBox = null;
let roomColliders = [];
let visualWalls = [];
let labShelfGroup = null; // Group containing the GLB lab shelf
let cabinetBones = []; // List of loaded cabinet bone groups for raycasting/grabbing
let grabbedBone = null; // Currently grabbed cabinet bone group
let grabbingController = null; // Controller currently grabbing the bone
let originalBoneParent = null; // Original parent of the grabbed bone
let originalBonePosition = new THREE.Vector3(); // Original local position of the grabbed bone
let originalBoneRotation = new THREE.Euler(); // Original local rotation of the grabbed bone
let originalBoneScale = new THREE.Vector3(); // Original scale of the grabbed bone
let grabbedBoneDistance = 0.3; // Default distance of grabbed bone from controller
let currentGrabbedScaleFactor = 2.0; // Current scale multiplier for grabbed bone

// Visual room boundaries matching the visual walls and windows of Room_updated.glb
const ROOM_LIMITS = {
  minX: -3.03,
  maxX: 2.83,
  minZ: -2.5,
  maxZ: 2.5
};
let vrInfoPanel = null;   // Holographic info panel rendered inside VR world
let vrBonePreview = null; // Isolated bone geometry floating inside VR world
let vrCloseButton = null; // Tappable CLOSE button mesh on the VR panel
let vrCycleIndex = -1;    // Tracker for trigger-based bone cycling in VR mode
let lastTriggerTime = 0;   // Timestamp to track double-trigger / double-clicks in VR
let vrGuidePanel = null;  // Holographic controller guide panel rendered inside VR
let vrGuideActive = false;// Tracker for whether the VR controller guide is active

// Webcam AR State Variables (Mobile Pass-Through fallback)
let webcamARActive = false;
let alphaOffset = 0;
let isFirstOrientationFrame = true;
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion(); // Device base orientation
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90 deg rotation around X

// Scale and offset parameters for life-size centering
const SCALE_FACTOR = 0.11; // Scales ~16 units height GLB to ~1.75 meters height
let skeletonBottomOffset = 0.88; // Elevates model to stand on floor (Y = 0)

// Raycaster for main viewport clicks
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Initialize application
init();

function init() {
  try {
    setupMainScene();
    setupIsolatedScene();
    loadSkeletonModel();
    loadSkeletonStand(); // Load the skeleton stand
    loadOperatingRoomModel(); // Start loading the operating room in the background
    setupEventListeners();
    animate();

    // Add App Version HUD element to easily verify cache refresh
    const versionDiv = document.createElement('div');
    versionDiv.style.position = 'fixed';
    versionDiv.style.bottom = '10px';
    versionDiv.style.right = '10px';
    versionDiv.style.background = 'rgba(0,0,0,0.8)';
    versionDiv.style.color = '#ff8800';
    versionDiv.style.padding = '5px 10px';
    versionDiv.style.fontFamily = 'monospace';
    versionDiv.style.fontSize = '12px';
    versionDiv.style.borderRadius = '4px';
    versionDiv.style.zIndex = '9999';
    versionDiv.innerText = 'App Version: v68';
    document.body.appendChild(versionDiv);
  } catch (error) {
    console.error("Initialization error (likely WebGL disabled/unsupported):", error);
    if (loadingText) {
      loadingText.innerHTML = "WebGL Context Creation Failed.<br><span style='font-size:16px; color:#ff4d4d;'>Hardware Acceleration is disabled in Chrome.</span><br><span style='font-size:14px; color:#a0aec0; display:block; margin-top:8px;'>To fix:<br>1. Go to <b>Settings</b> in Chrome.<br>2. Search for <b>\"graphics acceleration\"</b>.<br>3. Turn on <b>\"Use graphics acceleration when available\"</b>.<br>4. Relaunch your browser and refresh this page.</span>";
    }
  }
}

// 1. Setup Main 3D Scene
function setupMainScene() {
  const canvas = document.getElementById('canvas-main');

  // Scene
  mainScene = new THREE.Scene();
  mainScene.background = null; // transparent to show beautiful CSS radial gradient

  // Camera
  mainCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    mainCamera.position.set(0, 0.68, 4.22); // Zoomed out and lowered camera Y to tilt upwards and shift model down on mobile
  } else {
    mainCamera.position.set(0, 1.2, 2.5); // Initial camera position for desktop
  }

  // Renderer
  mainRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  mainRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mainRenderer.shadowMap.enabled = true;
  mainRenderer.shadowMap.type = THREE.PCFShadowMap;
  mainRenderer.xr.enabled = true; // Enable WebXR!

  // Orbit Controls
  mainControls = new OrbitControls(mainCamera, mainRenderer.domElement);
  mainControls.enableDamping = true;
  mainControls.dampingFactor = 0.05;
  mainControls.maxPolarAngle = Math.PI / 2 + 0.1; // Limit panning below ground
  mainControls.minDistance = 0.5;
  mainControls.maxDistance = 15;
  if (isMobile) {
    mainControls.target.set(0, 1.18, 0); // Focus higher (neck/head level) to tilt camera up and push the model down away from the top header on mobile
  } else {
    mainControls.target.set(0, 0.88, 0); // Focus on mid-torso area for desktop
  }

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  mainScene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 0.85);
  mainLight.position.set(5, 8, 5);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 1024;
  mainLight.shadow.mapSize.height = 1024;
  mainLight.shadow.bias = -0.0001;
  mainScene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0x4facfe, 0.45); // Cool cyan fill light
  fillLight.position.set(-5, 3, -2);
  mainScene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xf35588, 0.35); // Subtle pink rim light
  rimLight.position.set(0, 4, -6);
  mainScene.add(rimLight);

  // Floor Grid helper & Shadow floor plane
  gridHelper = new THREE.GridHelper(10, 20, 0x00f2fe, 0x1a213a);
  gridHelper.position.y = 0;
  gridHelper.material.opacity = 0.15;
  gridHelper.material.transparent = true;
  mainScene.add(gridHelper);

  const floorGeometry = new THREE.PlaneGeometry(50, 50);
  const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
  floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
  floorPlane.rotation.x = -Math.PI / 2;
  floorPlane.position.y = 0;
  floorPlane.receiveShadow = true;
  mainScene.add(floorPlane);

  // Create Dolly / Player Rig for VR locomotion
  dolly = new THREE.Group();
  dolly.position.set(0, 0, 0);
  mainScene.add(dolly);

  // Group to handle looking up/down artificially
  cameraPitchGroup = new THREE.Group();
  dolly.add(cameraPitchGroup);
  cameraPitchGroup.add(mainCamera);

  // 6DoF Controllers Setup for Zapbox / VR inputs
  controller1 = mainRenderer.xr.getController(0);
  controller1.addEventListener('squeezestart', () => onControllerSqueezeStart(controller1));
  controller1.addEventListener('squeezeend', () => onControllerSqueezeEnd(controller1));
  dolly.add(controller1);

  controller2 = mainRenderer.xr.getController(1);
  controller2.addEventListener('squeezestart', () => onControllerSqueezeStart(controller2));
  controller2.addEventListener('squeezeend', () => onControllerSqueezeEnd(controller2));
  dolly.add(controller2);

  // Controller Grip models setup
  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = mainRenderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  dolly.add(controllerGrip1);

  controllerGrip2 = mainRenderer.xr.getControllerGrip(1);
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  dolly.add(controllerGrip2);

  // Visual pointer rays for 6DoF aiming
  const laserGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -5)
  ]);
  const laserMat = new THREE.LineBasicMaterial({
    color: 0x00f2fe,
    transparent: true,
    opacity: 0.8
  });

  const laser1 = new THREE.Line(laserGeom, laserMat);
  laser1.name = 'laser';
  controller1.add(laser1);

  const laser2 = new THREE.Line(laserGeom, laserMat);
  laser2.name = 'laser';
  controller2.add(laser2);

  // Visual controller grip rings so user can locate controllers in space
  const gripGeom = new THREE.RingGeometry(0.015, 0.02, 32);
  const gripMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, side: THREE.DoubleSide });

  const grip1 = new THREE.Mesh(gripGeom, gripMat);
  grip1.rotation.x = Math.PI / 2;
  controller1.add(grip1);

  const grip2 = new THREE.Mesh(gripGeom, gripMat);
  grip2.rotation.x = Math.PI / 2;
  controller2.add(grip2);
}

// 2. Setup Secondary Viewport (Isolated bone)
function setupIsolatedScene() {
  const canvas = document.getElementById('canvas-isolated');

  isolatedScene = new THREE.Scene();

  isolatedCamera = new THREE.PerspectiveCamera(40, 1.16, 0.05, 10);
  isolatedCamera.position.set(0, 0, 2.5);

  isolatedRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  isolatedRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  isolatedControls = new OrbitControls(isolatedCamera, isolatedRenderer.domElement);
  isolatedControls.enableDamping = true;
  isolatedControls.dampingFactor = 0.08;
  isolatedControls.minDistance = 0.1;
  isolatedControls.maxDistance = 5;

  // Dedicated Lighting for isolated view
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  isolatedScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
  keyLight.position.set(3, 4, 3);
  isolatedScene.add(keyLight);

  const backLight = new THREE.DirectionalLight(0x00f2fe, 0.5);
  backLight.position.set(-3, -2, -3);
  isolatedScene.add(backLight);
}

// 4. Load the 3D GLB Skeleton Model
function loadSkeletonModel() {
  const loader = new GLTFLoader();

  loader.load(
    './skeleton/human_skeleton.glb?v=48',
    (gltf) => {
      skeletonGroup = gltf.scene;

      // Find the main mesh - Object_2 contains indices, position attributes
      skeletonGroup.traverse((child) => {
        if (child.isMesh) {
          skeletonMesh = child;
          child.castShadow = true;
          child.receiveShadow = true;

          // Apply a high-quality bone-like material
          child.material = new THREE.MeshStandardMaterial({
            color: 0xdddddf,
            roughness: 0.65,
            metalness: 0.05,
            flatShading: false
          });
        }
      });

      if (!skeletonMesh) {
        console.error("Could not find skeleton mesh in model file!");
        loadingText.innerText = "Error: Mesh parsing failed.";
        return;
      }

      // Apply scaling to make it 1.75 meters tall
      skeletonGroup.scale.set(SCALE_FACTOR, SCALE_FACTOR, SCALE_FACTOR);

      // Recompute size after scaling
      const scaledBox = new THREE.Box3().setFromObject(skeletonGroup);
      const scaledMin = scaledBox.min;

      // Calculate offset so the bottom of the feet rests exactly at Y = 0
      skeletonBottomOffset = -scaledMin.y;
      skeletonGroup.position.set(0, skeletonBottomOffset, 0);

      mainScene.add(skeletonGroup);
      if (skeletonStandGroup) {
        attachStandToSkeleton();
      }

      const finalBox = new THREE.Box3().setFromObject(skeletonGroup);
      const center = finalBox.getCenter(new THREE.Vector3());
      const size = finalBox.getSize(new THREE.Vector3());
      console.log("=== SKELETON MODEL DIMENSIONS ===");
      console.log(`Size: x=${size.x.toFixed(4)}, y=${size.y.toFixed(4)}, z=${size.z.toFixed(4)}`);
      console.log(`Center: x=${center.x.toFixed(4)}, y=${center.y.toFixed(4)}, z=${center.z.toFixed(4)}`);
      console.log(`Min: x=${finalBox.min.x.toFixed(4)}, y=${finalBox.min.y.toFixed(4)}, z=${finalBox.min.z.toFixed(4)}`);
      console.log(`Max: x=${finalBox.max.x.toFixed(4)}, y=${finalBox.max.y.toFixed(4)}, z=${finalBox.max.z.toFixed(4)}`);

      // Setup camera target and height dynamically based on the model's actual bounds

      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        mainControls.target.set(0, center.y + 0.3, 0);
        mainCamera.position.set(0, center.y - 0.2, size.y * 2.4); // Zoom out and tilt camera up to shift skeleton down on mobile
      } else {
        mainControls.target.copy(center);
        mainCamera.position.set(0, center.y, size.y * 1.35); // Set perfect zoom on startup for desktop
      }
      mainControls.update();

      // Create Floating 3D pins
      createBonePins();

      // Trigger resize to initialize widths/heights
      onResize();

      // Fade out loading screen
      setTimeout(() => {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.style.display = 'none', 500);
      }, 500);
    },
    (xhr) => {
      if (xhr.total && xhr.total > 0) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        loadingText.innerText = `Loading Skeleton Model... ${percent}%`;
      } else {
        // Server didn't send Content-Length — show bytes received so it doesn't look frozen
        const mb = (xhr.loaded / 1024 / 1024).toFixed(1);
        loadingText.innerText = `Loading Skeleton Model... ${mb} MB received`;
      }
    },
    (error) => {
      console.error('Error loading skeleton model:', error);
      loadingText.innerText = 'Error loading skeleton. Make sure GLB file exists.';
    }
  );
}

// 5. Create absolute DOM markers projected onto 3D position
function createBonePins() {
  Object.entries(BONES_DATA).forEach(([key, bone]) => {
    const pin = document.createElement('div');
    pin.className = 'bone-pin';
    pin.id = `pin-${key}`;

    const dot = document.createElement('div');
    dot.className = 'bone-pin-dot';

    const label = document.createElement('div');
    label.className = 'bone-pin-label';
    label.innerText = bone.name;

    pin.appendChild(dot);
    pin.appendChild(label);

    // Add click event to pin
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      selectBone(key);
    });

    labelsContainer.appendChild(pin);
    bonePins.push({ key, element: pin, localPos: new THREE.Vector3(bone.marker.x, bone.marker.y, bone.marker.z) });
  });
}

// Updates HTML Pin coordinates in screen space
const tempV = new THREE.Vector3();
function updatePins() {
  if (!skeletonMesh || !mainCamera) return;

  bonePins.forEach((pin) => {
    tempV.copy(pin.localPos);

    // Transform local coordinates to world coordinates
    skeletonMesh.localToWorld(tempV);

    // Project to screen coordinates
    tempV.project(mainCamera);

    const isBehind = tempV.z > 1;

    if (isBehind) {
      pin.element.style.display = 'none';
    } else {
      pin.element.style.display = 'flex';
      const x = (tempV.x * 0.5 + 0.5) * mainRenderer.domElement.clientWidth;
      const y = (tempV.y * -0.5 + 0.5) * mainRenderer.domElement.clientHeight;

      pin.element.style.left = `${x}px`;
      pin.element.style.top = `${y}px`;
    }
  });
}

// 6. Geometry Slicing Logic to Isolate Bones
function sliceGeometry(originalMesh, bounds) {
  const geom = originalMesh.geometry;
  const posAttr = geom.attributes.position;
  const normalAttr = geom.attributes.normal;
  const indexAttr = geom.index;

  const positions = [];
  const normals = [];

  const count = indexAttr ? indexAttr.count : posAttr.count;

  function inBounds(x, y, z) {
    return x >= bounds.xMin && x <= bounds.xMax &&
      y >= bounds.yMin && y <= bounds.yMax &&
      z >= bounds.zMin && z <= bounds.zMax;
  }

  if (indexAttr) {
    for (let i = 0; i < count; i += 3) {
      const idx0 = indexAttr.getX(i);
      const idx1 = indexAttr.getX(i + 1);
      const idx2 = indexAttr.getX(i + 2);

      const x0 = posAttr.getX(idx0), y0 = posAttr.getY(idx0), z0 = posAttr.getZ(idx0);
      const x1 = posAttr.getX(idx1), y1 = posAttr.getY(idx1), z1 = posAttr.getZ(idx1);
      const x2 = posAttr.getX(idx2), y2 = posAttr.getY(idx2), z2 = posAttr.getZ(idx2);

      if (inBounds(x0, y0, z0) || inBounds(x1, y1, z1) || inBounds(x2, y2, z2)) {
        positions.push(
          x0, y0, z0,
          x1, y1, z1,
          x2, y2, z2
        );

        if (normalAttr) {
          normals.push(
            normalAttr.getX(idx0), normalAttr.getY(idx0), normalAttr.getZ(idx0),
            normalAttr.getX(idx1), normalAttr.getY(idx1), normalAttr.getZ(idx1),
            normalAttr.getX(idx2), normalAttr.getY(idx2), normalAttr.getZ(idx2)
          );
        }
      }
    }
  } else {
    for (let i = 0; i < count; i += 3) {
      const x0 = posAttr.getX(i), y0 = posAttr.getY(i), z0 = posAttr.getZ(i);
      const x1 = posAttr.getX(i + 1), y1 = posAttr.getY(i + 1), z1 = posAttr.getZ(i + 1);
      const x2 = posAttr.getX(i + 2), y2 = posAttr.getY(i + 2), z2 = posAttr.getZ(i + 2);

      if (inBounds(x0, y0, z0) || inBounds(x1, y1, z1) || inBounds(x2, y2, z2)) {
        positions.push(
          x0, y0, z0,
          x1, y1, z1,
          x2, y2, z2
        );
        if (normalAttr) {
          normals.push(
            normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i),
            normalAttr.getX(i + 1), normalAttr.getY(i + 1), normalAttr.getZ(i + 1),
            normalAttr.getX(i + 2), normalAttr.getY(i + 2), normalAttr.getZ(i + 2)
          );
        }
      }
    }
  }

  const slicedGeom = new THREE.BufferGeometry();
  slicedGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length > 0) {
    slicedGeom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  }

  return slicedGeom;
}

// 7. Select Bone Event handler
function selectBone(key) {
  if (!skeletonMesh) return;

  // Clean previous buttons and pins
  if (currentSelectedBone) {
    const prevBtn = document.getElementById(`btn-${currentSelectedBone}`);
    if (prevBtn) prevBtn.classList.remove('active');

    const prevPin = document.getElementById(`pin-${currentSelectedBone}`);
    if (prevPin) prevPin.classList.remove('selected');
  }

  // If clicking active selected bone again, deselect it
  if (currentSelectedBone === key) {
    deselectAll();
    return;
  }

  currentSelectedBone = key;
  const bone = BONES_DATA[key];

  // Highlight active sidebar button and marker pin
  const btn = document.getElementById(`btn-${key}`);
  if (btn) btn.classList.add('active');

  const pin = document.getElementById(`pin-${key}`);
  if (pin) pin.classList.add('selected');

  // Update HUD Text Panel
  if (hudBoneName) hudBoneName.innerText = bone.name;
  if (hudBonePronunciation) hudBonePronunciation.innerText = `[${bone.pronunciation}]`;
  if (hudBoneSystem) hudBoneSystem.innerText = bone.system;
  if (hudBoneFunction) hudBoneFunction.innerText = bone.function;
  if (hudBoneClinical) hudBoneClinical.innerText = bone.clinicalSignificance;
  if (hudBoneFact) hudBoneFact.innerText = bone.funFact;

  if (infoPlaceholder) infoPlaceholder.style.display = 'none';
  if (infoContent) infoContent.style.display = 'block';

  // Toggle active class on app-container
  const appContainer = document.getElementById('app-container');
  if (appContainer) appContainer.classList.add('dossier-active');

  // Highlight bone in Main Scene by creating an overlay mesh
  highlightBoneInMain(bone);

  // Focus Main Camera on the selected bone
  focusCameraOnBone(bone);

  // Slice geometry and show in Isolated Sub-Viewport (HTML panel for 2D)
  isolateBoneInSubViewport(bone, key);

  // Show holographic in-world VR panel when presenting in Zapbox / WebXR
  if (mainRenderer.xr.isPresenting) {
    showVRInfoPanel(bone, key);
  }

  // Voice narration explanation for 2D and VR accessibility
  speakBoneDetails(bone);
}

// Deselects active selections
function deselectAll() {
  if (currentSelectedBone) {
    const prevBtn = document.getElementById(`btn-${currentSelectedBone}`);
    if (prevBtn) prevBtn.classList.remove('active');

    const prevPin = document.getElementById(`pin-${currentSelectedBone}`);
    if (prevPin) prevPin.classList.remove('selected');
  }

  currentSelectedBone = null;
  vrCycleIndex = -1; // Reset cycling tracker
  if (infoContent) infoContent.style.display = 'none';
  if (infoPlaceholder) infoPlaceholder.style.display = 'block';

  // Stop any active voice narration immediately
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  // Toggle active class on app-container
  const appContainer = document.getElementById('app-container');
  if (appContainer) appContainer.classList.remove('dossier-active');

  // Hide isolated panel
  subViewport.classList.remove('visible');

  // Remove highlighted mesh
  if (highlightedBoneMesh) {
    mainScene.remove(highlightedBoneMesh);
    highlightedBoneMesh.geometry.dispose();
    highlightedBoneMesh = null;
  }

  // Reset main camera target to the center of the skeleton
  if (skeletonGroup) {
    const finalBox = new THREE.Box3().setFromObject(skeletonGroup);
    const center = finalBox.getCenter(new THREE.Vector3());
    const isMobile = window.innerWidth <= 768;
    const targetY = isMobile ? center.y + 0.3 : center.y;
    tweenTargetTo(new THREE.Vector3(0, targetY, 0));
  }

  // Hide VR holographic panel
  hideVRInfoPanel();
}

// Smooth tween target position helper
function tweenTargetTo(targetPos) {
  let duration = 25; // frames
  let frame = 0;
  const startTarget = mainControls.target.clone();

  function tween() {
    if (frame < duration) {
      frame++;
      const alpha = frame / duration;
      const t = alpha * alpha * (3 - 2 * alpha); // Smoothstep
      mainControls.target.lerpVectors(startTarget, targetPos, t);
      mainControls.update();
      requestAnimationFrame(tween);
    }
  }
  tween();
}

// Highlight mesh overlays in main viewport
function highlightBoneInMain(bone) {
  if (highlightedBoneMesh) {
    mainScene.remove(highlightedBoneMesh);
    highlightedBoneMesh.geometry.dispose();
    highlightedBoneMesh = null;
  }
  // Disabled red selection highlight mesh as requested by the user
  return;
}

// Focuses main OrbitControls camera onto selected bone position
function focusCameraOnBone(bone) {
  const targetWorldPos = new THREE.Vector3(bone.marker.x, bone.marker.y, bone.marker.z);
  skeletonMesh.localToWorld(targetWorldPos);
  tweenTargetTo(targetWorldPos);
}

// Automatically positions and resets the camera for isolated view object based on its dimensions
function adjustIsolatedCameraForObject(object) {
  // Ensure matrices are updated so Box3 reads correct scaled bounds
  object.updateMatrix();
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius;

  console.log("adjustIsolatedCameraForObject - radius:", radius, "box:", box);

  // Set camera clipping planes dynamically to prevent clipping of large/small models
  isolatedCamera.near = radius * 0.05;
  isolatedCamera.far = radius * 20.0;
  isolatedCamera.updateProjectionMatrix();

  // Set OrbitControls min and max zoom limits dynamically based on object's radius
  isolatedControls.minDistance = radius * 0.5;
  isolatedControls.maxDistance = radius * 12.0;

  // Position camera further back so the model fits with nice margins (appears smaller)
  isolatedCamera.position.set(0, 0, radius * 4.5);

  // Update controls target and update controls
  isolatedControls.target.set(0, 0, 0);
  isolatedControls.update();
  isolatedControls.saveState(); // Save as new default reset state for this bone

  // Force resize of sub-renderer to fit the container bounds
  const subContainer = document.querySelector('.dossier-canvas-container');
  if (subContainer) {
    const subWidth = subContainer.clientWidth;
    const subHeight = subContainer.clientHeight;
    isolatedRenderer.setSize(subWidth, subHeight);
    isolatedCamera.aspect = subWidth / subHeight;
    isolatedCamera.updateProjectionMatrix();
  }
}

// Dynamic geometry extraction and isolation rendering in sub-viewport
function isolateBoneInSubViewport(bone, key) {
  // 1. Remove previous mesh from isolated scene without disposing the loaded skull model
  while (isolatedScene.children.length > 3) {
    const child = isolatedScene.children[3];
    isolatedScene.remove(child);
    if (child !== loadedSkullModel) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  }

  const subLoading = document.getElementById('sub-loading');

  if (key === 'skull') {
    // Reveal panel immediately so loading screen is visible inside it
    subViewport.classList.add('visible');

    if (loadedSkullModel) {
      if (subLoading) subLoading.style.display = 'none';
      isolatedScene.add(loadedSkullModel);
      adjustIsolatedCameraForObject(loadedSkullModel);
    } else {
      if (subLoading) subLoading.style.display = 'flex';

      const loader = new GLTFLoader();
      loader.load(
        './skeleton/human_male_skull.glb?v=48',
        (gltf) => {
          loadedSkullModel = gltf.scene;

          loadedSkullModel.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // 1. Scale down the model to make it look smaller and match standard bone sizes
          loadedSkullModel.scale.set(0.3, 0.3, 0.3);

          // 2. Update matrix world so Box3 gets the scaled size
          loadedSkullModel.updateMatrixWorld(true);

          // 3. Center the loaded skull model
          const box = new THREE.Box3().setFromObject(loadedSkullModel);
          const center = box.getCenter(new THREE.Vector3());
          loadedSkullModel.position.sub(center);

          if (subLoading) subLoading.style.display = 'none';

          // Only add to scene if skull is still the selected bone
          if (currentSelectedBone === 'skull') {
            isolatedScene.add(loadedSkullModel);
            adjustIsolatedCameraForObject(loadedSkullModel);
          }
        },
        undefined,
        (error) => {
          console.error('Error loading skull model:', error);
          if (subLoading) {
            const text = subLoading.querySelector('.sub-loading-text');
            if (text) text.innerText = 'Error loading model';
          }
        }
      );
    }
  } else {
    // Hide sub loading just in case
    if (subLoading) subLoading.style.display = 'none';

    // 2. Slice the geometry
    const slicedGeom = sliceGeometry(skeletonMesh, bone.bounds);

    // 3. Create high detail clay model for sub-viewport
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.1,
      flatShading: false
    });

    const isolatedMesh = new THREE.Mesh(slicedGeom, material);

    // Align isolated mesh at the center of the isolated scene!
    slicedGeom.computeBoundingBox();
    slicedGeom.center();

    // Rotate the isolated mesh to stand upright (Z local matches Y world)
    isolatedMesh.rotation.x = -Math.PI / 2;

    isolatedScene.add(isolatedMesh);

    // 4. Position Camera based on size of bone
    adjustIsolatedCameraForObject(isolatedMesh);

    // 5. Reveal panel
    subViewport.classList.add('visible');
  }
}

// 8. Event Listeners (Resize, Raycasting clicks)
function setupEventListeners() {
  // Use ResizeObserver for bulletproof container size tracking
  const viewportContainer = document.getElementById('viewport-container');
  const resizeObserver = new ResizeObserver(() => {
    onResize();
  });
  resizeObserver.observe(viewportContainer);

  // Main canvas clicks
  const canvas = document.getElementById('canvas-main');
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('mousemove', onCanvasHover);

  // Floating Viewport Control buttons
  document.getElementById('btn-close-sub').addEventListener('click', () => {
    deselectAll();
  });

  document.getElementById('btn-reset-sub').addEventListener('click', () => {
    isolatedControls.reset();
  });

  // WebXR Activation Event Listeners
  btnVR.addEventListener('click', () => startXRSession('immersive-vr'));
  btnAR.addEventListener('click', () => toggleWebcamAR());

  xrClose.addEventListener('click', () => {
    if (xrSession) xrSession.end();
  });

  // VR Fallback Modal & Simulator Event Listeners
  btnEnterSimulator.addEventListener('click', () => {
    vrFallbackModal.style.display = 'none';
    enterVRSimulator();
  });

  btnCloseModal.addEventListener('click', () => {
    vrFallbackModal.style.display = 'none';
  });

  btnExitSimulator.addEventListener('click', () => {
    exitVRSimulator();
  });

  // Double-tap anywhere on screen to dismiss/close the active bone info panel (mobile/cardboard)
  let lastTap = 0;
  window.addEventListener('touchstart', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 300 && tapLength > 0) {
      if (currentSelectedBone) {
        deselectAll();
      }
    }
    lastTap = currentTime;
  });

  // Double-click anywhere to dismiss/close the active bone info panel (desktop)
  window.addEventListener('dblclick', () => {
    if (currentSelectedBone) {
      deselectAll();
    }
  });
}

// Triggered by ResizeObserver when container bounds change
function onResize() {
  const container = document.getElementById('viewport-container');
  if (!container || !mainRenderer) return;

  const w = container.clientWidth;
  const h = container.clientHeight;

  mainCamera.aspect = w / h;
  mainCamera.updateProjectionMatrix();
  mainRenderer.setSize(w, h);

  // Resize isolated renderer to fit its container
  const subContainer = document.querySelector('.dossier-canvas-container');
  if (subContainer && isolatedRenderer) {
    const sw = subContainer.clientWidth;
    const sh = subContainer.clientHeight;
    isolatedRenderer.setSize(sw, sh);
    isolatedCamera.aspect = sw / sh;
    isolatedCamera.updateProjectionMatrix();
  }
}

// Detect click on skeleton mesh in main viewport
function onCanvasClick(e) {
  const container = document.getElementById('viewport-container');
  const rect = mainRenderer.domElement.getBoundingClientRect();

  mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, mainCamera);

  // If simulator is active, check click on cabinet bones first
  if (isVRSimulatorActive && cabinetBones.length > 0) {
    const intersectsCabinet = raycaster.intersectObjects(cabinetBones, true);
    if (intersectsCabinet.length > 0) {
      let obj = intersectsCabinet[0].object;
      let targetBoneGroup = null;
      while (obj && obj !== mainScene) {
        if (obj.userData && obj.userData.isCabinetBone) {
          targetBoneGroup = obj;
          break;
        }
        obj = obj.parent;
      }
      if (targetBoneGroup) {
        selectBone(targetBoneGroup.userData.boneName.toLowerCase());
        return;
      }
    }
  }

  if (skeletonMesh) {
    const intersects = raycaster.intersectObject(skeletonMesh);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      const localPoint = intersect.point.clone();
      skeletonMesh.worldToLocal(localPoint);

      const boneKey = getClosestBoneAtLocalPoint(localPoint);
      if (boneKey) {
        selectBone(boneKey);
      }
    }
  }
}

// Raycasting hover highlight
function onCanvasHover(e) {
  const container = document.getElementById('viewport-container');
  const rect = mainRenderer.domElement.getBoundingClientRect();

  mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, mainCamera);

  let hoveredKey = null;
  let hoveredCabinetBone = false;

  // If simulator is active, check hover on cabinet bones first
  if (isVRSimulatorActive && cabinetBones.length > 0) {
    const intersectsCabinet = raycaster.intersectObjects(cabinetBones, true);
    if (intersectsCabinet.length > 0) {
      hoveredCabinetBone = true;
    }
  }

  if (skeletonMesh && !hoveredCabinetBone) {
    const intersects = raycaster.intersectObject(skeletonMesh);
    if (intersects.length > 0) {
      const localPoint = intersects[0].point.clone();
      skeletonMesh.worldToLocal(localPoint);
      hoveredKey = getClosestBoneAtLocalPoint(localPoint);
    }
  }

  if (hoveredKey !== currentHoveredBone || hoveredCabinetBone) {
    if (currentHoveredBone) {
      const pin = document.getElementById(`pin-${currentHoveredBone}`);
      if (pin) pin.classList.remove('hovered');
    }

    currentHoveredBone = hoveredKey;

    if (currentHoveredBone) {
      const pin = document.getElementById(`pin-${currentHoveredBone}`);
      if (pin) pin.classList.add('hovered');
      mainRenderer.domElement.style.cursor = 'pointer';
    } else if (hoveredCabinetBone) {
      mainRenderer.domElement.style.cursor = 'pointer';
    } else {
      mainRenderer.domElement.style.cursor = 'grab';
    }
  }
}

// Find closest bone bounds containing the clicked local coordinate point
function getClosestBoneAtLocalPoint(localPoint) {
  let candidate = null;
  let minDistance = Infinity;

  Object.entries(BONES_DATA).forEach(([key, bone]) => {
    const dx = localPoint.x - bone.marker.x;
    const dy = localPoint.y - bone.marker.y;
    const dz = localPoint.z - bone.marker.z;
    const dist = dx * dx + dy * dy + dz * dz;

    if (dist < minDistance) {
      minDistance = dist;
      candidate = key;
    }
  });

  return candidate;
}

/**
 * VR-specific bone lookup.
 * The GLB model was authored with Z as the vertical/height axis and Y as depth.
 * After Three.js worldToLocal the height maps to Y, but the BONES_DATA bounds
 * are stored in the original Z-up model space. This function converts the
 * world-space hit point into the model's Z-up local coordinate frame before
 * matching, giving accurate results from any controller angle.
 */
function getClosestBoneVR(worldHitPoint) {
  if (!skeletonMesh) return null;
  // Ensure the mesh's world matrix has the fresh translation/rotation/scale updates
  skeletonMesh.updateMatrixWorld(true);

  const localPoint = worldHitPoint.clone();
  skeletonMesh.worldToLocal(localPoint);
  return getClosestBoneAtLocalPoint(localPoint);
}

// 9. WebXR Implementation (AR/VR sessions)
async function startXRSession(mode) {
  if (xrSession) {
    await xrSession.end();
    return;
  }

  if (!navigator.xr) {
    if (mode === 'immersive-vr') {
      vrFallbackModal.style.display = 'flex';
    } else {
      showXRMessage("WebXR is not supported by your browser. Use a compatible VR headset or AR phone.");
    }
    return;
  }

  const supported = await navigator.xr.isSessionSupported(mode);
  if (!supported) {
    if (mode === 'immersive-vr') {
      vrFallbackModal.style.display = 'flex';
    } else {
      showXRMessage(`WebXR ${mode === 'immersive-ar' ? 'AR' : 'VR'} mode is not supported on this hardware.`);
    }
    return;
  }

  try {
    const session = await navigator.xr.requestSession(mode, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'gamepad']
    });

    xrSession = session;

    // Determine the reference space type to use with fallback validation
    let referenceSpaceType = mode === 'immersive-ar' ? 'local' : 'local-floor';
    if (mode === 'immersive-vr') {
      try {
        await session.requestReferenceSpace('local-floor');
      } catch (e) {
        console.warn("local-floor reference space is not supported by this session. Falling back to local:", e);
        referenceSpaceType = 'local';
      }
    }

    mainRenderer.xr.setReferenceSpaceType(referenceSpaceType);
    await mainRenderer.xr.setSession(session);

    // Optimize render target framebuffer resolution for mobile VR headsets (Meta Quest)
    if (mainRenderer.xr.setFramebufferScaleFactor) {
      mainRenderer.xr.setFramebufferScaleFactor(0.9);
    }

    if (mode === 'immersive-ar') {
      mainScene.background = null;
      mainRenderer.setClearAlpha(0);
      skeletonGroup.position.set(0, -1.0, -1.5);
    } else if (mode === 'immersive-vr') {
      // Set solid background color to block pass-through camera in AR-based WebXR viewers (like Zapbox)
      mainScene.userData.originalBackground = mainScene.background;
      mainScene.background = new THREE.Color(0x070820);
      mainRenderer.setClearAlpha(1.0);

      // Hide floor grid helpers for VR immersion
      if (gridHelper) gridHelper.visible = false;
      if (floorPlane) floorPlane.visible = false;

      if (operatingRoomGroup) {
        operatingRoomGroup.visible = true;
        setTimeout(debugSceneTree, 1000); // Debug scene tree after 1s
      }

      // Position the skeleton standing in the large empty space of the VR room
      skeletonGroup.position.set(1.0, skeletonBottomOffset, -1.2);
      skeletonGroup.rotation.set(0, 0, 0);
      skeletonGroup.updateMatrixWorld(true);

      // Start player rig directly in front of the skeleton (facing it along Z)
      if (dolly) {
        dolly.position.set(1.0, 0, 0.2);
      }
      showVRGuide();
    }

    showXRMessage(`Entered XR Session. Put on your device!`);

    session.addEventListener('end', () => {
      xrSession = null;
      hideXRMessage();
      hideVRGuide();
      mainRenderer.setClearAlpha(1);

      // Restore background
      if (mainScene.userData.originalBackground !== undefined) {
        mainScene.background = mainScene.userData.originalBackground;
      } else {
        mainScene.background = null;
      }

      // Hide operating room and restore standard helpers
      if (operatingRoomGroup) operatingRoomGroup.visible = false;
      if (gridHelper) gridHelper.visible = true;
      if (floorPlane) floorPlane.visible = true;

      // Reset dolly position and rotation to origin
      if (dolly) {
        dolly.position.set(0, 0, 0);
        dolly.rotation.set(0, 0, 0);
      }
      if (cameraPitchGroup) {
        cameraPitchGroup.rotation.set(0, 0, 0);
      }

      // Restore skeleton position and rotation
      skeletonGroup.position.set(0, skeletonBottomOffset, 0);
      skeletonGroup.rotation.set(0, 0, 0);

      // Release any grabbed cabinet bone on session end
      if (grabbedBone) {
        if (originalBoneParent) {
          originalBoneParent.attach(grabbedBone);
        } else {
          mainScene.attach(grabbedBone);
        }
        grabbedBone.position.copy(originalBonePosition);
        grabbedBone.rotation.copy(originalBoneRotation);
        grabbedBone.scale.copy(originalBoneScale);
        grabbedBone = null;
        grabbingController = null;
        originalBoneParent = null;
      }
    });

  } catch (err) {
    console.error("Failed to start XR session:", err);
    showXRMessage(`Failed to launch WebXR: ${err.message}`);
  }
}

function showXRMessage(msg) {
  xrMessage.innerText = msg;
  xrInstruction.style.display = 'block';

  if (!xrSession) {
    setTimeout(() => {
      if (!xrSession) hideXRMessage();
    }, 5000);
  }
}

function hideXRMessage() {
  xrInstruction.style.display = 'none';
}

// 10. Animation Loop
function animate() {
  mainRenderer.setAnimationLoop(render);
}

function render() {
  if (!mainRenderer.xr.isPresenting && !webcamARActive) {
    mainControls.update();
  }

  // Update XR 6DoF controller pointer raycasting and VR locomotion when presenting in VR/AR (Zapbox)
  if (mainRenderer.xr.isPresenting) {
    updateXRControllerRaycast();
    const dt = Math.min(clock.getDelta(), 0.1); // Clamp to prevent giant leaps on frame stutters
    updateVRLocomotion(dt);
  } else {
    clock.getDelta(); // Keep clock updating to prevent giant dt on next VR entry
  }

  // Auto-rotate skeleton slowly if nothing is selected and not in VR/AR
  if (!currentSelectedBone && skeletonGroup && !mainRenderer.xr.isPresenting && !webcamARActive) {
    skeletonGroup.rotation.y += 0.003; // Rotate around Y-axis (which is vertical world axis after Sketchfab matrix)
  } else if (currentSelectedBone && skeletonGroup && !webcamARActive) {
    // If a bone is selected, rotate back to face forward slowly (original rotation is 0)
    skeletonGroup.rotation.y *= 0.92;
  }

  // Keep skeleton centered (the layout containers handle side-by-side positioning automatically)
  if (skeletonGroup && !mainRenderer.xr.isPresenting && !webcamARActive) {
    skeletonGroup.position.x = 0;
  }

  mainRenderer.render(mainScene, mainCamera);

  if (subViewport.classList.contains('visible') && !mainRenderer.xr.isPresenting) {
    isolatedControls.update();
    isolatedRenderer.render(isolatedScene, isolatedCamera);
  }

  if (!mainRenderer.xr.isPresenting && !webcamARActive) {
    updatePins();
    labelsContainer.style.display = 'block';
  } else {
    labelsContainer.style.display = 'none';
  }

  // Anchor VR info panel in front and to the right of the user's view every frame
  if (mainRenderer.xr.isPresenting && vrInfoPanel && vrInfoPanel.visible) {
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(mainCamera.quaternion);
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(mainCamera.quaternion);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mainCamera.quaternion);
    vrInfoPanel.position
      .copy(mainCamera.position)
      .addScaledVector(camForward, 1.4)
      .addScaledVector(camRight, 0.55)
      .addScaledVector(camUp, -0.05);
    vrInfoPanel.quaternion.copy(mainCamera.quaternion);
  }

  // Anchor VR guide panel centered in front of the user's view every frame
  if (mainRenderer.xr.isPresenting && vrGuidePanel && vrGuidePanel.visible) {
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(mainCamera.quaternion);
    vrGuidePanel.position
      .copy(mainCamera.position)
      .addScaledVector(camForward, 1.25);
    vrGuidePanel.quaternion.copy(mainCamera.quaternion);
  }


}

// --- Webcam AR (Mobile Pass-Through AR without installations) ---
function toggleWebcamAR() {
  if (webcamARActive) {
    stopWebcamAR();
  } else {
    startWebcamAR();
  }
}

function startWebcamAR() {
  const video = document.getElementById('webcam-video');
  if (!video) return;

  // Check if mediaDevices and getUserMedia are supported (required in secure contexts or localhost)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Webcam AR requires a secure context (HTTPS) or localhost.\n\nPlease start your server using HTTPS (e.g. "npx http-server -S -C cert.pem -K key.pem -p 8081") and access the site via "https://".');
    return;
  }

  // Request mobile camera stream (using environment/back camera if available)
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
  }).catch(err => {
    console.warn('Environment camera request failed or unsupported. Trying fallback camera...', err);
    // Fallback: Request any available camera (crucial for laptops/desktops without environment cameras)
    return navigator.mediaDevices.getUserMedia({ video: true });
  }).then(stream => {
    video.srcObject = stream;
    video.style.display = 'block';
    webcamARActive = true;
    document.body.classList.add('ar-active');

    // Clear background and floor elements for transparent AR pass-through
    mainScene.userData.originalBackground = mainScene.background;
    mainScene.background = null;
    mainRenderer.setClearAlpha(0);

    if (gridHelper) gridHelper.visible = false;
    if (floorPlane) floorPlane.visible = false;

    // Make layout containers transparent
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';

    const appContainer = document.getElementById('app-container');
    if (appContainer) appContainer.style.background = 'transparent';

    const vpContainer = document.getElementById('viewport-container');
    if (vpContainer) vpContainer.style.background = 'transparent';

    // Hide UI panels during AR mode
    const header = document.querySelector('header');
    if (header) header.style.display = 'none';

    const arvrPanel = document.getElementById('arvr-panel');
    if (arvrPanel) arvrPanel.style.display = 'none';

    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = 'none';

    const interactionHud = document.getElementById('interaction-hud');
    if (interactionHud) interactionHud.style.display = 'none';

    const labelsContainer = document.getElementById('labels-container');
    if (labelsContainer) labelsContainer.style.display = 'none';

    if (subViewport) subViewport.classList.remove('visible');

    // Save original model position, scale, and rotation
    mainScene.userData.originalMainGroupPos = skeletonGroup.position.clone();
    mainScene.userData.originalMainGroupScale = skeletonGroup.scale.clone();
    mainScene.userData.originalMainGroupRot = skeletonGroup.rotation.clone();

    // Position camera at origin and focus forward
    mainCamera.position.set(0, 0, 0);
    mainControls.target.set(0, 0, -1);

    // Place the skeleton 1.2 meters in front of the camera, scaled down slightly
    // We adjust height so it is at a comfortable desk projection level (-0.25)
    skeletonGroup.position.set(0, -0.25, -1.2);
    skeletonGroup.scale.set(0.045, 0.045, 0.045); // Scale relative to original group (original is 0.11)
    skeletonGroup.rotation.set(0, 0, 0);

    // Disable desktop mouse OrbitControls
    mainControls.enabled = false;

    // Request device orientation sensors (specifically needed for iOS Safari)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            resetOrientationOffset();
            window.addEventListener('deviceorientation', onDeviceOrientation, true);
          } else {
            console.warn('DeviceOrientation permission denied.');
          }
        })
        .catch(err => {
          console.error('Error requesting DeviceOrientation:', err);
        });
    } else {
      resetOrientationOffset();
      window.addEventListener('deviceorientation', onDeviceOrientation, true);
    }

    // Show the custom "EXIT AR" floating button
    showWebcamARExitButton();
  }).catch(err => {
    console.error('Camera access denied:', err);
    alert('Camera access is required to run Webcam AR. Please check your browser camera permissions.');
  });
}

function stopWebcamAR() {
  const video = document.getElementById('webcam-video');
  if (video) {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
    video.style.display = 'none';
  }

  webcamARActive = false;
  document.body.classList.remove('ar-active');
  window.removeEventListener('deviceorientation', onDeviceOrientation, true);
  mainControls.enabled = true;

  // Restore scene properties
  if (mainScene.userData.originalBackground !== undefined) {
    mainScene.background = mainScene.userData.originalBackground;
  }
  mainRenderer.setClearAlpha(1);

  if (gridHelper) gridHelper.visible = true;
  if (floorPlane) floorPlane.visible = true;

  // Restore backgrounds
  document.body.style.background = '';
  document.documentElement.style.background = '';

  const appContainer = document.getElementById('app-container');
  if (appContainer) appContainer.style.background = '';

  const vpContainer = document.getElementById('viewport-container');
  if (vpContainer) vpContainer.style.background = '';

  // Restore UI elements
  const header = document.querySelector('header');
  if (header) header.style.display = '';

  const arvrPanel = document.getElementById('arvr-panel');
  if (arvrPanel) arvrPanel.style.display = '';

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = '';

  const interactionHud = document.getElementById('interaction-hud');
  if (interactionHud) interactionHud.style.display = '';

  const labelsContainer = document.getElementById('labels-container');
  if (labelsContainer) labelsContainer.style.display = '';

  // Hide the custom EXIT AR button
  hideWebcamARExitButton();

  // Restore skeleton model position, scale, and rotation
  if (mainScene.userData.originalMainGroupPos) {
    skeletonGroup.position.copy(mainScene.userData.originalMainGroupPos);
  }
  if (mainScene.userData.originalMainGroupScale) {
    skeletonGroup.scale.copy(mainScene.userData.originalMainGroupScale);
  }
  if (mainScene.userData.originalMainGroupRot) {
    skeletonGroup.rotation.copy(mainScene.userData.originalMainGroupRot);
  }

  // Reset camera view
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    if (skeletonGroup) {
      const finalBox = new THREE.Box3().setFromObject(skeletonGroup);
      const center = finalBox.getCenter(new THREE.Vector3());
      const size = finalBox.getSize(new THREE.Vector3());
      mainCamera.position.set(0, center.y - 0.2, size.y * 2.4);
      mainControls.target.set(0, center.y + 0.3, 0);
    } else {
      mainCamera.position.set(0, 0.68, 4.22);
      mainControls.target.set(0, 1.18, 0);
    }
  } else {
    if (skeletonGroup) {
      const finalBox = new THREE.Box3().setFromObject(skeletonGroup);
      const center = finalBox.getCenter(new THREE.Vector3());
      const size = finalBox.getSize(new THREE.Vector3());
      mainCamera.position.set(0, center.y, size.y * 1.35);
      mainControls.target.copy(center);
    } else {
      mainCamera.position.set(0, 1.2, 2.5);
      mainControls.target.set(0, 0.88, 0);
    }
  }
  mainControls.reset();
}

function resetOrientationOffset() {
  isFirstOrientationFrame = true;
  alphaOffset = 0;
}

function onDeviceOrientation(event) {
  if (event.alpha === null || event.beta === null || event.gamma === null) return;

  let alpha = THREE.MathUtils.degToRad(event.alpha); // Z
  const beta = THREE.MathUtils.degToRad(event.beta); // X'
  const gamma = THREE.MathUtils.degToRad(event.gamma); // Y''
  const orient = window.orientation ? THREE.MathUtils.degToRad(window.orientation) : 0; // Screen orientation

  if (isFirstOrientationFrame) {
    alphaOffset = alpha;
    isFirstOrientationFrame = false;
  }

  // Align front direction
  alpha = alpha - alphaOffset;

  // Compute camera rotation from euler angles
  euler.set(beta, alpha, -gamma, 'YXZ');
  mainCamera.quaternion.setFromEuler(euler);
  mainCamera.quaternion.multiply(q1); // Shift 90deg

  // Adjust for phone portrait vs landscape orientation
  const zee = new THREE.Vector3(0, 0, 1);
  q0.setFromAxisAngle(zee, -orient);
  mainCamera.quaternion.multiply(q0);
}

function showWebcamARExitButton() {
  let exitBtn = document.getElementById('webcam-ar-exit');
  if (!exitBtn) {
    exitBtn = document.createElement('button');
    exitBtn.id = 'webcam-ar-exit';
    exitBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="margin-right: 6px; vertical-align: middle;">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
      <span>EXIT AR</span>
    `;
    document.body.appendChild(exitBtn);
    exitBtn.addEventListener('click', stopWebcamAR);
  }
  exitBtn.classList.add('ar-exit-visible');
}

function hideWebcamARExitButton() {
  const exitBtn = document.getElementById('webcam-ar-exit');
  if (exitBtn) {
    exitBtn.classList.remove('ar-exit-visible');
  }
}

// --- 6DoF Controller Raycasting & Interaction for Zapbox/WebXR ---
const xrRaycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

function updateXRControllerRaycast() {
  if (!mainRenderer.xr.isPresenting) return;

  const controllers = [controller1, controller2];

  controllers.forEach((controller) => {
    if (!controller) return;

    const laser = controller.getObjectByName('laser');
    if (!laser) return;

    // Default laser length is 5 meters
    let laserLength = 5;
    let hitFound = false;

    // Perform Raycasting from the controller
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
    xrRaycaster.set(origin, direction);

    // Check intersection with Skeleton Mesh
    if (skeletonMesh) {
      const intersects = xrRaycaster.intersectObject(skeletonMesh);
      if (intersects.length > 0) {
        laserLength = intersects[0].distance;
        hitFound = true;
      }
    }

    // Check intersection with VR Close Button
    if (vrCloseButton && vrCloseButton.visible) {
      const intersectsClose = xrRaycaster.intersectObject(vrCloseButton);
      if (intersectsClose.length > 0) {
        laserLength = Math.min(laserLength, intersectsClose[0].distance);
        hitFound = true;
      }
    }

    // Check intersection with Cabinet Bones (if not currently grabbed)
    if (cabinetBones.length > 0 && !grabbedBone) {
      const intersectsCabinet = xrRaycaster.intersectObjects(cabinetBones, true);
      if (intersectsCabinet.length > 0) {
        if (intersectsCabinet[0].distance < laserLength) {
          laserLength = intersectsCabinet[0].distance;
          hitFound = true;
        }
      }
    }

    // Update laser line visual length
    const positions = laser.geometry.attributes.position.array;
    positions[5] = -laserLength; // Update the Z coordinate of the end point
    laser.geometry.attributes.position.needsUpdate = true;

    // Change laser color to cyan if hovering, otherwise dim blue
    if (hitFound) {
      laser.material.color.setHex(0x00f2fe); // Cyan on hover
      laser.material.opacity = 1.0;
    } else {
      laser.material.color.setHex(0x4facfe); // Dim blue
      laser.material.opacity = 0.5;
    }
  });
}

function updateVRLocomotion(dt) {
  const session = mainRenderer.xr.getSession();
  if (!session || !dolly) return;

  if (vrGuideActive) {
    session.inputSources.forEach((source) => {
      if (!source.gamepad || !source.gamepad.buttons) return;
      const handedness = source.handedness;
      const aPressed = !!(source.gamepad.buttons[4] && source.gamepad.buttons[4].pressed);
      const keyA = `${handedness}_button_4`;

      if (aPressed && !window[keyA]) {
        window[keyA] = true;
        hideVRGuide();
      } else if (!aPressed) {
        window[keyA] = false;
      }
    });
    return; // Freeze locomotion while guide is active
  }

  const speed = 2.5;
  const moveVector = new THREE.Vector3();

  // Retrieve active WebXR camera which tracks headset position/rotation
  let xrCamera;
  try {
    xrCamera = mainRenderer.xr.getCamera(mainCamera);
  } catch (e) {
    xrCamera = mainCamera;
  }
  if (!xrCamera) return;

  // Visual debug counter to log state once every 60 frames (~1 second) to prevent console spam
  if (!window.locomotionDebugTimer) window.locomotionDebugTimer = 0;
  window.locomotionDebugTimer++;
  const shouldLog = (window.locomotionDebugTimer % 60 === 0);

  if (shouldLog) {
    console.log(`[Locomotion Debug] Active WebXR Session. Input sources count: ${session.inputSources.length}`);
  }

  session.inputSources.forEach((source, index) => {
    const handedness = source.handedness;
    const hasGamepad = !!source.gamepad;

    if (shouldLog) {
      console.log(`[Locomotion Debug] Hand: ${handedness} | Has Gamepad: ${hasGamepad}`);
    }

    if (!source.gamepad || !source.gamepad.axes) return;

    const axes = source.gamepad.axes;

    // Handle grabbed bone zooming and rotation if this controller is holding it
    const controller = mainRenderer.xr.getController(index);
    if (grabbedBone && controller === grabbingController) {
      let joystickX = 0;
      let joystickY = 0;
      if (axes.length >= 4 && (Math.abs(axes[2]) > 0.05 || Math.abs(axes[3]) > 0.05)) {
        joystickX = axes[2];
        joystickY = axes[3];
      } else if (axes.length >= 2) {
        joystickX = axes[0];
        joystickY = axes[1];
      }

      // Rotate bone with joystickX (spin horizontally)
      if (Math.abs(joystickX) > 0.05) {
        grabbedBone.rotation.y += joystickX * 2.0 * dt;
      }

      // Zoom bone with joystickY (adjust distance and scale)
      if (Math.abs(joystickY) > 0.05) {
        // Adjust distance along the controller's local forward axis (-Z)
        grabbedBoneDistance += joystickY * 0.4 * dt;
        grabbedBoneDistance = Math.max(0.15, Math.min(0.8, grabbedBoneDistance));
        grabbedBone.position.set(0, 0, -grabbedBoneDistance);

        // Adjust scale factor (pushing UP zoom in, pulling DOWN zoom out)
        const scaleChange = -joystickY * 1.5 * dt;
        currentGrabbedScaleFactor += scaleChange;
        currentGrabbedScaleFactor = Math.max(0.5, Math.min(5.0, currentGrabbedScaleFactor));
        grabbedBone.scale.copy(originalBoneScale).multiplyScalar(currentGrabbedScaleFactor);
      }
      return; // Skip walking/turning for this controller
    }

    // WebXR standard gamepad thumbstick mappings:
    // Typically axes[2] is horizontal and axes[3] is vertical.
    // If the device maps the thumbstick to axes[0] and axes[1], we fallback.
    let joystickX = 0;
    let joystickY = 0;
    if (axes.length >= 4 && (Math.abs(axes[2]) > 0.05 || Math.abs(axes[3]) > 0.05)) {
      joystickX = axes[2];
      joystickY = axes[3];
    } else if (axes.length >= 2) {
      joystickX = axes[0];
      joystickY = axes[1];
    }

    // Console log when joystick is actively pushed
    if (Math.abs(joystickX) > 0.05 || Math.abs(joystickY) > 0.05) {
      console.log(`[Locomotion Input] Hand: ${handedness} | Joysticks: xAxis=${joystickX.toFixed(2)}, yAxis=${joystickY.toFixed(2)} | Axes Array: [${axes.map(a => a.toFixed(2)).join(', ')}]`);
    }

    // Deadzone filter to prevent drifting
    if (Math.abs(joystickX) < 0.1) joystickX = 0;
    if (Math.abs(joystickY) < 0.1) joystickY = 0;

    // Handle controller buttons
    const buttons = source.gamepad.buttons;
    if (buttons) {
      const aPressed = !!(buttons[4] && buttons[4].pressed);
      const bPressed = !!(buttons[5] && buttons[5].pressed);
      const thumbstickPressed = !!(buttons[3] && buttons[3].pressed);
      const triggerPressed = !!(buttons[0] && buttons[0].pressed);

      const keyA = `${handedness}_button_4`;
      const keyB = `${handedness}_button_5`;
      const keyThumb = `${handedness}_button_3`;
      const keyTrigger = `${handedness}_button_0`;

      // Trigger pull (edge triggered)
      if (triggerPressed && !window[keyTrigger]) {
        window[keyTrigger] = true;
        const controller = mainRenderer.xr.getController(index);
        if (controller) {
          onControllerSelect(controller);
        }
      } else if (!triggerPressed) {
        window[keyTrigger] = false;
      }

      // Thumbstick click closes the panel
      if (thumbstickPressed && !window[keyThumb]) {
        window[keyThumb] = true;
        deselectAll();
      } else if (!thumbstickPressed) {
        window[keyThumb] = false;
      }

      // A/X Button click (edge triggered) to toggle/open helper guide
      if (aPressed && !window[keyA]) {
        window[keyA] = true;
        showVRGuide();
      } else if (!aPressed) {
        window[keyA] = false;
      }

      // B/Y Button click (edge triggered)
      if (bPressed && !window[keyB]) {
        window[keyB] = true;
        if (handedness === 'right') {
          deselectAll(); // Right B closes the panel
        }
      } else if (!bPressed) {
        window[keyB] = false;
      }
    }

    // LEFT controller translates the player rig (Walking)
    if (handedness === 'left') {
      if (Math.abs(joystickX) > 0 || Math.abs(joystickY) > 0) {
        const controller = mainRenderer.xr.getController(index);
        if (controller) {
          const controllerQuaternion = new THREE.Quaternion();
          controller.getWorldQuaternion(controllerQuaternion);

          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(controllerQuaternion);
          forward.y = 0;
          forward.normalize();

          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(controllerQuaternion);
          right.y = 0;
          right.normalize();

          moveVector.addScaledVector(forward, -joystickY);
          moveVector.addScaledVector(right, joystickX);
        }
      }
    }
    // RIGHT controller rotates the player rig (Turning / Looking around)
    else if (handedness === 'right') {
      const turnSpeed = 1.3; // Radians per second

      // Horizontal Turning (Yaw)
      if (Math.abs(joystickX) > 0) {
        // Pivot around the active scene camera's current position (preventing the swing effect)
        mainCamera.updateMatrixWorld(true);
        const headsetWorldPos = new THREE.Vector3();
        mainCamera.getWorldPosition(headsetWorldPos);

        // Apply rotation to the dolly
        dolly.rotation.y -= joystickX * turnSpeed * dt;
        dolly.updateMatrixWorld(true);
        mainCamera.updateMatrixWorld(true);

        // Get active camera's new world position and correct dolly shift
        const newHeadsetWorldPos = new THREE.Vector3();
        mainCamera.getWorldPosition(newHeadsetWorldPos);

        const shift = new THREE.Vector3().subVectors(headsetWorldPos, newHeadsetWorldPos);
        dolly.position.add(shift);
      }

      // Vertical Tilting (Pitch)
      if (Math.abs(joystickY) > 0 && cameraPitchGroup) {
        // Pivot around the active scene camera's current position (preventing the swing effect where camera moves down/up)
        mainCamera.updateMatrixWorld(true);
        const headsetWorldPos = new THREE.Vector3();
        mainCamera.getWorldPosition(headsetWorldPos);

        cameraPitchGroup.rotation.x -= joystickY * turnSpeed * dt;
        // Limit pitch to prevent flipping upside down (-80 to 80 degrees in AR, -30 to 30 degrees in VR)
        const isVR = session && session.mode === 'immersive-vr';
        const maxPitch = isVR ? (30 * Math.PI / 180) : 1.4;
        cameraPitchGroup.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, cameraPitchGroup.rotation.x));

        // Update matrices to compute new positions
        dolly.updateMatrixWorld(true);
        cameraPitchGroup.updateMatrixWorld(true);
        mainCamera.updateMatrixWorld(true);

        // Correct dolly shift
        const newHeadsetWorldPos = new THREE.Vector3();
        mainCamera.getWorldPosition(newHeadsetWorldPos);

        const shift = new THREE.Vector3().subVectors(headsetWorldPos, newHeadsetWorldPos);
        dolly.position.add(shift);
      }
    }
  });

  // Apply movement to the container (dolly) with collision detection
  if (moveVector.lengthSq() > 0) {
    moveVector.normalize().multiplyScalar(speed * dt);

    // Bounding cylindrical collider centered at skeleton (1.0, -1.2) with radius 0.6
    const candidateX = dolly.position.x + moveVector.x;
    const candidateZ = dolly.position.z + moveVector.z;
    const obsX = 1.0;
    const obsZ = -1.2;
    const obsRadius = 0.6; // Collide with skeleton base and stand

    const dx = candidateX - obsX;
    const dz = candidateZ - obsZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < obsRadius && dist > 0.001) {
      // Collision! Slide along the perimeter of the cylinder
      const normalX = dx / dist;
      const normalZ = dz / dist;

      // Project moveVector onto the normal
      const dot = moveVector.x * normalX + moveVector.z * normalZ;

      if (dot < 0) {
        // Subtract the normal component to slide
        moveVector.x -= dot * normalX;
        moveVector.z -= dot * normalZ;
      }
    }

    dolly.position.add(moveVector);
  }

  // Enforce room boundaries on the headset's world position (capsule collider)
  if (mainCamera) {
    // Force matrix update on the active scene camera to get fresh world position
    mainCamera.updateMatrixWorld(true);
    const headsetWorldPos = new THREE.Vector3();
    mainCamera.getWorldPosition(headsetWorldPos);

    // Read visual room boundaries from ROOM_LIMITS and shrink by player capsule radius
    const PLAYER_RADIUS = 0.4;
    const minX = ROOM_LIMITS.minX + PLAYER_RADIUS;
    const maxX = ROOM_LIMITS.maxX - PLAYER_RADIUS;
    const minZ = ROOM_LIMITS.minZ + PLAYER_RADIUS;
    const maxZ = ROOM_LIMITS.maxZ - PLAYER_RADIUS;

    const clampedX = Math.max(minX, Math.min(maxX, headsetWorldPos.x));
    const clampedZ = Math.max(minZ, Math.min(maxZ, headsetWorldPos.z));

    const shiftX = clampedX - headsetWorldPos.x;
    const shiftZ = clampedZ - headsetWorldPos.z;

    if (Math.abs(shiftX) > 0.001) {
      dolly.position.x += shiftX;
    }
    if (Math.abs(shiftZ) > 0.001) {
      dolly.position.z += shiftZ;
    }
  }
}


function onControllerSelect(controller) {
  if (!mainRenderer.xr.isPresenting) return;

  if (vrGuideActive) {
    return;
  }

  const currentTime = new Date().getTime();
  const triggerLength = currentTime - lastTriggerTime;

  // Double-pull the trigger within 350ms to close/dismiss the panel
  if (triggerLength < 350 && triggerLength > 0) {
    deselectAll();
    lastTriggerTime = 0; // reset
    return;
  }

  lastTriggerTime = currentTime;

  // Perform Raycasting from the controller
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
  const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
  xrRaycaster.set(origin, direction);

  // 1. Check intersection with CLOSE button on the VR panel
  if (vrCloseButton && vrCloseButton.visible) {
    const intersectsClose = xrRaycaster.intersectObject(vrCloseButton);
    if (intersectsClose.length > 0) {
      deselectAll();
      return;
    }
  }

  // 2. Check intersection with Skeleton Mesh
  if (skeletonMesh) {
    const intersectsSkeleton = xrRaycaster.intersectObject(skeletonMesh);
    if (intersectsSkeleton.length > 0) {
      const intersect = intersectsSkeleton[0];
      const boneKey = getClosestBoneVR(intersect.point);
      if (boneKey) {
        selectBone(boneKey);
        return;
      }
    }
  }
}

// 10.8 Handle Grab (Squeeze/Grip) interaction for VR controllers
function onControllerSqueezeStart(controller) {
  if (!mainRenderer.xr.isPresenting) return;

  if (vrGuideActive) {
    return;
  }

  if (grabbedBone) return; // Only grab one bone at a time

  // Perform Raycasting from the controller
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
  const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
  xrRaycaster.set(origin, direction);

  if (cabinetBones.length > 0) {
    const intersects = xrRaycaster.intersectObjects(cabinetBones, true);
    if (intersects.length > 0) {
      // Find the intersected bone group
      let obj = intersects[0].object;
      let targetBoneGroup = null;
      while (obj && obj !== mainScene) {
        if (obj.userData && obj.userData.isCabinetBone) {
          targetBoneGroup = obj;
          break;
        }
        obj = obj.parent;
      }

      if (targetBoneGroup) {
        // Grab the bone!
        grabbedBone = targetBoneGroup;
        grabbingController = controller;
        originalBoneParent = targetBoneGroup.parent;

        // Save original position, rotation, scale
        originalBonePosition.copy(targetBoneGroup.position);
        originalBoneRotation.copy(targetBoneGroup.rotation);
        originalBoneScale.copy(targetBoneGroup.scale);

        // Reset scale factor and scale the bone up
        currentGrabbedScaleFactor = 2.0;
        targetBoneGroup.scale.copy(originalBoneScale).multiplyScalar(currentGrabbedScaleFactor);

        // Parent the bone to the controller so it moves and rotates with it
        controller.attach(targetBoneGroup);

        // Position it in front of the controller (e.g. 0.3 meters forward)
        targetBoneGroup.position.set(0, 0, -0.3);
        targetBoneGroup.rotation.set(0, 0, 0);

        grabbedBoneDistance = 0.3;
        console.log(`Grabbed bone: ${targetBoneGroup.userData.boneName}`);
      }
    }
  }
}

function onControllerSqueezeEnd(controller) {
  if (!mainRenderer.xr.isPresenting) return;
  if (grabbedBone && grabbingController === controller) {
    // Release the grabbed bone!
    if (originalBoneParent) {
      originalBoneParent.attach(grabbedBone);
    } else {
      mainScene.attach(grabbedBone);
    }

    // Restore original transform
    grabbedBone.position.copy(originalBonePosition);
    grabbedBone.rotation.copy(originalBoneRotation);
    grabbedBone.scale.copy(originalBoneScale);

    console.log(`Released bone: ${grabbedBone.userData.boneName}`);
    grabbedBone = null;
    grabbingController = null;
    originalBoneParent = null;
  }
}

// 11. Load the 3D Operating Room Model
function loadOperatingRoomModel() {
  const loader = new GLTFLoader();
  loader.load(
    './skeleton/Room_updated.glb?v=57',
    (gltf) => {
      operatingRoomGroup = gltf.scene;

      // Keep hidden by default; only show in VR mode
      operatingRoomGroup.visible = false;

      // Disable dynamic shadows on room meshes for VR performance optimization
      roomColliders = [];
      operatingRoomGroup.traverse((child) => {
        if (child.isMesh) {
          child.receiveShadow = false;
          child.castShadow = false;
          roomColliders.push(child);
        }
      });

      // Position the room model at the origin
      operatingRoomGroup.position.set(0, 0, 0);
      mainScene.add(operatingRoomGroup);

      // Generate visual boundary walls colored orange/brown
      createVisualColliderWalls();

      // Load additional room props (e.g. lab shelf)
      loadLabShelf();

      console.log("Operating room model (Room_updated.glb) loaded successfully.");
    },
    undefined,
    (error) => {
      console.error('Error loading operating room model:', error);
    }
  );
}

// Helper to create visual chaperone/guardian walls colored orange/brown (#814913) at ROOM_LIMITS
function createVisualColliderWalls() {
  // Clear any existing visual walls
  visualWalls.forEach(wall => {
    if (wall.parent) wall.parent.remove(wall);
    wall.geometry.dispose();
    wall.material.dispose();
  });
  visualWalls = [];

  if (!operatingRoomGroup) return;

  const color = 0x814913; // Dark orange/brown from user image
  const opacity = 0.35;   // Semi-transparent
  const height = 3.0;     // Height of visual walls
  const yPos = 1.5;       // Center Y position

  const xMin = ROOM_LIMITS.minX;
  const xMax = ROOM_LIMITS.maxX;
  const zMin = ROOM_LIMITS.minZ;
  const zMax = ROOM_LIMITS.maxZ;

  const xSize = xMax - xMin;
  const zSize = zMax - zMin;

  // Visual material
  const material = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  // 1. Left Wall (at xMin)
  const leftGeo = new THREE.PlaneGeometry(zSize, height);
  const leftWall = new THREE.Mesh(leftGeo, material);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(xMin, yPos, (zMin + zMax) / 2);
  leftWall.visible = false;
  operatingRoomGroup.add(leftWall);
  visualWalls.push(leftWall);

  // 2. Right Wall (at xMax)
  const rightGeo = new THREE.PlaneGeometry(zSize, height);
  const rightWall = new THREE.Mesh(rightGeo, material);
  rightWall.rotation.y = Math.PI / 2;
  rightWall.position.set(xMax, yPos, (zMin + zMax) / 2);
  rightWall.visible = false;
  operatingRoomGroup.add(rightWall);
  visualWalls.push(rightWall);

  // 3. Front Wall (at zMin)
  const frontGeo = new THREE.PlaneGeometry(xSize, height);
  const frontWall = new THREE.Mesh(frontGeo, material);
  frontWall.position.set((xMin + xMax) / 2, yPos, zMin);
  frontWall.visible = false;
  operatingRoomGroup.add(frontWall);
  visualWalls.push(frontWall);

  // 4. Back Wall (at zMax)
  const backGeo = new THREE.PlaneGeometry(xSize, height);
  const backWall = new THREE.Mesh(backGeo, material);
  backWall.position.set((xMin + xMax) / 2, yPos, zMax);
  backWall.visible = false;
  operatingRoomGroup.add(backWall);
  visualWalls.push(backWall);
}

// 11.5 Load and Position Lab Cabinet Shelf
function loadLabShelf() {
  const loader = new GLTFLoader();
  loader.load(
    './skeleton/updated_shelf.glb?v=1',
    (gltf) => {
      labShelfGroup = gltf.scene;

      // Disable dynamic shadows on static lab shelf for VR performance optimization
      labShelfGroup.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      // Scale to convert GLTF meter units to desired size (1.1 scale gives height ~1.98m, width ~1.63m, depth ~1.04m)
      const scale = 1.1;
      labShelfGroup.scale.set(scale, scale, scale);

      // Debug: Log Three.js computed bounds
      labShelfGroup.updateMatrixWorld(true);
      const shelfBox = new THREE.Box3().setFromObject(labShelfGroup);
      const shelfSize = shelfBox.getSize(new THREE.Vector3());
      const shelfCenter = shelfBox.getCenter(new THREE.Vector3());
      console.log("=== THREE.JS SHELF BOUNDS ===");
      console.log(`Scale: ${scale}`);
      console.log(`Size: x=${shelfSize.x.toFixed(4)}, y=${shelfSize.y.toFixed(4)}, z=${shelfSize.z.toFixed(4)}`);
      console.log(`Center: x=${shelfCenter.x.toFixed(4)}, y=${shelfCenter.y.toFixed(4)}, z=${shelfCenter.z.toFixed(4)}`);
      console.log(`Min: x=${shelfBox.min.x.toFixed(4)}, y=${shelfBox.min.y.toFixed(4)}, z=${shelfBox.min.z.toFixed(4)}`);
      console.log(`Max: x=${shelfBox.max.x.toFixed(4)}, y=${shelfBox.max.y.toFixed(4)}, z=${shelfBox.max.z.toFixed(4)}`);

      // Z positioning: Place in the empty corner space next to the orange wall (z = -1.5)
      const zPos = 2.8;

      // X positioning: Place flush against the left white wall (xMin = -3.03)
      const xPos = 0;

      // Y positioning: Rest bottom of shelf on the floor (Y = 0)
      const yPos = 0.0;

      labShelfGroup.position.set(xPos, yPos, zPos);
      labShelfGroup.rotation.set(0, Math.PI, 0); // Rotate 90 degrees anticlockwise to face -Z

      // Add to operatingRoomGroup so it shows only in VR mode
      if (operatingRoomGroup) {
        operatingRoomGroup.add(labShelfGroup);
      }

      // Load all individual bone models and place them on the cabinet shelves
      loadCabinetBones();

      console.log("Lab shelf model loaded successfully.");
    },
    undefined,
    (error) => {
      console.error("Error loading lab shelf:", error);
    }
  );
}

// 11.6 Load and position bone models on cabinet shelves
function loadCabinetBones() {
  const bones = [
    // Shelf 4: Top Shelf (y = 1.43m - 1.45m)
    { name: 'Scapula', file: 'human_scapula.glb', scale: 0.004, localX: -0.4, localY: 1.43, localZ: 0.0, rotateY: Math.PI, labelX: -0.15, labelY: 1.50, labelZ: 0.15 },
    { name: 'Patella', file: 'human_patella.glb', scale: 0.001, localX: 0.4, localY: 1.45, localZ: 0.0, rotateY: Math.PI, labelX: 0.06, labelY: 1.50, labelZ: 0.25 },

    // Shelf 3: Upper-Middle Shelf (y = 1.10m - 1.15m)
    { name: 'Skull', file: 'skull_downloadable.glb', scale: 0.1, localX: -0.35, localY: 1.15, localZ: 0.0, rotateY: Math.PI * 2, labelX: -0.06, labelY: 1.18, labelZ: 0.15 },
    { name: 'Hand', file: 'human_hand_bones.glb', scale: 0.1, localX: 0.35, localY: 1.1, localZ: 0.0, rotateY: Math.PI, labelX: 0.15, labelY: 1.18, labelZ: 0.25 },

    // Shelf 2: Lower-Middle Shelf (y = 0.72m - 0.80m)
    { name: 'Pelvis', file: 'human_pelvis.glb', scale: 0.001, localX: -0.3, localY: 0.72, localZ: 0.0, rotateY: Math.PI, labelX: -0.15, labelY: 0.82, labelZ: 0.15 },
    { name: 'Sternum', file: 'human_sternum.glb', scale: 0.1, localX: 0.3, localY: 0.8, localZ: 0.0, rotateY: Math.PI, labelX: 0.06, labelY: 0.90, labelZ: 0.25 },

    // Shelf 1: Bottom Shelf (y = 0.56m - 0.60m)
    { name: 'Tibia', file: 'human_tibia.glb', scale: 0.001, localX: -0.3, localY: 0.56, localZ: 0.0, rotateZ: Math.PI / 2, rotateY: Math.PI / 2, labelX: -0.06, labelY: 0.63, labelZ: 0.15 },
    { name: 'Humerus', file: 'human_humerous.glb', scale: 0.001, localX: 0.3, localY: 0.60, localZ: 0.0, rotateZ: Math.PI / 2, rotateY: Math.PI / 2, labelX: 0.06, labelY: 0.51, labelZ: 0.25 }
  ];

  const loader = new GLTFLoader();
  bones.forEach(bone => {
    loader.load(
      `./skeleton/${bone.file}?v=1`,
      (gltf) => {
        const boneGroup = new THREE.Group();

        // Disable dynamic shadows on cabinet bones for VR performance optimization
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });

        // Set scaling
        gltf.scene.scale.set(bone.scale, bone.scale, bone.scale);

        // Update matrices to get correct dimensions
        gltf.scene.updateMatrixWorld(true);

        // Compute boundaries in Three.js
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());

        // Center X and Z, and ground Y (bottom of mesh at Y=0 relative to boneGroup)
        gltf.scene.position.set(-center.x, -box.min.y, -center.z);
        boneGroup.add(gltf.scene);

        // Position group relative to cabinet origin
        boneGroup.position.set(bone.localX, bone.localY, bone.localZ);

        // Apply optional rotations
        if (bone.rotateX) boneGroup.rotation.x = bone.rotateX;
        if (bone.rotateY) boneGroup.rotation.y = bone.rotateY;
        if (bone.rotateZ) boneGroup.rotation.z = bone.rotateZ;

        // Add 3D label sprite at centered, staggered absolute cabinet-local coordinates
        const labelSprite = create3DLabel(bone.name);
        labelSprite.position.set(bone.labelX, bone.labelY, bone.labelZ);

        // Add directly as children of the cabinet group so they move/rotate with it
        if (labShelfGroup) {
          labShelfGroup.add(boneGroup);
          labShelfGroup.add(labelSprite);
        }

        // Tag the group for grabbing interaction and add to list
        boneGroup.name = `cabinet_bone_${bone.name}`;
        boneGroup.userData = { isCabinetBone: true, boneName: bone.name, originalScale: new THREE.Vector3(bone.scale, bone.scale, bone.scale) };
        cabinetBones.push(boneGroup);

        console.log(`Bone model ${bone.name} successfully placed inside cabinet shelf with centered staggered label.`);
      },
      undefined,
      (error) => {
        console.error(`Error loading bone model ${bone.name}:`, error);
      }
    );
  });
}

// Helper to create a custom 3D Canvas Sprite Label that billboards in VR
function create3DLabel(text, heightOffset = 0) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;

  // Clear background
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background panel: rounded rect
  ctx.fillStyle = 'rgba(7, 8, 32, 0.85)';
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 2;

  const x = 2, y = 2, w = canvas.width - 4, h = canvas.height - 4, r = 10;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Draw bone name text
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#00f2fe';
  ctx.shadowBlur = 10;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  // Create canvas texture
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.24, 0.06, 1.0); // 24 cm wide, 6 cm high
  sprite.position.set(0, heightOffset, 0);

  return sprite;
}

// ─────────────────────────────────────────────────────────────
// 12. Holographic In-World VR Info Panel (Zapbox / WebXR)
// ─────────────────────────────────────────────────────────────

function showVRInfoPanel(bone, key) {
  // Clean up previous panel
  hideVRInfoPanel();

  // Build canvas texture
  var CW = 1024, CH = 768;
  var canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  var ctx = canvas.getContext('2d');

  // Panel background
  ctx.fillStyle = 'rgba(7, 8, 32, 0.94)';
  ctx.beginPath();
  ctx.roundRect(8, 8, CW - 16, CH - 16, 36);
  ctx.fill();

  // Neon border
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#00f2fe';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.roundRect(8, 8, CW - 16, CH - 16, 36);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Bone name
  ctx.fillStyle = '#00f2fe';
  ctx.font = 'bold 62px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(bone.name.toUpperCase(), CW / 2, 88);

  // Pronunciation
  ctx.fillStyle = '#f35588';
  ctx.font = 'italic 32px Arial';
  ctx.fillText('[ ' + bone.pronunciation + ' ]', CW / 2, 138);

  // System
  ctx.fillStyle = '#4facfe';
  ctx.font = '28px Arial';
  ctx.fillText(bone.system, CW / 2, 182);

  // Divider
  ctx.strokeStyle = 'rgba(0,242,254,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 200);
  ctx.lineTo(CW - 56, 200);
  ctx.stroke();

  var PAD = 60, W = CW - PAD * 2;

  // Function section
  ctx.fillStyle = '#a0aec0';
  ctx.font = 'bold 26px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('PHYSIOLOGICAL FUNCTION', PAD, 242);
  ctx.fillStyle = '#f0f3f9';
  ctx.font = '22px Arial';
  vrPanelWrapText(ctx, bone.function, PAD, 274, W, 28);

  // Clinical significance
  ctx.fillStyle = '#a0aec0';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('CLINICAL SIGNIFICANCE', PAD, 430);
  ctx.fillStyle = '#f0f3f9';
  ctx.font = '22px Arial';
  vrPanelWrapText(ctx, bone.clinicalSignificance, PAD, 462, W, 28);

  // Fun fact
  ctx.fillStyle = '#f35588';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('FUN FACT', PAD, 610);
  ctx.fillStyle = '#f7b2c7';
  ctx.font = '22px Arial';
  vrPanelWrapText(ctx, bone.funFact, PAD, 642, W, 28);

  // Footer hint
  ctx.fillStyle = 'rgba(160,174,192,0.5)';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Aim at X CLOSE and pull trigger to dismiss', CW / 2, CH - 20);

  var texture = new THREE.CanvasTexture(canvas);

  // Build 3D panel mesh
  var panelGeom = new THREE.PlaneGeometry(1.3, 0.975);
  var panelMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  var panelMesh = new THREE.Mesh(panelGeom, panelMat);
  panelMesh.renderOrder = 999;

  // Build isolated bone preview (left of info card)
  var bonePreviewMesh = null;
  if (skeletonMesh) {
    var slicedGeom = sliceGeometry(skeletonMesh, bone.bounds);
    slicedGeom.computeBoundingBox();
    slicedGeom.center();
    var previewMat = new THREE.MeshStandardMaterial({
      color: 0x00f2fe,
      roughness: 0.4,
      metalness: 0.1,
      emissive: new THREE.Color(0x004466)
    });
    bonePreviewMesh = new THREE.Mesh(slicedGeom, previewMat);
    bonePreviewMesh.rotation.x = -Math.PI / 2;
    var previewBox = new THREE.Box3().setFromObject(bonePreviewMesh);
    var previewSize = previewBox.getSize(new THREE.Vector3());
    var maxDim = Math.max(previewSize.x, previewSize.y, previewSize.z);
    var previewScale = 0.38 / (maxDim || 1);
    bonePreviewMesh.scale.setScalar(previewScale);
    bonePreviewMesh.position.set(-0.9, 0, 0.02);
  }

  // Build CLOSE button
  var btnCanvas = document.createElement('canvas');
  btnCanvas.width = 256;
  btnCanvas.height = 96;
  var bCtx = btnCanvas.getContext('2d');
  bCtx.fillStyle = 'rgba(220, 38, 38, 0.92)';
  bCtx.beginPath();
  bCtx.roundRect(4, 4, 248, 88, 20);
  bCtx.fill();
  bCtx.strokeStyle = '#ff6b6b';
  bCtx.lineWidth = 3;
  bCtx.shadowColor = '#ff6b6b';
  bCtx.shadowBlur = 12;
  bCtx.beginPath();
  bCtx.roundRect(4, 4, 248, 88, 20);
  bCtx.stroke();
  bCtx.shadowBlur = 0;
  bCtx.fillStyle = '#ffffff';
  bCtx.font = 'bold 38px Arial';
  bCtx.textAlign = 'center';
  bCtx.textBaseline = 'middle';
  bCtx.fillText('X  CLOSE', 128, 48);
  var btnTexture = new THREE.CanvasTexture(btnCanvas);
  var btnGeom = new THREE.PlaneGeometry(0.32, 0.12);
  var btnMat = new THREE.MeshBasicMaterial({
    map: btnTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  vrCloseButton = new THREE.Mesh(btnGeom, btnMat);
  vrCloseButton.renderOrder = 1000;
  vrCloseButton.name = 'vrCloseButton';
  vrCloseButton.position.set(0.52, 0.47, 0.01);

  // Assemble group
  vrInfoPanel = new THREE.Group();
  vrInfoPanel.add(panelMesh);
  if (bonePreviewMesh) {
    vrBonePreview = bonePreviewMesh;
    vrInfoPanel.add(vrBonePreview);
  }
  vrInfoPanel.add(vrCloseButton);
  vrInfoPanel.visible = true;
  if (cameraPitchGroup) {
    cameraPitchGroup.add(vrInfoPanel);
  } else {
    dolly.add(vrInfoPanel);
  }
}

function hideVRInfoPanel() {
  if (vrInfoPanel) {
    vrInfoPanel.traverse(function (child) {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
    if (cameraPitchGroup) {
      cameraPitchGroup.remove(vrInfoPanel);
    } else if (dolly) {
      dolly.remove(vrInfoPanel);
    }
    vrInfoPanel = null;
  }
  if (vrBonePreview) {
    if (cameraPitchGroup) {
      cameraPitchGroup.remove(vrBonePreview);
    } else if (dolly) {
      dolly.remove(vrBonePreview);
    }
    vrBonePreview = null;
  }
  vrCloseButton = null;
}

// ─────────────────────────────────────────────────────────────
// 12.5 Holographic VR Controller Guide Panel
// ─────────────────────────────────────────────────────────────

function showVRGuide() {
  hideVRGuide(); // Clean up if any
  vrGuideActive = true;

  var CW = 1280, CH = 960;
  var canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  var ctx = canvas.getContext('2d');

  // Panel background
  ctx.fillStyle = 'rgba(7, 8, 32, 0.96)';
  ctx.beginPath();
  ctx.roundRect(8, 8, CW - 16, CH - 16, 36);
  ctx.fill();

  // Neon border
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 5;
  ctx.shadowColor = '#00f2fe';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.roundRect(8, 8, CW - 16, CH - 16, 36);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Title
  ctx.fillStyle = '#00f2fe';
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('VR CONTROLLER GUIDE', CW / 2, 80);

  // Subtitle
  ctx.fillStyle = '#a0aec0';
  ctx.font = 'italic 28px Arial';
  ctx.fillText('OsteoExplore Interactive Lab Guide', CW / 2, 130);

  // Divider
  ctx.strokeStyle = 'rgba(0,242,254,0.3)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, 155);
  ctx.lineTo(CW - 60, 155);
  ctx.stroke();

  // Helper function to draw key-value controls beautifully
  var currentY = 215;
  function drawControlRow(keyText, descriptionText) {
    // Key pill background
    ctx.fillStyle = 'rgba(0, 242, 254, 0.15)';
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(80, currentY - 26, 370, 44, 10);
    ctx.fill();
    ctx.stroke();

    // Key text
    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(keyText, 265, currentY + 5);

    // Description text
    ctx.fillStyle = '#f0f3f9';
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(descriptionText, 490, currentY + 5);

    currentY += 71;
  }

  // Draw 8 rows of control mappings
  drawControlRow('LEFT THUMBSTICK', 'Walk & Move around the room');
  drawControlRow('RIGHT THUMBSTICK', 'Turn & Rotate camera view');
  drawControlRow('POINT & PULL TRIGGER', 'Select / inspect bones on skeleton');
  drawControlRow('POINT & HOLD GRIP', 'Grab bones from cabinet to inspect');
  drawControlRow('THUMBSTICK (GRABBING)', 'Rotate, zoom & scale grabbed bone');
  drawControlRow('BUTTON A / X', 'Toggle (open/close) this helper guide');
  drawControlRow('BUTTON B / THUMBSTICK CLICK', 'Close active bone inspection card');
  drawControlRow('DOUBLE-PULL TRIGGER', 'Shortcut to close active bone card');

  // Divider 2
  ctx.strokeStyle = 'rgba(0,242,254,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 785);
  ctx.lineTo(CW - 60, 785);
  ctx.stroke();

  // Footer / Dismiss hint
  ctx.fillStyle = '#ff8800';
  ctx.font = 'bold 34px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('PRESS BUTTON A / X TO CLOSE GUIDE', CW / 2, 855);

  var texture = new THREE.CanvasTexture(canvas);
  var panelGeom = new THREE.PlaneGeometry(1.8, 1.35);
  var panelMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  
  vrGuidePanel = new THREE.Mesh(panelGeom, panelMat);
  vrGuidePanel.renderOrder = 1001; // Render on top of normal bone cards
  vrGuidePanel.visible = true;

  if (cameraPitchGroup) {
    cameraPitchGroup.add(vrGuidePanel);
  } else if (dolly) {
    dolly.add(vrGuidePanel);
  }
}

function hideVRGuide() {
  if (vrGuidePanel) {
    if (vrGuidePanel.geometry) vrGuidePanel.geometry.dispose();
    if (vrGuidePanel.material) {
      if (vrGuidePanel.material.map) vrGuidePanel.material.map.dispose();
      vrGuidePanel.material.dispose();
    }
    if (cameraPitchGroup) {
      cameraPitchGroup.remove(vrGuidePanel);
    } else if (dolly) {
      dolly.remove(vrGuidePanel);
    }
    vrGuidePanel = null;
  }
  vrGuideActive = false;
}

function vrPanelWrapText(ctx, text, x, y, maxWidth, lineHeight) {
  var words = text.split(' ');
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var testLine = line + words[i] + ' ';
    var metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + ' ';
      y += lineHeight;
      if (y > 740) break;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

// ─────────────────────────────────────────────────────────────
// 13. Speech Synthesis Narration (Accessibility & Immersion)
// ─────────────────────────────────────────────────────────────

function speakBoneDetails(bone) {
  if (!window.speechSynthesis) return;

  // Cancel any ongoing narration immediately
  window.speechSynthesis.cancel();

  // Construct structured text to read out
  const text = `${bone.name}. Pronounced: ${bone.pronunciation}. Part of the ${bone.system}. Physiological function: ${bone.function}. Clinical significance: ${bone.clinicalSignificance}.`;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0; // Reading speed (1.0 is normal)
  utterance.pitch = 1.0; // Vocal pitch

  // Set English voice if available
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  window.speechSynthesis.speak(utterance);
}

// 14. Load and Position Skeleton Stand
function loadSkeletonStand() {
  const loader = new GLTFLoader();
  loader.load(
    './skeleton/IVPole.glb?v=48',
    (gltf) => {
      skeletonStandGroup = gltf.scene;

      // Compute and log dimensions
      const box = new THREE.Box3().setFromObject(skeletonStandGroup);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      console.log("=== SKELETON STAND (IVPole.glb) DIMENSIONS ===");
      console.log(`Size: x=${size.x.toFixed(4)}, y=${size.y.toFixed(4)}, z=${size.z.toFixed(4)}`);
      console.log(`Center: x=${center.x.toFixed(4)}, y=${center.y.toFixed(4)}, z=${center.z.toFixed(4)}`);
      console.log(`Min: x=${box.min.x.toFixed(4)}, y=${box.min.y.toFixed(4)}, z=${box.min.z.toFixed(4)}`);
      console.log(`Max: x=${box.max.x.toFixed(4)}, y=${box.max.y.toFixed(4)}, z=${box.max.z.toFixed(4)}`);

      skeletonStandGroup.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const childBox = new THREE.Box3().setFromObject(child);
          const childCenter = childBox.getCenter(new THREE.Vector3());
          console.log(`Mesh: ${child.name} | Center: x=${childCenter.x.toFixed(4)}, y=${childCenter.y.toFixed(4)}, z=${childCenter.z.toFixed(4)}`);
        }
      });

      if (skeletonGroup) {
        attachStandToSkeleton();
      }
    },
    undefined,
    (error) => {
      console.error('Error loading skeleton stand:', error);
    }
  );
}

// 15. Helper to align the stand and attach a hanging rod
function attachStandToSkeleton() {
  if (!skeletonGroup || !skeletonStandGroup) return;

  const STAND_SCALE = 0.151;
  const localScale = STAND_SCALE / SCALE_FACTOR; // 0.151 / 0.11 ≈ 1.3727

  skeletonStandGroup.scale.set(localScale, localScale, localScale);

  // Align Hook1 (local x=-0.0145, y=12.2649, z=0.7102 in stand space)
  // to hang exactly over skeleton origin (local x=0, y=16.65, z=0 in skeletonGroup space)
  const standLocalX = 0.0145 * localScale;
  const standLocalZ = -0.7102 * localScale;
  const standLocalY = -8.65; // sets stand base slightly lower to touch the floor of the VR room

  skeletonStandGroup.position.set(standLocalX, standLocalY, standLocalZ);

  skeletonGroup.add(skeletonStandGroup);

  // Add a small metallic hanging rod connecting skull to the stand's hook
  // The head top is at local Y ≈ 7.88. The hook is at local Y ≈ 16.836 + standLocalY.
  const headTopY = 7.88;
  const hookY = 16.836 + standLocalY;
  const gapHeight = hookY - headTopY;

  if (gapHeight > 0) {
    const rodGeometry = new THREE.CylinderGeometry(0.04, 0.04, gapHeight, 8);
    const rodMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.8
    });
    const rodMesh = new THREE.Mesh(rodGeometry, rodMaterial);
    rodMesh.position.set(0, headTopY + gapHeight / 2, 0);
    skeletonGroup.add(rodMesh);
  }

  console.log("Skeleton stand successfully attached to the skeleton group.");
}

function debugSceneTree() {
  console.log("=== THREE.JS SCENE TREE DEBUG ===");
  mainScene.traverse((child) => {
    if (child.isMesh || child.name.includes("Group") || child.name.includes("room") || child.name.includes("shelf") || child.name.includes("cabinet")) {
      const worldPos = new THREE.Vector3();
      child.getWorldPosition(worldPos);
      console.log(`Node: ${child.name} | Type: ${child.type} | Visible: ${child.visible} | Pos: [${child.position.x.toFixed(2)}, ${child.position.y.toFixed(2)}, ${child.position.z.toFixed(2)}] | WorldPos: [${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}] | Scale: [${child.scale.x.toFixed(4)}, ${child.scale.y.toFixed(4)}, ${child.scale.z.toFixed(4)}]`);
    }
  });
}

// --- Desktop VR Simulator Mode ---
function enterVRSimulator() {
  if (isVRSimulatorActive) return;
  isVRSimulatorActive = true;

  // Show exit simulator button
  btnExitSimulator.style.display = 'flex';

  // Save original settings
  mainScene.userData.originalBackground = mainScene.background;
  mainScene.userData.originalMainGroupPos = skeletonGroup.position.clone();
  mainScene.userData.originalMainGroupRot = skeletonGroup.rotation.clone();
  mainScene.userData.originalControlsTarget = mainControls.target.clone();

  // Hide 2D HTML labels container
  labelsContainer.style.display = 'none';

  // Hide grid helper and floor shadow for VR room immersion
  if (gridHelper) gridHelper.visible = false;
  if (floorPlane) floorPlane.visible = false;

  // Show virtual operating room and cabinet shelf
  if (operatingRoomGroup) {
    operatingRoomGroup.visible = true;
  }

  // Set dark environment background matching VR mode
  mainScene.background = new THREE.Color(0x070820);
  mainRenderer.setClearAlpha(1.0);

  // Position skeleton at the VR room coordinate space
  skeletonGroup.position.set(1.0, skeletonBottomOffset, -1.2);
  skeletonGroup.rotation.set(0, 0, 0);
  skeletonGroup.updateMatrixWorld(true);

  // Position controls camera to standing directly in front of the skeleton inside the VR room
  mainControls.target.set(1.0, 1.25, -1.2);
  mainCamera.position.set(1.0, 1.45, 0.45);
  mainControls.update();

  console.log("Desktop VR Simulator Mode activated.");
}

function exitVRSimulator() {
  if (!isVRSimulatorActive) return;
  isVRSimulatorActive = false;

  // Hide exit button
  btnExitSimulator.style.display = 'none';

  // Hide virtual operating room
  if (operatingRoomGroup) {
    operatingRoomGroup.visible = false;
  }

  // Restore background
  if (mainScene.userData.originalBackground !== undefined) {
    mainScene.background = mainScene.userData.originalBackground;
  } else {
    mainScene.background = null;
  }
  mainRenderer.setClearAlpha(1.0);

  // Show floor helpers
  if (gridHelper) gridHelper.visible = true;
  if (floorPlane) floorPlane.visible = true;

  // Show 2D HTML labels
  labelsContainer.style.display = 'block';

  // Restore skeleton transform
  if (mainScene.userData.originalMainGroupPos) {
    skeletonGroup.position.copy(mainScene.userData.originalMainGroupPos);
  }
  if (mainScene.userData.originalMainGroupRot) {
    skeletonGroup.rotation.copy(mainScene.userData.originalMainGroupRot);
  }

  // Restore camera target & controls
  if (mainScene.userData.originalControlsTarget) {
    mainControls.target.copy(mainScene.userData.originalControlsTarget);
  }
  
  // Calculate standard camera position
  const finalBox = new THREE.Box3().setFromObject(skeletonGroup);
  const center = finalBox.getCenter(new THREE.Vector3());
  const size = finalBox.getSize(new THREE.Vector3());
  
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    mainControls.target.set(0, center.y + 0.3, 0);
    mainCamera.position.set(0, center.y - 0.2, size.y * 2.4);
  } else {
    mainControls.target.copy(center);
    mainCamera.position.set(0, center.y, size.y * 1.35);
  }
  mainControls.update();

  console.log("Desktop VR Simulator Mode deactivated.");
}

