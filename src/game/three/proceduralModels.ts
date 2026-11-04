import * as THREE from 'three';
import { FactionId } from '../types/systems';
import {
  getCrossValleyRoadX,
  getHighwayCenterZ,
  getRiverCenterZ,
  RIVER_WATER_LEVEL,
  sampleTerrainHeight,
  THEATER_FULL_SIZE,
  TheaterLandmark,
} from '../systems/theaterMapGenerator';
import { StaticWorldPhysics } from '../systems/staticCollisionSystem';
import { ProceduralMaterialLibrary } from './proceduralTextures';

export interface OperatorRigRefs {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  rightArmPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  rifleGroup: THREE.Group;
  swordHeldGroup: THREE.Group;
  swordSheathedGroup: THREE.Group;
  swordTrailMesh: THREE.Mesh;
  muzzleNode: THREE.Object3D;
}

export interface FirstPersonViewmodelRefs {
  root: THREE.Group;
  rifleRig: THREE.Group;
  magazineMesh: THREE.Mesh;
  swordRig: THREE.Group;
  swordTrailMesh: THREE.Mesh;
  muzzleNode: THREE.Object3D;
  muzzleFlashMesh: THREE.Mesh;
}

export interface CommandVehicleRefs {
  root: THREE.Group;
  turretGroup: THREE.Group;
  eraGroup: THREE.Group;
  apsGroup: THREE.Group;
  mastGroup: THREE.Group;
  atgmGroup: THREE.Group;
  wheels: THREE.Mesh[];
}

/**
 * High-density 224x224 vertex-colored & micro-bumped PBR terrain mesh featuring:
 * - Asphalt highway + dashed yellow/white lane markings
 * - North-South cross-valley tactical dirt trail
 * - Wet shoreline darkening along riverbanks
 * - Granite mountain strata & snowline blending
 * - Animated PBR river water shader via onBeforeCompile
 */
export function buildMultiBiomeTerrainMesh(
  matLib: ProceduralMaterialLibrary
): {
  terrainMesh: THREE.Mesh;
  waterMesh: THREE.Mesh;
  updateWaterTime: (t: number) => void;
} {
  const segs = 224;
  const geo = new THREE.PlaneGeometry(THEATER_FULL_SIZE, THEATER_FULL_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  const colRiverBed = new THREE.Color('#1f2c30');
  const colWetShore = new THREE.Color('#474337');
  const colSandBank = new THREE.Color('#6f6855');
  const colAsphalt = new THREE.Color('#22262c');
  const colLaneMark = new THREE.Color('#cbb66b');
  const colRoadShoulder = new THREE.Color('#4d4b42');
  const colDirtTrail = new THREE.Color('#5a4e3d');
  const colValleyGrass = new THREE.Color('#35482f');
  const colLushMeadow = new THREE.Color('#3f5435');
  const colForestSlope = new THREE.Color('#253826');
  const colGraniteRidge = new THREE.Color('#4e555e');
  const colAlpineSnow = new THREE.Color('#d8e2ec');

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = sampleTerrainHeight(x, z);
    pos.setY(i, y);

    const distRiv = Math.abs(z - getRiverCenterZ(x));
    const distHw = Math.abs(z - getHighwayCenterZ(x));
    const distDirt = Math.abs(x - getCrossValleyRoadX(z));

    if (y < RIVER_WATER_LEVEL - 0.2) {
      c.copy(colRiverBed);
    } else if (distRiv < 8.6 && y < RIVER_WATER_LEVEL + 0.45) {
      c.copy(colWetShore);
    } else if (distRiv < 10.5 && y < RIVER_WATER_LEVEL + 1.45) {
      c.copy(colSandBank);
    } else if (distHw < 0.28 && Math.sin(x * 0.85) > 0.15) {
      c.copy(colLaneMark);
    } else if (distHw < 3.7) {
      c.copy(colAsphalt);
    } else if (distHw < 5.3) {
      c.copy(colRoadShoulder);
    } else if (distDirt < 2.6 && y < 16.5 && y > RIVER_WATER_LEVEL + 0.8) {
      c.copy(colDirtTrail);
    } else if (y > 21.8) {
      const snowBlend = Math.min(1, (y - 21.8) / 6.2);
      c.copy(colGraniteRidge).lerp(colAlpineSnow, snowBlend);
    } else if (y > 11.2) {
      const rockBlend = Math.min(1, (y - 11.2) / 7.8);
      c.copy(colForestSlope).lerp(colGraniteRidge, rockBlend);
    } else if (y > 3.6) {
      const forestBlend = Math.min(1, (y - 3.6) / 5.4);
      c.copy(colValleyGrass).lerp(colForestSlope, forestBlend);
    } else {
      const patch = Math.sin(x * 0.09) * Math.cos(z * 0.09) * 0.5 + 0.5;
      c.copy(colValleyGrass).lerp(colLushMeadow, patch * 0.65);
    }

    const jitter = (Math.sin(x * 0.43 + z * 0.47) * 0.5 + 0.5) * 0.044 - 0.022;
    colors[i * 3] = Math.max(0, Math.min(1, c.r + jitter));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, c.g + jitter));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, c.b + jitter));
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    bumpMap: matLib.terrainDetailBump,
    bumpScale: 0.22,
    roughness: 0.86,
    metalness: 0.04,
  });

  const terrainMesh = new THREE.Mesh(geo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = 'TheaterTerrain';

  // Animated Flowing PBR River Plane (extends MeshStandardMaterial via onBeforeCompile)
  const waterGeo = new THREE.PlaneGeometry(THEATER_FULL_SIZE, 108, 128, 48);
  waterGeo.rotateX(-Math.PI / 2);

  const waterMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#15485c'),
    roughness: 0.11,
    metalness: 0.78,
    transparent: true,
    opacity: 0.88,
  });

  let compiledWaterShader: { uniforms: Record<string, { value: number }> } | null = null;
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = { value: 0 };
    compiledWaterShader = shader as unknown as { uniforms: Record<string, { value: number }> };

    shader.vertexShader =
      `uniform float uWaterTime;\nvarying vec2 vWorldXZ;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec4 wPos = modelMatrix * vec4(transformed, 1.0);
        vWorldXZ = wPos.xz;
        float wave1 = sin(wPos.x * 0.45 + uWaterTime * 2.2) * 0.055;
        float wave2 = cos(wPos.z * 0.65 - uWaterTime * 1.7) * 0.045;
        transformed.y += wave1 + wave2;
        `
      );

    shader.fragmentShader =
      `uniform float uWaterTime;\nvarying vec2 vWorldXZ;\n` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float shimmer = sin(vWorldXZ.x * 1.3 + uWaterTime * 3.1) * cos(vWorldXZ.y * 1.6 - uWaterTime * 2.4);
        diffuseColor.rgb += vec3(0.05, 0.11, 0.14) * smoothstep(0.45, 0.95, shimmer);
        `
      );
  };

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(0, RIVER_WATER_LEVEL, 14);
  waterMesh.receiveShadow = true;

  return {
    terrainMesh,
    waterMesh,
    updateWaterTime: (t: number) => {
      if (compiledWaterShader) {
        compiledWaterShader.uniforms.uWaterTime.value = t;
      }
    },
  };
}

export function buildOperatorModel(
  faction: FactionId,
  isEnemy = false
): OperatorRigRefs {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const uniformHex = isEnemy
    ? faction === FactionId.EAST
      ? '#3e4a3b'
      : '#5e5547'
    : faction === FactionId.EAST
      ? '#364538'
      : '#4e5649';

  const armorHex = isEnemy ? '#2b2525' : '#22282f';
  const accentHex = isEnemy ? '#ef4444' : faction === FactionId.EAST ? '#f59e0b' : '#38bdf8';

  const clothMat = new THREE.MeshStandardMaterial({
    color: uniformHex,
    roughness: 0.86,
    metalness: 0.05,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: armorHex,
    roughness: 0.48,
    metalness: 0.38,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#181d23',
    roughness: 0.25,
    metalness: 0.88,
  });
  const bladeMat = new THREE.MeshStandardMaterial({
    color: '#e2ebf5',
    roughness: 0.12,
    metalness: 0.96,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.42,
    roughness: 0.18,
    metalness: 0.78,
  });

  // Articulated Legs + Tactical Boots
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.14, 0.78, 0);
  const legGeo = new THREE.BoxGeometry(0.18, 0.64, 0.2);
  legGeo.translate(0, -0.32, 0);
  const bootGeo = new THREE.BoxGeometry(0.19, 0.16, 0.26);
  bootGeo.translate(0, -0.7, -0.02);

  const leftLegMesh = new THREE.Mesh(legGeo, clothMat);
  const leftBootMesh = new THREE.Mesh(bootGeo, plateMat);
  leftLegMesh.castShadow = true;
  leftLegPivot.add(leftLegMesh, leftBootMesh);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.14, 0.78, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, clothMat);
  const rightBootMesh = new THREE.Mesh(bootGeo, plateMat);
  rightLegMesh.castShadow = true;
  rightLegPivot.add(rightLegMesh, rightBootMesh);

  bodyGroup.add(leftLegPivot, rightLegPivot);

  // Torso + Plate Carrier + Hydration Pack
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.66, 0.27), clothMat);
  torsoMesh.position.set(0, 1.12, 0);
  torsoMesh.castShadow = true;
  bodyGroup.add(torsoMesh);

  const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.49, 0.33), plateMat);
  vestMesh.position.set(0, 1.15, 0);
  vestMesh.castShadow = true;
  bodyGroup.add(vestMesh);

  const packMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.14), clothMat);
  packMesh.position.set(0, 1.16, 0.21);
  packMesh.castShadow = true;
  bodyGroup.add(packMesh);

  for (let i = -1; i <= 1; i++) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.065), clothMat);
    pouch.position.set(i * 0.14, 1.05, -0.19);
    bodyGroup.add(pouch);
  }

  // Helmet + Quad-Tube NVG Mount + Visor
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.6, 0);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.26, 0.26), clothMat);
  const helmetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.175, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    plateMat
  );
  helmetMesh.position.y = 0.03;
  helmetMesh.castShadow = true;

  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.072, 0.06), visorMat);
  visorMesh.position.set(0, 0.015, -0.13);

  const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), steelMat);
  nvgMount.position.set(0, 0.1, -0.16);

  headGroup.add(headMesh, helmetMesh, visorMesh, nvgMount);
  bodyGroup.add(headGroup);

  // Sheathed High-Durability Sword on Back Scabbard
  const swordSheathedGroup = new THREE.Group();
  swordSheathedGroup.position.set(-0.14, 1.22, 0.26);
  swordSheathedGroup.rotation.z = -0.58;
  const scabbard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.88, 0.03), plateMat);
  const hiltBack = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 8), steelMat);
  hiltBack.position.y = 0.54;
  swordSheathedGroup.add(scabbard, hiltBack);
  bodyGroup.add(swordSheathedGroup);

  // Articulated Arms
  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.33, 1.38, 0);
  const armGeo = new THREE.BoxGeometry(0.145, 0.56, 0.145);
  armGeo.translate(0, -0.24, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, clothMat);
  rightArmMesh.castShadow = true;
  rightArmPivot.add(rightArmMesh);
  rightArmPivot.rotation.x = Math.PI * 0.42;

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.33, 1.38, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, clothMat);
  leftArmMesh.castShadow = true;
  leftArmPivot.add(leftArmMesh);
  leftArmPivot.rotation.x = Math.PI * 0.42;
  leftArmPivot.rotation.y = -0.26;

  bodyGroup.add(rightArmPivot, leftArmPivot);

  // Primary Firearm
  const rifleGroup = new THREE.Group();
  rifleGroup.position.set(-0.08, -0.48, -0.1);
  rifleGroup.rotation.x = -Math.PI * 0.42;

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.48), steelMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 10), steelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.43);
  const optic = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.14), plateMat);
  optic.position.set(0, 0.085, -0.05);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.2, 0.09), plateMat);
  mag.position.set(0, -0.13, -0.08);
  mag.rotation.x = 0.22;

  const muzzleNode = new THREE.Object3D();
  muzzleNode.position.set(0, 0.02, -0.66);
  rifleGroup.add(receiver, barrel, optic, mag, muzzleNode);
  rightArmPivot.add(rifleGroup);

  // Drawn High-Durability Tactical Sword + Slash Trail Arc
  const swordHeldGroup = new THREE.Group();
  swordHeldGroup.position.set(0, -0.48, -0.05);
  swordHeldGroup.rotation.x = -Math.PI * 0.35;
  swordHeldGroup.visible = false;

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.24, 10), plateMat);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.06), steelMat);
  guard.position.y = 0.12;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.88, 0.052), bladeMat);
  blade.position.y = 0.56;

  // Dynamic Cleave Arc Ribbon
  const swordTrailMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 1.55, 18, 1, -Math.PI * 0.35, Math.PI * 0.7),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  swordTrailMesh.rotation.x = -Math.PI / 2;
  swordTrailMesh.position.set(0, 1.15, -0.45);
  swordTrailMesh.visible = false;
  root.add(swordTrailMesh);

  swordHeldGroup.add(grip, guard, blade);
  rightArmPivot.add(swordHeldGroup);

  return {
    root,
    bodyGroup,
    rightArmPivot,
    leftArmPivot,
    leftLegPivot,
    rightLegPivot,
    rifleGroup,
    swordHeldGroup,
    swordSheathedGroup,
    swordTrailMesh,
    muzzleNode,
  };
}

export function buildFirstPersonViewmodel(faction: FactionId): FirstPersonViewmodelRefs {
  const root = new THREE.Group();
  const accentHex = faction === FactionId.EAST ? '#f59e0b' : '#38bdf8';

  const steelMat = new THREE.MeshStandardMaterial({
    color: faction === FactionId.EAST ? '#1a1f25' : '#38342e',
    roughness: 0.26,
    metalness: 0.88,
  });
  const polymerMat = new THREE.MeshStandardMaterial({
    color: faction === FactionId.EAST ? '#25292e' : '#574e3f',
    roughness: 0.64,
    metalness: 0.24,
  });
  const reticleGlow = new THREE.MeshBasicMaterial({ color: accentHex });
  const bladeMat = new THREE.MeshStandardMaterial({
    color: '#e2ebf5',
    roughness: 0.12,
    metalness: 0.97,
  });

  const rifleRig = new THREE.Group();
  rifleRig.position.set(0.24, -0.22, -0.44);

  const upperReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.095, 0.44), steelMat);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.078, 0.34), polymerMat);
  handguard.position.set(0, 0.005, -0.34);

  // Picatinny top rail ribs + PEQ-15 tactical laser box
  const peqBox = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.028, 0.095), polymerMat);
  peqBox.position.set(0.015, 0.055, -0.36);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 12), steelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.56);

  const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.18, 14), polymerMat);
  suppressor.rotation.x = Math.PI / 2;
  suppressor.position.set(0, 0.012, -0.72);

  const opticBase = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.025, 0.12), steelMat);
  opticBase.position.set(0, 0.06, -0.06);
  const opticHood = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.052, 0.09), polymerMat);
  opticHood.position.set(0, 0.092, -0.06);
  const holoDot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), reticleGlow);
  holoDot.position.set(0, 0.092, -0.06);

  const magazineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.21, 0.088), polymerMat);
  magazineMesh.position.set(0, -0.14, -0.09);
  magazineMesh.rotation.x = 0.2;

  const muzzleNode = new THREE.Object3D();
  muzzleNode.position.set(0, 0.012, -0.84);

  const muzzleFlashMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.24, 8),
    new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.92 })
  );
  muzzleFlashMesh.rotation.x = -Math.PI / 2;
  muzzleFlashMesh.position.copy(muzzleNode.position);
  muzzleFlashMesh.visible = false;

  rifleRig.add(
    upperReceiver,
    handguard,
    peqBox,
    barrel,
    suppressor,
    opticBase,
    opticHood,
    holoDot,
    magazineMesh,
    muzzleNode,
    muzzleFlashMesh
  );

  // 1st-Person High-Durability Tactical Sword Rig
  const swordRig = new THREE.Group();
  swordRig.position.set(0.32, -0.28, -0.48);
  swordRig.rotation.set(0.25, -0.35, 0.35);
  swordRig.visible = false;

  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.25, 12), polymerMat);
  const tsuba = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.065), steelMat);
  tsuba.position.y = 0.13;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.88, 0.052), bladeMat);
  blade.position.y = 0.57;
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.65, 0.014), steelMat);
  fuller.position.y = 0.49;

  const swordTrailMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.95, 14, 1, -Math.PI * 0.4, Math.PI * 0.8),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  swordTrailMesh.position.set(0, -0.1, -0.75);
  swordTrailMesh.rotation.x = Math.PI * 0.38;
  swordTrailMesh.visible = false;
  root.add(swordTrailMesh);

  swordRig.add(hilt, tsuba, blade, fuller);
  root.add(rifleRig, swordRig);

  return {
    root,
    rifleRig,
    magazineMesh,
    swordRig,
    swordTrailMesh,
    muzzleNode,
    muzzleFlashMesh,
  };
}

export function buildSquadCommandVehicle(
  faction: FactionId,
  matLib?: ProceduralMaterialLibrary
): CommandVehicleRefs {
  const root = new THREE.Group();

  const camoTex = matLib
    ? faction === FactionId.EAST
      ? matLib.camoEastAlbedo
      : matLib.camoWestAlbedo
    : undefined;

  const hullMat = new THREE.MeshStandardMaterial({
    color: camoTex ? '#ffffff' : faction === FactionId.EAST ? '#354236' : '#4a5246',
    map: camoTex,
    roughness: 0.62,
    metalness: 0.38,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: '#1b2026',
    roughness: 0.32,
    metalness: 0.84,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: '#15171a',
    roughness: 0.9,
    metalness: 0.06,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: '#fef08a',
    emissive: '#fef08a',
    emissiveIntensity: 0.75,
    roughness: 0.2,
  });
  const eraMat = new THREE.MeshStandardMaterial({
    color: faction === FactionId.EAST ? '#948160' : '#2e493a',
    roughness: 0.44,
    metalness: 0.54,
  });
  const apsMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    roughness: 0.26,
    metalness: 0.8,
  });

  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.95, 6.25), hullMat);
  lowerHull.position.set(0, 0.95, 0);
  lowerHull.castShadow = true;
  lowerHull.receiveShadow = true;
  root.add(lowerHull);

  const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.58, 5.45), hullMat);
  upperDeck.position.set(0, 1.62, 0.15);
  upperDeck.castShadow = true;
  root.add(upperDeck);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.52, 1.28), hullMat);
  glacis.position.set(0, 1.38, -2.76);
  glacis.rotation.x = 0.38;
  glacis.castShadow = true;
  root.add(glacis);

  // Armored LED Headlights & Whip Antenna
  for (const hx of [-0.95, 0.95]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.08), headlightMat);
    lamp.position.set(hx, 1.18, -3.14);
    root.add(lamp);
  }
  const whipAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 2.4, 6), darkMetalMat);
  whipAntenna.position.set(-1.05, 3.0, 2.3);
  root.add(whipAntenna);

  const wheels: THREE.Mesh[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.38, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.41, 12);
  hubGeo.rotateZ(Math.PI / 2);

  for (const za of [-2.15, -0.75, 0.75, 2.15]) {
    for (const side of [-1.39, 1.39]) {
      const w = new THREE.Mesh(wheelGeo, rubberMat);
      const hub = new THREE.Mesh(hubGeo, darkMetalMat);
      w.add(hub);
      w.position.set(side, 0.52, za);
      w.castShadow = true;
      root.add(w);
      wheels.push(w);
    }
  }

  const turretGroup = new THREE.Group();
  turretGroup.position.set(0, 2.05, -0.45);
  const turretBasket = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.94, 0.54, 12), hullMat);
  turretBasket.castShadow = true;
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, 2.4, 10), darkMetalMat);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0, 0.06, -1.45);
  const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.22), darkMetalMat);
  muzzleBrake.position.set(0, 0.06, -2.65);
  turretGroup.add(turretBasket, gunBarrel, muzzleBrake);
  root.add(turretGroup);

  // Dynamic Retrofit Groups
  const eraGroup = new THREE.Group();
  const eraTileGeo = new THREE.BoxGeometry(0.16, 0.36, 0.58);
  for (let i = 0; i < 8; i++) {
    const zPos = -2.3 + i * 0.66;
    const leftBrick = new THREE.Mesh(eraTileGeo, eraMat);
    leftBrick.position.set(-1.44, 1.18, zPos);
    leftBrick.rotation.z = 0.08;
    leftBrick.castShadow = true;

    const rightBrick = new THREE.Mesh(eraTileGeo, eraMat);
    rightBrick.position.set(1.44, 1.18, zPos);
    rightBrick.rotation.z = -0.08;
    rightBrick.castShadow = true;
    eraGroup.add(leftBrick, rightBrick);
  }
  for (let k = -2; k <= 2; k++) {
    const frontBrick = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.44), eraMat);
    frontBrick.position.set(k * 0.46, 1.55, -2.86);
    frontBrick.rotation.x = 0.38;
    eraGroup.add(frontBrick);
  }
  eraGroup.visible = false;
  root.add(eraGroup);

  const apsGroup = new THREE.Group();
  for (const side of [-0.96, 0.96]) {
    const radarPanel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.48), apsMat);
    radarPanel.position.set(side, 0.22, 0);
    const launcherDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 10), darkMetalMat);
    launcherDrum.position.set(side * 0.85, 0.44, 0.2);
    apsGroup.add(radarPanel, launcherDrum);
  }
  apsGroup.visible = false;
  turretGroup.add(apsGroup);

  const mastGroup = new THREE.Group();
  const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.78, 10), darkMetalMat);
  mastPole.position.set(-0.45, 0.58, 0.35);
  const flirBall = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), apsMat);
  flirBall.position.set(-0.45, 1.0, 0.35);
  mastGroup.add(mastPole, flirBall);
  mastGroup.visible = false;
  turretGroup.add(mastGroup);

  const atgmGroup = new THREE.Group();
  for (const yOff of [0.18, 0.42]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.25, 12), eraMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0.88, yOff, -0.15);
    atgmGroup.add(tube);
  }
  atgmGroup.visible = false;
  turretGroup.add(atgmGroup);

  return {
    root,
    turretGroup,
    eraGroup,
    apsGroup,
    mastGroup,
    atgmGroup,
    wheels,
  };
}

export function buildConvoySupplyTruck(enemyFaction: FactionId): THREE.Group {
  const group = new THREE.Group();
  const cabMat = new THREE.MeshStandardMaterial({
    color: enemyFaction === FactionId.WEST ? '#6e6451' : '#3d4a3a',
    roughness: 0.68,
    metalness: 0.32,
  });
  const tarpMat = new THREE.MeshStandardMaterial({
    color: enemyFaction === FactionId.WEST ? '#524b3d' : '#2d372b',
    roughness: 0.86,
    metalness: 0.08,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    roughness: 0.14,
    metalness: 0.86,
  });
  const wheelMat = new THREE.MeshStandardMaterial({
    color: '#17191c',
    roughness: 0.9,
    metalness: 0.08,
  });

  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.42, 1.78, 2.05), cabMat);
  cab.position.set(0, 1.4, -2.1);
  cab.castShadow = true;
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 0.08), glassMat);
  windshield.position.set(0, 1.82, -3.13);

  const cargoBed = new THREE.Mesh(new THREE.BoxGeometry(2.52, 2.08, 4.15), tarpMat);
  cargoBed.position.set(0, 1.64, 1.15);
  cargoBed.castShadow = true;

  const beaconStrip = new THREE.Mesh(
    new THREE.BoxGeometry(2.56, 0.16, 4.18),
    new THREE.MeshStandardMaterial({
      color: '#f59e0b',
      emissive: '#f59e0b',
      emissiveIntensity: 0.5,
      roughness: 0.3,
    })
  );
  beaconStrip.position.set(0, 2.7, 1.15);

  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const za of [-2.2, 0.3, 2.1]) {
    for (const sx of [-1.29, 1.29]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(sx, 0.5, za);
      w.castShadow = true;
      group.add(w);
    }
  }

  group.add(cab, windshield, cargoBed, beaconStrip);
  return group;
}

export function buildSalvageTechCrate(): THREE.Group {
  const group = new THREE.Group();
  const caseMat = new THREE.MeshStandardMaterial({
    color: '#2c3540',
    roughness: 0.42,
    metalness: 0.68,
  });
  const latchMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    emissive: '#f59e0b',
    emissiveIntensity: 0.65,
    roughness: 0.22,
    metalness: 0.82,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.78, 0.95), caseMat);
  body.position.y = 0.39;
  body.castShadow = true;

  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.16, 1.02), caseMat);
  lid.position.y = 0.82;

  const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 1.05), latchMat);
  strap1.position.set(-0.42, 0.46, 0);
  const strap2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 1.05), latchMat);
  strap2.position.set(0.42, 0.46, 0);

  group.add(body, lid, strap1, strap2);
  return group;
}

/**
 * Reinforced Steel-Truss River Bridge calibrated to match sampleWalkableHeight(x, z)
 * so top deck surface sits cleanly at RIVER_WATER_LEVEL + 2.75 (+1.10m world Y).
 */
export function buildRiverBridge(matLib?: ProceduralMaterialLibrary): THREE.Group {
  const bridge = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({
    color: '#565d68',
    bumpMap: matLib?.concreteBump,
    bumpScale: 0.15,
    roughness: 0.82,
    metalness: 0.14,
  });
  const girderMat = new THREE.MeshStandardMaterial({
    color: '#28303a',
    roughness: 0.42,
    metalness: 0.76,
  });

  // Main Deck: top face at y = 2.75 relative to bridge root at RIVER_WATER_LEVEL
  const deck = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.6, 28.0), concreteMat);
  deck.position.y = 2.45;
  deck.castShadow = true;
  deck.receiveShadow = true;
  bridge.add(deck);

  // Graded North & South Approach Ramps spanning z = ±[14.0 .. 24.5]
  const northRamp = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.55, 11.2), concreteMat);
  northRamp.position.set(0, 1.65, -19.2);
  northRamp.rotation.x = 0.16;
  northRamp.receiveShadow = true;

  const southRamp = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.55, 11.2), concreteMat);
  southRamp.position.set(0, 1.65, 19.2);
  southRamp.rotation.x = -0.16;
  southRamp.receiveShadow = true;
  bridge.add(northRamp, southRamp);

  // Overhead Steel Truss Arch, Approach Ramp Side Curbs & Guardrails
  for (const sx of [-4.15, 4.15]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.25, 28.0), girderMat);
    rail.position.set(sx, 3.35, 0);
    rail.castShadow = true;

    const northRampRail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 11.0), girderMat);
    northRampRail.position.set(sx, 2.15, -19.2);
    northRampRail.rotation.x = 0.16;
    northRampRail.castShadow = true;

    const southRampRail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 11.0), girderMat);
    southRampRail.position.set(sx, 2.15, 19.2);
    southRampRail.rotation.x = -0.16;
    southRampRail.castShadow = true;

    const topChord = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 22.0), girderMat);
    topChord.position.set(sx, 5.65, 0);
    bridge.add(rail, northRampRail, southRampRail, topChord);

    for (let zt = -10; zt <= 10; zt += 5) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.1, 0.26), girderMat);
      strut.position.set(sx, 4.2, zt);
      bridge.add(strut);
    }
  }

  // Cross Overhead Struts
  for (const zc of [-8, 0, 8]) {
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.28, 0.32), girderMat);
    crossBeam.position.set(0, 5.65, zc);
    bridge.add(crossBeam);
  }

  for (const sz of [-8.8, 8.8]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(7.6, 6.8, 1.5), concreteMat);
    pier.position.set(0, -0.8, sz);
    bridge.add(pier);
  }

  return bridge;
}

/**
 * Builds landmark-specific detailed tactical architecture (SAM/Radar Battery, Heavy Logistics Depot,
 * Ruined Valley Compound, Highway Checkpoint, or Command Bunker) with deep concrete foundations
 * so sloped terrain never leaves floating underside gaps.
 */
export function buildLandmarkComplex(
  lm: TheaterLandmark,
  matLib?: ProceduralMaterialLibrary
): { group: THREE.Group; rotatingDish?: THREE.Object3D } {
  const group = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({
    color: '#4a515b',
    bumpMap: matLib?.concreteBump,
    bumpScale: 0.18,
    roughness: 0.84,
    metalness: 0.12,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#252c35',
    roughness: 0.36,
    metalness: 0.82,
  });
  const oliveMat = new THREE.MeshStandardMaterial({
    color: '#3c4a3b',
    roughness: 0.65,
    metalness: 0.32,
  });
  const containerRedMat = new THREE.MeshStandardMaterial({
    color: '#6e322d',
    roughness: 0.62,
    metalness: 0.42,
  });
  const containerBlueMat = new THREE.MeshStandardMaterial({
    color: '#2a465e',
    roughness: 0.62,
    metalness: 0.42,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    emissive: '#f59e0b',
    emissiveIntensity: 0.45,
    roughness: 0.3,
  });

  let rotatingDish: THREE.Object3D | undefined;

  if (lm.kind === 'SAM_SITE') {
    // Concrete Revetment Pad + Rotating Surveillance Radar + Quad SAM Canisters
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.4, 1.9, 12), concreteMat);
    pad.position.y = -0.45;
    pad.receiveShadow = true;

    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.6), oliveMat);
    pedestal.position.set(-1.6, 1.35, 0);
    pedestal.castShadow = true;

    const samPod = new THREE.Group();
    samPod.position.set(-1.6, 3.05, 0);
    samPod.rotation.x = -0.48;
    for (const cx of [-0.45, 0.45]) {
      for (const cy of [-0.35, 0.35]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.8, 12), oliveMat);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(cx, cy, 0);
        tube.castShadow = true;
        samPod.add(tube);
      }
    }

    const radarTower = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.62, 6.0, 8), steelMat);
    radarTower.position.set(2.4, 3.0, -1.2);
    radarTower.castShadow = true;

    const dishPivot = new THREE.Group();
    dishPivot.position.set(2.4, 6.2, -1.2);
    const radarArray = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 0.35), hazardMat);
    dishPivot.add(radarArray);
    rotatingDish = dishPivot;

    group.add(pad, pedestal, samPod, radarTower, dishPivot);
  } else if (lm.kind === 'DEPOT') {
    // Logistics Warehouse + Cylindrical Fuel Tanks + Stacked ISO Shipping Containers
    const warehouse = new THREE.Mesh(new THREE.BoxGeometry(9.2, 5.6, 6.4), concreteMat);
    warehouse.position.set(0, 1.4, 0);
    warehouse.castShadow = true;
    warehouse.receiveShadow = true;

    const roof = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.4, 6.8), steelMat);
    roof.position.set(0, 4.3, 0);

    const contPlinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 6.1), concreteMat);
    contPlinth.position.set(-7.2, -0.7, 1.2);

    const cont1 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 6.0), containerRedMat);
    cont1.position.set(-7.2, 1.3, 1.2);
    cont1.castShadow = true;

    const cont2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 6.0), containerBlueMat);
    cont2.position.set(-7.2, 3.9, 1.2);
    cont2.castShadow = true;

    for (const tz of [-1.8, 1.8]) {
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.8, 1.9), concreteMat);
      saddle.position.set(7.6, -0.3, tz);

      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 4.8, 16), steelMat);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(7.6, 1.45, tz);
      tank.castShadow = true;
      group.add(saddle, tank);
    }

    group.add(warehouse, roof, contPlinth, cont1, cont2);
  } else if (lm.kind === 'VILLAGE') {
    // Two-Story Concrete Tactical Compound + Courtyard Cover Walls
    const bldgA = new THREE.Mesh(new THREE.BoxGeometry(7.4, 6.8, 5.8), concreteMat);
    bldgA.position.set(-2.2, 2.0, -1.5);
    bldgA.castShadow = true;
    bldgA.receiveShadow = true;

    const bldgB = new THREE.Mesh(new THREE.BoxGeometry(5.2, 4.8, 5.2), concreteMat);
    bldgB.position.set(5.4, 1.0, 2.4);
    bldgB.castShadow = true;
    bldgB.receiveShadow = true;

    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(8.5, 3.0, 0.65), concreteMat);
    wall1.position.set(1.2, 0.1, 6.2);
    wall1.castShadow = true;

    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.0, 7.2), concreteMat);
    wall2.position.set(-6.5, 0.1, 2.8);
    wall2.castShadow = true;

    group.add(bldgA, bldgB, wall1, wall2);
  } else if (lm.kind === 'CHECKPOINT') {
    // Armored Guard Booth + Concrete Jersey Barriers + Floodlight Mast
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.8, 4.1, 2.8), concreteMat);
    booth.position.set(0, 0.65, 0);
    booth.castShadow = true;

    const lightMast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 6.6, 8), steelMat);
    lightMast.position.set(-1.6, 1.9, -1.4);
    const floodLamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.3), hazardMat);
    floodLamp.position.set(-1.6, 5.2, -1.4);

    for (const bx of [-3.6, 3.6]) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.45, 0.85), concreteMat);
      barrier.position.set(bx, -0.18, -2.6);
      barrier.castShadow = true;
      group.add(barrier);
    }

    group.add(booth, lightMast, floodLamp);
  } else {
    // Hardened Command Outpost Bunker + Rotating Comms Dish + HESCO Bastions
    const bunker = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.6, 5.4), concreteMat);
    bunker.position.y = 0.9;
    bunker.castShadow = true;
    bunker.receiveShadow = true;

    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.45, 5.9), steelMat);
    roof.position.y = 3.35;
    roof.castShadow = true;

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3.6, 8), steelMat);
    mast.position.set(1.8, 5.3, -1.2);

    const dishPivot = new THREE.Group();
    dishPivot.position.set(1.8, 6.9, -1.2);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.38),
      concreteMat
    );
    dish.rotation.x = Math.PI * 0.38;
    dishPivot.add(dish);
    rotatingDish = dishPivot;

    const hesco1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.95, 1.15), concreteMat);
    hesco1.position.set(-4.2, 0.08, 4.5);
    hesco1.castShadow = true;
    hesco1.receiveShadow = true;

    const hesco2 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.95, 4.4), concreteMat);
    hesco2.position.set(4.9, 0.08, 3.2);
    hesco2.castShadow = true;
    hesco2.receiveShadow = true;

    group.add(bunker, roof, mast, dishPivot, hesco1, hesco2);
  }

  return { group, rotatingDish };
}

/**
 * Registers exact 3D non-phaseable solid colliders (OBBs & Cylinders) for every individual
 * building, wall, container, fuel tank, HESCO barrier, radar mast, bridge deck, guardrail,
 * truss beam, and concrete river pier so Players, NPCs, Vehicles, and Projectiles cannot pass through.
 */
export function registerLandmarkAndBridgeColliders(
  lm: TheaterLandmark,
  baseY: number,
  physics: StaticWorldPhysics
): void {
  const yaw = lm.rotationY;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  const toWorld = (lx: number, lz: number): { x: number; z: number } => ({
    x: lm.x + lx * cosY + lz * sinY,
    z: lm.z - lx * sinY + lz * cosY,
  });

  if (lm.kind === 'BRIDGE') {
    // Main concrete bridge deck slab (blocks vertical shots & provides overhead ceiling in river)
    physics.addBox({
      id: `${lm.id}-deck`,
      cx: lm.x,
      cz: lm.z,
      widthX: 8.7,
      depthZ: 28.0,
      minY: baseY + 2.15,
      maxY: baseY + 2.75,
      material: 'CONCRETE',
      walkableTop: true,
    });

    // Left & right steel truss guardrails, approach ramp curbs, vertical struts & top chords
    for (const sx of [-4.15, 4.15]) {
      const sideTag = sx < 0 ? 'L' : 'R';
      physics.addBox({
        id: `${lm.id}-rail-${sideTag}`,
        cx: lm.x + sx,
        cz: lm.z,
        widthX: 0.48,
        depthZ: 28.2,
        minY: baseY + 2.65,
        maxY: baseY + 4.1,
        material: 'STEEL',
        walkableTop: false,
      });

      for (const sz of [-19.2, 19.2]) {
        physics.addBox({
          id: `${lm.id}-ramp-curb-${sideTag}-${sz < 0 ? 'N' : 'S'}`,
          cx: lm.x + sx,
          cz: lm.z + sz,
          widthX: 0.48,
          depthZ: 11.0,
          minY: baseY + 0.35,
          maxY: baseY + 3.25,
          material: 'STEEL',
          walkableTop: false,
        });
      }

      physics.addBox({
        id: `${lm.id}-chord-${sideTag}`,
        cx: lm.x + sx,
        cz: lm.z,
        widthX: 0.38,
        depthZ: 22.0,
        minY: baseY + 5.48,
        maxY: baseY + 5.82,
        material: 'STEEL',
        walkableTop: false,
      });

      for (let zt = -10; zt <= 10; zt += 5) {
        physics.addBox({
          id: `${lm.id}-strut-${sideTag}-${zt}`,
          cx: lm.x + sx,
          cz: lm.z + zt,
          widthX: 0.36,
          depthZ: 0.36,
          minY: baseY + 4.0,
          maxY: baseY + 5.8,
          material: 'STEEL',
          walkableTop: false,
        });
      }
    }

    // Overhead lateral steel crossbeams
    for (const zc of [-8, 0, 8]) {
      physics.addBox({
        id: `${lm.id}-crossbeam-${zc}`,
        cx: lm.x,
        cz: lm.z + zc,
        widthX: 8.6,
        depthZ: 0.38,
        minY: baseY + 5.5,
        maxY: baseY + 5.82,
        material: 'STEEL',
        walkableTop: false,
      });
    }

    // Concrete river support piers
    for (const sz of [-8.8, 8.8]) {
      physics.addBox({
        id: `${lm.id}-pier-${sz < 0 ? 'N' : 'S'}`,
        cx: lm.x,
        cz: lm.z + sz,
        widthX: 7.6,
        depthZ: 1.55,
        minY: baseY - 4.2,
        maxY: baseY + 2.55,
        material: 'CONCRETE',
        walkableTop: false,
      });
    }
    return;
  }

  if (lm.kind === 'SAM_SITE') {
    physics.addCylinder({
      id: `${lm.id}-pad`,
      cx: lm.x,
      cz: lm.z,
      radius: 5.9,
      minY: baseY - 1.5,
      maxY: baseY + 0.5,
      material: 'CONCRETE',
      walkableTop: true,
    });

    const launcherPos = toWorld(-1.6, 0);
    physics.addBox({
      id: `${lm.id}-launcher`,
      cx: launcherPos.x,
      cz: launcherPos.z,
      widthX: 2.75,
      depthZ: 3.85,
      minY: baseY - 0.5,
      maxY: baseY + 4.25,
      yaw,
      material: 'STEEL',
      walkableTop: false,
    });

    const radarPos = toWorld(2.4, -1.2);
    physics.addCylinder({
      id: `${lm.id}-radar`,
      cx: radarPos.x,
      cz: radarPos.z,
      radius: 0.68,
      minY: baseY - 0.5,
      maxY: baseY + 6.8,
      material: 'STEEL',
      walkableTop: false,
    });
  } else if (lm.kind === 'DEPOT') {
    physics.addBox({
      id: `${lm.id}-warehouse`,
      cx: lm.x,
      cz: lm.z,
      widthX: 9.5,
      depthZ: 6.7,
      minY: baseY - 1.5,
      maxY: baseY + 4.55,
      yaw,
      material: 'CONCRETE',
      walkableTop: true,
    });

    const contPos = toWorld(-7.2, 1.2);
    physics.addBox({
      id: `${lm.id}-containers`,
      cx: contPos.x,
      cz: contPos.z,
      widthX: 2.62,
      depthZ: 6.12,
      minY: baseY - 1.5,
      maxY: baseY + 5.25,
      yaw,
      material: 'STEEL',
      walkableTop: true,
    });

    for (const tz of [-1.8, 1.8]) {
      const tankPos = toWorld(7.6, tz);
      physics.addBox({
        id: `${lm.id}-tank-${tz < 0 ? '1' : '2'}`,
        cx: tankPos.x,
        cz: tankPos.z,
        widthX: 4.86,
        depthZ: 2.66,
        cornerRadius: 0.42,
        minY: baseY - 1.2,
        maxY: baseY + 2.8,
        yaw,
        material: 'STEEL',
        walkableTop: false,
      });
    }
  } else if (lm.kind === 'VILLAGE') {
    const posA = toWorld(-2.2, -1.5);
    physics.addBox({
      id: `${lm.id}-bldgA`,
      cx: posA.x,
      cz: posA.z,
      widthX: 7.48,
      depthZ: 5.88,
      minY: baseY - 1.5,
      maxY: baseY + 5.45,
      yaw,
      material: 'CONCRETE',
      walkableTop: true,
    });

    const posB = toWorld(5.4, 2.4);
    physics.addBox({
      id: `${lm.id}-bldgB`,
      cx: posB.x,
      cz: posB.z,
      widthX: 5.28,
      depthZ: 5.28,
      minY: baseY - 1.5,
      maxY: baseY + 3.45,
      yaw,
      material: 'CONCRETE',
      walkableTop: true,
    });

    const w1 = toWorld(1.2, 6.2);
    physics.addBox({
      id: `${lm.id}-wall1`,
      cx: w1.x,
      cz: w1.z,
      widthX: 8.56,
      depthZ: 0.72,
      minY: baseY - 1.5,
      maxY: baseY + 1.62,
      yaw,
      material: 'CONCRETE',
      walkableTop: true,
    });

    const w2 = toWorld(-6.5, 2.8);
    physics.addBox({
      id: `${lm.id}-wall2`,
      cx: w2.x,
      cz: w2.z,
      widthX: 0.72,
      depthZ: 7.26,
      minY: baseY - 1.5,
      maxY: baseY + 1.62,
      yaw,
      material: 'CONCRETE',
      walkableTop: true,
    });
  } else if (lm.kind === 'CHECKPOINT') {
    physics.addBox({
      id: `${lm.id}-booth`,
      cx: lm.x,
      cz: lm.z,
      widthX: 2.88,
      depthZ: 2.88,
      minY: baseY - 1.5,
      maxY: baseY + 2.75,
      yaw,
      material: 'CONCRETE',
      walkableTop: true,
    });

    const mastPos = toWorld(-1.6, -1.4);
    physics.addCylinder({
      id: `${lm.id}-lightmast`,
      cx: mastPos.x,
      cz: mastPos.z,
      radius: 0.24,
      minY: baseY - 1.5,
      maxY: baseY + 5.35,
      material: 'STEEL',
      walkableTop: false,
    });

    for (const bx of [-3.6, 3.6]) {
      const barPos = toWorld(bx, -2.6);
      physics.addBox({
        id: `${lm.id}-barrier-${bx < 0 ? 'L' : 'R'}`,
        cx: barPos.x,
        cz: barPos.z,
        widthX: 2.46,
        depthZ: 0.9,
        minY: baseY - 1.5,
        maxY: baseY + 1.08,
        yaw,
        material: 'CONCRETE',
        walkableTop: true,
      });
    }
  } else {
    // OUTPOST: Hardened Bunker + Rooftop Mast + HESCO Bastions
    physics.addBox({
      id: `${lm.id}-bunker`,
      cx: lm.x,
      cz: lm.z,
      widthX: 7.25,
      depthZ: 5.85,
      minY: baseY - 1.5,
      maxY: baseY + 3.6,
      yaw,
      material: 'CONCRETE',
      walkableTop: true,
    });

    const mastPos = toWorld(1.8, -1.2);
    physics.addCylinder({
      id: `${lm.id}-mast`,
      cx: mastPos.x,
      cz: mastPos.z,
      radius: 0.42,
      minY: baseY + 3.4,
      maxY: baseY + 7.6,
      material: 'STEEL',
      walkableTop: false,
    });

    const h1 = toWorld(-4.2, 4.5);
    physics.addBox({
      id: `${lm.id}-hesco1`,
      cx: h1.x,
      cz: h1.z,
      widthX: 4.46,
      depthZ: 1.22,
      minY: baseY - 1.5,
      maxY: baseY + 1.58,
      yaw,
      material: 'CONCRETE',
      walkableTop: true,
    });

    const h2 = toWorld(4.9, 3.2);
    physics.addBox({
      id: `${lm.id}-hesco2`,
      cx: h2.x,
      cz: h2.z,
      widthX: 1.22,
      depthZ: 4.46,
      minY: baseY - 1.5,
      maxY: baseY + 1.58,
      yaw,
      material: 'CONCRETE',
      walkableTop: true,
    });
  }
}
