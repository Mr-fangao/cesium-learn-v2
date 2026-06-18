/**
 * ShaderWater 逻辑 — Material fabric 动态水域
 *
 * 波浪: 主浪 8 方向 + 细浪 6 方向，对角线传播
 * 光学: Fresnel (Schlick) + 波峰增亮
 */

import { createDemoGui } from '@/shared/gui'

export interface WaterSettings {
  amplitude: number
  frequency: number
  speed: number
  fresnelPower: number
  shallowColor: string
  deepColor: string
  alpha: number
}

/* ================================================================
 * GLSL 着色器
 * ================================================================ */

export const SHADER_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);

  vec3 V = normalize(materialInput.positionToEyeEC);
  vec3 N = normalize(materialInput.normalEC);
  vec2 uv = materialInput.st;

  float A = uAmplitude;
  float F = uFrequency;
  float t = uTime * uSpeed;

  // === 两层波浪叠加 ===
  float h = 0.0, gx = 0.0, gy = 0.0;

  // —— 主浪层 (8 dir) ——
  for (int i = 0; i < 8; i++) {
    float angle = 6.283185307 * float(i) / 8.0 + 0.28 * float(i);
    vec2 dir = vec2(cos(angle), sin(angle));
    float Fi = F * (0.85 + 0.3 * float(i) / 7.0);
    float Si = 0.55 + 0.45 * sin(float(i) * 1.7);
    float w  = 0.35;

    float phase = Fi * dot(uv, dir) + t * Si;
    h  += w * sin(phase);
    gx += w * Fi * dir.x * cos(phase);
    gy += w * Fi * dir.y * cos(phase);
  }

  // —— 细浪层 (6 dir) ——
  for (int j = 0; j < 6; j++) {
    float angle = 6.283185307 * float(j) / 6.0 + 1.2;
    vec2 dir = vec2(cos(angle), sin(angle));
    float Fi = F * 3.2 * (0.9 + 0.2 * float(j) / 5.0);
    float Si = 1.3 + 0.5 * cos(float(j) * 2.1);
    float w  = 0.08;

    float phase = Fi * dot(uv, dir) + t * Si;
    h  += w * sin(phase);
    gx += w * Fi * dir.x * cos(phase);
    gy += w * Fi * dir.y * cos(phase);
  }

  h  *= A;
  gx *= A;
  gy *= A;

  // === 法线扰动 ===
  float bump = 0.1;
  vec3 waveN = normalize(N + vec3(-gx * bump, -gy * bump, 0.0));

  // === Fresnel (Schlick) ===
  float NdotV = abs(dot(waveN, V));
  float fresnel = pow(1.0 - NdotV, uFresnelPower);

  // === 颜色 ===
  vec3 shallowColor = vec3(uShallowR, uShallowG, uShallowB);
  vec3 deepColor    = vec3(uDeepR, uDeepG, uDeepB);
  vec3 waterColor   = mix(deepColor, shallowColor, fresnel);

  // 波峰微亮（模拟泡沫/高光）
  float crest = smoothstep(0.0, 1.5, h + 0.5);
  waterColor = mix(waterColor, waterColor * 1.25, crest * 0.25);

  material.diffuse = waterColor;
  material.alpha   = uAlpha;

  return material;
}
`

/* ================================================================
 * 构建
 * ================================================================ */

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  }
}

export function buildMaterial(C: any, settings: WaterSettings) {
  const s = hexToRgb(settings.shallowColor)
  const d = hexToRgb(settings.deepColor)
  return new C.Material({
    fabric: {
      type: 'WaterCustom',
      uniforms: {
        uTime: 0.0,
        uAmplitude: settings.amplitude,
        uFrequency: settings.frequency,
        uSpeed: settings.speed,
        uFresnelPower: settings.fresnelPower,
        uAlpha: settings.alpha,
        uShallowR: s.r, uShallowG: s.g, uShallowB: s.b,
        uDeepR: d.r, uDeepG: d.g, uDeepB: d.b,
      },
      source: SHADER_SOURCE,
    },
  })
}

export function buildPrimitive(
  viewer: Cesium.Viewer,
  C: any,
  settings: WaterSettings,
): { primitive: any; material: any; timeUpdater: () => void } {
  const material = buildMaterial(C, settings)

  const rect = C.Rectangle.fromDegrees(115.5, 39.0, 117.5, 40.5)
  const geometry = new C.RectangleGeometry({
    rectangle: rect,
    vertexFormat: C.VertexFormat.ALL,
    height: 1,
    granularity: 0.05 * (Math.PI / 180),
  })

  const instance = new C.GeometryInstance({ geometry, id: 'water-surface' })

  const appearance = new C.EllipsoidSurfaceAppearance({
    aboveGround: false,
    material,
    translucent: true,
  })

  const primitive = new C.Primitive({
    geometryInstances: [instance],
    appearance,
    asynchronous: false,
  })

  viewer.scene.primitives.add(primitive)

  const start = performance.now()
  const timeUpdater = () => {
    if (material && !material.isDestroyed?.()) {
      material.uniforms.uTime = (performance.now() - start) / 1000.0
    }
  }
  viewer.scene.preUpdate.addEventListener(timeUpdater)

  return { primitive, material, timeUpdater }
}

export function setupGUI(stage: HTMLElement, settings: WaterSettings, onChange: () => void) {
  const gui = createDemoGui(stage)
  gui.add(settings, 'amplitude', 0.0, 2.0).name('波幅').onChange(onChange)
  gui.add(settings, 'frequency', 3, 30).name('频率').onChange(onChange)
  gui.add(settings, 'speed', 0.1, 3.0).name('速度').onChange(onChange)
  gui.add(settings, 'fresnelPower', 0.5, 5.0).name('Fresnel 强度').onChange(onChange)
  gui.add(settings, 'alpha', 0.3, 1.0).name('透明度').onChange(onChange)
  gui.addColor(settings, 'shallowColor').name('浅水色').onChange(onChange)
  gui.addColor(settings, 'deepColor').name('深水色').onChange(onChange)
  return gui
}
