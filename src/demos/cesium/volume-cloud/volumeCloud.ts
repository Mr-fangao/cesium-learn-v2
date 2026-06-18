/**
 * VolumeCloud 逻辑 — 体渲染云层 Stacked Texture Slices
 *
 * 数据管线:
 *   生产: GRIB2/NetCDF → Python xarray → PNG 堆叠纹理 → Cesium
 *   Demo: JS fBm 噪声 → Canvas → Material texture2D → GPU
 */

import { createDemoGui } from '@/shared/gui'

export interface CloudSettings {
  layerCount: number
  totalThickness: number
  textureSize: number
  opacity: number
  coverage: number
  baseAltitude: number
}

/* ================================================================
 * fBm 噪声生成器（等同生产管线中 Python → PNG 这一步）
 * ================================================================ */

function hash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453
  return n - Math.floor(n)
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n00 = hash(ix, iy, seed)
  const n10 = hash(ix + 1, iy, seed)
  const n01 = hash(ix, iy + 1, seed)
  const n11 = hash(ix + 1, iy + 1, seed)
  return n00 + (n10 - n00) * sx + (n01 - n00) * sy + (n11 - n01 - n10 + n00) * sx * sy
}

function fbm(x: number, y: number, seed: number): number {
  let v = 0, a = 0.5, f = 1.0
  for (let i = 0; i < 5; i++) {
    v += a * smoothNoise(x * f, y * f, seed + i * 100)
    f *= 2.1; a *= 0.55
  }
  return v
}

export function generateCloudTexture(
  layerIndex: number, totalLayers: number, coverage: number, textureSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = textureSize
  canvas.height = textureSize
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(textureSize, textureSize)

  const seed = layerIndex * 0.73 * 1000
  const t = totalLayers > 1 ? layerIndex / (totalLayers - 1) : 0
  const threshold = (1.0 - coverage) + t * 0.15

  for (let py = 0; py < textureSize; py++) {
    for (let px = 0; px < textureSize; px++) {
      const idx = (py * textureSize + px) * 4
      const noise = fbm(px / textureSize * 8, py / textureSize * 8, seed)
      const density = Math.max(0, Math.min(1, (noise - threshold) / (1.0 - threshold + 0.12)))
      img.data[idx]     = Math.floor(235 + density * 20)
      img.data[idx + 1] = Math.floor(240 + density * 15)
      img.data[idx + 2] = Math.floor(250 + density * 5)
      img.data[idx + 3] = Math.floor(density * 220)
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

/* ================================================================
 * GLSL 纹理采样
 * ================================================================ */

export const CLOUD_SHADER = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec4 tex = texture(uCloudTexture, materialInput.st);
  material.diffuse = tex.rgb;
  material.alpha   = tex.a * uLayerAlpha;
  return material;
}
`

/* ================================================================
 * 构建云层
 * ================================================================ */

export function buildCloudLayers(
  viewer: Cesium.Viewer,
  C: any,
  settings: CloudSettings,
): { layers: any[]; textures: HTMLCanvasElement[] } {
  const { layerCount, totalThickness, opacity, coverage, baseAltitude } = settings
  const rect = C.Rectangle.fromDegrees(114, 38, 119, 41)

  const layers: any[] = []
  const textures: HTMLCanvasElement[] = []

  for (let i = 0; i < layerCount; i++) {
    const t = layerCount > 1 ? i / (layerCount - 1) : 0
    const alt = baseAltitude + t * totalThickness
    const layerAlpha = (1.0 - t * 0.55) * opacity

    const texCanvas = generateCloudTexture(i, layerCount, coverage, settings.textureSize)
    textures.push(texCanvas)

    const geometry = new C.RectangleGeometry({
      rectangle: rect,
      vertexFormat: C.VertexFormat.ALL,
      height: alt,
      granularity: 0.15 * (Math.PI / 180),
    })

    const instance = new C.GeometryInstance({ geometry, id: `cloud-${i}` })

    const material = new C.Material({
      fabric: {
        type: `CloudLayer_${i}`,
        uniforms: { uCloudTexture: texCanvas, uLayerAlpha: layerAlpha },
        source: CLOUD_SHADER,
      },
    })

    const appearance = new C.MaterialAppearance({
      material,
      translucent: true,
      flat: false,
      materialSupport: C.MaterialAppearance.MaterialSupport.ALL,
    })

    const primitive = new C.Primitive({
      geometryInstances: [instance],
      appearance,
      asynchronous: false,
    })

    viewer.scene.primitives.add(primitive)
    layers.push(primitive)
  }

  return { layers, textures }
}

export function setupGUI(stage: HTMLElement, settings: CloudSettings, onChange: () => void) {
  const gui = createDemoGui(stage)
  gui.add(settings, 'layerCount', 5, 50, 1).name('切片层数').onChange(onChange)
  gui.add(settings, 'totalThickness', 2000, 20000).name('云层厚度 (m)').onChange(onChange)
  gui.add(settings, 'opacity', 0.1, 1.0).name('不透明度').onChange(onChange)
  gui.add(settings, 'coverage', 0.1, 1.0).name('覆盖率').onChange(onChange)
  gui.add(settings, 'baseAltitude', 20000, 80000).name('云底高度 (m)').onChange(onChange)
  return gui
}
