// Anatomical data and spatial bounding boxes for the 3D skeleton model.
// Coordinates are in the GLB model's local space (Z is height, X is width, Y is depth).
export const BONES_DATA = {
  skull: {
    name: "Skull (Cranium)",
    pronunciation: "KR-nee-um",
    system: "Skeletal System (Axial)",
    function: "Protects the brain, houses the primary sense organs (eyes, ears, nose, tongue), and provides structure for the face and jaw muscles.",
    clinicalSignificance: "Skull fractures can lead to traumatic brain injury (TBI) or bleeding. Understanding skull sutures (where bones meet) is critical in pediatrics and neurosurgery.",
    funFact: "The adult human skull is not a single bone; it is made up of 22 separate bones fused together, except for the mandible (jawbone).",
    // Local coordinates bounding box
    bounds: {
      xMin: -2.0, xMax: 2.0,
      yMin: -2.0, yMax: 2.0,
      zMin: 5.8, zMax: 8.0
    },
    // Marker position for floating 3D label
    marker: { x: 0.0, y: 0.0, z: 6.9 }
  },
  spine: {
    name: "Spine (Vertebral Column)",
    pronunciation: "VER-tuh-brul KAHL-um",
    system: "Skeletal System (Axial)",
    function: "Provides structural support for the torso, protects the spinal cord, and allows flexible bending, twisting, and shock absorption during movement.",
    clinicalSignificance: "Conditions include herniated discs, scoliosis (abnormal curvature), and spinal stenosis. Severe damage can cause paralysis.",
    funFact: "Humans are born with 33 vertebrae, but by adulthood, some fuse together (sacrum and coccyx) leaving us with 26 vertebrae.",
    bounds: {
      xMin: -0.8, xMax: 0.8,
      yMin: -1.8, yMax: 0.2,
      zMin: 0.8, zMax: 5.8
    },
    marker: { x: 0.0, y: -0.6, z: 3.2 }
  },
  ribcage: {
    name: "Ribcage & Sternum",
    pronunciation: "RIB-kayj and STER-num",
    system: "Skeletal System (Axial)",
    function: "Protects vital organs in the chest (heart and lungs) and aids respiration by expanding and contracting with the diaphragm.",
    clinicalSignificance: "Rib fractures can puncture the lungs (pneumothorax). Cardiopulmonary resuscitation (CPR) involves chest compressions on the sternum.",
    funFact: "Most people have 12 pairs of ribs, but about 1 in 200 people are born with an extra rib, called a cervical rib, which can cause thoracic outlet syndrome.",
    bounds: {
      xMin: -2.2, xMax: 2.2,
      yMin: -1.5, yMax: 1.2,
      zMin: 2.0, zMax: 5.2
    },
    marker: { x: 0.0, y: 0.6, z: 3.6 }
  },
  pelvis: {
    name: "Pelvis (Hip Girdle)",
    pronunciation: "PEL-vis",
    system: "Skeletal System (Appendicular)",
    function: "Transfers the weight of the upper body to the lower limbs, protects pelvic organs (bladder, reproductive organs), and serves as an attachment point for core muscles.",
    clinicalSignificance: "Pelvic fractures are often high-energy injuries that can cause severe internal bleeding. The female pelvis is wider and more circular to facilitate childbirth.",
    funFact: "The pelvis is made up of three fused bones: the ilium, ischium, and pubis, which meet at the acetabulum (hip socket).",
    bounds: {
      xMin: -2.0, xMax: 2.0,
      yMin: -1.5, yMax: 1.2,
      zMin: -0.5, zMax: 1.8
    },
    marker: { x: 0.0, y: 0.4, z: 0.7 }
  },
  clavicle_l: {
    name: "Left Clavicle (Collarbone)",
    pronunciation: "KLAV-ih-kul",
    system: "Skeletal System (Appendicular)",
    function: "Connects the arm to the trunk, acting as a strut to keep the shoulder blade in position so the arm can swing freely.",
    clinicalSignificance: "The clavicle is one of the most commonly broken bones in the body, frequently fractured by falls onto an outstretched hand or shoulder.",
    funFact: "In Latin, 'clavicula' means 'little key', describing the way the bone rotates along its axis like a key during arm elevation.",
    bounds: {
      xMin: 0.3, xMax: 2.5,
      yMin: -1.0, yMax: 1.0,
      zMin: 4.6, zMax: 5.3
    },
    marker: { x: 0.8, y: 0.4, z: 4.9 }
  },
  clavicle_r: {
    name: "Right Clavicle (Collarbone)",
    pronunciation: "KLAV-ih-kul",
    system: "Skeletal System (Appendicular)",
    function: "Connects the arm to the trunk, acting as a strut to keep the shoulder blade in position so the arm can swing freely.",
    clinicalSignificance: "Fractures are common in cycling accidents and contact sports.",
    funFact: "It is the only long bone in the body that lies horizontally.",
    bounds: {
      xMin: -2.5, xMax: -0.3,
      yMin: -1.0, yMax: 1.0,
      zMin: 4.6, zMax: 5.3
    },
    marker: { x: -0.8, y: 0.4, z: 4.9 }
  },
  humerus_l: {
    name: "Left Humerus (Upper Arm)",
    pronunciation: "HYOO-muh-rus",
    system: "Skeletal System (Appendicular)",
    function: "Provides structure for the upper arm and serves as an attachment point for muscles controlling the shoulder and elbow joints.",
    clinicalSignificance: "Fractures can occur at the surgical neck. The ulnar nerve runs behind the medial epicondyle—hitting it causes a tingling 'funny bone' sensation.",
    funFact: "Despite the name 'funny bone' (a play on humerus / humorous), the tingling is actually caused by compressing the ulnar nerve against the bone.",
    bounds: {
      xMin: 1.2, xMax: 3.2,
      yMin: -1.2, yMax: 1.2,
      zMin: 1.8, zMax: 4.7
    },
    marker: { x: 1.7, y: 0.3, z: 3.5 }
  },
  humerus_r: {
    name: "Right Humerus (Upper Arm)",
    pronunciation: "HYOO-muh-rus",
    system: "Skeletal System (Appendicular)",
    function: "Provides structure for the upper arm and serves as an attachment point for muscles controlling the shoulder and elbow joints.",
    clinicalSignificance: "Radial nerve injury can occur with humeral shaft fractures, leading to 'wrist drop'.",
    funFact: "It links the scapula (shoulder blade) to the lower arm bones.",
    bounds: {
      xMin: -3.2, xMax: -1.2,
      yMin: -1.2, yMax: 1.2,
      zMin: 1.8, zMax: 4.7
    },
    marker: { x: -1.7, y: 0.3, z: 3.5 }
  },
  forearm_l: {
    name: "Left Radius & Ulna",
    pronunciation: "RAY-dee-us and UL-nuh",
    system: "Skeletal System (Appendicular)",
    function: "The radius (thumb side) and ulna (pinky side) pivot around each other to enable pronation and supination (turning the palm down or up).",
    clinicalSignificance: "A Colles' fracture is a common break of the distal radius, typically caused by breaking a fall with an outstretched hand.",
    funFact: "When you turn your palm down, the radius physically crosses over the ulna, forming an 'X' shape.",
    bounds: {
      xMin: 1.8, xMax: 3.5,
      yMin: -1.2, yMax: 1.2,
      zMin: -0.8, zMax: 1.8
    },
    marker: { x: 2.4, y: 0.2, z: 0.5 }
  },
  forearm_r: {
    name: "Right Radius & Ulna",
    pronunciation: "RAY-dee-us and UL-nuh",
    system: "Skeletal System (Appendicular)",
    function: "Form the skeletal framework of the forearm, facilitating hand rotation and elbow flexion/extension.",
    clinicalSignificance: "Dislocation of the radial head is common in young children, often called 'nursemaid's elbow'.",
    funFact: "The ulna forms the bony point of your elbow (the olecranon process).",
    bounds: {
      xMin: -3.5, xMax: -1.8,
      yMin: -1.2, yMax: 1.2,
      zMin: -0.8, zMax: 1.8
    },
    marker: { x: -2.4, y: 0.2, z: 0.5 }
  },
  femur_l: {
    name: "Left Femur (Thigh)",
    pronunciation: "FEE-mur",
    system: "Skeletal System (Appendicular)",
    function: "Supports the entire weight of the upper body during standing, walking, or jumping, and acts as a lever for the major leg muscles.",
    clinicalSignificance: "A 'broken hip' is usually a fracture of the femoral neck. Femur shaft fractures are medical emergencies due to potential blood loss from the femoral artery.",
    funFact: "The femur is the longest, strongest, and heaviest bone in the human body. It can support up to 30 times an adult's body weight.",
    bounds: {
      xMin: 0.3, xMax: 2.2,
      yMin: -1.2, yMax: 1.2,
      zMin: -4.2, zMax: -0.4
    },
    marker: { x: 1.0, y: 0.4, z: -2.2 }
  },
  femur_r: {
    name: "Right Femur (Thigh)",
    pronunciation: "FEE-mur",
    system: "Skeletal System (Appendicular)",
    function: "Supports body weight and enables leg movement at the hip and knee joints.",
    clinicalSignificance: "Avascular necrosis can occur if blood supply to the femoral head is disrupted.",
    funFact: "An average femur is about 18 inches long and represents roughly 26% of a person's total height.",
    bounds: {
      xMin: -2.2, xMax: -0.3,
      yMin: -1.2, yMax: 1.2,
      zMin: -4.2, zMax: -0.4
    },
    marker: { x: -1.0, y: 0.4, z: -2.2 }
  },
  patella_l: {
    name: "Left Patella (Kneecap)",
    pronunciation: "puh-TEL-uh",
    system: "Skeletal System (Appendicular)",
    function: "Protects the knee joint front and increases the leverage of the quadriceps tendon, allowing for more efficient leg extension.",
    clinicalSignificance: "Patellar subluxation (slipping out of place) and patellofemoral pain syndrome ('runner's knee') are common sports injuries.",
    funFact: "Humans are not born with bony kneecaps; they start as soft cartilage and do not fully ossify (harden into bone) until ages 3 to 5.",
    bounds: {
      xMin: 0.6, xMax: 1.6,
      yMin: 0.2, yMax: 1.2,
      zMin: -4.5, zMax: -3.9
    },
    marker: { x: 1.1, y: 0.8, z: -4.2 }
  },
  patella_r: {
    name: "Right Patella (Kneecap)",
    pronunciation: "puh-TEL-uh",
    system: "Skeletal System (Appendicular)",
    function: "Acts as a shield for the knee joint and improves leverage of the thigh muscles.",
    clinicalSignificance: "Direct trauma can fracture the patella, requiring surgical repair if displaced.",
    funFact: "It is the largest sesamoid bone (a bone embedded within a tendon) in the body.",
    bounds: {
      xMin: -1.6, xMax: -0.6,
      yMin: 0.2, yMax: 1.2,
      zMin: -4.5, zMax: -3.9
    },
    marker: { x: -1.1, y: 0.8, z: -4.2 }
  },
  shin_l: {
    name: "Left Tibia & Fibula",
    pronunciation: "TIB-ee-uh and FIB-yoo-luh",
    system: "Skeletal System (Appendicular)",
    function: "The tibia (shinbone) supports the body's weight, while the fibula (calf bone) acts as an anchor for muscles and stabilizes the ankle joint.",
    clinicalSignificance: "Stress fractures are common in runners. The lateral malleolus (bottom of fibula) is easily fractured in ankle rolling injuries.",
    funFact: "The tibia is the second largest bone in the body. The fibula, on the other hand, bears only about 17% of the body's weight.",
    bounds: {
      xMin: 0.3, xMax: 2.0,
      yMin: -1.2, yMax: 1.2,
      zMin: -7.8, zMax: -4.3
    },
    marker: { x: 0.9, y: 0.3, z: -6.1 }
  },
  shin_r: {
    name: "Right Tibia & Fibula",
    pronunciation: "TIB-ee-uh and FIB-yoo-luh",
    system: "Skeletal System (Appendicular)",
    function: "Provide structure to the lower leg and form key joints at the knee and ankle.",
    clinicalSignificance: "Shin splints occur due to stress on the tibia and connective tissues.",
    funFact: "Fibula grafts are frequently harvested to reconstruct bones in other parts of the body.",
    bounds: {
      xMin: -2.0, xMax: -0.3,
      yMin: -1.2, yMax: 1.2,
      zMin: -7.8, zMax: -4.3
    },
    marker: { x: -0.9, y: 0.3, z: -6.1 }
  },
  foot_l: {
    name: "Left Foot Bones",
    pronunciation: "FOOT bones",
    system: "Skeletal System (Appendicular)",
    function: "Provides a flexible, shock-absorbing platform that distributes body weight and acts as a lever to propel the body forward.",
    clinicalSignificance: "Flat feet (loss of arches), bunions, and plantar fasciitis can cause pain. Sprains of ankle ligaments are extremely common.",
    funFact: "Nearly one-quarter of all the bones in your body are located in your feet—each foot contains 26 bones and 33 joints.",
    bounds: {
      xMin: 0.3, xMax: 2.2,
      yMin: -1.8, yMax: 1.2,
      zMin: -8.3, zMax: -7.7
    },
    marker: { x: 1.0, y: -0.2, z: -8.0 }
  },
  foot_r: {
    name: "Right Foot Bones",
    pronunciation: "FOOT bones",
    system: "Skeletal System (Appendicular)",
    function: "Supports balance, posture, and gait through complex interactions of tarsals, metatarsals, and phalanges.",
    clinicalSignificance: "Metatarsal fractures ('Jones fracture') are common in athletes.",
    funFact: "The heel bone (calcaneus) is the largest bone in the foot and is cushioned by a thick fat pad.",
    bounds: {
      xMin: -2.2, xMax: -0.3,
      yMin: -1.8, yMax: 1.2,
      zMin: -8.3, zMax: -7.7
    },
    marker: { x: -1.0, y: -0.2, z: -8.0 }
  }
};
