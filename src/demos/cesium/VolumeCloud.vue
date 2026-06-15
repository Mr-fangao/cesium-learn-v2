<script setup lang="ts">
/**
 * VolumeCloud — 体渲染云层可视化系统
 *
 * 生产场景: 气象数据 3D 可视化
 *   数据管线: 气象格点数据 (GRIB2/NetCDF) → Python 预处理 → PNG 纹理堆叠 → Cesium 渲染
 *   本 Demo:  JS fBm 噪声 → Canvas 纹理 (等效生产管线, 接头替换即可)
 *
 * 面试话术:
 *   "在 Cesium 1.111 上用 Stacked Texture Slices 实现了气象云 3D 体渲染。原始
 *    气象数据 (GRIB2/NetCDF) 经 Python xarray 按气压层切片转 PNG 纹理，每层作为
 *    一个 MaterialAppearance 半透明平面堆叠，通过逐层不同 alpha + 独立纹理采样
 *    构建 3D 云体积效果。本 Demo 用 JS fBm 噪声模拟了这条管线，实际项目中替换
 *    generateCloudTexture 的数据源即可。"
 */

import { ref, onUnmounted } from 'vue'
import { GUI } from 'lil-gui'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'

/* ================================================================
 * 状态 & 参数
 * ================================================================ */

const viewerReady = ref(false)
const showTutorial = ref(false)

let viewer: Cesium.Viewer | null = null
let gui: GUI | null = null
let layers: any[] = []
/** 生成的纹理 Canvas，unmount 时释放 */
let textures: HTMLCanvasElement[] = []

const settings = {
  layerCount: 30,
  totalThickness: 12000,
  textureSize: 256,
  opacity: 0.7,
  coverage: 0.45,
  baseAltitude: 50000,
}

/* ================================================================
 * JS 云纹理生成器（等同生产管线中 Python xarray → PNG 这一步）
 * ================================================================ */

/**
 * fBm (分形布朗运动) 噪声
 * 与 GLSL 版数学等价，在 CPU 端预计算为 Canvas 纹理
 * 生产环境中替换为: PIL.Image.open("layer_03.png")
 */
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
    f *= 2.1
    a *= 0.55
  }
  return v
}

/**
 * 生成单层云纹理 Canvas
 * @returns RGBA Canvas, RGB=云白色, A=云密度
 */
function generateCloudTexture(layerIndex: number, totalLayers: number, coverage: number): HTMLCanvasElement {
  const size = settings.textureSize
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)

  const seed = layerIndex * 0.73 * 1000
  // 云顶更薄、更透明（模拟真实大气湿度递减）
  const t = totalLayers > 1 ? layerIndex / (totalLayers - 1) : 0
  const threshold = (1.0 - coverage) + t * 0.15

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4
      const noise = fbm(px / size * 8, py / size * 8, seed)
      const density = Math.max(0, Math.min(1,
        (noise - threshold) / (1.0 - threshold + 0.12),
      ))

      // 微蓝色调的白云（模拟 Rayleigh 散射）
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
 * GLSL: 纹理采样（替代程序化噪声, 生产环境完全一致）
 * ================================================================ */

const CLOUD_SHADER = /* glsl */ `
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

function clearLayers() {
  if (!viewer || viewer.isDestroyed()) return
  layers.forEach(l => { if (!l.isDestroyed?.()) viewer!.scene.primitives.remove(l) })
  layers = []
  textures = []
}

function buildCloudLayers() {
  if (!viewer || viewer.isDestroyed()) return
  const C = window.Cesium
  clearLayers()

  const { layerCount, totalThickness, opacity, coverage, baseAltitude } = settings
  const rect = C.Rectangle.fromDegrees(114, 38, 119, 41)

  for (let i = 0; i < layerCount; i++) {
    const t = layerCount > 1 ? i / (layerCount - 1) : 0
    const alt = baseAltitude + t * totalThickness
    const layerAlpha = (1.0 - t * 0.55) * opacity

    // 生成该层纹理（生产: 替换为加载 PNG）
    const texCanvas = generateCloudTexture(i, layerCount, coverage)
    textures.push(texCanvas)

    const geometry = new C.RectangleGeometry({
      rectangle: rect,
      vertexFormat: C.VertexFormat.ALL,
      height: alt,
      granularity: 0.15 * (Math.PI / 180),
    })

    const instance = new C.GeometryInstance({ geometry, id: `cloud-${i}` })

    // Canvas → Material image uniform
    const material = new C.Material({
      fabric: {
        type: `CloudLayer_${i}`,
        uniforms: {
          uCloudTexture: texCanvas,
          uLayerAlpha: layerAlpha,
        },
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
}

/* ================================================================
 * lil-gui
 * ================================================================ */

function setupGUI() {
  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (!stage) return

  gui = new GUI({ autoPlace: false, width: 260 })
  gui.domElement.style.position = 'absolute'
  gui.domElement.style.top = '12px'
  gui.domElement.style.right = '12px'
  gui.domElement.style.zIndex = '10'
  stage.appendChild(gui.domElement)

  gui.add(settings, 'layerCount', 5, 50, 1).name('切片层数').onChange(buildCloudLayers)
  gui.add(settings, 'totalThickness', 2000, 20000).name('云层厚度 (m)').onChange(buildCloudLayers)
  gui.add(settings, 'opacity', 0.1, 1.0).name('不透明度').onChange(buildCloudLayers)
  gui.add(settings, 'coverage', 0.1, 1.0).name('覆盖率').onChange(buildCloudLayers)
  gui.add(settings, 'baseAltitude', 20000, 80000).name('云底高度 (m)').onChange(buildCloudLayers)
}

/* ================================================================
 * 生命周期
 * ================================================================ */

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  viewerReady.value = true
  buildCloudLayers()
  setupGUI()

  const C = window.Cesium as any
  v.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(116.5, 39.5, 250000),
    orientation: {
      heading: C.Math.toRadians(10),
      pitch: C.Math.toRadians(-50),
      roll: 0,
    },
    duration: 2.0,
  })
}

onUnmounted(() => {
  gui?.destroy(); gui = null
  clearLayers()
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">体渲染云层 · Stacked Texture Slices</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">JS fBm → Canvas → Material texture2D</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer :initial-position="[116.5, 39.5, 250_000]" @ready="onViewerReady" />
    </div>

    <TutorialModal v-model:visible="showTutorial" title="体渲染云层 · 数据管线详解">

      <h3>0. 数据管线总览</h3>
      <pre><code>┌─────────────────────────────────────────────────────────┐
│ 生产环境                                                 │
│ GRIB2/NetCDF → Python xarray → PNG 堆叠纹理 → Cesium    │
│                                                         │
│ 本 Demo (等价管线)                                       │
│ JS fBm 噪声  → Canvas API   → Material texture2D → GPU  │
│                                                         │
│ 差别只在纹理来源, Material/Appearance/渲染 完全一致      │
└─────────────────────────────────────────────────────────┘</code></pre>

      <h3>1. 生产环境数据处理（Python 脚本模板）</h3>
      <pre><code># 安装: pip install xarray netCDF4 Pillow
import xarray as xr
from PIL import Image
import numpy as np

# 1. 读取 NetCDF 气象数据
ds = xr.open_dataset("era5_cloud_20250101.nc")
# ds["cc"] shape: (pressure_level, lat, lon)
cloud_cover = ds["cc"].values  # 3D numpy array

# 2. 逐层输出 PNG
for i, level in enumerate(ds.pressure_level.values):
    # 插值到目标分辨率
    data = cloud_cover[i]  # shape: (lat, lon)
    # 归一化到 [0, 255]
    alpha = ((data - data.min()) / (data.max() - data.min()) * 255).astype(np.uint8)
    # 白色云 + alpha
    rgba = np.zeros((*data.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = 240  # 云白
    rgba[:, :, 3] = alpha
    Image.fromarray(rgba, "RGBA").save(f"cloud_layer_{i:02d}.png")</code></pre>

      <h3>2. GLSL 纹理采样（生产与 Demo 完全相同）</h3>
      <pre><code>czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec4 tex = texture(uCloudTexture, materialInput.st);
    material.diffuse = tex.rgb;      // 云层颜色
    material.alpha   = tex.a * uLayerAlpha;  // 密度 × 透明度
    return material;
}</code></pre>
      <p>这段 GLSL 在生产环境和本 Demo 中<strong>完全相同</strong>。唯一的区别是 <code>uCloudTexture</code> 的来源：生产 = 加载 PNG，Demo = JS Canvas。</p>

      <h3>3. 免费气象数据源</h3>
      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.78rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">数据源</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">变量</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">分辨率</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">获取</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">ERA5</td><td style="padding:6px 10px;border:1px solid #3f3f46;">云量 cc, 湿度 r</td><td style="padding:6px 10px;border:1px solid #3f3f46;">0.25°×37 层</td><td style="padding:6px 10px;border:1px solid #3f3f46;">cds.climate.copernicus.eu</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">NOAA GFS</td><td style="padding:6px 10px;border:1px solid #3f3f46;">相对湿度 RH</td><td style="padding:6px 10px;border:1px solid #3f3f46;">0.25°×31 层</td><td style="padding:6px 10px;border:1px solid #3f3f46;">nomads.ncep.noaa.gov</td></tr>
        </tbody>
      </table>

      <h3>4. 面试话术</h3>
      <p><strong>Q: "你在项目中做过气象数据可视化吗？"</strong></p>
      <p>A: "在 Cesium 上实现了气象云图的 3D 体渲染。核心方案是 <strong>Stacked Texture Slices</strong>——将 3D 气象场数据按气压层离散为多层 RectangleGeometry，
      每层加载对应气压层的 PNG 纹理（从 NetCDF 预处理的）。材质系统用 Cesium 的 <code>MaterialAppearance</code> +
      <code>czm_getMaterial</code>，在片元着色器中 <code>texture</code> 采样纹理，alpha 通道控制云密度。
      数据管线是 Python xarray 把 NetCDF/GRIB2 转为 PNG 堆叠纹理，整个过程可以自动化。
      最终效果支持 5 个实时可调参数满足气象分析师需求。"</p>

    </TutorialModal>
  </div>
</template>
