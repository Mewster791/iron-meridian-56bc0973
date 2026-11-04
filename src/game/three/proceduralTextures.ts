import * as THREE from 'three';

export enum AtmospherePreset {
  ALPINE_DAYLIGHT = 'ALPINE_DAYLIGHT',
  GOLDEN_DUSK = 'GOLDEN_DUSK',
  OVERCAST_STORM = 'OVERCAST_STORM',
  NIGHT_NVG = 'NIGHT_NVG',
}

export interface AtmosphereConfig {
  label: string;
  skyZenith: string;
  skyHorizon: string;
  sunColor: string;
  sunIntensity: number;
  sunPosition: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogDensity: number;
  exposure: number;
}

export const ATMOSPHERE_CONFIGS: Record<AtmospherePreset, AtmosphereConfig> = {
  [AtmospherePreset.ALPINE_DAYLIGHT]: {
    label: 'Alpine Daylight',
    skyZenith: '#2c537a',
    skyHorizon: '#9cb4c9',
    sunColor: '#fff3db',
    sunIntensity: 2.35,
    sunPosition: [75, 105, 48],
    hemiSky: '#b9d6f2',
    hemiGround: '#3a4635',
    hemiIntensity: 0.88,
    fogColor: '#95adc2',
    fogDensity: 0.0036,
    exposure: 1.08,
  },
  [AtmospherePreset.GOLDEN_DUSK]: {
    label: 'Golden Dusk',
    skyZenith: '#1e2c4a',
    skyHorizon: '#d98a5b',
    sunColor: '#ffab5e',
    sunIntensity: 2.6,
    sunPosition: [-110, 36, 65],
    hemiSky: '#f0b284',
    hemiGround: '#2d2823',
    hemiIntensity: 0.72,
    fogColor: '#b88268',
    fogDensity: 0.0044,
    exposure: 1.05,
  },
  [AtmospherePreset.OVERCAST_STORM]: {
    label: 'Overcast Storm',
    skyZenith: '#2a333d',
    skyHorizon: '#63707d',
    sunColor: '#cbd8e6',
    sunIntensity: 1.35,
    sunPosition: [30, 95, -40],
    hemiSky: '#8fa1b3',
    hemiGround: '#29302a',
    hemiIntensity: 0.95,
    fogColor: '#616e7a',
    fogDensity: 0.0062,
    exposure: 1.02,
  },
  [AtmospherePreset.NIGHT_NVG]: {
    label: 'Night Ops (Phosphor)',
    skyZenith: '#051310',
    skyHorizon: '#103028',
    sunColor: '#6ee7b7',
    sunIntensity: 1.15,
    sunPosition: [-50, 85, -50],
    hemiSky: '#34d399',
    hemiGround: '#091c16',
    hemiIntensity: 0.78,
    fogColor: '#0c261f',
    fogDensity: 0.0048,
    exposure: 1.25,
  },
};

/**
 * Builds a procedural atmospheric sky dome shader with Rayleigh/Mie horizon glow,
 * solar disc, and high-altitude stratocumulus wisps (zero external HDRI/404s).
 */
export function createProceduralSkyDome(): {
  mesh: THREE.Mesh;
  uniforms: {
    uZenithColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uSunColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uTime: { value: number };
  };
} {
  const uniforms = {
    uZenithColor: { value: new THREE.Color('#2c537a') },
    uHorizonColor: { value: new THREE.Color('#9cb4c9') },
    uSunColor: { value: new THREE.Color('#fff3db') },
    uSunDir: { value: new THREE.Vector3(75, 105, 48).normalize() },
    uTime: { value: 0 },
  };

  const skyGeo = new THREE.SphereGeometry(410, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uTime;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float elev = clamp(dir.y, 0.0, 1.0);
        float horizonCurve = pow(1.0 - elev, 2.3);
        vec3 col = mix(uZenithColor, uHorizonColor, horizonCurve);

        // Subtle high-altitude cloud wisps
        if (dir.y > 0.04) {
          vec2 cloudUv = dir.xz / (dir.y + 0.18) * 1.6 + vec2(uTime * 0.008, uTime * 0.004);
          float c = noise(cloudUv) * 0.6 + noise(cloudUv * 2.3) * 0.4;
          float cloudMask = smoothstep(0.54, 0.82, c) * smoothstep(0.04, 0.28, dir.y);
          col = mix(col, mix(uHorizonColor, vec3(1.0), 0.35), cloudMask * 0.26);
        }

        // Solar Mie scatter halo & crisp sun disc
        float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSunColor * pow(sunAmt, 12.0) * 0.25;
        col += uSunColor * smoothstep(0.9982, 0.9996, sunAmt) * 1.1;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(skyGeo, skyMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

export interface ProceduralMaterialLibrary {
  terrainDetailBump: THREE.DataTexture;
  camoEastAlbedo: THREE.CanvasTexture;
  camoWestAlbedo: THREE.CanvasTexture;
  concreteBump: THREE.DataTexture;
  dispose: () => void;
}

export function createProceduralMaterialLibrary(
  maxAnisotropy: number
): ProceduralMaterialLibrary {
  // 1. High-frequency organic terrain micro-bump map (granite/soil grain)
  const size = 256;
  const bumpData = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const n1 = Math.sin(x * 0.35) * Math.cos(y * 0.35) * 28;
      const n2 = (((x * 73856093) ^ (y * 19349663)) & 63) - 31;
      const v = Math.max(0, Math.min(255, 128 + n1 + n2));
      bumpData[idx] = v;
      bumpData[idx + 1] = v;
      bumpData[idx + 2] = v;
      bumpData[idx + 3] = 255;
    }
  }
  const terrainDetailBump = new THREE.DataTexture(bumpData, size, size);
  terrainDetailBump.wrapS = THREE.RepeatWrapping;
  terrainDetailBump.wrapT = THREE.RepeatWrapping;
  terrainDetailBump.repeat.set(44, 44);
  terrainDetailBump.anisotropy = maxAnisotropy;
  terrainDetailBump.needsUpdate = true;

  // 2. Concrete & HESCO Bastion Weave Bump Map
  const concSize = 128;
  const concData = new Uint8Array(concSize * concSize * 4);
  for (let y = 0; y < concSize; y++) {
    for (let x = 0; x < concSize; x++) {
      const idx = (y * concSize + x) * 4;
      const gridLine = x % 16 === 0 || y % 16 === 0 ? -36 : 0;
      const grain = (((x * 331) ^ (y * 977)) & 31) - 15;
      const v = Math.max(0, Math.min(255, 136 + gridLine + grain));
      concData[idx] = v;
      concData[idx + 1] = v;
      concData[idx + 2] = v;
      concData[idx + 3] = 255;
    }
  }
  const concreteBump = new THREE.DataTexture(concData, concSize, concSize);
  concreteBump.wrapS = THREE.RepeatWrapping;
  concreteBump.wrapT = THREE.RepeatWrapping;
  concreteBump.repeat.set(3, 2);
  concreteBump.needsUpdate = true;

  // 3. Tactical Vehicle Digital Splinter Camo Textures (sRGB)
  const buildCamo = (base: string, patchA: string, patchB: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 48; i++) {
        ctx.fillStyle = i % 2 === 0 ? patchA : patchB;
        const px = ((i * 53) % 240);
        const py = ((i * 97) % 240);
        const pw = 24 + (i % 4) * 12;
        const ph = 14 + (i % 3) * 10;
        ctx.fillRect(px, py, pw, ph);
      }
      // Subtle armor panel weld seams
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, 248, 248);
      ctx.beginPath();
      ctx.moveTo(0, 128);
      ctx.lineTo(256, 128);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  const camoEastAlbedo = buildCamo('#334235', '#243026', '#4a5744');
  const camoWestAlbedo = buildCamo('#525849', '#3d4237', '#6e6956');

  return {
    terrainDetailBump,
    camoEastAlbedo,
    camoWestAlbedo,
    concreteBump,
    dispose: () => {
      terrainDetailBump.dispose();
      camoEastAlbedo.dispose();
      camoWestAlbedo.dispose();
      concreteBump.dispose();
    },
  };
}
