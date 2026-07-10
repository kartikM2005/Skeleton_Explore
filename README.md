# OsteoExplore - 3D Human Skeleton AR & VR Explorer

OsteoExplore is an immersive, high-fidelity WebGL application designed to explore human osteology and skeletal anatomy in interactive 3D, Virtual Reality (VR), and Augmented Reality (AR). Using Three.js, the WebXR Device API, and detailed 3D models, it transforms anatomy learning into an engaging spatial experience.

Set inside a meticulously detailed virtual operating room, users can study a life-size human skeleton, inspect individual bone models stored in an interactive lab cabinet, or enter VR to grab, scale, and inspect bone structures up close.

---

## 📸 Application Screenshots

### Desktop Viewport
![OsteoExplore Dossier Panel & Skeleton View](assets/dossier_panel_skull.png)
*Figure 1: The desktop viewport showing the main skeleton, interactive 3D hotspots, and the detailed glassmorphic Dossier Panel with an isolated, rotatable view of the skull.*

### WebXR Virtual Reality (VR) Mode
![OsteoExplore VR Holographic HUD & Isolated Bone View](assets/webxr_vr_dossier.png)
*Figure 2: Inside VR mode using a WebXR headset. The selected bone (Skull) is highlighted with a glowing overlay, alongside a floating holographic information panel and an isolated 3D preview model.*

![OsteoExplore VR Cabinet Grab & Inspection](assets/webxr_vr_cabinet.png)
*Figure 3: Interacting with the laboratory cabinet in VR. The user has grabbed the skull model from the shelf using controller grip triggers to zoom, rotate, and inspect it.*

### WebXR Augmented Reality (AR) Mode
![OsteoExplore AR Pass-through View](assets/webxr_ar_mode.png)
*Figure 4: Simulated Augmented Reality (AR) pass-through mode in the WebXR Device API emulator, displaying the life-size skeleton model aligned with controller guides.*

---

## 🌟 Key Features

*   **Interactive 3D Viewport**: Smooth controls to rotate, zoom, and pan around a medical-grade 3D human skeleton standing on an IV pole in a virtual operating room.
*   **Aesthetic UI (Dossier Panel)**: A futuristic glassmorphic sidebar featuring:
    *   An **Isolated 3D View** allowing independent orbital control, rotation, and inspection of the selected bone.
    *   Comprehensive anatomical data: pronunciation guides, classification (Axial vs. Appendicular), physiological function, clinical significance, and fun facts.
*   **Virtual Reality (VR) Classroom**:
    *   Compatible with WebXR headsets (e.g., Meta Quest series, Zapbox, or simulated WebXR environments).
    *   **VR Locomotion**: Teleportation and smooth movement using thumbsticks/joysticks.
    *   **Holographic Info Panel**: A floating VR screen rendering real-time descriptions and details for selected bones.
    *   **Floating 3D Previews**: Selected bones materialize adjacent to the holographic panel in the VR world.
    *   **Interactive Grabbing**: Walk over to the lab cabinet, squeeze your controller trigger/grip, and pick up individual bone models (e.g., Skull, Pelvis, Sternum).
    *   **Manipulate Bones**: Rotate grabbed bones or adjust their distance and scale dynamically using controller thumbsticks.
*   **Augmented Reality (AR) Sandbox**: Mobile AR camera pass-through support with device orientation controls.
*   **Interactive Lab Cabinet**: An auxiliary cabinet with dedicated shelves displaying individual bone models with custom billboarded 3D text tags.
*   **WebGL Fallback Guidance**: Built-in visual alerts and instructions for enabling hardware acceleration in browsers if WebGL fails to initialize.

---

## 🛠️ Tech Stack & Libraries

*   **Core**: HTML5, Vanilla CSS3 (Custom variables, glassmorphism, dynamic keyframe animations).
*   **Scripting**: Javascript (ES6+ Import/Export Modules).
*   **3D Engine**: [Three.js](https://threejs.org/) (v150).
*   **Interactive Controls**: OrbitControls (Three.js addon).
*   **Model Importer**: GLTFLoader (Three.js addon).
*   **WebXR Utilities**: XRControllerModelFactory, WebXR Manager.

---

## 📂 Project Directory Structure

```text
Human_skeleton_Explore/
│
├── assets/
│   ├── dossier_panel_skull.png     # Screenshot showing the application HUD & Skull Dossier
│   ├── webxr_ar_mode.png           # Screenshot showing simulated AR pass-through mode
│   ├── webxr_vr_cabinet.png        # Screenshot showing VR cabinet bone interaction
│   └── webxr_vr_dossier.png        # Screenshot showing VR holographic dossier panel
│
├── skeleton/                       # GLTF/GLB 3D models directory
│   ├── Room_updated.glb            # Visual medical operating room scene
│   ├── IVPole.glb                  # IV stand for the main skeleton
│   ├── human_skeleton.glb          # Core 3D human skeleton model
│   ├── lab_shelf.glb               # Medical bone cabinet model
│   ├── skull_downloadable.glb      # High-quality skull bone model
│   ├── human_pelvis.glb            # Pelvis bone model
│   ├── human_sternum.glb           # Sternum bone model
│   ├── human_humerous.glb          # Humerus bone model
│   ├── human_tibia.glb             # Tibia bone model
│   ├── human_patella.glb           # Patella bone model
│   ├── human_hand_bones.glb        # Hand bone model
│   └── human_scapula.glb           # Scapula bone model
│
├── index.html                      # HTML5 page skeleton and import maps config
├── style.css                       # Stylesheet containing the custom design system
├── main.js                         # Core application script (Init, WebGL, XR, & Interaction loops)
├── data.js                         # Database containing bone metadata, bounds, and pin coordinates
├── cert.pem                        # SSL Certificate for HTTPS local hosting
└── key.pem                         # Private SSL Key for HTTPS local hosting
```

---

## 🎮 How to Interact

### Desktop & Mobile
*   **Rotate Scene**: Left-click and drag (desktop) or touch and drag (mobile).
*   **Zoom**: Mouse scroll wheel (desktop) or pinch-to-zoom (mobile).
*   **Inspect Bone**: Left-click directly on any labeled 3D hotspot pin or click the bone geometry itself. This launches the **Dossier Panel** on the left.
*   **Dossier View**: Scroll to read clinical facts, and drag within the dossier viewport canvas to rotate the isolated model.

### Virtual Reality (VR)
*   **Movement**: Use the thumbstick on either VR controller to walk or turn within the room.
*   **Selecting Bones**: Aim your controller pointer at the skeleton pins or buttons and pull the **Trigger** to display details on the holographic HUD.
*   **Cabinet Bone Interaction**:
    1. Walk to the wooden lab cabinet on the side of the room.
    2. Point at a bone model on the shelves.
    3. Press and hold the **Squeeze/Grip** button to grab and pick up the bone.
    4. Move the controller to bring the bone closer or rotate it.
    5. While holding a bone, use the **Thumbstick** to rotate (Left/Right) or scale/zoom (Up/Down) the model.
    6. Release the **Squeeze/Grip** button to return the bone back to its shelf.

---

## 🚀 Local Development Setup

To test WebXR features, browsers enforce a strict security policy requiring a secure connection (**HTTPS**) or `localhost`. 

This repository contains local SSL certificates (`cert.pem` and `key.pem`) to make HTTPS local serving easy.

### Running with a Local Server

You can serve the project using node's `http-server` (or any equivalent development server). 

1.  Open your terminal in the repository root directory.
2.  Start a secure local server using:
    ```bash
    npx http-server -S -C cert.pem -K key.pem -p 8081
    ```
    *   `-S` enables SSL (HTTPS).
    *   `-C` and `-K` specify the local certificates.
    *   `-p 8081` binds the server to port `8081`.

3.  Open your browser and navigate to:
    ```text
    https://localhost:8081
    ```
    *(Note: Your browser may show a "Your connection is not private" warning because the SSL certificate is self-signed. Click "Advanced" and proceed to localhost to access the app.)*

4.  To test on a VR Headset (like Meta Quest):
    *   Make sure your headset and computer are on the same Wi-Fi network.
    *   Access the computer's local IP address (e.g., `https://192.168.x.x:8081`) from the headset browser, or set up port forwarding via Android Developer Options.
