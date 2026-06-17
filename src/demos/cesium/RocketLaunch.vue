<script setup lang="ts">
/**
 * RocketLaunch — Cesium ParticleSystem 粒子系统实战
 *
 * 场景：文昌火箭发射（矢量 Entity 搭建发射台 + 火箭）
 * 粒子系统 × 2：尾焰 (ConeEmitter) + 烟雾 (CircleEmitter)
 *
 * 面试定位: "ParticleSystem · ConeEmitter/CircleEmitter · modelMatrix 动态跟随"
 */

import { ref, reactive, onUnmounted } from 'vue'
import { GUI } from 'lil-gui'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'

/* ================================================================
 * 1. 响应式状态
 * ================================================================ */

const showTutorial = ref(false)

const state = reactive({
  launched: false,
  speed: 1.0,
  showFlame: true,
  showSmoke: true,
  flightTime: 0,
})

/* ================================================================
 * 2. 非响应式引用
 * ================================================================ */

let viewer: Cesium.Viewer | null = null
let C: any = null
let rocketEntity: Cesium.Entity | null = null
let flamePS: any = null
let smokePS: any = null
let trajectorySamples: { time: number; pos: any }[] = []
let launchStartJulian: any = null

/* ================================================================
 * 3. 程序化粒子贴图 (Canvas 径向渐变)
 * ================================================================ */

function createGlowImage(inner: string, outer: string): HTMLCanvasElement {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.25, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return canvas
}

/* ================================================================
 * 4. 场景建造
 * ================================================================ */

function buildLaunchPad() {
  const { Cartesian3, Color, Cartesian3: C3, Transforms } = C

  // ── 发射台基座（扁灰圆柱）──
  viewer!.entities.add({
    name: '发射台基座',
    position: Cartesian3.fromDegrees(110.949, 19.618, 2),
    cylinder: {
      length: 4,
      topRadius: 25,
      bottomRadius: 28,
      material: Color.fromCssColorString('#4a4a4a'),
    },
  })

  // ── 工作平台 ──
  viewer!.entities.add({
    name: '工作平台',
    position: Cartesian3.fromDegrees(110.949, 19.618, 6),
    cylinder: {
      length: 1,
      topRadius: 18,
      bottomRadius: 20,
      material: Color.fromCssColorString('#666666'),
    },
  })

  // ── 服务塔（高大框架）──
  viewer!.entities.add({
    name: '服务塔',
    position: Cartesian3.fromDegrees(110.9482, 19.6182, 40),
    box: {
      dimensions: new C3(6, 6, 80),
      material: Color.fromCssColorString('#5a5a5a').withAlpha(0.85),
    },
  })

  // ── 塔架横梁（红色水平装饰）──
  for (let h = 10; h <= 80; h += 15) {
    viewer!.entities.add({
      name: `横梁-${h}`,
      position: Cartesian3.fromDegrees(110.9482, 19.6182, h),
      box: {
        dimensions: new C3(8, 1.5, 3),
        material: Color.fromCssColorString('#c0392b'),
      },
    })
  }

  // ── 脐带塔（连接火箭的摆臂结构）──
  viewer!.entities.add({
    name: '脐带塔',
    position: Cartesian3.fromDegrees(110.9495, 19.618, 38),
    box: {
      dimensions: new C3(3, 12, 76),
      material: Color.fromCssColorString('#505050'),
    },
  })

  // ── 避雷塔 × 4 ──
  const offsets = [
    [110.9482, 19.6188],
    [110.9498, 19.6188],
    [110.9482, 19.6172],
    [110.9498, 19.6172],
  ]
  offsets.forEach(([lon, lat]) => {
    viewer!.entities.add({
      name: '避雷塔',
      position: Cartesian3.fromDegrees(lon, lat, 45),
      cylinder: {
        length: 90,
        topRadius: 0.4,
        bottomRadius: 0.8,
        material: Color.fromCssColorString('#808080'),
      },
    })
  })

  // ── 导流槽 ──
  viewer!.entities.add({
    name: '导流槽',
    position: Cartesian3.fromDegrees(110.949, 19.618, -2),
    box: {
      dimensions: new C3(15, 8, 4),
      material: Color.fromCssColorString('#333333'),
    },
  })
}

function buildRocket(): Cesium.Entity {
  const startPos = C.Cartesian3.fromDegrees(110.949, 19.618, 10)

  const rocket = viewer!.entities.add({
    name: '火箭',
    position: startPos,
    cylinder: {
      length: 36,
      topRadius: 2.2,
      bottomRadius: 2.2,
      material: C.Color.WHITE,
    },
  })

  // 整流罩（红色锥形头部）—— 作为子 entity 叠加
  viewer!.entities.add({
    name: '整流罩',
    parent: rocket,
    position: new C.Cartesian3(0, 0, 18),
    cylinder: {
      length: 8,
      topRadius: 0.15,
      bottomRadius: 2.3,
      material: C.Color.fromCssColorString('#e74c3c'),
    },
  })

  // 一级喷管（底部深色段）
  viewer!.entities.add({
    name: '喷管',
    parent: rocket,
    position: new C.Cartesian3(0, 0, -20),
    cylinder: {
      length: 3,
      topRadius: 1.2,
      bottomRadius: 1.6,
      material: C.Color.fromCssColorString('#2c3e50'),
    },
  })

  // 箭体标识条纹（红色环）
  viewer!.entities.add({
    name: '箭体标识',
    parent: rocket,
    position: new C.Cartesian3(0, 0, -8),
    cylinder: {
      length: 2,
      topRadius: 2.25,
      bottomRadius: 2.25,
      material: C.Color.fromCssColorString('#e74c3c'),
    },
  })

  return rocket
}

/* ================================================================
 * 5. 弹道预计算
 * ================================================================ */

function buildTrajectory() {
  const samples: { time: number; pos: any }[] = []
  const padLon = 110.949
  const padLat = 19.618
  const BASE_ALT = 10

  for (let t = 0; t <= 120; t++) {
    // 高度：v₀=20 m/s, a=8 m/s²
    const alt = BASE_ALT + 20 * t + 0.5 * 8 * t * t

    // 水平偏移：前 10s 垂直 → 之后缓慢东偏（重力转弯简化）
    let eastOffset = 0
    if (t > 10) {
      const pt = t - 10
      eastOffset = 0.5 * 3 * pt * pt * 0.5
    }
    const dLon = eastOffset / (111320 * Math.cos((padLat * Math.PI) / 180))

    samples.push({
      time: t,
      pos: C.Cartesian3.fromDegrees(padLon + dLon, padLat, alt),
    })
  }
  return samples
}

/* ================================================================
 * 6. 粒子系统创建
 * ================================================================ */

function createFlameSystem(flameImg: HTMLCanvasElement) {
  const ps = new C.ParticleSystem({
    show: true,
    image: flameImg,
    emitter: new C.ConeEmitter(C.Math.toRadians(12)),
    emissionRate: 200,
    speed: 25,
    minimumSpeed: 20,
    maximumSpeed: 45,
    startScale: 6,
    endScale: 1.5,
    startColor: C.Color.YELLOW.withAlpha(0.9),
    endColor: new C.Color(1.0, 0.2, 0.0, 0.0),
    minimumParticleLife: 0.4,
    maximumParticleLife: 0.9,
    // 发射器放在喷嘴位置（火箭底部 -20m），Z 翻转指向下方
    emitterModelMatrix: (() => {
      const rot = C.Matrix3.fromRotationX(C.Math.toRadians(180))
      return C.Matrix4.fromRotationTranslation(rot, new C.Cartesian3(0, 0, -20))
    })(),
  })
  return ps
}

function createSmokeSystem(smokeImg: HTMLCanvasElement) {
  return new C.ParticleSystem({
    show: true,
    image: smokeImg,
    emitter: new C.CircleEmitter(3.0),
    emissionRate: 60,
    speed: 5,
    minimumSpeed: 2,
    maximumSpeed: 10,
    startScale: 2.5,
    endScale: 14,
    startColor: new C.Color(0.95, 0.95, 0.95, 0.55),
    endColor: new C.Color(0.7, 0.7, 0.7, 0.0),
    minimumParticleLife: 2.5,
    maximumParticleLife: 4.5,
    sizeInMeters: true,
    // 烟雾也从喷嘴位置发出
    emitterModelMatrix: C.Matrix4.fromTranslation(new C.Cartesian3(0, 0, -20), new C.Matrix4()),
  })
}

/* ================================================================
 * 7. 发射 / 重置
 * ================================================================ */

function launch() {
  if (!viewer || state.launched) return

  state.launched = true
  state.flightTime = 0

  // 火箭绑定弹道（用 addSeconds 计算时间，避免 ISO 秒>59 的格式化错误）
  const baseTime = C.JulianDate.fromIso8601('2024-01-01T00:00:00Z')
  const sp = new C.SampledPositionProperty()
  const sampleTime = new C.JulianDate()
  trajectorySamples.forEach((s) => {
    C.JulianDate.addSeconds(baseTime, s.time, sampleTime)
    sp.addSample(C.JulianDate.clone(sampleTime), s.pos)
  })
  rocketEntity!.position = sp

  // 粒子可见
  flamePS.show = state.showFlame
  smokePS.show = state.showSmoke

  // 时钟驱动
  launchStartJulian = baseTime
  viewer.clock.startTime = baseTime.clone()
  viewer.clock.currentTime = baseTime.clone()
  viewer.clock.stopTime = C.JulianDate.addSeconds(baseTime, 120, new C.JulianDate())
  viewer.clock.clockRange = C.ClockRange.LOOP_STOP
  viewer.clock.multiplier = state.speed
  viewer.clock.shouldAnimate = true

  // 相机跟随
  viewer.scene.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(110.949, 19.63, 400),
    orientation: { heading: C.Math.toRadians(90), pitch: C.Math.toRadians(-25), roll: 0 },
    duration: 1.5,
  })
}

function reset() {
  if (!viewer) return

  state.launched = false
  state.flightTime = 0

  viewer.clock.shouldAnimate = false
  viewer.clock.currentTime = C.JulianDate.fromIso8601('2024-01-01T00:00:00Z')
  viewer.clock.multiplier = state.speed

  // 火箭回原位（清除 orientation，恢复默认竖直姿态）
  rocketEntity!.position = C.Cartesian3.fromDegrees(110.949, 19.618, 10)
  rocketEntity!.orientation = undefined as any

  // 重建粒子系统（重置后干净的粒子状态）
  if (flamePS) { viewer.scene.primitives.remove(flamePS); flamePS.destroy() }
  if (smokePS) { viewer.scene.primitives.remove(smokePS); smokePS.destroy() }

  const fImg = createGlowImage('rgba(255,255,100,1)', 'rgba(255,50,0,0)')
  const sImg = createGlowImage('rgba(255,255,255,0.7)', 'rgba(180,180,180,0)')
  flamePS = createFlameSystem(fImg)
  smokePS = createSmokeSystem(sImg)
  viewer.scene.primitives.add(flamePS)
  viewer.scene.primitives.add(smokePS)

  // 相机回初始位置
  viewer.scene.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(110.949, 19.618, 800),
    orientation: { heading: C.Math.toRadians(30), pitch: C.Math.toRadians(-45), roll: 0 },
    duration: 1,
  })
}

/* ================================================================
 * 8. 粒子跟随火箭更新
 * ================================================================ */

function onScenePreUpdate(_scene: any) {
  if (!state.launched || !rocketEntity || !flamePS || !smokePS) return

  const pos = rocketEntity.position?.getValue(viewer!.clock.currentTime)
  if (!pos) return

  // ENU 坐标系：Z=当地垂线（真·上方），避免 ECEF 的 Z=北极导致的横向偏移
  const m = C.Transforms.eastNorthUpToFixedFrame(pos, C.Ellipsoid.WGS84, new C.Matrix4())
  flamePS.modelMatrix = m
  smokePS.modelMatrix = m
}

/* ================================================================
 * 9. CesiumViewer ready 回调
 * ================================================================ */

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  C = window.Cesium

  // 隐藏 logo
  ;(v.cesiumWidget.creditContainer as HTMLElement).style.display = 'none'

  // 建造场景
  buildLaunchPad()
  rocketEntity = buildRocket()
  trajectorySamples = buildTrajectory()

  // 粒子贴图 + 粒子系统
  const fImg = createGlowImage('rgba(255,255,100,1)', 'rgba(255,50,0,0)')
  const sImg = createGlowImage('rgba(255,255,255,0.7)', 'rgba(180,180,180,0)')
  flamePS = createFlameSystem(fImg)
  smokePS = createSmokeSystem(sImg)
  v.scene.primitives.add(flamePS)
  v.scene.primitives.add(smokePS)

  // 粒子跟随
  v.scene.preUpdate.addEventListener(onScenePreUpdate)

  // 飞行时间更新
  v.clock.onTick.addEventListener((clock: Cesium.Clock) => {
    if (state.launched && launchStartJulian) {
      const elapsed = C.JulianDate.secondsDifference(clock.currentTime, launchStartJulian)
      state.flightTime = Math.max(0, elapsed)
    }
  })

  // GUI
  setupGUI()
}

/* ================================================================
 * 10. lil-gui
 * ================================================================ */

let gui: GUI | null = null

function setupGUI() {
  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (!stage || gui) return

  gui = new GUI({ autoPlace: false, width: 260 })
  Object.assign(gui.domElement.style, {
    position: 'absolute', top: '12px', right: '12px', zIndex: '10',
    backdropFilter: 'blur(10px)',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
  })
  stage.appendChild(gui.domElement)

  const ctrl = gui.addFolder('控制')
  ctrl.add({ launch }, 'launch').name('🔴 发射')
  ctrl.add({ reset }, 'reset').name('🔄 重置')
  ctrl.add(state, 'speed', [0.5, 1, 2, 5]).name('速度').onChange((v: number) => {
    state.speed = v
    if (viewer) viewer.clock.multiplier = v
  })

  const fx = gui.addFolder('粒子效果')
  fx.add(state, 'showFlame').name('尾焰').onChange((v: boolean) => { if (flamePS) flamePS.show = v })
  fx.add(state, 'showSmoke').name('烟雾').onChange((v: boolean) => { if (smokePS) smokePS.show = v })

  const info = gui.addFolder('飞行数据')
  info.add(state, 'flightTime').name('飞行时间 (s)').disable().listen()
}

/* ================================================================
 * 11. 清理
 * ================================================================ */

onUnmounted(() => {
  if (viewer && !viewer.isDestroyed()) {
    viewer.scene.preUpdate.removeEventListener(onScenePreUpdate)
  }
  if (flamePS) { flamePS.destroy(); flamePS = null }
  if (smokePS) { smokePS.destroy(); smokePS = null }
  if (gui) { gui.destroy(); gui = null }
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <!-- Header -->
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">粒子系统 · 火箭发射</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">ParticleSystem · ConeEmitter · CircleEmitter · modelMatrix 跟随</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <!-- Cesium 视口 -->
    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer
        :initial-position="[110.949, 19.618, 800]"
        :scene-mode="'3d'"
        @ready="onViewerReady"
      />
    </div>

    <!-- 教程弹窗 -->
    <TutorialModal v-model:visible="showTutorial" title="ParticleSystem 粒子系统">
      <div class="tutorial-body space-y-4 text-sm leading-relaxed">
        <section>
          <h3 class="text-accent text-base font-semibold mb-2">一、Cesium 粒子系统架构</h3>
          <p>
            <code>ParticleSystem</code> 管理一群独立粒子（每个粒子是一个 Billboard），
            挂在 <code>viewer.scene.primitives</code> 上，与 Primitive/Entity 走同一渲染管线。
            适合模拟火焰、烟雾、爆炸碎片、雨雪等效果。
          </p>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">二、四种发射器 (Emitter)</h3>
          <table class="tutorial-table">
            <thead>
              <tr><th>发射器</th><th>构造</th><th>粒子起始</th><th>场景</th></tr>
            </thead>
            <tbody>
              <tr><td>CircleEmitter</td><td><code>new CircleEmitter(radius)</code></td><td>圆盘内随机</td><td>烟雾、波纹</td></tr>
              <tr><td>ConeEmitter</td><td><code>new ConeEmitter(angle)</code></td><td>锥尖 → 锥底</td><td>火焰、喷射</td></tr>
              <tr><td>SphereEmitter</td><td><code>new SphereEmitter(radius)</code></td><td>球内随机</td><td>爆炸碎片</td></tr>
              <tr><td>BoxEmitter</td><td><code>new BoxEmitter(dimensions)</code></td><td>盒内随机</td><td>建筑烟尘</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">三、粒子生命周期渐变</h3>
          <p>每个粒子从出生到死亡，Cesium 自动在以下维度做归一化插值（<code>normalizedAge: 0→1</code>）：</p>
          <ul class="list-disc list-inside ml-2 space-y-1">
            <li><b>颜色</b>：<code>startColor</code> → <code>endColor</code>（alpha 控制淡出）</li>
            <li><b>大小</b>：<code>startScale</code> → <code>endScale</code>（模拟膨胀/收缩）</li>
            <li><b>速度</b>：初始随机速度线性衰减到 0</li>
            <li><b>寿命</b>：<code>min/maxParticleLife</code> 区间内随机取值</li>
          </ul>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">四、modelMatrix — 粒子跟随移动物体</h3>
          <p>粒子系统默认静止在世界原点。要让粒子跟随火箭飞行，每帧更新 <code>modelMatrix</code>：</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>scene.preUpdate.addEventListener(() => {
  const pos = entity.position.getValue(clock.currentTime)
  Cesium.Matrix4.fromTranslation(pos, ps.modelMatrix)
})</code></pre>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">五、程序化粒子贴图</h3>
          <p>用 Canvas 2D 画径向渐变圆，8 行代码免外部图片。不同颜色/透明度组合模拟火焰与烟雾。</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>const c = document.createElement('canvas'); c.width = c.height = 64
const g = c.getContext('2d')!.createRadialGradient(32,32,0,32,32,32)
g.addColorStop(0, 'rgba(255,255,0,1)'); g.addColorStop(1, 'rgba(255,0,0,0)')
c.getContext('2d')!.fill(g)</code></pre>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">六、ParticleBurst 爆发（本 demo 未用）</h3>
          <p>在系统寿命的特定时刻一次性释放大量粒子：</p>
          <pre class="bg-zinc-900 p-2 rounded text-xs mt-1"><code>bursts: [new Cesium.ParticleBurst({ time: 5, minimum: 100, maximum: 300 })]
// 第 5 秒喷出 100-300 个粒子，适合级间分离、爆炸</code></pre>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">七、性能参考</h3>
          <ul class="list-disc list-inside ml-2 space-y-1">
            <li>粒子总数 = <code>emissionRate × particleLife</code>（尾焰 200/s × 1s = 200 个）</li>
            <li>每个粒子 = 1 个 GPU Billboard draw call，2000 以内无忧</li>
            <li><code>sizeInMeters: true</code> 适合大地域场景，false 适合近距离特效</li>
          </ul>
        </section>

        <section>
          <h3 class="text-accent text-base font-semibold mb-2">八、关键 API 速查</h3>
          <table class="tutorial-table">
            <thead><tr><th>属性</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td>emissionRate</td><td>每秒发射数</td></tr>
              <tr><td>min/maxSpeed</td><td>速度范围 (m/s)</td></tr>
              <tr><td>startColor / endColor</td><td>颜色渐变</td></tr>
              <tr><td>startScale / endScale</td><td>大小渐变</td></tr>
              <tr><td>min/maxParticleLife</td><td>寿命范围 (s)</td></tr>
              <tr><td>lifetime</td><td>发射总时长 (s)</td></tr>
              <tr><td>loop</td><td>是否循环</td></tr>
              <tr><td>sizeInMeters</td><td>米 (true) 或像素 (false)</td></tr>
              <tr><td>updateCallback</td><td>每帧外力回调 <code>(p, dt) =&gt; void</code></td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </TutorialModal>

    <!-- 飞行时间 HUD（放在 demo-page 层，覆盖整个页面） -->
    <div
      v-if="state.launched"
      class="absolute bottom-6 left-1/2 z-20 px-6 py-2 rounded-full
             bg-black/60 backdrop-blur text-white font-mono text-lg tracking-wider
             border border-white/10"
      style="transform: translateX(-50%)"
    >
      T+ {{ state.flightTime.toFixed(1) }} s
    </div>
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
