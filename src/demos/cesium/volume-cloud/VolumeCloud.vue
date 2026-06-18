<script setup lang="ts">
/**
 * VolumeCloud — 体渲染云层可视化系统
 *
 * 数据管线: 气象格点数据 (GRIB2/NetCDF) → Python 预处理 → PNG 纹理堆叠 → Cesium 渲染
 * 本 Demo:  JS fBm 噪声 → Canvas 纹理 (等效生产管线, 替换数据源即可)
 */

import { ref, reactive, onUnmounted } from 'vue'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'
import { buildCloudLayers, setupGUI } from './volumeCloud'
import type { CloudSettings } from './volumeCloud'

const viewerReady = ref(false)
const showTutorial = ref(false)

let viewer: Cesium.Viewer | null = null
let C: any = null
let gui: any = null
let layers: any[] = []
let textures: HTMLCanvasElement[] = []

const settings = reactive<CloudSettings>({
  layerCount: 30,
  totalThickness: 12000,
  textureSize: 256,
  opacity: 0.7,
  coverage: 0.45,
  baseAltitude: 50000,
})

function rebuild() {
  if (!viewer || !C) return
  layers.forEach(l => { if (!l.isDestroyed?.()) viewer!.scene.primitives.remove(l) })
  layers = []
  const r = buildCloudLayers(viewer, C, settings)
  layers = r.layers
  textures = r.textures
}

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  C = window.Cesium
  viewerReady.value = true

  const r = buildCloudLayers(v, C, settings)
  layers = r.layers
  textures = r.textures

  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (stage) gui = setupGUI(stage, settings, rebuild)

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
  layers.forEach(l => { if (!l.isDestroyed?.()) viewer?.scene.primitives.remove(l) })
  layers = []
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
    data = cloud_cover[i]  # shape: (lat, lon)
    alpha = ((data - data.min()) / (data.max() - data.min()) * 255).astype(np.uint8)
    rgba = np.zeros((*data.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = 240
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
