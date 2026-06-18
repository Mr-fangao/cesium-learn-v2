<script setup lang="ts">
/**
 * TerrainAnalysis — Cesium 地形高度采样与分析
 */

import { ref, reactive, onUnmounted, nextTick } from 'vue'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'
import {
  checkTerrain, addGroundMarker, addSamplePin,
  computeProfile, drawProfileChart,
  setupClickHandler, setupGUI,
} from './terrainAnalysis'
import type { TerrainState } from './terrainAnalysis'

const showTutorial = ref(false)
const showProfile = ref(false)
const terrainReady = ref(false)

const state = reactive<TerrainState>({ exaggeration: 3.0, sampleLevel: 11, profileMode: false })

let viewer: Cesium.Viewer | null = null
let cesium: any = null
let gui: any = null
let handler: any = null
let samplePins: Cesium.Entity[] = []

const profileData = { a: null as any, b: null as any, aEntity: null as Cesium.Entity | null, bEntity: null as Cesium.Entity | null, locked: false }

function clearProfile() {
  profileData.a = null; profileData.b = null; profileData.locked = false
  if (profileData.aEntity) { viewer?.entities.remove(profileData.aEntity); profileData.aEntity = null }
  if (profileData.bEntity) { viewer?.entities.remove(profileData.bEntity); profileData.bEntity = null }
  showProfile.value = false
  state.profileMode = false
}

function clearAllSamples() {
  samplePins.forEach(e => viewer?.entities.remove(e))
  samplePins = []
  clearProfile()
}

async function onProfileReady(a: any, b: any) {
  if (!viewer || !cesium) { profileData.locked = false; return }
  try {
    const r = await computeProfile(viewer, cesium, a, b, state.sampleLevel)
    if (r) {
      showProfile.value = true
      await nextTick()
      drawProfileChart(r.samples, r.distances)
    }
  } catch (e: any) {
    console.error('[Terrain] computeProfile failed:', e.message || e)
  } finally {
    profileData.locked = false
  }
}

function onViewerReady(v: Cesium.Viewer) {
  viewer = v; cesium = window.Cesium
  v.scene.globe.terrainExaggeration = state.exaggeration
  checkTerrain(v, (v) => { terrainReady.value = v })

  v.camera.flyTo({
    destination: cesium.Cartesian3.fromDegrees(86.925, 27.988, 30000),
    orientation: { heading: cesium.Math.toRadians(15), pitch: cesium.Math.toRadians(-35), roll: 0 },
    duration: 0,
  })

  addGroundMarker(v, cesium, cesium.Math.toRadians(86.925), cesium.Math.toRadians(27.988), '珠穆朗玛峰 8848m', '#ffd93d', 0.8)

  handler = setupClickHandler(v, cesium, state, samplePins, profileData, onProfileReady, () => {})

  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (stage) gui = setupGUI(stage, state, () => viewer, () => { clearProfile(); state.profileMode = true }, clearAllSamples)
}

onUnmounted(() => {
  if (handler) { handler.destroy(); handler = null }
  if (gui) { gui.destroy(); gui = null }
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">地形高度采样</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">sampleTerrain · EllipsoidGeodesic · terrainExaggeration</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded ml-auto" :class="terrainReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'">{{ terrainReady ? '地形已加载' : '等待地形...' }}</span>
      <button class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors" @click="showTutorial = true">📖 教程</button>
    </div>

    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer :initial-position="[86.925, 27.988, 30000]" terrain="ion" @ready="onViewerReady" />

      <div class="absolute left-4 top-4 z-10 text-xs text-zinc-400 bg-black/50 backdrop-blur rounded-lg px-3 py-2 space-y-1 border border-white/10">
        <p v-if="!state.profileMode">🖱️ 点击地表 → 采样高度</p>
        <p v-else class="text-emerald-400">📍 请点击剖面 <b>起点 A</b>{{ profileData.a ? ' ✓ 已选，请点击终点 B' : '' }}</p>
        <p v-if="samplePins.length > 0" class="text-zinc-500">{{ samplePins.length }} 个采样点</p>
      </div>

      <div v-if="!terrainReady" class="absolute right-4 bottom-4 z-10 text-xs text-amber-400 bg-amber-500/10 backdrop-blur rounded-lg px-3 py-2 border border-amber-500/20 max-w-xs">
        ⚠️ Cesium World Terrain 瓦片加载中...
      </div>

      <div v-if="showProfile" class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 bg-black/70 backdrop-blur rounded-xl border border-white/15 p-2">
        <canvas id="profile-canvas" width="620" height="280" class="rounded-lg" />
        <button class="absolute top-3 right-4 text-xs text-zinc-400 hover:text-white transition-colors" @click="showProfile = false">✕ 关闭</button>
      </div>
    </div>

    <TutorialModal v-model:visible="showTutorial" title="地形高度采样与分析">
      <div class="tutorial-body space-y-4 text-sm leading-relaxed">
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">一、TerrainProvider — 地形数据源</h3>
          <p>数字高程模型（DEM）用栅格存储地表高度。Cesium 通过 <code>TerrainProvider</code> 加载量化网格瓦片（quantized-mesh），并在 GPU 中重建地形几何。</p>
          <p class="mt-2 font-semibold text-zinc-300">🔑 关键规则：Terrain 必须在 Viewer 构造时传入，不能事后设置 <code>viewer.terrainProvider = xxx</code>（会破坏底图渲染）。</p>
          <h4 class="text-sm font-semibold text-zinc-300 mt-3">Cesium World Terrain（Ion，需免费 Token）</h4>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>const resource = await Cesium.IonResource.fromAssetId(1, { accessToken: token })
const tp = await Cesium.CesiumTerrainProvider.fromUrl(resource, {
  requestVertexNormals: true, requestWaterMask: true,
})</code></pre>
          <h4 class="text-sm font-semibold text-zinc-300 mt-3">ArcGIS World Elevation（免费，无需 Token）</h4>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>const tp = Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer',
)</code></pre>
          <h4 class="text-sm font-semibold text-zinc-300 mt-3">baseLayer: false — 关闭默认底图</h4>
          <p>自定义底图（天地图等）必须配合 <code>baseLayer: false</code>，否则 Cesium 会创建默认 Ion/Bing 底图，触发过期 Token → 401 → 地球黑屏。</p>
        </section>
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">二、sampleTerrain — 精确高度采样</h3>
          <table class="tutorial-table">
            <thead><tr><th>API</th><th>参数</th><th>场景</th></tr></thead>
            <tbody>
              <tr><td><code>scene.sampleHeight(carto)</code></td><td>单个 Cartographic</td><td>鼠标 hover，同步查</td></tr>
              <tr><td><code>scene.sampleHeightMostDetailed(ps)</code></td><td>Cartographic[]</td><td>强制加载最精细瓦片后采样（慢）</td></tr>
              <tr><td><code>Cesium.sampleTerrain(tp, level, ps)</code></td><td>provider + level + Cartographic[]</td><td>指定 LOD 批量采样，剖面分析首选</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">三、EllipsoidGeodesic — 大圆路径插值</h3>
          <p>地球椭球上两点间最短路径是"大圆"（geodesic）。<code>EllipsoidGeodesic</code> 可沿该路径按比例插值，<code>surfaceDistance</code> 为只读属性（非方法）。</p>
        </section>
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">四、terrainExaggeration — 地形夸张</h3>
          <p>Cesium 在 GPU 着色器中实时应用夸张：<code>newHeight = (height - relativeHeight) × exaggeration + relativeHeight</code></p>
        </section>
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">五、heightReference — Entity 贴地模式</h3>
          <p><b>🔑 关键坑</b>：<code>CLAMP_TO_GROUND</code> + <code>disableDepthTestDistance: Infinity</code> 二者缺一不可。缺前者图标不贴地形，缺后者 z-fighting 沉入地下。</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>// ✅ 正确组合
position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
billboard: {
  heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
}</code></pre>
        </section>
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">六、面试话术</h3>
          <p><strong>Q: "Cesium 里怎么配置地形？"</strong></p>
          <p>A: "地形 Provider 必须在 Viewer 构造时通过 <code>terrainProvider</code> 参数传入。Cesium World Terrain 用 <code>IonResource.fromAssetId(1, { accessToken })</code> 内嵌 Token，不碰 <code>Ion.defaultAccessToken</code> setter。ArcGIS World Elevation 是免费替代方案。"</p>
          <p class="mt-2"><strong>Q: "Cesium 里怎么做地形高度查询？"</strong></p>
          <p>A: "三个层次：<code>sampleHeight()</code> 同步查、<code>sampleHeightMostDetailed()</code> 异步最精细、<code>sampleTerrain(provider, level)</code> 指定 LOD 批量采样。"</p>
          <p class="mt-2"><strong>Q: "Entity 怎么贴到地形表面？"</strong></p>
          <p>A: "<code>CLAMP_TO_GROUND</code> + <code>disableDepthTestDistance: Infinity</code>。千万别用 fromDegrees(lon,lat,sampledHeight) 设绝对高度——渲染管线不同贴不齐。"</p>
        </section>
      </div>
    </TutorialModal>
  </div>
</template>

<style scoped>
.tutorial-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.tutorial-table th, .tutorial-table td { border: 1px solid rgba(255,255,255,0.12); padding: 4px 10px; text-align: left; }
.tutorial-table th { background: rgba(129,140,248,0.12); font-weight: 600; }
</style>
