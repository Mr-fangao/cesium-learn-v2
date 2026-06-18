/**
 * RocketLaunch 逻辑 — ParticleSystem 粒子系统实战
 */

import { createDemoGui } from '@/shared/gui'

/* ================================================================
 * 粒子贴图
 * ================================================================ */

export function createGlowImage(inner: string, outer: string): HTMLCanvasElement {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner); g.addColorStop(0.25, inner); g.addColorStop(1, outer)
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  return canvas
}

/* ================================================================
 * 场景建造
 * ================================================================ */

export function buildLaunchPad(viewer: Cesium.Viewer, C: any): void {
  const { Cartesian3, Color } = C

  viewer.entities.add({
    name: '发射台基座',
    position: Cartesian3.fromDegrees(110.949, 19.618, 2),
    cylinder: { length: 4, topRadius: 25, bottomRadius: 28, material: Color.fromCssColorString('#4a4a4a') },
  })
  viewer.entities.add({
    name: '工作平台',
    position: Cartesian3.fromDegrees(110.949, 19.618, 6),
    cylinder: { length: 1, topRadius: 18, bottomRadius: 20, material: Color.fromCssColorString('#666666') },
  })
  viewer.entities.add({
    name: '服务塔',
    position: Cartesian3.fromDegrees(110.9482, 19.6182, 40),
    box: { dimensions: new Cartesian3(6, 6, 80), material: Color.fromCssColorString('#5a5a5a').withAlpha(0.85) },
  })
  for (let h = 10; h <= 80; h += 15) {
    viewer.entities.add({
      name: `横梁-${h}`,
      position: Cartesian3.fromDegrees(110.9482, 19.6182, h),
      box: { dimensions: new Cartesian3(8, 1.5, 3), material: Color.fromCssColorString('#c0392b') },
    })
  }
  viewer.entities.add({
    name: '脐带塔',
    position: Cartesian3.fromDegrees(110.9495, 19.618, 38),
    box: { dimensions: new Cartesian3(3, 12, 76), material: Color.fromCssColorString('#505050') },
  })
  const offsets = [[110.9482, 19.6188], [110.9498, 19.6188], [110.9482, 19.6172], [110.9498, 19.6172]]
  offsets.forEach(([lon, lat]) => {
    viewer.entities.add({
      name: '避雷塔',
      position: Cartesian3.fromDegrees(lon, lat, 45),
      cylinder: { length: 90, topRadius: 0.4, bottomRadius: 0.8, material: Color.fromCssColorString('#808080') },
    })
  })
  viewer.entities.add({
    name: '导流槽',
    position: Cartesian3.fromDegrees(110.949, 19.618, -2),
    box: { dimensions: new Cartesian3(15, 8, 4), material: Color.fromCssColorString('#333333') },
  })
}

export function buildRocket(viewer: Cesium.Viewer, C: any): Cesium.Entity {
  const startPos = C.Cartesian3.fromDegrees(110.949, 19.618, 10)
  const rocket = viewer.entities.add({
    name: '火箭', position: startPos,
    cylinder: { length: 36, topRadius: 2.2, bottomRadius: 2.2, material: C.Color.WHITE },
  })
  viewer.entities.add({
    name: '整流罩', parent: rocket, position: new C.Cartesian3(0, 0, 18),
    cylinder: { length: 8, topRadius: 0.15, bottomRadius: 2.3, material: C.Color.fromCssColorString('#e74c3c') },
  })
  viewer.entities.add({
    name: '喷管', parent: rocket, position: new C.Cartesian3(0, 0, -20),
    cylinder: { length: 3, topRadius: 1.2, bottomRadius: 1.6, material: C.Color.fromCssColorString('#2c3e50') },
  })
  viewer.entities.add({
    name: '箭体标识', parent: rocket, position: new C.Cartesian3(0, 0, -8),
    cylinder: { length: 2, topRadius: 2.25, bottomRadius: 2.25, material: C.Color.fromCssColorString('#e74c3c') },
  })
  return rocket
}

/* ================================================================
 * 弹道预计算
 * ================================================================ */

export function buildTrajectory(C: any): { time: number; pos: any }[] {
  const samples: { time: number; pos: any }[] = []
  const padLon = 110.949, padLat = 19.618, BASE_ALT = 10
  for (let t = 0; t <= 120; t++) {
    const alt = BASE_ALT + 20 * t + 0.5 * 8 * t * t
    let eastOffset = 0
    if (t > 10) { const pt = t - 10; eastOffset = 0.5 * 3 * pt * pt * 0.5 }
    const dLon = eastOffset / (111320 * Math.cos((padLat * Math.PI) / 180))
    samples.push({ time: t, pos: C.Cartesian3.fromDegrees(padLon + dLon, padLat, alt) })
  }
  return samples
}

/* ================================================================
 * 粒子系统
 * ================================================================ */

export function createFlameSystem(C: any, flameImg: HTMLCanvasElement): any {
  return new C.ParticleSystem({
    show: true, image: flameImg,
    emitter: new C.ConeEmitter(C.Math.toRadians(12)),
    emissionRate: 200, speed: 25, minimumSpeed: 20, maximumSpeed: 45,
    startScale: 6, endScale: 1.5,
    startColor: C.Color.YELLOW.withAlpha(0.9),
    endColor: new C.Color(1.0, 0.2, 0.0, 0.0),
    minimumParticleLife: 0.4, maximumParticleLife: 0.9,
    emitterModelMatrix: (() => {
      const rot = C.Matrix3.fromRotationX(C.Math.toRadians(180))
      return C.Matrix4.fromRotationTranslation(rot, new C.Cartesian3(0, 0, -20))
    })(),
  })
}

export function createSmokeSystem(C: any, smokeImg: HTMLCanvasElement): any {
  return new C.ParticleSystem({
    show: true, image: smokeImg,
    emitter: new C.CircleEmitter(3.0),
    emissionRate: 60, speed: 5, minimumSpeed: 2, maximumSpeed: 10,
    startScale: 2.5, endScale: 14,
    startColor: new C.Color(0.95, 0.95, 0.95, 0.55),
    endColor: new C.Color(0.7, 0.7, 0.7, 0.0),
    minimumParticleLife: 2.5, maximumParticleLife: 4.5,
    sizeInMeters: true,
    emitterModelMatrix: C.Matrix4.fromTranslation(new C.Cartesian3(0, 0, -20), new C.Matrix4()),
  })
}

/* ================================================================
 * 粒子跟随
 * ================================================================ */

export function createPreUpdateHandler(
  C: any, viewer: () => Cesium.Viewer | null,
  rocketEntity: () => Cesium.Entity | null,
  flamePS: () => any, smokePS: () => any,
  launched: () => boolean,
) {
  return (_scene: any) => {
    if (!launched()) return
    const v = viewer(); const r = rocketEntity(); const f = flamePS(); const s = smokePS()
    if (!v || !r || !f || !s) return
    const pos = r.position?.getValue(v.clock.currentTime)
    if (!pos) return
    const m = C.Transforms.eastNorthUpToFixedFrame(pos, C.Ellipsoid.WGS84, new C.Matrix4())
    f.modelMatrix = m; s.modelMatrix = m
  }
}

/* ================================================================
 * GUI
 * ================================================================ */

export function setupGUI(
  stage: HTMLElement, state: any,
  viewer: () => Cesium.Viewer | null,
  flamePS: () => any, smokePS: () => any,
  onLaunch: () => void, onReset: () => void,
): any {
  const gui = createDemoGui(stage)
  Object.assign(gui.domElement.style, {
    backdropFilter: 'blur(10px)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)',
  })

  const ctrl = gui.addFolder('控制')
  ctrl.add({ launch: onLaunch }, 'launch').name('🔴 发射')
  ctrl.add({ reset: onReset }, 'reset').name('🔄 重置')
  ctrl.add(state, 'speed', [0.5, 1, 2, 5]).name('速度').onChange((v: number) => {
    state.speed = v; const vv = viewer(); if (vv) vv.clock.multiplier = v
  })

  const fx = gui.addFolder('粒子效果')
  fx.add(state, 'showFlame').name('尾焰').onChange((v: boolean) => { const f = flamePS(); if (f) f.show = v })
  fx.add(state, 'showSmoke').name('烟雾').onChange((v: boolean) => { const s = smokePS(); if (s) s.show = v })

  const info = gui.addFolder('飞行数据')
  info.add(state, 'flightTime').name('飞行时间 (s)').disable().listen()

  return gui
}
