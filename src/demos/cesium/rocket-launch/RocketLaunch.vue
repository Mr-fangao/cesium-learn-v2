<script setup lang="ts">
/**
 * RocketLaunch — Cesium ParticleSystem 粒子系统实战
 * 场景: 文昌火箭发射（矢量 Entity 搭建发射台 + 火箭）
 */

import { ref, reactive, onUnmounted } from 'vue'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'
import {
  createGlowImage, buildLaunchPad, buildRocket, buildTrajectory,
  createFlameSystem, createSmokeSystem, createPreUpdateHandler, setupGUI,
} from './rocketLaunch'

const showTutorial = ref(false)

const state = reactive({
  launched: false, speed: 1.0, showFlame: true, showSmoke: true, flightTime: 0,
})

let viewer: Cesium.Viewer | null = null
let cesium: any = null
let rocketEntity: Cesium.Entity | null = null
let flamePS: any = null
let smokePS: any = null
let trajectorySamples: { time: number; pos: any }[] = []
let launchStartJulian: any = null
let gui: any = null
let preUpdateHandler: ((_scene: any) => void) | null = null

function launch() {
  if (!viewer || state.launched) return
  state.launched = true; state.flightTime = 0

  const baseTime = cesium.JulianDate.fromIso8601('2024-01-01T00:00:00Z')
  const sp = new cesium.SampledPositionProperty()
  const sampleTime = new cesium.JulianDate()
  trajectorySamples.forEach((s) => {
    cesium.JulianDate.addSeconds(baseTime, s.time, sampleTime)
    sp.addSample(cesium.JulianDate.clone(sampleTime), s.pos)
  })
  rocketEntity!.position = sp
  flamePS.show = state.showFlame
  smokePS.show = state.showSmoke

  launchStartJulian = baseTime
  viewer.clock.startTime = baseTime.clone()
  viewer.clock.currentTime = baseTime.clone()
  viewer.clock.stopTime = cesium.JulianDate.addSeconds(baseTime, 120, new cesium.JulianDate())
  viewer.clock.clockRange = cesium.ClockRange.LOOP_STOP
  viewer.clock.multiplier = state.speed
  viewer.clock.shouldAnimate = true

  viewer.scene.camera.flyTo({
    destination: cesium.Cartesian3.fromDegrees(110.951, 19.616, 350),
    orientation: { heading: cesium.Math.toRadians(330), pitch: cesium.Math.toRadians(-35), roll: 0 },
    duration: 1.5,
  })
}

function reset() {
  if (!viewer) return
  state.launched = false; state.flightTime = 0
  viewer.clock.shouldAnimate = false
  viewer.clock.currentTime = cesium.JulianDate.fromIso8601('2024-01-01T00:00:00Z')
  viewer.clock.multiplier = state.speed
  rocketEntity!.position = cesium.Cartesian3.fromDegrees(110.949, 19.618, 10)
  rocketEntity!.orientation = undefined as any

  if (flamePS) { viewer.scene.primitives.remove(flamePS); flamePS.destroy() }
  if (smokePS) { viewer.scene.primitives.remove(smokePS); smokePS.destroy() }
  const fImg = createGlowImage('rgba(255,255,100,1)', 'rgba(255,50,0,0)')
  const sImg = createGlowImage('rgba(255,255,255,0.7)', 'rgba(180,180,180,0)')
  flamePS = createFlameSystem(cesium, fImg)
  smokePS = createSmokeSystem(cesium, sImg)
  viewer.scene.primitives.add(flamePS)
  viewer.scene.primitives.add(smokePS)

  viewer.scene.camera.flyTo({
    destination: cesium.Cartesian3.fromDegrees(110.949, 19.618, 800),
    orientation: { heading: cesium.Math.toRadians(30), pitch: cesium.Math.toRadians(-45), roll: 0 },
    duration: 1,
  })
}

function onViewerReady(v: Cesium.Viewer) {
  viewer = v; cesium = window.Cesium
  ;(v.cesiumWidget.creditContainer as HTMLElement).style.display = 'none'

  buildLaunchPad(v, cesium)
  rocketEntity = buildRocket(v, cesium)
  trajectorySamples = buildTrajectory(cesium)

  const fImg = createGlowImage('rgba(255,255,100,1)', 'rgba(255,50,0,0)')
  const sImg = createGlowImage('rgba(255,255,255,0.7)', 'rgba(180,180,180,0)')
  flamePS = createFlameSystem(cesium, fImg)
  smokePS = createSmokeSystem(cesium, sImg)
  v.scene.primitives.add(flamePS)
  v.scene.primitives.add(smokePS)

  preUpdateHandler = createPreUpdateHandler(
    C, () => viewer, () => rocketEntity, () => flamePS, () => smokePS,
    () => state.launched,
  )
  v.scene.preUpdate.addEventListener(preUpdateHandler)

  v.clock.onTick.addEventListener((clock: Cesium.Clock) => {
    if (state.launched && launchStartJulian) {
      state.flightTime = Math.max(0, cesium.JulianDate.secondsDifference(clock.currentTime, launchStartJulian))
    }
  })

  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (stage) gui = setupGUI(stage, state, () => viewer, () => flamePS, () => smokePS, launch, reset)
}

onUnmounted(() => {
  if (viewer && !viewer.isDestroyed() && preUpdateHandler) {
    viewer.scene.preUpdate.removeEventListener(preUpdateHandler)
  }
  if (flamePS) { flamePS.destroy(); flamePS = null }
  if (smokePS) { smokePS.destroy(); smokePS = null }
  if (gui) { gui.destroy(); gui = null }
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">粒子系统 · 火箭发射</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">ParticleSystem · ConeEmitter · CircleEmitter · modelMatrix 跟随</span>
      <button class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto" @click="showTutorial = true">📖 教程</button>
    </div>

    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer :initial-position="[110.949, 19.618, 800]" scene-mode="3d" @ready="onViewerReady" />
    </div>

    <TutorialModal v-model:visible="showTutorial" title="ParticleSystem 粒子系统">
      <div class="tutorial-body space-y-4 text-sm leading-relaxed">
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">一、Cesium 粒子系统架构</h3>
          <p><code>ParticleSystem</code> 管理一群独立粒子（每个粒子是一个 Billboard），挂在 <code>viewer.scene.primitives</code> 上，与 Primitive/Entity 走同一渲染管线。</p>
        </section>
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">二、四种发射器 (Emitter)</h3>
          <table class="tutorial-table">
            <thead><tr><th>发射器</th><th>构造</th><th>粒子起始</th><th>场景</th></tr></thead>
            <tbody>
              <tr><td>CircleEmitter</td><td><code>new CircleEmitter(radius)</code></td><td>圆盘内随机</td><td>烟雾、波纹</td></tr>
              <tr><td>ConeEmitter</td><td><code>new ConeEmitter(angle)</code></td><td>锥尖 → 锥底</td><td>火焰、喷射</td></tr>
              <tr><td>SphereEmitter</td><td><code>new SphereEmitter(radius)</code></td><td>球内随机</td><td>爆炸碎片</td></tr>
              <tr><td>BoxEmitter</td><td><code>new BoxEmitter(dimensions)</code></td><td>盒内随机</td><td>建筑烟尘</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">三、modelMatrix — 粒子跟随 + ENU 坐标系</h3>
          <p><b>关键陷阱</b>：<code>Matrix4.fromTranslation(pos)</code> 生成 ECEF 矩阵，Z 轴 = 北极方向。非赤道地区需用 <code>eastNorthUpToFixedFrame</code> 生成 ENU 矩阵。</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>scene.preUpdate.addEventListener(() => {
  const pos = entity.position.getValue(clock.currentTime)
  const m = Cesium.Transforms.eastNorthUpToFixedFrame(pos, Cesium.Ellipsoid.WGS84)
  flamePS.modelMatrix = m  // Z=当地真·上方
})</code></pre>
        </section>
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">四、面试话术</h3>
          <p><strong>Q: "Cesium 里怎么做粒子特效？"</strong></p>
          <p>A: "用 <code>ParticleSystem</code>，选合适的 Emitter——锥形做火焰、圆形做烟雾、球形做爆炸——配置 <code>startColor→endColor</code> 和 <code>startScale→endScale</code> 的生命周期渐变。要跟随实体移动就每帧更新 <code>modelMatrix</code>。"</p>
        </section>
      </div>
    </TutorialModal>

    <div v-if="state.launched" class="absolute bottom-6 left-1/2 z-20 px-6 py-2 rounded-full bg-black/60 backdrop-blur text-white font-mono text-lg tracking-wider border border-white/10" style="transform: translateX(-50%)">
      T+ {{ state.flightTime.toFixed(1) }} s
    </div>
  </div>
</template>

<style scoped>
.tutorial-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.tutorial-table th, .tutorial-table td { border: 1px solid rgba(255,255,255,0.12); padding: 4px 10px; text-align: left; }
.tutorial-table th { background: rgba(129,140,248,0.12); font-weight: 600; }
</style>
