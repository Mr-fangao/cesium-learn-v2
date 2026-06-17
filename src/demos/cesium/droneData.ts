/**
 * 无人机蜂群飞行数据生成器
 *
 * 模拟 30 架无人机在上海浦东-外滩区域的 patrol 飞行路径。
 * 生成 1Hz 采样点的位置/姿态/设备元数据，供 droneWsSimulator 以 WebSocket 模式推送。
 *
 * 数据格式参照 IAircraftWebSocketData 接口（来自上家公司 dk-aircraft 源码）
 */

export interface DroneSample {
  /** 采样时间（相对秒，0 = 任务开始） */
  time: number
  /** 经度 */
  lon: number
  /** 纬度 */
  lat: number
  /** 高度 (m) */
  alt: number
  /** 偏航角（度，0=正北，顺时针） */
  yaw: number
  /** 俯仰角（度） */
  pitch: number
  /** 横滚角（度） */
  roll: number
  /** 速度 (m/s) */
  speed: number
  /** 剩余电量 (%) */
  battery: number
  /** 信号强度 */
  signal: '强' | '中' | '弱'
}

export interface DroneConfig {
  /** 设备 ID */
  id: string
  /** 设备名称 */
  name: string
  /** 设备型号 */
  model: string
  /** 数据来源 */
  source: 'DAAS' | 'UOMMN' | 'BEIDOU' | 'fusion'
  /** 起始经纬度 */
  startLon: number
  startLat: number
  /** 巡逻中心 */
  centerLon: number
  centerLat: number
  /** 飞行高度 (m) */
  altitude: number
  /** 巡航速度 (m/s) */
  speed: number
  /** 巡逻半径 (经纬度，约 0.01° ≈ 1km) */
  radius: number
  /** 巡逻模式 */
  pattern: 'circle' | 'figure8' | 'zigzag' | 'racetrack'
  /** 总飞行时长 (秒) */
  duration: number
}

/* ================================================================
 * 上海区域坐标
 * ================================================================ */

// 外滩-陆家嘴-浦东机场-虹桥区域
const SHANGHAI = {
  bund:      { lon: 121.490, lat: 31.240 },  // 外滩
  lujiazui:  { lon: 121.505, lat: 31.240 },  // 陆家嘴
  pudong:    { lon: 121.545, lat: 31.230 },  // 浦东
  hongqiao:  { lon: 121.330, lat: 31.195 },  // 虹桥
  century:   { lon: 121.545, lat: 31.215 },  // 世纪公园
  expo:      { lon: 121.485, lat: 31.190 },  // 世博园
  disney:    { lon: 121.665, lat: 31.145 },  // 迪士尼
  pudongAir: { lon: 121.805, lat: 31.145 },  // 浦东机场
  songjiang: { lon: 121.230, lat: 31.030 },  // 松江
  nanhui:    { lon: 121.550, lat: 31.050 },  // 南汇
}

/* ================================================================
 * 30 架无人机配置
 * ================================================================ */

const MODELS = ['FP-981C', 'FP-981C', 'F6100', 'F6100', 'E3', 'M350 RTK'] as const
const SOURCES: DroneConfig['source'][] = ['DAAS', 'UOMMN', 'BEIDOU', 'fusion']

function makeConfig(id: number, center: { lon: number; lat: number }): DroneConfig {
  const patterns: DroneConfig['pattern'][] = ['circle', 'figure8', 'zigzag', 'racetrack']
  return {
    id: `drone-${String(id).padStart(3, '0')}`,
    name: `${MODELS[id % MODELS.length]}-${String(id).padStart(3, '0')}`,
    model: MODELS[id % MODELS.length],
    source: SOURCES[id % SOURCES.length],
    startLon: center.lon + (Math.random() - 0.5) * 0.02,
    startLat: center.lat + (Math.random() - 0.5) * 0.02,
    centerLon: center.lon,
    centerLat: center.lat,
    altitude: 150 + Math.random() * 350,    // 150-500m
    speed: 8 + Math.random() * 7,            // 8-15 m/s
    radius: 0.005 + Math.random() * 0.015,   // 0.5-2km 半径
    pattern: patterns[id % patterns.length],
    duration: 300,  // 5 分钟
  }
}

function makeConfigs(): DroneConfig[] {
  const centers = [
    SHANGHAI.bund, SHANGHAI.lujiazui, SHANGHAI.pudong,
    SHANGHAI.hongqiao, SHANGHAI.century, SHANGHAI.expo,
    SHANGHAI.disney, SHANGHAI.pudongAir, SHANGHAI.songjiang, SHANGHAI.nanhui,
  ]
  const configs: DroneConfig[] = []
  for (let i = 0; i < 30; i++) {
    configs.push(makeConfig(i + 1, centers[i % centers.length]))
  }
  return configs
}

/* ================================================================
 * 巡逻路径计算
 * ================================================================ */

function circlePath(cfg: DroneConfig, t: number): { lon: number; lat: number; yaw: number } {
  const omega = cfg.speed / (111_320 * cfg.radius) // 角速度（经度修正近似）
  const angle = omega * t
  const lon = cfg.centerLon + cfg.radius * Math.cos(angle) / Math.cos(cfg.centerLat * Math.PI / 180)
  const lat = cfg.centerLat + cfg.radius * Math.sin(angle)
  const yaw = (angle * 180 / Math.PI + 90) % 360 // 切线方向
  return { lon, lat, yaw }
}

function figure8Path(cfg: DroneConfig, t: number): { lon: number; lat: number; yaw: number } {
  const period = 120 // 一个 8 字周期 120 秒
  const phase = (2 * Math.PI * t) / period
  const halfR = cfg.radius * 0.6
  const x = halfR * Math.sin(phase) / Math.cos(cfg.centerLat * Math.PI / 180)
  const y = halfR * Math.sin(2 * phase) * 0.5
  const dx = halfR * Math.cos(phase) / Math.cos(cfg.centerLat * Math.PI / 180)
  const dy = halfR * Math.cos(2 * phase)
  const yaw = (Math.atan2(dy, dx) * 180 / Math.PI + 90) % 360
  return { lon: cfg.centerLon + x, lat: cfg.centerLat + y, yaw }
}

function zigzagPath(cfg: DroneConfig, t: number): { lon: number; lat: number; yaw: number } {
  const segLen = 40 // 每段 40 秒
  const segCount = 6
  const totalCycle = segLen * segCount
  const cycleT = t % totalCycle
  const seg = Math.floor(cycleT / segLen)
  const segT = (cycleT % segLen) / segLen
  const dy = cfg.radius * (seg % 2 === 0 ? (2 * segT - 1) : (1 - 2 * segT))
  const dx = (seg / segCount - 0.5) * cfg.radius * 2 / Math.cos(cfg.centerLat * Math.PI / 180)
  const lon = cfg.centerLon + dx
  const lat = cfg.centerLat + dy
  const yaw = seg % 2 === 0 ? (segT < 0.5 ? 0 : 180) : (segT < 0.5 ? 180 : 0)
  return { lon, lat, yaw }
}

function racetrackPath(cfg: DroneConfig, t: number): { lon: number; lat: number; yaw: number } {
  const lapTime = 80 // 一圈 80 秒
  const phase = (2 * Math.PI * (t % lapTime)) / lapTime
  const halfR = cfg.radius * 0.7
  // 椭圆路径
  const a = halfR / Math.cos(cfg.centerLat * Math.PI / 180)
  const b = halfR * 0.5
  const lon = cfg.centerLon + a * Math.cos(phase)
  const lat = cfg.centerLat + b * Math.sin(phase)
  const dx = -a * Math.sin(phase)
  const dy = b * Math.cos(phase)
  const yaw = (Math.atan2(dy, dx) * 180 / Math.PI + 90) % 360
  return { lon, lat, yaw }
}

/* ================================================================
 * 采样生成
 * ================================================================ */

function generateSamples(cfg: DroneConfig): DroneSample[] {
  const samples: DroneSample[] = []
  const dt = 1 // 1Hz 采样

  for (let t = 0; t <= cfg.duration; t += dt) {
    let pos: { lon: number; lat: number; yaw: number }
    switch (cfg.pattern) {
      case 'figure8':   pos = figure8Path(cfg, t);   break
      case 'zigzag':    pos = zigzagPath(cfg, t);    break
      case 'racetrack': pos = racetrackPath(cfg, t); break
      default:          pos = circlePath(cfg, t);     break
    }

    samples.push({
      time: t,
      lon: pos.lon,
      lat: pos.lat,
      alt: cfg.altitude + 5 * Math.sin(t * 0.05), // 微小高度波动
      yaw: pos.yaw,
      pitch: (Math.sin(t * 0.1) * 3),     // ±3° 小幅俯仰
      roll: (Math.cos(t * 0.08) * 2),      // ±2° 小幅横滚
      speed: cfg.speed + Math.sin(t * 0.03) * 2,
      battery: Math.max(20, 100 - (t / cfg.duration) * 80 * (0.8 + Math.random() * 0.4)),
      signal: Math.random() < 0.02 ? '弱' : Math.random() < 0.08 ? '中' : '强',
    })
  }

  return samples
}

/* ================================================================
 * 告警模拟
 * ================================================================ */

function generateWarnings(configs: DroneConfig[]) {
  // 随机选择 2-3 架无人机在随机时间触发告警
  const warnings: Record<string, { time: number; title: string; level: 'GJ' | 'YJ' }[]> = {}
  const titles = ['电子围栏越界', '信号链路中断', '电量低于阈值', '偏离计划航线', '进入禁飞区']
  const count = 2 + Math.floor(Math.random() * 2)
  const shuffled = [...configs].sort(() => Math.random() - 0.5)
  for (let i = 0; i < count; i++) {
    const drone = shuffled[i]
    const warnCount = 1 + Math.floor(Math.random() * 2)
    warnings[drone.id] = []
    for (let j = 0; j < warnCount; j++) {
      warnings[drone.id].push({
        time: 30 + Math.floor(Math.random() * 200),
        title: titles[Math.floor(Math.random() * titles.length)],
        level: Math.random() < 0.3 ? 'GJ' : 'YJ',
      })
    }
  }
  return warnings
}

/* ================================================================
 * 导出
 * ================================================================ */

export interface FlightData {
  configs: DroneConfig[]
  samples: Record<string, DroneSample[]>  // droneId → samples
  warnings: Record<string, { time: number; title: string; level: 'GJ' | 'YJ' }[]>
}

export function generateFlightData(): FlightData {
  const configs = makeConfigs()
  const samples: Record<string, DroneSample[]> = {}
  for (const cfg of configs) {
    samples[cfg.id] = generateSamples(cfg)
  }
  const warnings = generateWarnings(configs)
  return { configs, samples, warnings }
}
