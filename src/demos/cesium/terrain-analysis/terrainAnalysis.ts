/**
 * TerrainAnalysis 逻辑 — 地形高度采样与分析
 */

import { createDemoGui } from '@/shared/gui'

export interface TerrainState {
  exaggeration: number
  sampleLevel: number
  profileMode: boolean
}

/* ================================================================
 * 地形就绪检测
 * ================================================================ */

export function checkTerrain(viewer: Cesium.Viewer, setReady: (v: boolean) => void): void {
  let attempts = 0
  const poll = () => {
    if (viewer.isDestroyed()) return
    if (viewer.scene.sampleHeightSupported) { setReady(true); return }
    if (++attempts < 6) setTimeout(poll, 2500)
  }
  setTimeout(poll, 3000)
}

/* ================================================================
 * 标记与采样
 * ================================================================ */

export function createPinCanvas(color: string): HTMLCanvasElement {
  const size = 24
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
  ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke()
  return c
}

export function addGroundMarker(
  viewer: Cesium.Viewer, cesium: any, lon: number, lat: number,
  text: string, color: string, scale = 0.7,
): Cesium.Entity | undefined {
  return viewer.entities.add({
    position: cesium.Cartesian3.fromRadians(lon, lat, 0),
    billboard: {
      image: createPinCanvas(color),
      verticalOrigin: cesium.VerticalOrigin.BOTTOM,
      heightReference: cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scale,
    },
    label: {
      text, font: '13px monospace',
      fillColor: cesium.Color.fromCssColorString(color),
      outlineColor: cesium.Color.fromCssColorString('#1a1a2e'), outlineWidth: 2,
      verticalOrigin: cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new cesium.Cartesian2(0, -28),
      heightReference: cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
}

export function addSamplePin(
  viewer: Cesium.Viewer, cesium: any, lon: number, lat: number, height: number,
  samplePins: Cesium.Entity[],
): void {
  const entity = addGroundMarker(viewer, cesium, lon, lat, `${height.toFixed(0)} m`, '#4da6ff', 0.6)
  if (entity) samplePins.push(entity)
}

/* ================================================================
 * 剖面分析
 * ================================================================ */

export async function computeProfile(
  viewer: Cesium.Viewer, cesium: any,
  startCarto: any, endCarto: any, level: number,
): Promise<{ samples: any[]; distances: number[] } | null> {
  const tp = viewer.terrainProvider
  if (!tp) return null

  const geodesic = new cesium.EllipsoidGeodesic(startCarto, endCarto)
  const samples: any[] = []
  for (let i = 0; i <= 100; i++) {
    samples.push(geodesic.interpolateUsingFraction(i / 100, new cesium.Cartographic()))
  }

  await cesium.sampleTerrain(tp, level, samples)

  const totalD = geodesic.surfaceDistance
  const distances = samples.map((_, i) => (totalD * i) / (samples.length - 1))
  return { samples, distances }
}

export function drawProfileChart(samples: any[], distances: number[]): void {
  const canvas = document.getElementById('profile-canvas') as HTMLCanvasElement | null
  if (!canvas) return
  const W = canvas.width, H = canvas.height
  const pad = { top: 30, right: 20, bottom: 40, left: 55 }
  const pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom

  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, W, H)

  const heights = samples.map((s: any) => s.height ?? 0)
  const hMin = Math.min(...heights), hMax = Math.max(...heights)
  const hRange = hMax - hMin || 1
  const dMax = distances[distances.length - 1] || 1

  const toX = (d: number) => pad.left + (d / dMax) * pw
  const toY = (h: number) => pad.top + ph - ((h - hMin) / hRange) * ph

  // Background
  ctx.fillStyle = 'rgba(15, 15, 25, 0.85)'
  ctx.beginPath(); ctx.roundRect(pad.left - 10, pad.top - 10, pw + 20, ph + 20, 8); ctx.fill()

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (ph / 5) * i
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke()
    const x = pad.left + (pw / 5) * i
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ph); ctx.stroke()
  }

  // Fill
  ctx.beginPath(); ctx.moveTo(toX(0), pad.top + ph)
  for (let i = 0; i < samples.length; i++) ctx.lineTo(toX(distances[i]), toY(heights[i]))
  ctx.lineTo(toX(dMax), pad.top + ph); ctx.closePath()
  const fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph)
  fillGrad.addColorStop(0, 'rgba(77, 166, 255, 0.5)'); fillGrad.addColorStop(1, 'rgba(77, 166, 255, 0.05)')
  ctx.fillStyle = fillGrad; ctx.fill()

  // Line
  ctx.beginPath(); ctx.strokeStyle = '#4da6ff'; ctx.lineWidth = 2
  for (let i = 0; i < samples.length; i++) {
    const x = toX(distances[i]), y = toY(heights[i])
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()

  // Max point
  const maxIdx = heights.indexOf(hMax)
  ctx.fillStyle = '#ff6b6b'
  ctx.beginPath(); ctx.arc(toX(distances[maxIdx]), toY(hMax), 4, 0, Math.PI * 2); ctx.fill()
  ctx.fillText(`${hMax.toFixed(0)}m`, toX(distances[maxIdx]) + 8, toY(hMax) - 4)

  // Min point
  const minIdx = heights.indexOf(hMin)
  ctx.fillStyle = '#ffd93d'
  ctx.beginPath(); ctx.arc(toX(distances[minIdx]), toY(hMin), 4, 0, Math.PI * 2); ctx.fill()
  ctx.fillText(`${hMin.toFixed(0)}m`, toX(distances[minIdx]) + 8, toY(hMin) - 4)

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + ph); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ph); ctx.lineTo(pad.left + pw, pad.top + ph); ctx.stroke()

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  ctx.fillText(`${dMax.toFixed(1)} km`, pad.left + pw / 2, pad.top + ph + 25)
  ctx.save(); ctx.translate(10, pad.top + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('高程 (m)', 0, 0); ctx.restore()

  ctx.textAlign = 'right'
  for (let i = 0; i <= 5; i++) {
    const h = hMin + (hRange / 5) * i
    ctx.fillText(`${h.toFixed(0)}`, pad.left - 6, pad.top + ph - (ph / 5) * i + 4)
  }
}

/* ================================================================
 * 点击交互
 * ================================================================ */

export function setupClickHandler(
  viewer: Cesium.Viewer, cesium: any,
  state: TerrainState, samplePins: Cesium.Entity[],
  profileData: { a: any; b: any; aEntity: Cesium.Entity | null; bEntity: Cesium.Entity | null; locked: boolean },
  onProfileReady: (a: any, b: any) => void,
  onSampleAdded: () => void,
): any {
  const handler = new cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

  handler.setInputAction(async (click: any) => {
    if (profileData.locked) return

    const ray = viewer.camera.getPickRay(click.position)
    const cartesian = ray
      ? viewer.scene.globe.pick(ray, viewer.scene)
      : viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid)
    if (!cartesian) return

    const carto = cesium.Cartographic.fromCartesian(cartesian)
    let height = carto.height
    const tp = viewer.terrainProvider
    if (tp) {
      const samples = [cesium.Cartographic.clone(carto)]
      await cesium.sampleTerrain(tp, state.sampleLevel, samples)
      if (samples[0].height !== undefined) height = samples[0].height
    }

    if (state.profileMode) {
      if (!profileData.a) {
        profileData.a = cesium.Cartographic.fromRadians(carto.longitude, carto.latitude, height)
        profileData.aEntity = addGroundMarker(viewer, cesium, carto.longitude, carto.latitude, 'A 起点', '#4ade80', 0.8) ?? null
      } else {
        profileData.b = cesium.Cartographic.fromRadians(carto.longitude, carto.latitude, height)
        profileData.bEntity = addGroundMarker(viewer, cesium, carto.longitude, carto.latitude, 'B 终点', '#f87171', 0.8) ?? null
        state.profileMode = false
        profileData.locked = true
        onProfileReady(profileData.a, profileData.b)
      }
      return
    }

    addSamplePin(viewer, cesium, carto.longitude, carto.latitude, height, samplePins)
    onSampleAdded()
  }, cesium.ScreenSpaceEventType.LEFT_CLICK)

  return handler
}

/* ================================================================
 * GUI
 * ================================================================ */

export function setupGUI(
  stage: HTMLElement, state: TerrainState, viewer: () => Cesium.Viewer | null,
  onProfileStart: () => void, onClearAll: () => void,
): any {
  const gui = createDemoGui(stage)

  gui.add(state, 'exaggeration', 1, 15, 0.5).name('地形夸张 ×')
    .onChange((v: number) => { const vv = viewer(); if (vv) vv.scene.globe.terrainExaggeration = v })

  gui.add(state, 'sampleLevel', { '低 (L8)': 8, '中 (L10)': 10, '默认 (L11)': 11, '高 (L12)': 12, '最高 (L14)': 14 })
    .name('采样精度')

  const profileFolder = gui.addFolder('剖面分析')
  profileFolder.add({ start: onProfileStart }, 'start').name('开始选点 (A→B)')
  profileFolder.add({ clear: onClearAll }, 'clear').name('清除全部标记')

  const contourFolder = gui.addFolder('等高线 (预留)')
  contourFolder.add({ disabled: '待开发' }, 'disabled').name('状态').disable()

  return gui
}
