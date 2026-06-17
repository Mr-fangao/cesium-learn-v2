<script setup lang="ts">
/**
 * TilesetDemo — 3D Tileset 模型加载
 *
 * 技术点:
 *   1. Cesium3DTileset.fromUrl() 异步加载 + 飞行定位
 *   2. Cesium3DTileStyle 条件着色（纯色 / 半透明）
 *   3. scene.pick() 拾取 Tile Content → 信息面板
 *
 * 模型切换流程:
 *   GUI 下拉 → clearTileset() → fromUrl() → primitives.add() → flyTo()
 */

import { ref, onUnmounted } from 'vue'
import { GUI } from 'lil-gui'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'

/* ================================================================
 * 1. 模型配置
 * ================================================================ */

interface ModelConfig {
  id: string
  name: string
  url: string
  /** 飞行定位 [lon, lat, height(m)] */
  homePosition: [number, number, number]
  /** 着色方案选项 */
  styleOptions: string[]
  /** 当前着色方案索引 */
  styleIndex: number
}

const MODELS: ModelConfig[] = [
  {
    id: 'requestVolume',
    name: 'Request Volume (费城建筑)',
    url: '/data/3dtiles/request-volume/tileset.json',
    homePosition: [-75.612, 40.042, 500],
    styleOptions: ['原始', '蓝色调', '暖色调', '半透明'],
    styleIndex: 0,
  },
  {
    id: 'dayanta',
    name: '大雁塔倾斜摄影',
    url: '/data/3dtiles/dayanta/tileset.json',
    homePosition: [108.959, 34.219, 500],
    styleOptions: ['原始纹理', '蓝色调', '半透明'],
    styleIndex: 0,
  },
]

/* ================================================================
 * 2. 响应式状态 (ref)
 * ================================================================ */

const showTutorial = ref(false)

const pickInfo = ref<{
  visible: boolean
  modelName: string
  properties: { key: string; value: string }[]
}>({ visible: false, modelName: '', properties: [] })

/* ================================================================
 * 3. 非响应式状态 (let)
 * ================================================================ */

let viewer: Cesium.Viewer | null = null
let gui: GUI | null = null
let pickHandler: any = null
let guiStyleCtrl: any = null
let currentTileset: any = null
let currentModelIndex = 0

/** UI 绑定参数 */
const settings = {
  modelName: MODELS[0].name,
  styleMode: MODELS[0].styleOptions[0],
  opacity: 1.0,
  pickEnabled: true,
  showBoundingVolume: false,
}

/* ================================================================
 * 4. 工具函数
 * ================================================================ */

function isTilesetAlive(t: any): boolean {
  if (!t || !viewer || viewer.isDestroyed()) return false
  try {
    // Cesium3DTileset 1.111 可能没有 isDestroyed，用 primitives.contains 兜底
    if (typeof t.isDestroyed === 'function') return !t.isDestroyed()
    return viewer.scene.primitives.contains(t)
  } catch { return false }
}

function getCesium(): any | null {
  const C = (window as any).Cesium
  return C ?? null
}

/* ================================================================
 * 5. Tileset 加载 / 销毁
 * ================================================================ */

function clearTileset() {
  if (isTilesetAlive(currentTileset)) {
    viewer!.scene.primitives.remove(currentTileset)
  }
  currentTileset = null
}

async function loadModel(modelIndex: number) {
  const C = getCesium()
  if (!C || !viewer || viewer.isDestroyed()) return

  clearTileset()
  currentModelIndex = modelIndex
  pickInfo.value = { visible: false, modelName: '', properties: [] }

  const model = MODELS[modelIndex]
  try {
    const tileset = await C.Cesium3DTileset.fromUrl(model.url)
    currentTileset = tileset
    tileset.debugShowBoundingVolume = settings.showBoundingVolume
    viewer.scene.primitives.add(tileset)

    // 加载完成后飞行定位
    const [lon, lat, h] = model.homePosition
    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(lon, lat, h),
      duration: 1.5,
    })

    applyCurrentStyle()
  } catch (e: any) {
    console.error(`[TilesetDemo] 加载失败: ${model.name}`, e)
  }
}

/* ================================================================
 * 6. Style 着色
 * ================================================================ */

function applyCurrentStyle() {
  const C = getCesium()
  if (!C || !isTilesetAlive(currentTileset)) return

  const model = MODELS[currentModelIndex]
  const styleName = model.styleOptions[model.styleIndex]

  // 重置为默认
  currentTileset.style = undefined
  currentTileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.HIGHLIGHT ?? 0
  currentTileset.colorBlendAmount = settings.opacity

  switch (model.id) {
    case 'dayanta':     applyDayantaStyle(C, styleName);     break
    case 'requestVolume': applyRequestVolumeStyle(C, styleName); break
  }
}

function applyDayantaStyle(C: any, styleName: string) {
  switch (styleName) {
    case '原始纹理': break
    case '蓝色调':
      currentTileset.style = new C.Cesium3DTileStyle({ color: "color('#4488cc')" })
      currentTileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.REPLACE ?? 1
      break
    case '半透明':
      currentTileset.style = new C.Cesium3DTileStyle({ color: "color('white', 0.35)" })
      currentTileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.MIX ?? 0
      break
  }
}

function applyRequestVolumeStyle(C: any, styleName: string) {
  switch (styleName) {
    case '原始': break
    case '蓝色调':
      currentTileset.style = new C.Cesium3DTileStyle({ color: "color('#5b9bd5')" })
      currentTileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.REPLACE ?? 1
      break
    case '暖色调':
      currentTileset.style = new C.Cesium3DTileStyle({ color: "color('#e8923f')" })
      currentTileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.REPLACE ?? 1
      break
    case '半透明':
      currentTileset.style = new C.Cesium3DTileStyle({ color: "color('white', 0.4)" })
      currentTileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.MIX ?? 0
      break
  }
}

/* ================================================================
 * 7. 模型 / 样式切换
 * ================================================================ */

function switchModel(modelIndex: number) {
  const model = MODELS[modelIndex]
  settings.modelName = model.name

  // 更新 GUI 着色方案下拉菜单
  if (guiStyleCtrl) {
    settings.styleMode = model.styleOptions[model.styleIndex]
    guiStyleCtrl.options(model.styleOptions).setValue(settings.styleMode)
  }

  loadModel(modelIndex)
}

function switchStyle(styleName: string) {
  const model = MODELS[currentModelIndex]
  const idx = model.styleOptions.indexOf(styleName)
  if (idx === -1) return
  model.styleIndex = idx
  settings.styleMode = styleName
  applyCurrentStyle()
}

/* ================================================================
 * 8. 拾取 (Picking)
 * ================================================================ */

function setupPickHandler() {
  const C = getCesium()
  if (!C || !viewer || viewer.isDestroyed()) return null

  const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas)

  handler.setInputAction((movement: any) => {
    if (!settings.pickEnabled || !viewer || viewer.isDestroyed()) return

    const pos = movement.position ?? movement.endPosition
    if (!pos) return

    const picked = viewer.scene.pick(pos)
    if (!picked) {
      pickInfo.value = { visible: false, modelName: '', properties: [] }
      return
    }

    const model = MODELS[currentModelIndex]
    const props: { key: string; value: string }[] = []
    const { content, primitive } = picked

    // 从 Cesium3DTileContent 提取信息
    if (content) {
      try {
        const url = typeof content.url === 'function' ? content.url() : content.url
        if (url) props.push({ key: 'Content URL', value: String(url) })
      } catch (_) { /* ignore */ }
      if (content.featuresLength !== undefined) {
        props.push({ key: 'Features', value: String(content.featuresLength) })
      }
      const bt = content.batchTable?._properties
      if (bt) {
        for (const [k, v] of Object.entries(bt).slice(0, 5)) {
          props.push({ key: k, value: String(v) })
        }
      }
    }

    // 从 Cesium3DTileset 提取信息
    if (primitive?._url) {
      props.push({ key: 'Tileset', value: primitive._url.split('/').pop() || '' })
    }

    if (props.length === 0) {
      props.push({ key: '类型', value: model.id === 'dayanta' ? '倾斜摄影 Mesh' : '建筑/点云' })
    }

    pickInfo.value = { visible: true, modelName: model.name, properties: props }
  }, C.ScreenSpaceEventType.LEFT_CLICK)

  return handler
}

/* ================================================================
 * 9. lil-gui 控制面板
 * ================================================================ */

function setupGUI() {
  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (!stage) return

  gui = new GUI({ autoPlace: false, width: 260 })
  Object.assign(gui.domElement.style, {
    position: 'absolute', top: '12px', right: '12px', zIndex: '10',
  })
  stage.appendChild(gui.domElement)

  // 模型选择
  gui.add(settings, 'modelName', MODELS.map(m => m.name)).name('模型选择')
    .onChange((v: string) => {
      const idx = MODELS.findIndex(m => m.name === v)
      if (idx !== -1 && idx !== currentModelIndex) switchModel(idx)
    })

  // 着色方案（动态选项，切换模型时更新）
  guiStyleCtrl = gui.add(settings, 'styleMode', MODELS[currentModelIndex].styleOptions).name('着色方案')
    .onChange((v: string) => switchStyle(v))

  // 透明度
  gui.add(settings, 'opacity', 0.1, 1.0, 0.05).name('透明度')
    .onChange(() => {
      if (isTilesetAlive(currentTileset)) {
        currentTileset.colorBlendAmount = settings.opacity
        applyCurrentStyle()
      }
    })

  // 拾取
  gui.add(settings, 'pickEnabled').name('拾取信息')

  // 调试
  const dbg = gui.addFolder('调试')
  dbg.add(settings, 'showBoundingVolume').name('显示包围盒')
    .onChange((v: boolean) => {
      if (isTilesetAlive(currentTileset)) currentTileset.debugShowBoundingVolume = v
    })

  // 相机
  const cam = gui.addFolder('相机')
  cam.add({ f: () => flyToView(0, -90) }, 'f').name('正视')
  cam.add({ f: () => flyToView(0, 0) }, 'f').name('俯视')
  cam.add({ f: () => flyToView(90, -45) }, 'f').name('侧视')
  cam.add({ f: () => {
    const m = MODELS[currentModelIndex]
    const C = getCesium()
    if (C && viewer) {
      viewer.camera.flyTo({
        destination: C.Cartesian3.fromDegrees(...m.homePosition),
        duration: 1.0,
      })
    }
  } }, 'f').name('重置')
}

/* ================================================================
 * 10. 相机控制
 * ================================================================ */

function flyToView(headingDeg: number, pitchDeg: number) {
  const C = getCesium()
  if (!C || !viewer || viewer.isDestroyed()) return

  const [lon, lat, h] = MODELS[currentModelIndex].homePosition
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(lon, lat, h),
    orientation: {
      heading: C.Math.toRadians(headingDeg),
      pitch: C.Math.toRadians(pitchDeg),
      roll: 0,
    },
    duration: 1.0,
  })
}

/* ================================================================
 * 11. 生命周期
 * ================================================================ */

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  loadModel(0)          // 默认加载第一个模型
  setupGUI()            // 初始化控制面板
  pickHandler = setupPickHandler()  // 初始化拾取
}

onUnmounted(() => {
  gui?.destroy(); gui = null
  clearTileset()
  if (pickHandler) {
    pickHandler.destroy?.()
    pickHandler = null
  }
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <!-- Header -->
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">3D Tileset 模型加载</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">Cesium3DTileset · Style · Pick</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <!-- Stage -->
    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer
        :initial-position="[-75.612, 40.042, 5_000_000]"
        :scene-mode="'3d'"
        @ready="onViewerReady"
      />

      <!-- 拾取信息面板 -->
      <Transition name="fade">
        <div
          v-if="pickInfo.visible"
          class="absolute bottom-4 left-4 z-10 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/60 rounded-lg px-4 py-3 text-xs font-mono shadow-lg min-w-[240px]"
        >
          <div class="text-zinc-400 mb-2">📌 {{ pickInfo.modelName }}</div>
          <div
            v-for="(prop, i) in pickInfo.properties"
            :key="i"
            class="flex justify-between gap-4 py-0.5"
          >
            <span class="text-zinc-500">{{ prop.key }}</span>
            <span class="text-zinc-200">{{ prop.value }}</span>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 教程弹窗 -->
    <TutorialModal v-model:visible="showTutorial" title="3D Tileset · 技术详解">

      <h3>一、3D Tiles 格式基础</h3>

      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.78rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">文件</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">用途</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">内部结构</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>tileset.json</strong></td><td style="padding:6px 10px;border:1px solid #3f3f46;">空间索引树（地图目录）</td><td style="padding:6px 10px;border:1px solid #3f3f46;">asset, root{boundingVolume, geometricError, children[], transform}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>.b3dm</strong>（批量三维模型）</td><td style="padding:6px 10px;border:1px solid #3f3f46;">建筑群 / 倾斜摄影</td><td style="padding:6px 10px;border:1px solid #3f3f46;">28B 头 + Feature Table（特征表）+ Batch Table（批量属性表）+ 内嵌 glTF 模型</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>.i3dm</strong>（实例化模型）</td><td style="padding:6px 10px;border:1px solid #3f3f46;">大量重复物体（树木/路灯）</td><td style="padding:6px 10px;border:1px solid #3f3f46;">头 + 逐个实例的变换矩阵 + glTF 模型</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>.pnts</strong>（点云）</td><td style="padding:6px 10px;border:1px solid #3f3f46;">LiDAR（激光雷达）扫描</td><td style="padding:6px 10px;border:1px solid #3f3f46;">头 + 逐点坐标 xyz + 可选颜色/分类/强度</td></tr>
        </tbody>
      </table>

      <p><strong>HLOD（层级细节度）调度原理</strong>：tileset.json 是一棵空间树，每个节点携带 <code>geometricError</code>（几何误差，单位米）。Cesium 每帧计算：</p>
      <pre><code>SSE = geometricError / distance * (screenHeight / fov)
// SSE > 阈值 (默认16px) → 细化（加载子节点替换父级，更精细）
// SSE < 阈值          → 合并（卸载子节点显示父级，更粗糙）
// 相机拉远自动降 LOD，推近自动升 LOD</code></pre>

      <p><strong>坐标转换</strong>：tileset.json 中 <code>root.transform</code> 是一个 4×4 矩阵，将瓦片局部坐标（米）转为 ECEF（地心坐标系）。大雁塔 root transform 平移部分约 [-1715218, 4992846, 3566378]，对应西安的 ECEF 坐标。</p>

      <h3>二、功能实现（伪代码）</h3>

      <h4>2.1 加载 & 切换</h4>
      <p><strong>关键 API</strong>：<code>Cesium3DTileset.fromUrl(url)</code> — 异步静态方法，自动获取并解析 tileset.json</p>
      <pre><code>// 加载
const tileset = await Cesium.Cesium3DTileset.fromUrl('/data/3dtiles/dayanta/tileset.json')
viewer.scene.primitives.add(tileset)  // 加入场景
viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(108.9, 34.2, 500) })

// 切换: 先移除旧模型释放 GPU 内存，再加载新模型
viewer.scene.primitives.remove(旧tileset)
await 加载新模型(url)</code></pre>

      <h4>2.2 Style 着色</h4>
      <p><strong>关键 API</strong>：<code>new Cesium3DTileStyle(json)</code> — 声明式 JSON 样式，浏览器端实时计算无需后端</p>
      <pre><code>// 纯色覆盖
tileset.style = new Cesium.Cesium3DTileStyle({ color: "color('#4488cc')" })
tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.REPLACE
// REPLACE=完全替换  HIGHLIGHT=乘算叠加  MIX=线性混合

// 生产环境：按属性条件着色
tileset.style = new Cesium.Cesium3DTileStyle({
  color: { conditions: [
    ['${feature["height"]} > 100', "color('red')"],       // 高于100米→红
    ['${feature["district"]} === "朝阳"', "color('blue')"], // 朝阳区→蓝
    ['true', "color('#888')"],                              // 默认灰
  ]},
  show: '${feature["area"]} > 500',  // 只显示面积>500㎡的建筑
})</code></pre>

      <h4>2.3 拾取查询</h4>
      <p><strong>关键 API</strong>：<code>viewer.scene.pick(屏幕坐标)</code> 射线查询，返回 <code>{content, primitive}</code></p>
      <pre><code>const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
handler.setInputAction((event) => {
  const picked = viewer.scene.pick(event.position)
  // picked.content.url              → 瓦片文件路径
  // picked.content.featuresLength   → 该瓦片包含的 feature 数量
  // picked.content.batchTable       → 批量属性表（高度/名称/面积等）
  // picked.primitive._url           → tileset.json 原始 URL
}, Cesium.ScreenSpaceEventType.LEFT_CLICK)</code></pre>

      <h3>三、数据管线（生产环境）</h3>

      <pre><code>┌──────────────────────────────────────────────────────────┐
│ 倾斜摄影 → 3D Tiles 标准流水线                             │
│                                                          │
│ 1. 采集   无人机多视角航拍 → 影像集                        │
│ 2. 重建   ContextCapture / Bentley CC（三维重建软件）      │
│           → OSGB 三角网（倾斜摄影通用格式）                │
│ 3. 切片   cesiumlab（国产切片工具）→ 3D Tiles             │
│    · 空间参考: EPSG:4490（国家大地坐标系）→ ECEF 自动转换  │
│    · 纹理: jpg / webp（体积更小）/ png                     │
│    · 材质: KHR_materials_unlit（无光照）/ PBR（物理渲染）  │
│    · LOD: 通常 L16-L17 两级                               │
│ 4. 部署   Nginx（网页服务器）/ 云对象存储 → Cesium 前端    │
│                                                          │
│ ⚠️ cesiumlab1 → KHR_technique_webgl（旧材质, Cesium 不支  │
│    持），需用 cesiumlab2+ 导出 KHR_materials_unlit         │
└──────────────────────────────────────────────────────────┘</code></pre>

      <h3>四、性能优化清单</h3>

      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.78rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">手段</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">API / 参数</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">效果</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">提高合并阈值</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>tileset.maximumScreenSpaceError = 32</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">网络请求数 ↓40-60%</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">限制显存</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>tileset.maximumCachedBytes = 256MB</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">防止显存溢出崩溃</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">跳级加载</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>tileset.skipLevelOfDetail = true</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">飞行时不加载中间 LOD</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">几何压缩</td><td style="padding:6px 10px;border:1px solid #3f3f46;">切片时开启 Draco（谷歌的几何压缩算法）</td><td style="padding:6px 10px;border:1px solid #3f3f46;">b3dm 体积 ↓30-50%</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">纹理压缩</td><td style="padding:6px 10px;border:1px solid #3f3f46;">切片时使用 WebP（谷歌的图像格式）</td><td style="padding:6px 10px;border:1px solid #3f3f46;">纹理体积 ↓40-60%</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">传输压缩</td><td style="padding:6px 10px;border:1px solid #3f3f46;">Nginx 开启 gzip（网页压缩）</td><td style="padding:6px 10px;border:1px solid #3f3f46;">传输量再 ↓30%</td></tr>
        </tbody>
      </table>

      <h3>五、面试话术</h3>

      <p><strong>Q: "3D Tiles 加载怎么实现的？"</strong></p>
      <p>A: "核心是 <code>Cesium3DTileset.fromUrl()</code> 异步加载 tileset.json，解析 HLOD（层级细节度）树。数据管线：无人机倾斜摄影 → ContextCapture（三维重建软件）生成 OSGB（通用三角网格式）→ <strong>cesiumlab（国产切片工具）切为 b3dm</strong> → 部署到 Nginx（网页服务器）→ Cesium 前端加载。Cesium 每帧根据 <code>geometricError</code>（几何误差）计算 SSE（屏幕空间误差）自动调度瓦片细化/合并。着色用 <code>Cesium3DTileStyle</code> 的声明式 JSON 样式实时切换，拾取用 <code>scene.pick()</code> 射线查询读取 Batch Table（批量属性表）。"</p>

      <p><strong>Q: "性能优化做过哪些？"</strong></p>
      <p>A: "① <code>maximumScreenSpaceError</code> 调高到 32~64 减少请求；② <code>maximumCachedBytes</code> 限制显存；③ <code>skipLevelOfDetail</code> 跳级加载，飞行中不加载中间层；④ cesiumlab 切片时开启 Draco（几何压缩）和 WebP（纹理压缩）；⑤ 服务端 gzip/brotli（压缩算法）压缩 b3dm 文件。"</p>

      <p><strong>Q: "b3dm 文件结构？"</strong></p>
      <p>A: "b3dm 即 Batched 3D Model（批量三维模型），专为建筑群/倾斜摄影设计。三部分：28 字节 Header（文件头）+ Feature Table（特征表，存 BATCH_LENGTH 等全局量）+ Batch Table（批量属性表，每个 feature 的自定义属性如高度/名称/面积，JSON 描述 Schema、BIN 存值）+ 内嵌 glTF 2.0（实际几何体）。"</p>

    </TutorialModal>
  </div>
</template>
