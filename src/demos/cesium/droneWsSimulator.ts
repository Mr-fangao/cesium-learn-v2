/**
 * 模拟 WebSocket 数据推送器
 *
 * 模拟生产环境中 WebSocket 实时接收无人机状态数据的行为。
 * 从预生成的 FlightData 按时间顺序推送采样点，
 * 支持变速播放、启停控制、回调注册。
 *
 * 使用方式:
 *   const sim = new DroneWsSimulator(flightData)
 *   sim.onTick((drones) => { ... 更新 Entity ... })
 *   sim.start()
 */

import type { FlightData, DroneSample, DroneConfig } from './droneData'

export interface TickData {
  /** 当前模拟时间（秒） */
  simTime: number
  /** 本 tick 更新的无人机数据 */
  drones: Map<string, DroneSample>
  /** 本 tick 触发的告警 */
  warnings: Array<{ droneId: string; title: string; level: 'GJ' | 'YJ' }>
}

type TickCallback = (data: TickData) => void

export class DroneWsSimulator {
  private _data: FlightData
  private _tickCallbacks: TickCallback[] = []
  private _timer: ReturnType<typeof setInterval> | null = null
  private _simTime = 0
  private _speed = 1.0
  private _tickInterval = 1000 // ms，基准 1 秒 = 1 个采样点
  private _running = false
  private _paused = false

  /** 当前所有无人机的最新采样点（用于 track 渲染） */
  private _latestSamples: Map<string, DroneSample> = new Map()

  /** 飞行开始的实际时间戳 */
  private _startRealTime = 0

  constructor(data: FlightData) {
    this._data = data
  }

  /* ================================================================
   * 公开 API
   * ================================================================ */

  get simTime() { return this._simTime }
  get speed() { return this._speed }
  get running() { return this._running }
  get configs(): DroneConfig[] { return this._data.configs }
  get warnings() { return this._data.warnings }
  get latestSamples() { return this._latestSamples }

  /** 注册每 tick 回调 */
  onTick(cb: TickCallback): () => void {
    this._tickCallbacks.push(cb)
    return () => {
      const idx = this._tickCallbacks.indexOf(cb)
      if (idx !== -1) this._tickCallbacks.splice(idx, 1)
    }
  }

  /** 启动模拟 */
  start() {
    if (this._running) return
    this._running = true
    this._paused = false
    this._startRealTime = Date.now()
    this._scheduleNext()
  }

  /** 暂停 */
  pause() { this._paused = true }

  /** 恢复 */
  resume() {
    if (!this._paused) return
    this._paused = false
    this._startRealTime = Date.now() - this._simTime * (1000 / this._speed)
    this._scheduleNext()
  }

  /** 停止 */
  stop() {
    this._running = false
    this._paused = false
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
  }

  /** 设置播放速度（1=实时, 2=2倍速, 0.5=半速） */
  setSpeed(speed: number) {
    this._speed = Math.max(0.1, Math.min(10, speed))
    if (this._running && !this._paused) {
      if (this._timer) clearTimeout(this._timer)
      this._startRealTime = Date.now() - this._simTime * (1000 / this._speed)
      this._scheduleNext()
    }
  }

  /** 跳转到指定 simTime（秒），修正内部计时基准 */
  seekTo(simTime: number) {
    const clamped = Math.max(0, Math.min(simTime, this._data.configs[0]?.duration ?? 300))
    this._simTime = clamped
    this._startRealTime = Date.now() - clamped * (1000 / this._speed)
    this._latestSamples.clear()
  }

  /** 重置并从头开始 */
  reset() {
    this.stop()
    this._simTime = 0
    this._latestSamples.clear()
  }

  /** 销毁 */
  destroy() {
    this.stop()
    this._tickCallbacks = []
    this._latestSamples.clear()
  }

  /* ================================================================
   * 内部逻辑
   * ================================================================ */

  private _scheduleNext() {
    if (!this._running || this._paused) return
    const realElapsed = Date.now() - this._startRealTime
    const simElapsed = realElapsed * this._speed / 1000
    const nextTick = Math.floor(simElapsed) + 1
    const nextRealTime = this._startRealTime + nextTick * (1000 / this._speed)
    const delay = Math.max(0, nextRealTime - Date.now())

    this._timer = setTimeout(() => {
      if (!this._running || this._paused) return
      this._tick()
      this._scheduleNext()
    }, delay)
  }

  private _tick() {
    const realElapsed = Date.now() - this._startRealTime
    this._simTime = Math.floor(realElapsed * this._speed / 1000)

    const tickDrones = new Map<string, DroneSample>()
    const tickWarnings: TickData['warnings'] = []

    for (const cfg of this._data.configs) {
      const samples = this._data.samples[cfg.id]
      if (!samples) continue

      // 找到当前时间的采样点
      const sample = samples.find(s => s.time === this._simTime)
      if (sample) {
        this._latestSamples.set(cfg.id, sample)
        tickDrones.set(cfg.id, sample)
      }

      // 检查告警
      const warns = this._data.warnings[cfg.id]
      if (warns) {
        for (const w of warns) {
          if (w.time === this._simTime) {
            tickWarnings.push({ droneId: cfg.id, title: w.title, level: w.level })
          }
        }
      }
    }

    // 检查是否所有 drone 都完成了
    const allDone = this._data.configs.every(cfg => {
      const samples = this._data.samples[cfg.id]
      return samples && this._simTime >= samples[samples.length - 1]?.time
    })
    if (allDone) {
      this._running = false
      if (this._timer) { clearTimeout(this._timer); this._timer = null }
    }

    // 通知回调
    const data: TickData = { simTime: this._simTime, drones: tickDrones, warnings: tickWarnings }
    for (const cb of this._tickCallbacks) {
      try { cb(data) } catch (e) { console.error('[DroneWsSimulator] callback error:', e) }
    }
  }
}
