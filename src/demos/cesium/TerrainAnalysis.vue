<script setup lang="ts">
/**
 * TerrainAnalysis — Cesium 地形高度采样与分析
 *
 * 场景：珠穆朗玛峰区域，Cesium World Terrain 真实高程
 * 功能：点击采样高度 + 两点剖面分析 + 地形夸张
 *
 * 面试定位: "sampleTerrain · EllipsoidGeodesic · terrainExaggeration · 高程剖面"
 */

import { ref, reactive, onUnmounted, nextTick } from 'vue'
import { GUI } from 'lil-gui'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'

/* ================================================================
 * 1. 响应式状态
 * ================================================================ */

const showTutorial = ref(false)
const showProfile = ref(false)
const terrainReady = ref(false)

const state = reactive({
  exaggeration: 3.0,
  sampleLevel: 11,
  profileMode: false,
})

/* ================================================================
 * 2. 非响应式引用
 * ================================================================ */

let viewer: Cesium.Viewer | null = null
let C: any = null
let gui: GUI | null = null
let handler: any = null
let samplePins: Cesium.Entity[] = []
let profileA: any = null // Cartographic | null
let profileB: any = null // Cartographic | null
let profileAEntity: Cesium.Entity | null = null
let profileBEntity: Cesium.Entity | null = null
let profileLocked = false

/* ================================================================
 * 3. 地形就绪检测
 * ================================================================ */

function checkTerrain() {
  if (!viewer) return

  // 简单策略：等 3 秒让瓦片加载，然后标记就绪
  // 如果 15 秒后 sampleHeightSupported 仍为 false，才认为无地形
  let attempts = 0
  function poll() {
    if (!viewer) return
    attempts++
    if (viewer.scene.sampleHeightSupported) {
      terrainReady.value = true
      return
    }
    if (attempts < 8) {
      setTimeout(poll, 2000)
    }
    // 超过 8 次 (~16s) 放弃，保持警告状态
  }
  setTimeout(poll, 3000) // 先给瓦片服务 3 秒初始化时间
}

/* ================================================================
 * 4. 点击采样
 * ================================================================ */

function addSamplePin(lon: number, lat: number, height: number) {
  if (!viewer || !C) return

  // 用 sampleTerrain 的高度直接定位，不经 pickPosition 的深度值
  const entity = viewer.entities.add({
    position: C.Cartesian3.fromRadians(lon, lat, height),
    billboard: {
      image: createPinCanvas('#4da6ff'),
      verticalOrigin: C.VerticalOrigin.BOTTOM,
      scale: 0.6,
    },
    label: {
      text: `${height.toFixed(0)} m`,
      font: '13px monospace',
      fillColor: C.Color.WHITE,
      outlineColor: C.Color.fromCssColorString('#1a1a2e'),
      outlineWidth: 2,
      verticalOrigin: C.VerticalOrigin.BOTTOM,
      pixelOffset: new C.Cartesian2(0, -28),
    },
  })
  samplePins.push(entity)
}

function createPinCanvas(color: string): HTMLCanvasElement {
  const size = 24
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 2
  ctx.stroke()
  return c
}

/* ================================================================
 * 5. 剖面分析
 * ================================================================ */

async function computeProfile(startCarto: any, endCarto: any) {
  if (!viewer || !C) return

  const tp = viewer.terrainProvider
  if (!tp) return

  try {
    const geodesic = new C.EllipsoidGeodesic(startCarto, endCarto)
    const samples: any[] = []
    for (let i = 0; i <= 100; i++) {
      samples.push(geodesic.interpolateUsingFraction(i / 100, new C.Cartographic()))
    }

    await C.sampleTerrain(tp, state.sampleLevel, samples)

    const totalD = geodesic.surfaceDistance
    const distances = samples.map((_, i) => (totalD * i) / (samples.length - 1))

    showProfile.value = true
    await nextTick()
    drawProfileChart(samples, distances)
  } catch (e: any) {
    console.error('[Terrain] computeProfile failed:', e.message || e)
  } finally {
    profileLocked = false
  }
}

function drawProfileChart(samples: any[], distances: number[]) {
  const canvas = document.getElementById('profile-canvas') as HTMLCanvasElement | null
  if (!canvas) return
  const W = canvas.width
  const H = canvas.height
  const pad = { top: 30, right: 20, bottom: 40, left: 55 }
  const pw = W - pad.left - pad.right
  const ph = H - pad.top - pad.bottom

  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, W, H)

  // 数据范围
  const heights = samples.map((s: any) => s.height ?? 0)
  const hMin = Math.min(...heights)
  const hMax = Math.max(...heights)
  const hRange = hMax - hMin || 1
  const dMax = distances[distances.length - 1] || 1

  const toX = (d: number) => pad.left + (d / dMax) * pw
  const toY = (h: number) => pad.top + ph - ((h - hMin) / hRange) * ph

  // 背景
  ctx.fillStyle = 'rgba(15, 15, 25, 0.85)'
  ctx.beginPath()
  ctx.roundRect(pad.left - 10, pad.top - 10, pw + 20, ph + 20, 8)
  ctx.fill()

  // 网格线
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (ph / 5) * i
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke()
  }
  for (let i = 0; i <= 5; i++) {
    const x = pad.left + (pw / 5) * i
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ph); ctx.stroke()
  }

  // 填充区域
  ctx.beginPath()
  ctx.moveTo(toX(0), pad.top + ph)
  for (let i = 0; i < samples.length; i++) {
    ctx.lineTo(toX(distances[i]), toY(heights[i]))
  }
  ctx.lineTo(toX(dMax), pad.top + ph)
  ctx.closePath()
  const fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph)
  fillGrad.addColorStop(0, 'rgba(77, 166, 255, 0.5)')
  fillGrad.addColorStop(1, 'rgba(77, 166, 255, 0.05)')
  ctx.fillStyle = fillGrad
  ctx.fill()

  // 折线
  ctx.beginPath()
  ctx.strokeStyle = '#4da6ff'
  ctx.lineWidth = 2
  for (let i = 0; i < samples.length; i++) {
    const x = toX(distances[i]), y = toY(heights[i])
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()

  // 标注最高点
  const maxIdx = heights.indexOf(hMax)
  const mx = toX(distances[maxIdx])
  const my = toY(hMax)
  ctx.fillStyle = '#ff6b6b'
  ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ff6b6b'
  ctx.font = '11px monospace'
  ctx.fillText(`${hMax.toFixed(0)}m`, mx + 8, my - 4)

  // 标注最低点
  const minIdx = heights.indexOf(hMin)
  const mix = toX(distances[minIdx])
  const miy = toY(hMin)
  ctx.fillStyle = '#ffd93d'
  ctx.beginPath(); ctx.arc(mix, miy, 4, 0, Math.PI * 2); ctx.fill()
  ctx.fillText(`${hMin.toFixed(0)}m`, mix + 8, miy - 4)

  // 坐标轴
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + ph); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ph); ctx.lineTo(pad.left + pw, pad.top + ph); ctx.stroke()

  // 轴标签
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`${dMax.toFixed(1)} km`, pad.left + pw / 2, pad.top + ph + 25)

  ctx.save()
  ctx.translate(10, pad.top + ph / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('高程 (m)', 0, 0)
  ctx.restore()

  // Y 轴刻度
  ctx.textAlign = 'right'
  for (let i = 0; i <= 5; i++) {
    const h = hMin + (hRange / 5) * i
    const y = pad.top + ph - (ph / 5) * i
    ctx.fillText(`${h.toFixed(0)}`, pad.left - 6, y + 4)
  }
}

function clearProfile() {
  profileA = null; profileB = null
  profileLocked = false
  if (profileAEntity) { viewer?.entities.remove(profileAEntity); profileAEntity = null }
  if (profileBEntity) { viewer?.entities.remove(profileBEntity); profileBEntity = null }
  showProfile.value = false
  state.profileMode = false
}

function clearAllSamples() {
  samplePins.forEach((e) => viewer?.entities.remove(e))
  samplePins = []
  clearProfile()
}

/* ================================================================
 * 6. ScreenSpaceEventHandler
 * ================================================================ */

function setupClickHandler() {
  if (!viewer || !C) return

  handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas)

  handler.setInputAction(async (click: any) => {
    if (!viewer || !C || profileLocked) return

    // 拾取椭球面得到精确 lon/lat（数学交点，不受地形 LOD 影响）
    const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid)
    if (!cartesian) return

    const carto = C.Cartographic.fromCartesian(cartesian)

    // 用 terrainProvider 查询真实地形高度（与剖面图同一数据源）
    let height = carto.height
    const tp = viewer.terrainProvider
    if (tp) {
      const samples = [C.Cartographic.clone(carto)]
      await C.sampleTerrain(tp, state.sampleLevel, samples)
      if (samples[0].height !== undefined) height = samples[0].height
    }

    // 用采样后的高度重建位置（不依赖 pickPosition 深度值或 CLAMP_TO_GROUND）
    const pos = C.Cartesian3.fromRadians(carto.longitude, carto.latitude, height)

    if (state.profileMode) {
      if (!profileA) {
        profileA = C.Cartographic.fromRadians(carto.longitude, carto.latitude, height)
        profileAEntity = viewer.entities.add({
          position: pos,
          billboard: { image: createPinCanvas('#4ade80'), verticalOrigin: C.VerticalOrigin.BOTTOM, scale: 0.8 },
          label: { text: 'A 起点', font: '13px monospace', fillColor: C.Color.fromCssColorString('#4ade80'), outlineColor: C.Color.fromCssColorString('#1a1a2e'), outlineWidth: 2, verticalOrigin: C.VerticalOrigin.BOTTOM, pixelOffset: new C.Cartesian2(0, -28) },
        })
      } else {
        profileB = C.Cartographic.fromRadians(carto.longitude, carto.latitude, height)
        profileBEntity = viewer.entities.add({
          position: pos,
          billboard: { image: createPinCanvas('#f87171'), verticalOrigin: C.VerticalOrigin.BOTTOM, scale: 0.8 },
          label: { text: 'B 终点', font: '13px monospace', fillColor: C.Color.fromCssColorString('#f87171'), outlineColor: C.Color.fromCssColorString('#1a1a2e'), outlineWidth: 2, verticalOrigin: C.VerticalOrigin.BOTTOM, pixelOffset: new C.Cartesian2(0, -28) },
        })
        state.profileMode = false
        profileLocked = true
        computeProfile(profileA, profileB)
      }
      return
    }

    const pin = viewer.entities.add({
      position: pos,
      billboard: {
        image: createPinCanvas('#4da6ff'),
        verticalOrigin: C.VerticalOrigin.BOTTOM,
        scale: 0.6,
      },
      label: {
        text: `${height.toFixed(0)} m`,
        font: '13px monospace',
        fillColor: C.Color.WHITE,
        outlineColor: C.Color.fromCssColorString('#1a1a2e'),
        outlineWidth: 2,
        verticalOrigin: C.VerticalOrigin.BOTTOM,
        pixelOffset: new C.Cartesian2(0, -28),
      },
    })
    samplePins.push(pin)
  }, C.ScreenSpaceEventType.LEFT_CLICK)
}

/* ================================================================
 * 7. GUI
 * ================================================================ */

function setupGUI() {
  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (!stage || gui) return

  gui = new GUI({ autoPlace: false, width: 260 })
  Object.assign(gui.domElement.style, {
    position: 'absolute', top: '12px', right: '12px', zIndex: '10',
  })
  stage.appendChild(gui.domElement)

  // 地形夸张
  gui.add(state, 'exaggeration', 1, 15, 0.5).name('地形夸张 ×')
    .onChange((v: number) => {
      if (viewer) viewer.scene.globe.terrainExaggeration = v
    })

  // 采样精度
  gui.add(state, 'sampleLevel', { '低 (L8)': 8, '中 (L10)': 10, '默认 (L11)': 11, '高 (L12)': 12, '最高 (L14)': 14 })
    .name('采样精度')

  // 剖面分析
  const profileFolder = gui.addFolder('剖面分析')
  profileFolder.add({ start: () => {
    clearProfile()
    state.profileMode = true
  } }, 'start').name('开始选点 (A→B)')
  profileFolder.add({ clear: clearAllSamples }, 'clear').name('清除全部标记')

  // TODO: 等高线生成入口
  const contourFolder = gui.addFolder('等高线 (预留)')
  contourFolder.add({ disabled: '待开发' }, 'disabled').name('状态').disable()
}

/* ================================================================
 * 8. onViewerReady
 * ================================================================ */

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  C = window.Cesium

  v.scene.globe.terrainExaggeration = state.exaggeration
  checkTerrain()

  v.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(86.925, 27.988, 30000),
    orientation: {
      heading: C.Math.toRadians(15),
      pitch: C.Math.toRadians(-35),
      roll: 0,
    },
    duration: 0,
  })

  // 珠峰参考标记
  v.entities.add({
    position: C.Cartesian3.fromDegrees(86.925, 27.988, 8848),
    billboard: {
      image: createPinCanvas('#ffd93d'),
      verticalOrigin: C.VerticalOrigin.BOTTOM,
      eyeOffset: new C.Cartesian3(0, 0, 10),
      scale: 0.8,
    },
    label: {
      text: '珠穆朗玛峰 8848m',
      font: '14px monospace',
      fillColor: C.Color.fromCssColorString('#ffd93d'),
      outlineColor: C.Color.fromCssColorString('#1a1a2e'),
      outlineWidth: 3,
      style: C.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: C.VerticalOrigin.BOTTOM,
      pixelOffset: new C.Cartesian2(0, -30),
    },
  })

  setupClickHandler()
  setupGUI()
}

/* ================================================================
 * 9. 清理
 * ================================================================ */

onUnmounted(() => {
  if (handler) { handler.destroy(); handler = null }
  if (gui) { gui.destroy(); gui = null }
})

/* ================================================================
 * TODO: 等高线生成 (Contour Line Generation)
 *
 * 入口: generateContours(bbox, interval)
 * 思路:
 *   1. 在指定范围 bbox 内做密集网格采样 (sampleTerrain, L14, 100×100+)
 *   2. 高度矩阵应用 Marching Squares 算法提取等值线
 *   3. 等值线分段 → Cesium Entity polyline 渲染
 *
 * 参考: https://en.wikipedia.org/wiki/Marching_squares
 * 依赖: 密集采样性能可接受 (100×100 = 10k 点, sampleTerrain 批量处理)
 *
 * NPM 备选: turf.js (turf.isolines) 可直接从点集生成等值线
 * ================================================================ */
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <!-- Header -->
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">地形高度采样</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">sampleTerrain · EllipsoidGeodesic · terrainExaggeration</span>
      <span
        class="text-[10px] px-1.5 py-0.5 rounded ml-auto"
        :class="terrainReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'"
      >{{ terrainReady ? '地形已加载' : '等待地形...' }}</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <!-- Cesium 视口 -->
    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer
        :initial-position="[86.925, 27.988, 30000]"
        terrain="ion"
        @ready="onViewerReady"
      />

      <!-- 左上角操作提示 -->
      <div
        class="absolute left-4 top-4 z-10 text-xs text-zinc-400 bg-black/50 backdrop-blur rounded-lg px-3 py-2 space-y-1 border border-white/10"
      >
        <p v-if="!state.profileMode">🖱️ 点击地表 → 采样高度</p>
        <p v-else class="text-emerald-400">
          📍 请点击剖面 <b>起点 A</b>{{ profileA ? ' ✓ 已选，请点击终点 B' : '' }}
        </p>
        <p v-if="samplePins.length > 0" class="text-zinc-500">{{ samplePins.length }} 个采样点</p>
      </div>

      <!-- 地形状态提示 -->
      <div
        v-if="!terrainReady"
        class="absolute right-4 bottom-4 z-10 text-xs text-amber-400 bg-amber-500/10 backdrop-blur rounded-lg px-3 py-2 border border-amber-500/20 max-w-xs"
      >
        ⚠️ Cesium World Terrain 瓦片加载中...
      </div>

      <!-- 剖面图 -->
      <div
        v-if="showProfile"
        class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 bg-black/70 backdrop-blur rounded-xl border border-white/15 p-2"
      >
        <canvas id="profile-canvas" width="620" height="280" class="rounded-lg" />
        <button
          class="absolute top-3 right-4 text-xs text-zinc-400 hover:text-white transition-colors"
          @click="showProfile = false"
        >✕ 关闭</button>
      </div>
    </div>

    <!-- 教程弹窗 -->
    <TutorialModal v-model:visible="showTutorial" title="地形高度采样与分析">
      <div class="tutorial-body space-y-4 text-sm leading-relaxed">
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">一、TerrainProvider — 地形数据源</h3>
          <p>数字高程模型（DEM）用栅格存储地表高度。Cesium 通过 <code>TerrainProvider</code> 加载量化网格瓦片（quantized-mesh），并在 GPU 中重建地形几何。</p>
          <p class="mt-2 font-semibold text-zinc-300">🔑 关键规则：Terrain 必须在 Viewer 构造时传入，不能事后设置 <code>viewer.terrainProvider = xxx</code>（会破坏底图渲染）。</p>

          <h4 class="text-sm font-semibold text-zinc-300 mt-3">Cesium World Terrain（Ion，需免费 Token）</h4>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>// ✅ Token 内嵌到 Resource，绝不碰 Cesium.Ion.defaultAccessToken
const resource = await Cesium.IonResource.fromAssetId(1, { accessToken: token })
const tp = await Cesium.CesiumTerrainProvider.fromUrl(resource, {
  requestVertexNormals: true,
  requestWaterMask: true,
})</code></pre>

          <h4 class="text-sm font-semibold text-zinc-300 mt-3">ArcGIS World Elevation（免费，无需 Token）</h4>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>const tp = Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer',
)</code></pre>

          <h4 class="text-sm font-semibold text-zinc-300 mt-3">baseLayer: false — 关闭默认底图</h4>
          <p>自定义底图（天地图等）必须配合 <code>baseLayer: false</code>，否则 Cesium 会创建默认 Ion/Bing 底图，触发过期 Token → 401 → 地球黑屏。</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>const viewer = new Cesium.Viewer(container, {
  imageryProvider: undefined,  // 留空，后续手动 addImageryProvider
  baseLayer: false,            // ← 禁用 Cesium 默认底图
  terrainProvider: tp,         // Terrain 在构造时传入
})</code></pre>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">二、sampleTerrain — 精确高度采样</h3>
          <table class="tutorial-table">
            <thead><tr><th>API</th><th>参数</th><th>场景</th></tr></thead>
            <tbody>
              <tr><td><code>scene.sampleHeight(carto)</code></td><td>单个 Cartographic</td><td>鼠标 hover，从已加载瓦片同步查</td></tr>
              <tr><td><code>scene.sampleHeightMostDetailed(ps)</code></td><td>Cartographic[]</td><td>强制加载最精细瓦片后采样（慢）</td></tr>
              <tr><td><code>Cesium.sampleTerrain(tp, level, ps)</code></td><td>provider + level + Cartographic[]</td><td>指定 LOD 批量采样，剖面分析首选</td></tr>
            </tbody>
          </table>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>// 单点采样（点击获取高度）
const tp = viewer.terrainProvider
const pos = Cesium.Cartographic.fromDegrees(lon, lat)
await Cesium.sampleTerrain(tp, level, [pos])
const height = pos.height  // 原地修改

// 批量采样（剖面分析）
const geodesic = new Cesium.EllipsoidGeodesic(start, end)
const samples = []
for (let i = 0; i <= 100; i++) {
  samples.push(geodesic.interpolateUsingFraction(i / 100, new Cesium.Cartographic()))
}
await Cesium.sampleTerrain(tp, level, samples)
// samples[i].height 已填充</code></pre>
          <p class="mt-1 text-zinc-400">⚠️ 高度 = WGS84 椭球面以上（非 MSL 海平面），海洋区域 ≠ 0。推荐用 <code>sampleTerrain</code> 而非 <code>sampleHeight</code>，和剖面分析用同一 API 保证数据一致性。</p>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">三、EllipsoidGeodesic — 大圆路径插值</h3>
          <p>地球椭球上两点间最短路径是"大圆"（geodesic）。<code>EllipsoidGeodesic</code> 可沿该路径按比例插值：</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>const geodesic = new Cesium.EllipsoidGeodesic(startCarto, endCarto)
for (let i = 0; i <= 100; i++) {
  const point = geodesic.interpolateUsingFraction(i / 100, new Cesium.Cartographic())
  // point.longitude, point.latitude → 待采样
}
const totalDistance = geodesic.surfaceDistance  // 米（属性，不是方法！不是 getSurfaceDistance()）</code></pre>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">四、terrainExaggeration — 地形夸张</h3>
          <p>Cesium 在 GPU 着色器中实时应用夸张，不修改原始瓦片数据：</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>// 公式: newHeight = (height - relativeHeight) × exaggeration + relativeHeight
viewer.scene.globe.terrainExaggeration = 3.0       // 3 倍夸张
viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0  // 基准面</code></pre>
          <p class="mt-1 text-zinc-400">⚠️ 只影响地形几何，不抬高 billboard/label，标注点可能"沉入"夸大后的地形</p>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">五、heightReference — Entity 贴地模式</h3>
          <table class="tutorial-table">
            <thead><tr><th>模式</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td><code>NONE</code></td><td>WGS84 椭球绝对高度（默认）</td></tr>
              <tr><td><code>CLAMP_TO_GROUND</code></td><td>吸附到地形表面</td></tr>
              <tr><td><code>RELATIVE_TO_GROUND</code></td><td>相对地形表面的高度</td></tr>
            </tbody>
          </table>
          <p class="mt-2"><b>🔑 关键坑</b>：即使你通过 <code>sampleTerrain</code> 拿到了正确高度，把 Entity position 设为 <code>fromDegrees(lon, lat, height)</code> <b>也不会贴地形</b>。Cesium 的 terrain 渲染和 Entity 绝对坐标是两个独立系统，视觉上不会对齐。</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>// ❌ 高度值正确，但图标不贴地形
position: Cesium.Cartesian3.fromDegrees(lon, lat, sampledHeight)

// ✅ 高度设 0，靠 CLAMP_TO_GROUND 自动贴地形
position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
billboard: { heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }

// 高度数值只显示在 label 文字里，不参与位置计算
label: { text: `${sampledHeight.toFixed(0)} m` }</code></pre>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">六、等高线生成 · 预留接口</h3>
          <p>本 Demo 已预留等高线生成入口（见源码 TODO 注释）：</p>
          <ul class="list-disc list-inside ml-2 space-y-1">
            <li>思路：密集网格采样 → Marching Squares 提取等值线 → polyline 渲染</li>
            <li>备选：<code>turf.js</code> 的 <code>turf.isolines()</code> 可直接从点集生成等值线</li>
            <li>入口函数签名：<code>generateContours(bbox: Rectangle, interval: number)</code></li>
          </ul>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">七、面试话术</h3>

          <p><strong>Q: "Cesium 里怎么配置地形？"</strong></p>
          <p>A: "地形 Provider 必须在 Viewer 构造时通过 <code>terrainProvider</code> 参数传入，不能事后 <code>viewer.terrainProvider = xxx</code>。Cesium World Terrain 用 <code>IonResource.fromAssetId(1, { accessToken })</code> 内嵌 Token，不碰 <code>Ion.defaultAccessToken</code> setter——那个 setter 有全局副作用，会把默认底图切到 Ion 过期 token → 401。如果不想用 Ion，ArcGIS World Elevation 是免费的替代方案，<code>ArcGISTiledElevationTerrainProvider.fromUrl()</code> 一行搞定，无需 Token。"</p>

          <p class="mt-2"><strong>Q: "Cesium 默认底图怎么关闭？"</strong></p>
          <p>A: "<code>baseLayer: false</code>，不是 <code>imageryProvider: undefined</code>。这两个在 Cesium 里语义完全不同——前者禁止创建任何默认底图，后者是告诉 Cesium '用你自带的'，结果就是请求 Ion Bing Maps（asset 2）→ 内置 token 过期 → 401 → 地球黑屏。自定义底图（天地图等）必须配合 <code>baseLayer: false</code>。"</p>

          <p class="mt-2"><strong>Q: "Cesium 里怎么做地形高度查询？"</strong></p>
          <p>A: "三个层次的 API：① <code>scene.sampleHeight()</code> 同步查已加载瓦片，适合鼠标 hover；② <code>scene.sampleHeightMostDetailed()</code> 异步强制加载最精细瓦片后采样，适合精确查询；③ <code>Cesium.sampleTerrain(provider, level)</code> 指定 LOD 批量采样，适合剖面分析。高度是 WGS84 椭球高而非海拔，海洋区域不是 0。"</p>

          <p class="mt-2"><strong>Q: "地形夸张是怎么实现的？"</strong></p>
          <p>A: "Cesium 在 GPU 着色器中动态夸张，公式 <code>(h - relativeH) × exag + relativeH</code>。每个顶点存储大地水准面法向量，精度 ~10cm，滑块实时生效。局限是只影响地形几何，billboard/label 不会跟着抬高，需用 <code>heightReference</code> 补偿。"</p>

          <p class="mt-2"><strong>Q: "两点间如何做高程剖面？"</strong></p>
          <p>A: "① <code>EllipsoidGeodesic</code> 沿大圆路径等距生成采样点；② <code>Cesium.sampleTerrain(provider, level, samples)</code> 批量获取高度；③ Canvas 2D 绘制距离-高程折线图。大圆是椭球上的最短路径，比经纬度线性插值更准确。"</p>

          <p class="mt-2"><strong>Q: "Cesium Ion Token 为什么一设置全局就出问题？"</strong></p>
          <p>A: "<code>Cesium.Ion.defaultAccessToken</code> 的 setter 会触发 Cesium 内部重新配置所有使用 Ion 的服务——包括默认 imagery provider。设置后默认底图立刻切到 Ion 托管的 Bing Maps（asset 2），但 Cesium 内置的默认 token 已过期 → 401。所以任何 Demo 只要碰了这个 setter，即使立刻还原，底图也已经切走了回不来。正确做法是用 <code>IonResource.fromAssetId(id, { accessToken })</code> 把 Token 内嵌到具体资源里，不污染全局。"</p>

          <p class="mt-2"><strong>Q: "Entity 怎么贴到地形表面？"</strong></p>
          <p>A: "用 <code>HeightReference.CLAMP_TO_GROUND</code>。position 的 height 设 0 就行，Cesium 会自动把 billboard/label 吸附到地形。千万别用 <code>fromDegrees(lon, lat, sampledHeight)</code> 设绝对高度——即使数值和地形一致，渲染管线不同也贴不齐。"</p>
        </section>
      </div>
    </TutorialModal>
  </div>
</template>

<style scoped>
/* ---- 教程表格 ---- */
.tutorial-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.tutorial-table th,
.tutorial-table td {
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 4px 10px;
  text-align: left;
}
.tutorial-table th {
  background: rgba(129, 140, 248, 0.12);
  font-weight: 600;
}
</style>
