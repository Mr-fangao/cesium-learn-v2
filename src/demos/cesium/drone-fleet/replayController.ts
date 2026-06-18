/**
 * ReplayController — 回放时间状态机
 *
 * 纯逻辑类，不依赖 Cesium/Vue/Viewer。管理回放时间线、
 * 播放/暂停/调速/跳转等状态，通过回调通知外部重建渲染数据。
 *
 * 使用方式:
 *   const rc = new ReplayController(300)       // 300 秒总时长
 *   rc.onTimeChanged((t) => { ... 重建轨迹 ... })
 *   scene.preUpdate.addListener(() => {
 *     const delta = (now - lastFrameTime) * speed
 *     rc.update(delta)                         // 每帧推进时间
 *   })
 */

export class ReplayController {
  private _replayTime = 0
  private _playing = false
  private _speed = 1.0
  private readonly _totalDuration: number
  private _timeChangedCallbacks: Array<(time: number) => void> = []

  constructor(totalDuration: number) {
    this._totalDuration = Math.max(0, totalDuration)
  }

  /* ================================================================
   * 属性
   * ================================================================ */

  get replayTime(): number { return this._replayTime }
  get playing(): boolean { return this._playing }
  get speed(): number { return this._speed }
  get totalDuration(): number { return this._totalDuration }

  /* ================================================================
   * 控制方法
   * ================================================================ */

  play(): void {
    if (this._replayTime >= this._totalDuration) {
      // 已播完 → 从头开始
      this._replayTime = 0
    }
    this._playing = true
  }

  pause(): void {
    this._playing = false
  }

  toggle(): void {
    if (this._playing) this.pause()
    else this.play()
  }

  /** 跳转到指定时间（秒），自动钳位到 [0, totalDuration] */
  seekTo(time: number): void {
    const prev = this._replayTime
    this._replayTime = Math.max(0, Math.min(time, this._totalDuration))
    if (this._replayTime !== prev) {
      this._notifyChanged()
    }
  }

  /** 设置播放速度 */
  setSpeed(speed: number): void {
    this._speed = Math.max(0.1, Math.min(10, speed))
  }

  /** 跳转到开头并暂停 */
  restart(): void {
    this._playing = false
    this._replayTime = 0
    this._notifyChanged()
  }

  /** 跳转到末尾并暂停 */
  skipToEnd(): void {
    this._playing = false
    this._replayTime = this._totalDuration
    this._notifyChanged()
  }

  /* ================================================================
   * 每帧更新
   * ================================================================ */

  /**
   * 每帧调用，用真实时间增量推进回放时间。
   *
   * @param realDeltaSeconds 自上一帧以来的实际流逝秒数（通常来自 Date.now() 差值）
   * @returns 如果时间发生变化，返回新时间；否则返回 null（避免不必要的重建）
   */
  update(realDeltaSeconds: number): number | null {
    if (!this._playing) return null
    if (realDeltaSeconds <= 0) return null
    // 限制单帧最大推进量，防止切回前台时跳变
    const delta = Math.min(realDeltaSeconds, 0.5) * this._speed
    const prev = this._replayTime
    this._replayTime = Math.min(this._replayTime + delta, this._totalDuration)
    if (this._replayTime >= this._totalDuration) {
      this._playing = false // 播到末尾自动暂停
    }
    if (this._replayTime !== prev) {
      this._notifyChanged()
      return this._replayTime
    }
    return null
  }

  /* ================================================================
   * 回调
   * ================================================================ */

  /** 注册时间变化回调，返回取消注册函数 */
  onTimeChanged(cb: (time: number) => void): () => void {
    this._timeChangedCallbacks.push(cb)
    return () => {
      const idx = this._timeChangedCallbacks.indexOf(cb)
      if (idx !== -1) this._timeChangedCallbacks.splice(idx, 1)
    }
  }

  private _notifyChanged(): void {
    for (const cb of this._timeChangedCallbacks) {
      try { cb(this._replayTime) } catch (e) { /* 静默 */ }
    }
  }
}
