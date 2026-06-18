/**
 * PrimitiveCustom 逻辑 — 六边形柱状图构建与 GUI
 *
 * 坐标变换链路:
 *   局部 ENU → eastNorthUpToFixedFrame → ECEF → Cesium 渲染管线
 */

import { createDemoGui } from '@/shared/gui'

export interface PrimitiveSettings {
  count: number
  height: number
  radius: number
  spacing: number
}

/**
 * 创建六棱柱 Geometry
 *
 * CylinderGeometry(slices:6) — 圆周 6 等分 → 正六边形截面
 * 几何体中心在原点，沿 Z 轴站立（顶面 z=+length/2，底面 z=-length/2）
 */
export function createHexPrism(C: any, radius: number, height: number) {
  return new C.CylinderGeometry({
    length: height,
    topRadius: radius,
    bottomRadius: radius,
    slices: 6,
  })
}

/**
 * 构建/重建 N×N 六边形柱状图 Primitive
 *
 * 所有柱子共享一份 Geometry，modelMatrix + color 实例差异化
 * 返回新的 Primitive（调用方负责管理旧 Primitive 的移除）
 */
export function buildPrimitive(
  viewer: Cesium.Viewer,
  C: any,
  settings: PrimitiveSettings,
): any {
  const { count, height, radius, spacing } = settings

  const centerLat = 39.909
  const METERS_PER_DEG_LAT = 111320
  const METERS_PER_DEG_LON = 111320 * Math.cos(centerLat * Math.PI / 180)

  const centerLon = 116.397
  const halfExtent = ((count - 1) * spacing) / 2

  const geometry = createHexPrism(C, radius, height)
  const instances: any[] = []

  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      const lon = centerLon + (col * spacing - halfExtent) / METERS_PER_DEG_LON
      const lat = centerLat + (row * spacing - halfExtent) / METERS_PER_DEG_LAT

      // ENU 原点抬高 height/2 → 柱底刚好贴地，不会半埋入椭球
      const modelMatrix = C.Transforms.eastNorthUpToFixedFrame(
        C.Cartesian3.fromDegrees(lon, lat, height / 2),
      )

      const hue = (1 - col / Math.max(count - 1, 1)) * (240 / 360)
      const color = C.Color.fromHsl(hue, 0.7, 0.55, 0.55)

      instances.push(new C.GeometryInstance({
        geometry,
        modelMatrix,
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(color),
        },
      }))
    }
  }

  const p = new C.Primitive({
    geometryInstances: instances,
    appearance: new C.PerInstanceColorAppearance({
      flat: true,
      translucent: true,
    }),
    asynchronous: false,
  })

  viewer.scene.primitives.add(p)
  return p
}

/**
 * 创建 lil-gui 控制面板
 */
export function setupGUI(stage: HTMLElement, settings: PrimitiveSettings, onChange: () => void) {
  const gui = createDemoGui(stage, 240)
  gui.add(settings, 'count', 1, 20, 1).name('数量 N×N').onChange(onChange)
  gui.add(settings, 'height', 50, 5000).name('高度 (m)').onChange(onChange)
  gui.add(settings, 'radius', 20, 500).name('半径 (m)').onChange(onChange)
  gui.add(settings, 'spacing', 100, 5000).name('间距 (m)').onChange(onChange)
  return gui
}
