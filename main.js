import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BONES_DATA } from './data.js';

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

// Global Application State
let mainScene, mainCamera, mainRenderer, mainControls;
let isolatedScene, isolatedCamera, isolatedRenderer, isolatedControls;
let skeletonMesh = null; // The loaded Mesh Object_2
let skeletonGroup = null; // Group containing the GLB scene
let highlightedBoneMesh = null; // Mesh overlay showing active selection
let currentSelectedBone = null;
let currentHoveredBone = null;
let bonePins = [];
let xrSession = null;
let loadedSkullModel = null;
let isSkullLoading = false;
let gridHelper = null;
let floorPlane = null;
let controller1 = null, controller2 = null; // 6DoF WebXR controllers (for Zapbox)
let operatingRoomGroup = null; // 3D Operating Room model for VR mode
let vrInfoPanel = null;   // Holographic info panel rendered inside VR world
let vrBonePreview = null; // Isolated bone geometry floating inside VR world
let vrCloseButton = null; // Tappable CLOSE button mesh on the VR panel

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
  setupMainScene();
  setupIsolatedScene();
  loadSkeletonModel();
  loadOperatingRoomModel(); // Start loading the operating room in the background
  setupEventListeners();
  animate();
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
  mainRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
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

  // 6DoF Controllers Setup for Zapbox / VR inputs
  controller1 = mainRenderer.xr.getController(0);
  controller1.addEventListener('selectstart', () => onControllerSelect(controller1));
  controller1.addEventListener('squeezestart', deselectAll);
  mainScene.add(controller1);

  controller2 = mainRenderer.xr.getController(1);
  controller2.addEventListener('selectstart', () => onControllerSelect(controller2));
  controller2.addEventListener('squeezestart', deselectAll);
  mainScene.add(controller2);

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
    './skeleton/human_skeleton.glb',
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

      // Setup camera target and height dynamically based on the model's actual bounds
      const finalBox = new THREE.Box3().setFromObject(skeletonGroup);
      const center = finalBox.getCenter(new THREE.Vector3());
      const size = finalBox.getSize(new THREE.Vector3());
      
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
      const x1 = posAttr.getX(i+1), y1 = posAttr.getY(i+1), z1 = posAttr.getZ(i+1);
      const x2 = posAttr.getX(i+2), y2 = posAttr.getY(i+2), z2 = posAttr.getZ(i+2);
      
      if (inBounds(x0, y0, z0) || inBounds(x1, y1, z1) || inBounds(x2, y2, z2)) {
        positions.push(
          x0, y0, z0,
          x1, y1, z1,
          x2, y2, z2
        );
        if (normalAttr) {
          normals.push(
            normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i),
            normalAttr.getX(i+1), normalAttr.getY(i+1), normalAttr.getZ(i+1),
            normalAttr.getX(i+2), normalAttr.getY(i+2), normalAttr.getZ(i+2)
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
  if (infoContent) infoContent.style.display = 'none';
  if (infoPlaceholder) infoPlaceholder.style.display = 'block';

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
        './skeleton/human_male_skull.glb',
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
  
  if (skeletonMesh) {
    const intersects = raycaster.intersectObject(skeletonMesh);
    if (intersects.length > 0) {
      const localPoint = intersects[0].point.clone();
      skeletonMesh.worldToLocal(localPoint);
      hoveredKey = getClosestBoneAtLocalPoint(localPoint);
    }
  }
  
  if (hoveredKey !== currentHoveredBone) {
    if (currentHoveredBone) {
      const pin = document.getElementById(`pin-${currentHoveredBone}`);
      if (pin) pin.classList.remove('hovered');
    }
    
    currentHoveredBone = hoveredKey;
    
    if (currentHoveredBone) {
      const pin = document.getElementById(`pin-${currentHoveredBone}`);
      if (pin) pin.classList.add('hovered');
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
    const b = bone.bounds;
    
    if (localPoint.x >= b.xMin && localPoint.x <= b.xMax &&
        localPoint.y >= b.yMin && localPoint.y <= b.yMax &&
        localPoint.z >= b.zMin && localPoint.z <= b.zMax) {
      
      const dx = localPoint.x - bone.marker.x;
      const dy = localPoint.y - bone.marker.y;
      const dz = localPoint.z - bone.marker.z;
      const dist = dx*dx + dy*dy + dz*dz;
      
      if (dist < minDistance) {
        minDistance = dist;
        candidate = key;
      }
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
    showXRMessage("WebXR is not supported by your browser. Use a compatible VR headset or AR phone.");
    return;
  }
  
  const supported = await navigator.xr.isSessionSupported(mode);
  if (!supported) {
    showXRMessage(`WebXR ${mode === 'immersive-ar' ? 'AR' : 'VR'} mode is not supported on this hardware.`);
    return;
  }
  
  try {
    const session = await navigator.xr.requestSession(mode, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    });
    
    xrSession = session;
    mainRenderer.xr.setReferenceSpaceType(mode === 'immersive-ar' ? 'local' : 'local-floor');
    await mainRenderer.xr.setSession(session);
    
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
      }
      
      // Position the skeleton standing in front and slightly to the right of the user
      skeletonGroup.position.set(0.4, skeletonBottomOffset, -1.2);
      skeletonGroup.rotation.set(0, 0, 0);
    }
    
    showXRMessage(`Entered XR Session. Put on your device!`);
    
    session.addEventListener('end', () => {
      xrSession = null;
      hideXRMessage();
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

      // Restore skeleton position and rotation
      skeletonGroup.position.set(0, skeletonBottomOffset, 0);
      skeletonGroup.rotation.set(0, 0, 0);
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
  
  // Update XR 6DoF controller pointer raycasting when presenting in VR/AR (Zapbox)
  if (mainRenderer.xr.isPresenting) {
    updateXRControllerRaycast();
  }
  
  // Auto-rotate skeleton slowly if nothing is selected and not in VR/AR
  if (!currentSelectedBone && skeletonGroup && !mainRenderer.xr.isPresenting && !webcamARActive) {
    skeletonGroup.rotation.y += 0.003; // Rotate around Y-axis (which is vertical world axis after Sketchfab matrix)
  } else if (currentSelectedBone && skeletonGroup && !webcamARActive) {
    // If a bone is selected, rotate back to face forward slowly (original rotation is 0)
    skeletonGroup.rotation.y *= 0.92; 
  }

  // Keep skeleton centered (the layout containers handle side-by-side positioning automatically)
  if (skeletonGroup) {
    skeletonGroup.position.x = 0;
  }
  
  mainRenderer.render(mainScene, mainCamera);
  
  if (subViewport.classList.contains('visible')) {
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
    const camRight   = new THREE.Vector3(1, 0, 0).applyQuaternion(mainCamera.quaternion);
    const camUp      = new THREE.Vector3(0, 1, 0).applyQuaternion(mainCamera.quaternion);
    vrInfoPanel.position
      .copy(mainCamera.position)
      .addScaledVector(camForward, 1.4)
      .addScaledVector(camRight,   0.55)
      .addScaledVector(camUp,     -0.05);
    vrInfoPanel.quaternion.copy(mainCamera.quaternion);
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

  // Request mobile camera stream (using environment/back camera if available)
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
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
  let hoveredBoneKey = null;
  
  [controller1, controller2].forEach((controller) => {
    if (!controller || !controller.visible) return;
    
    // Update raycaster position and orientation from controller matrixWorld
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    xrRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    xrRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    
    if (skeletonMesh) {
      const intersects = xrRaycaster.intersectObject(skeletonMesh);
      if (intersects.length > 0) {
        // Use the VR-specific lookup that accounts for Z-as-height model axis
        const boneKey = getClosestBoneVR(intersects[0].point);
        if (boneKey) {
          hoveredBoneKey = boneKey;
        }
      }
    }
  });

  // Update hover states
  if (hoveredBoneKey !== currentHoveredBone) {
    if (currentHoveredBone) {
      const pin = document.getElementById(`pin-${currentHoveredBone}`);
      if (pin) pin.classList.remove('hovered');
    }
    
    currentHoveredBone = hoveredBoneKey;
    
    if (currentHoveredBone) {
      const pin = document.getElementById(`pin-${currentHoveredBone}`);
      if (pin) pin.classList.add('hovered');
    }
  }
}

function onControllerSelect(controller) {
  if (!mainRenderer.xr.isPresenting) return;
  
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  xrRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  xrRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  let clickedSomething = false;

  // Check CLOSE button on VR panel first
  if (vrCloseButton && vrInfoPanel && vrInfoPanel.visible) {
    const closeHits = xrRaycaster.intersectObject(vrCloseButton);
    if (closeHits.length > 0) {
      deselectAll();
      return;
    }
  }

  // Check skeleton bones
  if (skeletonMesh) {
    const intersects = xrRaycaster.intersectObject(skeletonMesh);
    if (intersects.length > 0) {
      const boneKey = getClosestBoneVR(intersects[0].point);
      if (boneKey) {
        selectBone(boneKey);
        clickedSomething = true;
      }
    }
  }

  // If the VR info panel is open and the user clicks empty space, dismiss it
  if (currentSelectedBone && !clickedSomething) {
    deselectAll();
  }
}

// 11. Load the 3D Operating Room Model
function loadOperatingRoomModel() {
  const loader = new GLTFLoader();
  loader.load(
    './skeleton/charite_university_hospital_-_operating_room.glb',
    (gltf) => {
      operatingRoomGroup = gltf.scene;
      
      // Keep hidden by default; only show in VR mode
      operatingRoomGroup.visible = false;
      
      // Enable shadow receiving on meshes in the room
      operatingRoomGroup.traverse((child) => {
        if (child.isMesh) {
          child.receiveShadow = true;
          child.castShadow = true;
        }
      });
      
      // Position the room model at the origin
      operatingRoomGroup.position.set(0, 0, 0);
      mainScene.add(operatingRoomGroup);
      console.log("Operating room model loaded successfully.");
    },
    undefined,
    (error) => {
      console.error('Error loading operating room model:', error);
    }
  );
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
  canvas.width  = CW;
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
  var panelMat  = new THREE.MeshBasicMaterial({
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
    var previewBox  = new THREE.Box3().setFromObject(bonePreviewMesh);
    var previewSize = previewBox.getSize(new THREE.Vector3());
    var maxDim = Math.max(previewSize.x, previewSize.y, previewSize.z);
    var previewScale = 0.38 / (maxDim || 1);
    bonePreviewMesh.scale.setScalar(previewScale);
    bonePreviewMesh.position.set(-0.9, 0, 0.02);
  }

  // Build CLOSE button
  var btnCanvas = document.createElement('canvas');
  btnCanvas.width  = 256;
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
  var btnMat  = new THREE.MeshBasicMaterial({
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
  mainScene.add(vrInfoPanel);
}

function hideVRInfoPanel() {
  if (vrInfoPanel) {
    vrInfoPanel.traverse(function(child) {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
    mainScene.remove(vrInfoPanel);
    vrInfoPanel = null;
  }
  if (vrBonePreview) {
    mainScene.remove(vrBonePreview);
    vrBonePreview = null;
  }
  vrCloseButton = null;
}

function vrPanelWrapText(ctx, text, x, y, maxWidth, lineHeight) {
  var words = text.split(' ');
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var testLine = line + words[i] + ' ';
    var metrics  = ctx.measureText(testLine);
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
