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
let profileCanvas: HTMLCanvasElement | null = null
let terrainProvider: any = null

/* ================================================================
 * 3. 地形就绪检测
 * ================================================================ */

function checkTerrain() {
  if (!viewer) return

  const name = (terrainProvider as any)?.constructor?.name ?? ''

  // CesiumTerrainProvider minified name 如 "nD"
  // EllipsoidTerrainProvider minified name 如 "ID" 或其他
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

function addSamplePin(cartesian: any, carto: any, height: number) {
  if (!viewer || !C) return

  const entity = viewer.entities.add({
    position: cartesian,
    billboard: {
      image: createPinCanvas('#4da6ff'),
      verticalOrigin: C.VerticalOrigin.BOTTOM,
      heightReference: C.HeightReference.CLAMP_TO_GROUND,
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
      heightReference: C.HeightReference.CLAMP_TO_GROUND,
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
  if (!viewer || !C || !terrainProvider) return

  // 沿大圆路径生成 100 个采样点
  const geodesic = new C.EllipsoidGeodesic(startCarto, endCarto)
  const samples: any[] = []
  for (let i = 0; i <= 100; i++) {
    const carto = geodesic.interpolateUsingFraction(i / 100, new C.Cartographic())
    samples.push(carto)
  }

  // 批量采样地形高度
  await C.sampleTerrain(terrainProvider, state.sampleLevel, samples)

  // 计算累积距离（沿大圆均匀分布）
  const totalD = geodesic.getSurfaceDistance()
  const distances: number[] = []
  for (let i = 0; i < samples.length; i++) {
    distances.push((totalD * i) / (samples.length - 1))
  }

  showProfile.value = true
  await nextTick()
  drawProfileChart(samples, distances)
}

function drawProfileChart(samples: any[], distances: number[]) {
  const canvas = document.getElementById('profile-canvas') as HTMLCanvasElement | null
  if (!canvas) return
  profileCanvas = canvas

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
    const cartesian = viewer!.scene.pickPosition(click.position)
    if (!cartesian || !C) return

    const carto = C.Cartographic.fromCartesian(cartesian)

    if (state.profileMode) {
      if (!profileA) {
        // 选起点
        profileA = C.Cartographic.clone(carto)
        profileAEntity = viewer!.entities.add({
          position: C.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 5),
          billboard: {
            image: createPinCanvas('#4ade80'),
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            scale: 0.8,
          },
          label: {
            text: 'A 起点',
            font: '13px monospace',
            fillColor: C.Color.fromCssColorString('#4ade80'),
            outlineColor: C.Color.fromCssColorString('#1a1a2e'),
            outlineWidth: 2,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            pixelOffset: new C.Cartesian2(0, -28),
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
          },
        })
      } else if (!profileB) {
        // 选终点
        profileB = C.Cartographic.clone(carto)
        profileBEntity = viewer!.entities.add({
          position: C.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 5),
          billboard: {
            image: createPinCanvas('#f87171'),
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            scale: 0.8,
          },
          label: {
            text: 'B 终点',
            font: '13px monospace',
            fillColor: C.Color.fromCssColorString('#f87171'),
            outlineColor: C.Color.fromCssColorString('#1a1a2e'),
            outlineWidth: 2,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            pixelOffset: new C.Cartesian2(0, -28),
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
          },
        })
        state.profileMode = false
        await computeProfile(profileA, profileB)
      }
      return
    }

    // 普通模式：采样当前点高度
    if (viewer!.scene.sampleHeightSupported) {
      const pos = C.Cartographic.clone(carto)
      const positions = [pos]
      try {
        await viewer!.scene.sampleHeightMostDetailed(positions)
        if (positions[0].height !== undefined) {
          addSamplePin(cartesian, positions[0], positions[0].height)
        }
      } catch {
        // sampleHeightMostDetailed 失败，用 pickPosition 返回的高度
        addSamplePin(cartesian, carto, carto.height)
      }
    } else {
      addSamplePin(cartesian, carto, carto.height)
    }
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
    profileA = null; profileB = null
    if (profileAEntity) { viewer?.entities.remove(profileAEntity); profileAEntity = null }
    if (profileBEntity) { viewer?.entities.remove(profileBEntity); profileBEntity = null }
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
  terrainProvider = v.terrainProvider

  // DEBUG: 不替换 terrain，测试底图是否正常
  v.scene.globe.terrainExaggeration = state.exaggeration
  // checkTerrain()

  // 珠峰参考标记
  v.entities.add({
    position: C.Cartesian3.fromDegrees(86.925, 27.988, 8850),
    billboard: {
      image: createPinCanvas('#ffd93d'),
      verticalOrigin: C.VerticalOrigin.BOTTOM,
      heightReference: C.HeightReference.CLAMP_TO_GROUND,
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
        :initial-position="[86.925, 27.988, 25000]"
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
        ⚠️ 地形瓦片加载中... 需 Cesium Ion Token（<a href="https://ion.cesium.com" target="_blank" class="underline text-amber-300">免费注册</a>）
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
          <h3 class="text-accent text-base font-semibold mb-2">一、DEM 与 TerrainProvider</h3>
          <p>数字高程模型（DEM）用栅格存储地表高度。Cesium 通过 <code>TerrainProvider</code> 加载量化网格瓦片（quantized-mesh），并在 GPU 着色器中重建地形几何。</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>// Cesium World Terrain（推荐，全球覆盖）
viewer.terrainProvider = Cesium.createWorldTerrain({
  requestVertexNormals: true,  // 光照法线
  requestWaterMask: true,      // 水面效果
})

// 自定义地形服务
new Cesium.CesiumTerrainProvider({ url: 'https://your-server/tiles' })</code></pre>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">二、sampleTerrain — 批量高度采样</h3>
          <table class="tutorial-table">
            <thead><tr><th>API</th><th>参数</th><th>特点</th></tr></thead>
            <tbody>
              <tr><td><code>scene.sampleHeight(carto)</code></td><td>单个 Cartographic</td><td>同步，从已加载瓦片采样</td></tr>
              <tr><td><code>scene.sampleHeightMostDetailed(positions)</code></td><td>Cartographic[]</td><td>异步，强制加载最精细瓦片</td></tr>
              <tr><td><code>Cesium.sampleTerrain(provider, level, positions)</code></td><td>provider + level + Cartographic[]</td><td>异步，可指定 LOD 级别</td></tr>
            </tbody>
          </table>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>const positions = [Cesium.Cartographic.fromDegrees(86.925, 27.988)]
await Cesium.sampleTerrain(terrainProvider, 11, positions)
console.log(positions[0].height)  // 原地修改 → 8848m</code></pre>
          <p class="mt-1 text-zinc-400">⚠️ 高度 = WGS84 椭球面以上（非 MSL 海平面），海洋区域 ≠ 0</p>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">三、EllipsoidGeodesic — 大圆路径插值</h3>
          <p>地球椭球上两点间最短路径是"大圆"（geodesic）。<code>EllipsoidGeodesic</code> 可沿该路径按比例插值：</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>const geodesic = new Cesium.EllipsoidGeodesic(startCarto, endCarto)
for (let i = 0; i <= 100; i++) {
  const point = geodesic.interpolateUsingFraction(i / 100, new Cesium.Cartographic())
  // point.longitude, point.latitude → 待采样
}
const totalDistance = geodesic.getSurfaceDistance()  // 米</code></pre>
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
          <p><strong>Q: "Cesium 里怎么做地形高度查询？"</strong></p>
          <p>A: "三个层次的 API：① <code>scene.sampleHeight()</code> 同步查已加载瓦片，适合鼠标 hover；② <code>scene.sampleHeightMostDetailed()</code> 异步强制加载最精细瓦片后采样，适合精确查询；③ <code>Cesium.sampleTerrain(provider, level)</code> 指定 LOD 批量采样，适合剖面分析这种几百上千个点的场景。核心注意事项：高度是 WGS84 椭球高而非海拔，海洋区域不是 0。"</p>

          <p class="mt-2"><strong>Q: "地形夸张是怎么实现的？"</strong></p>
          <p>A: "Cesium 1.83 后使用 GPU 着色器动态夸张，公式是 <code>(h - relativeH) × exag + relativeH</code>。每个顶点存储大地水准面法向量，着色器重建夸张位置，精度 ~10cm。优势是不需要预处理瓦片，滑块实时生效。局限是只影响地形几何，billboard/label 等 Entity 不会跟着抬高，需要用 heightReference 做补偿。"</p>

          <p class="mt-2"><strong>Q: "两点间如何做高程剖面？"</strong></p>
          <p>A: "① 用 <code>EllipsoidGeodesic</code> 沿大圆路径等距生成 100+ 采样点；② <code>Cesium.sampleTerrain(provider, level, samples)</code> 批量获取高度；③ Canvas 2D 绘制距离-高程折线图。大圆是椭球上的最短路径，比简单的经纬度线性插值更准确。"</p>
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
