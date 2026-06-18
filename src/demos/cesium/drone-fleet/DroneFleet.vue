<script setup lang="ts">
/**
 * DroneFleet — 无人机蜂群态势监控系统
 *
 * 核心模式:
 *   1. CallbackProperty 驱动 position/orientation（每帧回调最新值）
 *   2. Simulated WebSocket → addSample → SampledPositionProperty 插值
 *   3. 轨迹滑动时间窗口 + 纯色 Polyline（Cesium 1.111 shader bug 降级方案）
 *   4. 历史回放: 预加载全量样本 + ReplayController 状态机 + 共享渲染路径
 *
 * 面试定位: "无人机蜂群实时态势监控与历史回放系统"
 */

import { ref, reactive, onUnmounted } from 'vue'
import { GUI } from 'lil-gui'
import { createDemoGui } from '@/shared/gui'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'
import { generateFlightData } from './droneData'
import { DroneWsSimulator } from './droneWsSimulator'
import { ReplayController } from './replayController'
import ReplayBar from './ReplayBar.vue'
import type { DroneConfig, DroneSample } from './droneData'

/* ================================================================
 * 1. 数据生成 & 模拟器实例
 * ================================================================ */

const flightData = generateFlightData()
let simulator: DroneWsSimulator

/* ================================================================
 * 2. 响应式状态
 * ================================================================ */

const showTutorial = ref(false)

const settings = reactive({
  mode: 'live' as 'live' | 'replay',
  droneCount: 15,
  speed: 1.0,
  trackWindow: 60,
  trackWidth: 4,
  showTracks: true,
  showLabels: false,
})

const REPLAY_TOTAL = 300 // 总时长（秒），与 flightData 一致

/* ================================================================
 * 3. 非响应式状态
 * ================================================================ */

let viewer: Cesium.Viewer | null = null
let gui: GUI | null = null
let droneDS: Cesium.CustomDataSource | null = null
let trackDS: Cesium.CustomDataSource | null = null

/** 每个无人机的状态 */
interface TimeState {
  sampledPosition: any       // Cesium.SampledPositionProperty
  latestPos: Cesium.Cartesian3
  latestOri: Cesium.Quaternion
}
const droneStates = new Map<string, TimeState>()
let baseTime: any = null           // 基准 JulianDate（第一个采样点的绝对时间）
let currentRenderTime = 0          // 当前渲染时间（相对秒），每帧平滑更新
let lastFrameTime = 0              // 上一帧的实际时间戳
const SAMPLE_DELAY = 3             // 渲染延迟（秒），保证插值所需的前瞻数据

/** 最新朝向: droneId → Quaternion（quick lookup） */
const latestOrientations = new Map<string, Cesium.Quaternion>()

/** 轨迹历史: droneId → [{time, pos}] */
const trackHistory = new Map<string, { time: number; pos: Cesium.Cartesian3 }[]>()

/** 活跃无人机 ID 集合 */
const activeDroneIds = new Set<string>()

// —— 回放模式状态 ——
let replayController: ReplayController | null = null
let lastReplayFrameTime = 0
/** 响应式回放状态（ReplayBar props 绑定） */
const replayDisplayTime = ref(0)
const replayDisplayPlaying = ref(false)
const replayDisplaySpeed = ref(1.0)
/** 快查表: droneId → (time → DroneSample)，O(1) 查找任意时刻的朝向/标签数据 */
const samplesByTime = new Map<string, Map<number, DroneSample>>()

/* ================================================================
 * 4. Billboard 图标 + Track 颜色
 * ================================================================ */

const TRACK_COLORS = [
  '#00CFF8', '#FF6B6B', '#51CF66', '#FFD43B', '#845EF7',
  '#FF922B', '#20C997', '#F06595', '#5C7CFA', '#FCC419',
  '#22B8CF', '#E8590C', '#AE3EC9', '#099268', '#748FFC',
]

let _colorIdx = 0
function nextColor(): string {
  return TRACK_COLORS[_colorIdx++ % TRACK_COLORS.length]
}

function createDroneCanvas(color: string): HTMLCanvasElement {
  const s = 32
  const c = document.createElement('canvas')
  c.width = s; c.height = s
  const ctx = c.getContext('2d')!
  ctx.beginPath(); ctx.arc(s / 2, s / 2, 12, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
  ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 2; ctx.stroke()
  return c
}

/* ================================================================
 * 5. Entity 创建
 * ================================================================ */

function getCesium(): any { return (window as any).Cesium }

/**
 * 获取当前渲染时间偏移（秒），模式感知。
 * 实时模式: currentRenderTime（平滑追赶 simTime-3）
 * 回放模式: replayController.replayTime（用户控制）
 * 两种模式共享同一个 CallbackProperty / 标签渲染路径。
 */
function getRenderOffset(): number {
  if (settings.mode === 'replay' && replayController) {
    return replayController.replayTime
  }
  return currentRenderTime
}

function createDroneEntity(cfg: DroneConfig) {
  const cesium = getCesium()
  if (!cesium || !droneDS || !viewer) return

  const droneId = cfg.id
  activeDroneIds.add(droneId)
  const color = nextColor()

  // 初始化位置缓存
  const initPos = cesium.Cartesian3.fromDegrees(cfg.startLon, cfg.startLat, cfg.altitude)
  const sp = new cesium.SampledPositionProperty()
  sp.forwardExtrapolationType = cesium.ExtrapolationType.HOLD
  sp.backwardExtrapolationType = cesium.ExtrapolationType.HOLD
  sp.addSample(cesium.JulianDate.now(), initPos)

  const state: TimeState = {
    sampledPosition: sp,
    latestPos: initPos.clone(),
    latestOri: cesium.Quaternion.IDENTITY.clone(),
  }
  droneStates.set(droneId, state)
  latestOrientations.set(droneId, cesium.Quaternion.IDENTITY.clone())
  trackHistory.set(droneId, [])

  // 无人机实体
  droneDS.entities.add({
    id: droneId,
    name: cfg.name,
    position: new cesium.CallbackProperty(() => {
      if (!baseTime) return initPos
      const s = droneStates.get(droneId)
      if (!s) return initPos
      // 在 baseTime + 当前渲染偏移处插值
      const renderTime = cesium.JulianDate.addSeconds(baseTime, getRenderOffset(), new cesium.JulianDate())
      return s.sampledPosition.getValue(renderTime) ?? s.latestPos
    }, false),
    orientation: new cesium.CallbackProperty(() => latestOrientations.get(droneId) ?? cesium.Quaternion.IDENTITY, false),
    billboard: {
      image: createDroneCanvas(color),
      scale: 1.0,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: cfg.name.replace(/-\d{3}$/, ''),
      font: '10px monospace',
      fillColor: cesium.Color.WHITE,
      style: cesium.LabelStyle.FILL,
      verticalOrigin: cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new cesium.Cartesian2(0, -16),
      show: settings.showLabels,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })

  // HTML 浮层标签
  if (settings.showLabels) createLabelElement(droneId, cfg)

  // 轨迹实体 — 每 tick 通过 polyline 整体替换更新
  trackDS!.entities.add({
    id: `track-${droneId}`,
    polyline: {
      positions: [initPos.clone(), cesium.Cartesian3.add(initPos.clone(), new cesium.Cartesian3(1, 1, 0), new cesium.Cartesian3())],
      material: cesium.Color.fromCssColorString(color).withAlpha(0.7),
      width: settings.trackWidth,
      show: settings.showTracks,
      clampToGround: false,
    },
  })
  // 记住颜色供后续更新使用
  const te = trackDS!.entities.getById(`track-${droneId}`) as any; if (te) te._droneColor = color
}

/* ================================================================
 * 6. 朝向计算（参照 fixInitOffsetQuaternion）
 * ================================================================ */

function updateOrientation(droneId: string, yaw: number, pitch: number, roll: number) {
  const cesium = getCesium()
  if (!cesium) return
  // yaw: 0=正北顺时针 → Cesium heading: 0=正东逆时针
  const hpr = new cesium.HeadingPitchRoll(
    cesium.Math.toRadians(90 - yaw),
    cesium.Math.toRadians(pitch),
    cesium.Math.toRadians(roll),
  )
  const ori = cesium.Transforms.headingPitchRollQuaternion(droneStates.get(droneId)!.latestPos, hpr)
  latestOrientations.set(droneId, ori)
}

/* ================================================================
 * 7. 模拟器回调
 * ================================================================ */

/**
 * 每帧更新 currentRenderTime（平滑推进）
 * currentRenderTime 以实时速度追 max(0, simTime - SAMPLE_DELAY)
 */
function updateRenderTime() {
  if (settings.mode !== 'live') return
  if (!baseTime) return
  const now = Date.now() / 1000 // 秒
  const delta = lastFrameTime > 0 ? (now - lastFrameTime) * settings.speed : 0
  lastFrameTime = now
  if (delta > 0) {
    const simTime = simulator?.simTime ?? 0
    // 目标: simTime - SAMPLE_DELAY（渲染延迟 3 秒）
    const target = Math.max(0, simTime - SAMPLE_DELAY)
    // 以实时速度追目标，不跳变
    if (currentRenderTime < target) {
      currentRenderTime = Math.min(currentRenderTime + delta, target)
    }
  }
}

function onSimTick(data: {
  simTime: number
  drones: Map<string, { lon: number; lat: number; alt: number; yaw: number; pitch: number; roll: number; speed: number }>
  warnings: Array<{ droneId: string; title: string; level: string }>
}) {
  const cesium = getCesium()
  if (!cesium || !viewer || viewer.isDestroyed() || !droneDS) return

  // 建立基准时间
  if (!baseTime) baseTime = cesium.JulianDate.now()

  // 采样以 simTime 秒偏移添加到 SampledPositionProperty
  const sampleTime = cesium.JulianDate.addSeconds(baseTime, data.simTime, new cesium.JulianDate())

  if (data.simTime % 10 === 0) {
    console.log(`[DroneFleet] t=${data.simTime}s, samples=${data.drones.size}, active=${activeDroneIds.size}`)
  }

  // —— 动态增减无人机 ——
  while (activeDroneIds.size < settings.droneCount) {
    for (const cfg of flightData.configs) {
      if (activeDroneIds.size >= settings.droneCount) break
      if (!activeDroneIds.has(cfg.id)) createDroneEntity(cfg)
    }
  }
  while (activeDroneIds.size > settings.droneCount) {
    const toRemove = Array.from(activeDroneIds).pop()!
    droneDS.entities.removeById(toRemove)
    // 移除轨迹 entity + HTML 标签
    trackDS!.entities.removeById(`track-${toRemove}`)
    removeLabelElement(toRemove)
    activeDroneIds.delete(toRemove)
    latestOrientations.delete(toRemove)
    trackHistory.delete(toRemove)
    droneStates.delete(toRemove)
  }

  // —— 更新位置 & 朝向 ——
  for (const [droneId, s] of data.drones) {
    if (!activeDroneIds.has(droneId)) continue
    const pos = cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.alt)
    const state = droneStates.get(droneId)
    if (state) {
      state.sampledPosition.addSample(sampleTime, pos)
      state.latestPos = pos.clone()
    }
    updateOrientation(droneId, s.yaw, s.pitch ?? 0, s.roll ?? 0)
    // 更新 HTML 浮层内容
    if (settings.showLabels) updateLabelContent(droneId, s)

    // 轨迹历史
    const history = trackHistory.get(droneId)!
    history.push({ time: data.simTime, pos: pos.clone() })
    if (history.length > 1200) history.shift()

    // 替换整个 polyline 对象触发 Cesium 重渲染
    const trackEntity = trackDS!.entities.getById(`track-${droneId}`)
    if (trackEntity && history.length >= 2) {
      const cutoff = settings.trackWindow > 0 ? data.simTime - settings.trackWindow : 0
      const windowed = settings.trackWindow > 0 ? history.filter(h => h.time >= cutoff) : history
      if (windowed.length >= 2) {
        const c = (trackEntity as any)._droneColor || '#00CFF8'
        trackEntity.polyline = {
          positions: windowed.map(h => h.pos),
          material: cesium.Color.fromCssColorString(c).withAlpha(0.7),
          width: settings.trackWidth,
          show: settings.showTracks,
          clampToGround: false,
        }
      }
    }
  }

  // —— 告警处理 ——
  for (const w of data.warnings) {
    console.warn(`[DroneFleet] 🚨 ${w.droneId}: ${w.title} (${w.level})`)
  }
}

/* ================================================================
 * 8a. 回放模式 — 预加载 & 状态切换
 * ================================================================ */

/** 确保所有 drone 实体已创建（实时模式可能只建了部分） */
function ensureAllDronesCreated() {
  for (const cfg of flightData.configs) {
    if (!activeDroneIds.has(cfg.id)) {
      createDroneEntity(cfg)
    }
  }
}

/** 回放模式：批量预加载全部采样点到 SampledPositionProperty */
function preloadAllSamplesForReplay() {
  const cesium = getCesium()
  if (!cesium || !baseTime) return

  for (const [droneId, state] of droneStates) {
    const samples = flightData.samples[droneId]
    if (!samples || samples.length === 0) continue

    // 重建 SampledPositionProperty（清空实时模式的零散采样点）
    const newSp = new cesium.SampledPositionProperty()
    newSp.forwardExtrapolationType = cesium.ExtrapolationType.HOLD
    newSp.backwardExtrapolationType = cesium.ExtrapolationType.HOLD

    for (const s of samples) {
      const pos = cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.alt)
      const jd = cesium.JulianDate.addSeconds(baseTime, s.time, new cesium.JulianDate())
      newSp.addSample(jd, pos)
    }

    state.sampledPosition = newSp

    // 同步重建 trackHistory（全量，供 rebuildTracksAtTime 过滤）
    const history = samples.map(s => ({
      time: s.time,
      pos: cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.alt),
    }))
    trackHistory.set(droneId, history)
  }
}

/** 构建 samplesByTime 快查表（O(1) 查找任意时刻的朝向/标签数据） */
function buildSamplesLookup() {
  samplesByTime.clear()
  for (const [droneId, samples] of Object.entries(flightData.samples)) {
    const map = new Map<number, DroneSample>()
    for (const s of samples) map.set(s.time, s)
    samplesByTime.set(droneId, map)
  }
}

/** 在指定时间重建所有轨迹线（滑动窗口过滤） */
let _lastRebuildIntSec = -1

function rebuildTracksAtTime(currentTime: number) {
  // 节流：采样点 1Hz，不到下一秒轨迹 positions 完全不变，跳过不必要的重建
  const intSec = Math.floor(currentTime)
  if (intSec === _lastRebuildIntSec) return
  _lastRebuildIntSec = intSec

  const cesium = getCesium()
  if (!cesium) return

  for (const droneId of activeDroneIds) {
    const history = trackHistory.get(droneId)
    if (!history || history.length < 2) continue

    const cutoff = settings.trackWindow > 0 ? currentTime - settings.trackWindow : -Infinity
    const windowed = settings.trackWindow > 0
      ? history.filter(h => h.time >= cutoff && h.time <= currentTime)
      : history.filter(h => h.time <= currentTime)

    const trackEntity = trackDS?.entities.getById(`track-${droneId}`)
    if (!trackEntity || windowed.length < 2) continue

    const color = (trackEntity as any)._droneColor || '#00CFF8'
    trackEntity.polyline = {
      positions: windowed.map(h => h.pos),
      material: cesium.Color.fromCssColorString(color).withAlpha(0.7),
      width: settings.trackWidth,
      show: settings.showTracks,
      clampToGround: false,
    }
  }
}

/** 在回放时间点更新无人机朝向 + HTML 标签内容 */
function updateReplayOrientations(time: number) {
  const floorTime = Math.floor(time)

  for (const droneId of activeDroneIds) {
    const lookup = samplesByTime.get(droneId)
    if (!lookup) continue

    // 查找 ≤ floorTime 最近的采样点
    for (let t = Math.min(floorTime, REPLAY_TOTAL); t >= 0; t--) {
      const s = lookup.get(t)
      if (s) {
        updateOrientation(droneId, s.yaw, s.pitch ?? 0, s.roll ?? 0)
        if (settings.showLabels) updateLabelContent(droneId, s)
        break
      }
    }
  }
}

/** 每帧回放更新（scene.preUpdate 监听，仅在 replay 模式生效） */
function updateReplayFrame() {
  if (settings.mode !== 'replay' || !replayController) return
  const now = Date.now() / 1000
  const rawDelta = lastReplayFrameTime > 0 ? (now - lastReplayFrameTime) : 0
  lastReplayFrameTime = now
  // ReplayController.update 内部会乘以 speed，这里只传原始时间增量
  const changed = replayController.update(rawDelta)
  if (changed !== null) {
    // 时间变化 → 同步响应式状态（onTimeChanged 已处理 displayTime）
    // 检查自动暂停
    if (!replayController.playing) {
      replayDisplayPlaying.value = false
    }
  }
}

/** 切换到回放模式 */
function switchToReplay() {
  const cesium = getCesium()
  if (!cesium) return

  // 确保 baseTime 已初始化（实时模式可能还没收到第一个 tick）
  if (!baseTime) {
    baseTime = cesium.JulianDate.now()
  }

  // 1. 暂停实时推送
  simulator.pause()

  // 2. 确保所有 drone 已创建
  ensureAllDronesCreated()

  // 3. 预加载全部样本
  preloadAllSamplesForReplay()

  // 4. 构建快查表
  buildSamplesLookup()

  // 5. 初始化回放控制器，从当前实时位置开始
  const startTime = Math.max(0, Math.min(currentRenderTime, REPLAY_TOTAL))
  replayController = new ReplayController(REPLAY_TOTAL)
  replayController.seekTo(startTime)
  replayController.onTimeChanged((t) => {
    replayDisplayTime.value = t
    rebuildTracksAtTime(t)
    updateReplayOrientations(t)
  })
  lastReplayFrameTime = Date.now() / 1000
  replayDisplayTime.value = startTime
  replayDisplayPlaying.value = false
  replayDisplaySpeed.value = settings.speed

  // 6. 更新 GUI state
  settings.mode = 'replay'
}

/** 切回实时模式 */
function switchToLive() {
  // 1. 销毁回放控制器
  replayController?.pause()
  replayController = null

  // 2. 恢复实时模拟器
  const resumeTime = currentRenderTime
  simulator.seekTo(resumeTime)
  simulator.resume()

  // 3. 更新 GUI state
  settings.mode = 'live'
}

// —— ReplayBar 事件处理 ——
function onReplaySeek(t: number) {
  // seekTo 内部触发 onTimeChanged → rebuildTracksAtTime + updateReplayOrientations
  replayController?.seekTo(t)
  replayDisplayTime.value = replayController?.replayTime ?? 0
  // 注: 上面的 seekTo 可能因时间相同（replayController 内部钳位）而不触发 onTimeChanged
  // 但 slider 拖拽时 t 几乎肯定不同，所以不需要额外调用
}

function onReplayTogglePlay() {
  replayController?.toggle()
  replayDisplayPlaying.value = replayController?.playing ?? false
}

function onReplayRestart() {
  replayController?.restart()
  replayDisplayTime.value = 0
  replayDisplayPlaying.value = false
  rebuildTracksAtTime(0)
  updateReplayOrientations(0)
}

function onReplaySetSpeed(v: number) {
  settings.speed = v
  replayDisplaySpeed.value = v
  replayController?.setSpeed(v)
}

/* ================================================================
 * 8b. lil-gui
 * ================================================================ */

function setupGUI() {
  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (!stage) return

  gui = createDemoGui(stage)

  gui.add(settings, 'mode', ['live', 'replay']).name('模式')
    .onChange((v: 'live' | 'replay') => {
      if (v === 'replay') switchToReplay()
      else switchToLive()
    })

  gui.add(settings, 'droneCount', [5, 10, 15, 20, 25, 30]).name('无人机数量')

  gui.add(settings, 'speed', [0.5, 1, 2, 5, 10]).name('飞行速度')
    .onChange((v: number) => {
      if (settings.mode === 'replay' && replayController) {
        replayController.setSpeed(v)
      } else {
        simulator.setSpeed(v)
      }
    })

  const track = gui.addFolder('轨迹显示')
  track.add(settings, 'showTracks').name('显示轨迹')
    .onChange((v: boolean) => {
      for (const id of activeDroneIds) {
        const e = trackDS?.entities.getById(`track-${id}`)
        if (e) e.show = v
      }
    })
  track.add(settings, 'trackWindow', { '10秒': 10, '30秒': 30, '60秒': 60, '120秒': 120, '全部': 0 }).name('轨迹窗口')
  track.add(settings, 'trackWidth', 1, 8, 0.5).name('线宽')
    .onChange(() => {
      for (const id of activeDroneIds) {
        const e = trackDS?.entities.getById(`track-${id}`)
        if (e?.polyline) e.polyline.width = settings.trackWidth
      }
    })

  gui.add(settings, 'showLabels').name('显示标牌')
    .onChange((v: boolean) => {
      if (v) {
        for (const id of activeDroneIds) {
          const cfg = flightData.configs.find(c => c.id === id)
          if (cfg && !htmlLabels.has(id)) createLabelElement(id, cfg)
        }
      } else {
        for (const id of activeDroneIds) removeLabelElement(id)
      }
      // 同时控制 Cesium Label
      for (const id of activeDroneIds) {
        const e = droneDS?.entities.getById(id)
        if (e?.label) e.label.show = v
      }
    })

  const cam = gui.addFolder('相机')
  cam.add({ f: flyToShanghai }, 'f').name('上海全景')
  cam.add({ f: followDrone }, 'f').name('跟随无人机')
}

/* ================================================================
 * 9. 相机控制
 * ================================================================ */

function flyToShanghai() {
  const cesium = getCesium()
  if (!cesium || !viewer) return
  viewer.camera.flyTo({
    destination: cesium.Cartesian3.fromDegrees(121.50, 31.23, 12000),
    orientation: { heading: cesium.Math.toRadians(0), pitch: cesium.Math.toRadians(-55), roll: 0 },
    duration: 2.0,
  })
}

function followDrone() {
  const cesium = getCesium()
  if (!cesium || !viewer) return
  const firstId = activeDroneIds.values().next().value
  if (!firstId) return flyToShanghai()
  const pos = droneStates.get(firstId)?.latestPos
  if (pos) {
    viewer.camera.flyTo({
      destination: cesium.Cartesian3.add(pos, new cesium.Cartesian3(0, 0, 800), new cesium.Cartesian3()),
      duration: 1.0,
    })
  }
}

/* ================================================================
 * 10. HTML 浮层标签
 * ================================================================ */

const htmlLabels = new Map<string, HTMLElement>()

function createLabelElement(droneId: string, cfg: DroneConfig): HTMLElement {
  const el = document.createElement('div')
  el.className = 'drone-label'
  el.innerHTML = `
    <span class="dl-name">${cfg.name.replace(/-\d{3}$/, '')}</span>
    <span class="dl-data">⚡<b class="dl-battery">100%</b> 📶<b class="dl-signal">强</b></span>
    <span class="dl-data">⬆<b class="dl-alt">${cfg.altitude}m</b> 🚀<b class="dl-speed">0m/s</b></span>
  `
  document.getElementById('drone-labels')!.appendChild(el)
  htmlLabels.set(droneId, el)
  return el
}

function removeLabelElement(droneId: string) {
  const el = htmlLabels.get(droneId)
  if (el) { el.remove(); htmlLabels.delete(droneId) }
}

function updateLabelContent(droneId: string, sample: { alt: number; speed: number; battery: number; signal: string }) {
  const el = htmlLabels.get(droneId)
  if (!el) return
  const bat = el.querySelector('.dl-battery'); if (bat) bat.textContent = `${Math.round(sample.battery)}%`
  const sig = el.querySelector('.dl-signal'); if (sig) sig.textContent = sample.signal
  const alt = el.querySelector('.dl-alt'); if (alt) alt.textContent = `${Math.round(sample.alt)}m`
  const spd = el.querySelector('.dl-speed'); if (spd) spd.textContent = `${sample.speed.toFixed(1)}m/s`
}

function updateAllLabelPositions() {
  if (!viewer || viewer.isDestroyed() || !baseTime) return
  const cesium = getCesium()
  if (!cesium) return
  const scene = viewer.scene
  const renderTime = cesium.JulianDate.addSeconds(baseTime, getRenderOffset(), new cesium.JulianDate())
  for (const [droneId, state] of droneStates) {
    const el = htmlLabels.get(droneId)
    if (!el) continue
    // 用插值后的位置（与无人机实体同步）
    const pos = state.sampledPosition.getValue(renderTime) ?? state.latestPos
    const screen = cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pos)
    if (screen) {
      el.style.display = ''
      el.style.transform = `translate(${screen.x}px, ${screen.y}px)`
    } else {
      el.style.display = 'none'
    }
  }
}

/* ================================================================
 * 11. 生命周期
 * ================================================================ */

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  const cesium = getCesium()
  if (!cesium) return

  droneDS = new cesium.CustomDataSource('drones')
  viewer.dataSources.add(droneDS)

  trackDS = new cesium.CustomDataSource('tracks')
  viewer.dataSources.add(trackDS)

  simulator = new DroneWsSimulator(flightData)
  simulator.setSpeed(settings.speed)
  simulator.onTick(onSimTick)

  // 预创建初始无人机
  for (const cfg of flightData.configs) {
    if (activeDroneIds.size >= settings.droneCount) break
    createDroneEntity(cfg)
  }

  // HTML 标签位置更新 + 内部时间推进 + 回放时间推进（每帧）
  viewer.scene.preUpdate.addEventListener(updateAllLabelPositions)
  viewer.scene.preUpdate.addEventListener(updateRenderTime)
  viewer.scene.preUpdate.addEventListener(updateReplayFrame)

  // 开启抗锯齿
  if (viewer.scene.msaaLevel !== undefined) viewer.scene.msaaLevel = 4
  if (viewer.scene.fxaa !== undefined) viewer.scene.fxaa = true

  simulator.start()
  setupGUI()
  flyToShanghai()
}

onUnmounted(() => {
  gui?.destroy(); gui = null
  simulator?.destroy()
  replayController = null
  if (viewer && !viewer.isDestroyed()) {
    if (droneDS) viewer.dataSources.remove(droneDS, true)
    if (trackDS) viewer.dataSources.remove(trackDS, true)
  }
  droneDS = null; trackDS = null
  latestOrientations.clear(); trackHistory.clear()
  droneStates.clear()
  samplesByTime.clear()
  // 清理 HTML 标签
  for (const [, el] of htmlLabels) el.remove()
  htmlLabels.clear()
  activeDroneIds.clear()
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">无人机蜂群态势监控</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">SampledPositionProperty · WS Sim · Replay · Polyline Track</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer :initial-position="[121.50, 31.23, 15_000]" :scene-mode="'3d'" @ready="onViewerReady" />
      <!-- HTML 浮层容器 -->
      <div id="drone-labels" class="absolute inset-0 pointer-events-none overflow-hidden z-10" />

      <!-- 回放控制栏（仅回放模式可见） -->
      <ReplayBar
        v-if="settings.mode === 'replay' && replayController"
        :time="replayDisplayTime"
        :total-duration="REPLAY_TOTAL"
        :playing="replayDisplayPlaying"
        :speed="replayDisplaySpeed"
        @seek="onReplaySeek"
        @toggle-play="onReplayTogglePlay"
        @restart="onReplayRestart"
        @set-speed="onReplaySetSpeed"
      />
    </div>

    <TutorialModal v-model:visible="showTutorial" title="无人机蜂群 · 技术详解">

      <h3>一、数据流架构</h3>
      <pre><code>┌──────────────────────────────────────────────────────────┐
│ 生产环境                                                  │
│ WebSocket → IAircraftWebSocketData → SampledProperty     │
│   → SampledPositionProperty.addSample() → Entity 渲染    │
│                                                          │
│ 本 Demo                                                   │
│ droneData.ts (预生成 30 架 patrol 路径)                    │
│   → droneWsSimulator.ts (模拟 WebSocket 1Hz 推送)        │
│     → onSimTick → addSample() → CallbackProperty 求值    │
└──────────────────────────────────────────────────────────┘</code></pre>

      <h3>二、平滑动画原理（面试重点）</h3>
      <p>无人机位置用 <code>SampledPositionProperty</code>（Cesium 内置的时间-位置插值器）存储。关键技巧：</p>
      <pre><code>// 1. 每收到一条数据，添加采样点（绝对时间）
sampledPosition.addSample(JulianDate.fromDate(new Date()), position)

// 2. 渲染时间始终比最新数据延迟 3 秒（参照 dk-aircraft 做法）
currentRenderTime = smoothChase(max(0, simTime - 3))
//   每帧以实时速度追赶目标值，不跳变

// 3. 无人机位置在延迟后的时间点插值求值
const renderTime = baseTime + currentRenderTime
const pos = sampledPosition.getValue(renderTime)
// 返回值是相邻采样点的线性插值 → 丝滑飞行</code></pre>
      <p><strong>为什么延迟 3 秒？</strong>保证 <code>SampledPositionProperty</code> 始终有"未来"采样点可用。如果渲染时间和最新数据同步，则没有前瞻数据，插值退化为直接返回最新点 → 卡顿。</p>

      <h3>三、关键 API 清单</h3>
      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.78rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">API</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">作用</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Cesium.SampledPositionProperty</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">时间→位置的插值器，<code>addSample(time, pos)</code> 存采样点，<code>getValue(time)</code> 线性插值</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Cesium.CallbackProperty</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">每帧回调的动态属性，<code>isConstant: false</code> 时每帧求值</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Cesium.CustomDataSource</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">Entity 分组容器（类似图层），<code>viewer.dataSources.add(ds)</code></td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Cesium.VelocityOrientationProperty</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">根据位置变化自动计算朝向（备选方案）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Cesium.HeadingPitchRoll</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">欧拉角 → <code>Transforms.headingPitchRollQuaternion</code> → 四元数朝向</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Cesium.SceneTransforms.wgs84ToWindowCoordinates</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">世界坐标 → 屏幕坐标，用于 HTML DOM 浮层定位</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Cesium.PolylineGlowMaterialProperty</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">⚠️ Cesium 1.111 有 shader bug，本 Demo 改用纯色 <code>Cesium.Color</code></td></tr>
        </tbody>
      </table>

      <h3>四、轨迹线实现</h3>
      <pre><code>// 轨迹通过替换整个 polyline 对象强制 Cesium 重渲染
// （单纯改 positions 不会触发 Entity 属性变更检测）
trackEntity.polyline = {
  positions: windowedHistory.map(h => h.pos),  // 滑动时间窗口后的位置
  material: Cesium.Color.fromCssColorString(color).withAlpha(0.7),
  width: settings.trackWidth,
  show: settings.showTracks,
  clampToGround: false,
}</code></pre>

      <h3>五、HTML 浮层标签</h3>
      <pre><code>// 核心: SceneTransforms 把 3D 世界坐标映射到屏幕 2D 坐标
const screen = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
  viewer.scene, interpolatedPosition
)
// 用 CSS transform 定位 DOM 元素
el.style.transform = `translate(${screen.x}px, ${screen.y}px)`

// 注意: 必须用插值后的位置（sampledPosition.getValue(renderTime)）
// 不能用原始采样点，否则标签跳变不同步</code></pre>

      <h3>六、历史回放系统</h3>
      <pre><code>┌──────────────────────────────────────────────────────────┐
│ 回放架构                                                    │
│                                                              │
│ ReplayController（纯状态机）                                  │
│   ├─ replayTime: 0 ~ 300s，用户拖拽/播放                     │
│   ├─ speed, playing, seekTo(), update(delta)               │
│   └─ onTimeChanged → rebuildTracks + updateOrientations    │
│                                                              │
│ 关键设计: 预加载 + 共享渲染路径                               │
│   preloadAllSamplesForReplay()                              │
│     → 一次性把 301 个采样点注入 SampledPositionProperty      │
│     → 重建 trackHistory（30 架 × 301 个位置的全量数据）       │
│                                                              │
│   getRenderOffset()                                         │
│     → 实时模式: currentRenderTime（追赶 simTime-3）         │
│     → 回放模式: replayController.replayTime（用户控制）      │
│     → CallbackProperty / 标签定位都走同一个函数              │
│                                                              │
│ ReplayBar.vue（底部浮层）                                     │
│   ⟲ ▶/⏸ ━━●━━━ 00:42/05:00  0.5x 1x 2x 5x 10x            │
│   纯数据流: Props 进, Emits 出, 零内部状态                   │
└──────────────────────────────────────────────────────────┘</code></pre>
      <p><strong>为什么需要"预加载"？</strong>实时模式每秒 addSample 一个采样点，SampledPositionProperty 里只有历史数据。回放需要跳转到任意时间，如果没有预加载全部 301 个采样点，跳转后的 getValue() 只能外推（ExtrapolationType.HOLD）返回最近的已知点，无法插值 → 动画卡顿。</p>
      <p><strong>轨迹节流优化：</strong>采样点是 1Hz 的，在相邻整数秒之间 positions 完全不变。<code>rebuildTracksAtTime</code> 用 <code>Math.floor(currentTime)</code> 做节流，每秒只重建一次 polyline，避免 Cesium 60fps 下反复销毁/创建 GPU 几何体。</p>
      <p><strong>为什么不用 Cesium 自带的 Clock？</strong>Cesium Clock 会驱动整个场景的时间线，和实时模式的 simTime 冲突。独立的 <code>ReplayController</code> 完全不碰 Cesium Clock，只通过 <code>getRenderOffset()</code> 影响 CallbackProperty 的求值时间，两个模式互不干扰。</p>

      <h3>七、面试话术</h3>
      <p><strong>Q: "实时轨迹监控怎么做？数据量大怎么办？"</strong></p>
      <p>A: "核心是用 <code>SampledPositionProperty</code> 存时间-位置采样点，Cesium 自动做线性插值。关键技巧是<strong>渲染时间始终比最新数据延迟 2-3 秒</strong>，保证始终有前瞻数据可用，动画才丝滑。数据量大的话：① <code>addSample</code> 后剔除时间窗口外的旧采样点；② 轨迹用滑动窗口只渲染最近 N 秒；③ 底层 <code>SampledPositionProperty</code> 内部用二分查找 + 环形缓冲，O(log n) 插入。"</p>

      <p><strong>Q: "Cesium Entity 和 Primitive 怎么选？"</strong></p>
      <p>A: "Entity 是高层 API，适合中小规模（&lt;500 个），自动管理生命周期，支持 CallbackProperty 动态属性。Primitive 是底层 API，适合大规模（1000+），手动管理 GPU 资源。这个 Demo 30 架无人机用 Entity + CustomDataSource 完全够用。生产环境中上万架飞机就用 Primitive + BillboardCollection 直接拼。"</p>

      <p><strong>Q: "历史回放怎么做？和实时监控怎么共存？"</strong></p>
      <p>A: "核心是<strong>预加载 + 共享渲染路径</strong>。切到回放模式时，把所有采样点一次性注入 SampledPositionProperty，后续任意 seek 都能线性插值。实时和回放通过 <code>getRenderOffset()</code> 统一出口——实时模式返回追赶 simTime-3 的偏移量，回放模式返回用户控制的时间——Entity 的 CallbackProperty 完全不需要改动。回放控制用独立的状态机 ReplayController，不碰 Cesium Clock，避免和实时模式冲突。轨迹用整数秒节流，避免每帧重建 polyline。"</p>

    </TutorialModal>
  </div>
</template>

<style>
/* —— 无人机 HTML 浮层标签 —— */
.drone-label {
  position: absolute;
  top: 0; left: 0;
  transform: translate(-50%, -130%);
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  padding: 4px 8px;
  font-family: monospace;
  font-size: 11px;
  color: #e4e4e7;
  white-space: nowrap;
  pointer-events: none;
  line-height: 1.5;
}
.drone-label .dl-name {
  color: #a5f3fc;
  font-weight: 600;
  margin-right: 8px;
}
.drone-label .dl-data {
  color: #a1a1aa;
}
.drone-label .dl-data b {
  color: #e4e4e7;
  font-weight: 500;
  margin-right: 6px;
}
.drone-label .dl-battery { color: #4ade80; }
.drone-label .dl-signal { color: #facc15; }
</style>
