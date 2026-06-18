<script setup lang="ts">
/**
 * TilesetDemo — 3D Tileset 模型加载与样式
 */

import { ref, onUnmounted } from 'vue'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'
import {
  MODELS, isTilesetAlive, clearTileset, loadModel,
  applyCurrentStyle, switchModel, switchStyle,
  setupPickHandler, flyToView, setupGUI,
} from './tilesetDemo'

const showTutorial = ref(false)
const pickInfo = ref<{ visible: boolean; modelName: string; properties: { key: string; value: string }[] }>(
  { visible: false, modelName: '', properties: [] },
)

let viewer: Cesium.Viewer | null = null
let C: any = null
let gui: any = null
let pickHandler: any = null
let guiStyleCtrl: { value: any } = { value: null }
let currentTileset: any = null
let currentModelIndex = 0

const settings = {
  modelName: MODELS[0].name,
  styleMode: MODELS[0].styleOptions[0],
  opacity: 1.0,
  pickEnabled: true,
  showBoundingVolume: false,
}

function setPickInfo(p: any) {
  if (p) pickInfo.value = p
  else pickInfo.value = { visible: false, modelName: '', properties: [] }
}

async function doLoadModel(idx: number) {
  if (!viewer || !C) return
  currentModelIndex = idx
  pickInfo.value = { visible: false, modelName: '', properties: [] }
  currentTileset = await loadModel(viewer, C, idx, currentTileset, settings.showBoundingVolume)
  applyCurrentStyle(C, currentTileset, idx, settings.opacity)
}

async function onModelChange(name: string) {
  const idx = MODELS.findIndex(m => m.name === name)
  if (idx === -1 || idx === currentModelIndex) return
  switchModel(idx, settings, guiStyleCtrl)
  await doLoadModel(idx)
}

function onStyleChange(name: string) {
  switchStyle(name, currentModelIndex, settings)
  if (C) applyCurrentStyle(C, currentTileset, currentModelIndex, settings.opacity)
}

function onOpacityChange() {
  if (isTilesetAlive(currentTileset, viewer) && C) {
    currentTileset.colorBlendAmount = settings.opacity
    applyCurrentStyle(C, currentTileset, currentModelIndex, settings.opacity)
  }
}

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  C = window.Cesium

  doLoadModel(0)

  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (stage) {
    gui = setupGUI(
      stage, settings, guiStyleCtrl,
      onModelChange, onStyleChange, onOpacityChange,
      (v: boolean) => { if (isTilesetAlive(currentTileset, viewer)) currentTileset.debugShowBoundingVolume = v },
      (h: number, p: number) => { if (viewer && C) flyToView(viewer, C, currentModelIndex, h, p) },
      () => { if (viewer && C) viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(...MODELS[currentModelIndex].homePosition), duration: 1.0 }) },
      () => currentModelIndex,
    )
  }

  pickHandler = setupPickHandler(
    v, C,
    () => settings.pickEnabled,
    () => currentModelIndex,
    setPickInfo,
  )
}

onUnmounted(() => {
  gui?.destroy(); gui = null
  currentTileset = clearTileset(viewer, currentTileset)
  if (pickHandler) { pickHandler.destroy?.(); pickHandler = null }
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">3D Tileset 模型加载</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">Cesium3DTileset · Style · Pick</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer :initial-position="[-75.612, 40.042, 5_000_000]" scene-mode="3d" @ready="onViewerReady" />

      <Transition name="fade">
        <div
          v-if="pickInfo.visible"
          class="absolute bottom-4 left-4 z-10 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/60 rounded-lg px-4 py-3 text-xs font-mono shadow-lg min-w-[240px]"
        >
          <div class="text-zinc-400 mb-2">📌 {{ pickInfo.modelName }}</div>
          <div v-for="(prop, i) in pickInfo.properties" :key="i" class="flex justify-between gap-4 py-0.5">
            <span class="text-zinc-500">{{ prop.key }}</span>
            <span class="text-zinc-200">{{ prop.value }}</span>
          </div>
        </div>
      </Transition>
    </div>

    <TutorialModal v-model:visible="showTutorial" title="3D Tileset · 技术详解">

      <h3>一、3D Tiles 格式基础</h3>
      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.78rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">文件</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">用途</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">内部结构</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>tileset.json</strong></td><td style="padding:6px 10px;border:1px solid #3f3f46;">空间索引树</td><td style="padding:6px 10px;border:1px solid #3f3f46;">asset, root{boundingVolume, geometricError, children[], transform}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>.b3dm</strong></td><td style="padding:6px 10px;border:1px solid #3f3f46;">建筑群 / 倾斜摄影</td><td style="padding:6px 10px;border:1px solid #3f3f46;">28B 头 + Feature Table + Batch Table + 内嵌 glTF</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>.i3dm</strong></td><td style="padding:6px 10px;border:1px solid #3f3f46;">大量重复物体</td><td style="padding:6px 10px;border:1px solid #3f3f46;">头 + 实例变换矩阵 + glTF</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>.pnts</strong></td><td style="padding:6px 10px;border:1px solid #3f3f46;">LiDAR 点云</td><td style="padding:6px 10px;border:1px solid #3f3f46;">头 + 逐点坐标 xyz + 可选颜色/分类</td></tr>
        </tbody>
      </table>

      <p><strong>HLOD 调度原理</strong>：每个节点携带 <code>geometricError</code>（几何误差，单位米）。Cesium 每帧计算 SSE = geometricError / distance * (screenHeight / fov)，SSE > 阈值 → 细化加载子节点，SSE < 阈值 → 合并卸载子节点。</p>

      <h3>二、功能实现（伪代码）</h3>
      <h4>2.1 加载 & 切换</h4>
      <pre><code>const tileset = await Cesium.Cesium3DTileset.fromUrl('/data/3dtiles/dayanta/tileset.json')
viewer.scene.primitives.add(tileset)
viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(108.9, 34.2, 500) })</code></pre>

      <h4>2.2 Style 着色</h4>
      <pre><code>tileset.style = new Cesium.Cesium3DTileStyle({ color: "color('#4488cc')" })
tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.REPLACE
// 生产环境按属性条件着色:
tileset.style = new Cesium.Cesium3DTileStyle({
  color: { conditions: [
    ['${feature["height"]} > 100', "color('red')"],
    ['true', "color('#888')"],
  ]},
})</code></pre>

      <h4>2.3 拾取查询</h4>
      <pre><code>const picked = viewer.scene.pick(event.position)
// picked.content.url / .featuresLength / .batchTable
// picked.primitive._url</code></pre>

      <h3>三、数据管线（生产环境）</h3>
      <pre><code>┌──────────────────────────────────────────────────────────┐
│ 倾斜摄影 → 3D Tiles 标准流水线                             │
│ 1. 采集   无人机多视角航拍 → 影像集                        │
│ 2. 重建   ContextCapture / Bentley CC → OSGB 三角网       │
│ 3. 切片   cesiumlab（国产切片工具）→ 3D Tiles             │
│    · 空间参考: EPSG:4490 → ECEF 自动转换                  │
│    · 材质: KHR_materials_unlit / PBR                      │
│ 4. 部署   Nginx / 云对象存储 → Cesium 前端                │
│ ⚠️ cesiumlab1 → KHR_technique_webgl（Cesium 不支持）       │
└──────────────────────────────────────────────────────────┘</code></pre>

      <h3>四、性能优化清单</h3>
      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.78rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">手段</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">API / 参数</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">效果</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">提高合并阈值</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>tileset.maximumScreenSpaceError = 32</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">网络请求 ↓40-60%</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">限制显存</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>tileset.maximumCachedBytes = 256MB</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">防止显存溢出</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">跳级加载</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>tileset.skipLevelOfDetail = true</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">飞行时不加载中间 LOD</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">几何压缩</td><td style="padding:6px 10px;border:1px solid #3f3f46;">切片时开启 Draco</td><td style="padding:6px 10px;border:1px solid #3f3f46;">b3dm 体积 ↓30-50%</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">纹理压缩</td><td style="padding:6px 10px;border:1px solid #3f3f46;">切片时使用 WebP</td><td style="padding:6px 10px;border:1px solid #3f3f46;">纹理体积 ↓40-60%</td></tr>
        </tbody>
      </table>

      <h3>五、面试话术</h3>
      <p><strong>Q: "3D Tiles 加载怎么实现的？"</strong></p>
      <p>A: "核心是 <code>Cesium3DTileset.fromUrl()</code> 异步加载 tileset.json，解析 HLOD 树。数据管线：无人机倾斜摄影 → ContextCapture 生成 OSGB → <strong>cesiumlab 切为 b3dm</strong> → Nginx → Cesium 前端。Cesium 每帧根据 geometricError 计算 SSE 自动调度瓦片。着色用 <code>Cesium3DTileStyle</code> 声明式 JSON 实时切换，拾取用 <code>scene.pick()</code> 读取 Batch Table。"</p>
      <p><strong>Q: "性能优化做过哪些？"</strong></p>
      <p>A: "① <code>maximumScreenSpaceError</code> 调高到 32~64 减少请求；② <code>maximumCachedBytes</code> 限制显存；③ <code>skipLevelOfDetail</code> 跳级加载；④ cesiumlab 切片时开启 Draco 和 WebP 压缩；⑤ 服务端 gzip/brotli。"</p>
    </TutorialModal>
  </div>
</template>
