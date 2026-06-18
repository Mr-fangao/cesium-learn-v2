/**
 * TilesetDemo 逻辑 — 3D Tileset 加载/样式/拾取
 */

import { createDemoGui } from '@/shared/gui'

export interface ModelConfig {
  id: string
  name: string
  url: string
  homePosition: [number, number, number]
  styleOptions: string[]
  styleIndex: number
}

export const MODELS: ModelConfig[] = [
  {
    id: 'requestVolume',
    name: 'Request Volume (费城建筑)',
    url: '/data/3dtiles/request-volume/tileset.json',
    homePosition: [-75.612, 40.042, 500],
    styleOptions: ['原始', '蓝色调', '暖色调', '半透明'],
    styleIndex: 0,
  },
  {
    id: 'dayanta',
    name: '大雁塔倾斜摄影',
    url: '/data/3dtiles/dayanta/tileset.json',
    homePosition: [108.959, 34.219, 500],
    styleOptions: ['原始纹理', '蓝色调', '半透明'],
    styleIndex: 0,
  },
]

export function isTilesetAlive(t: any, viewer: Cesium.Viewer | null): boolean {
  if (!t || !viewer || viewer.isDestroyed()) return false
  try {
    if (typeof t.isDestroyed === 'function') return !t.isDestroyed()
    return viewer.scene.primitives.contains(t)
  } catch { return false }
}

export function clearTileset(viewer: Cesium.Viewer | null, tileset: any): any {
  if (isTilesetAlive(tileset, viewer)) {
    viewer!.scene.primitives.remove(tileset)
  }
  return null
}

export async function loadModel(
  viewer: Cesium.Viewer, C: any, modelIndex: number, tileset: any,
  showBoundingVolume: boolean,
): Promise<any> {
  const model = MODELS[modelIndex]
  tileset = clearTileset(viewer, tileset)

  const newTileset = await C.Cesium3DTileset.fromUrl(model.url)
  newTileset.debugShowBoundingVolume = showBoundingVolume
  viewer.scene.primitives.add(newTileset)

  const [lon, lat, h] = model.homePosition
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(lon, lat, h),
    duration: 1.5,
  })

  return newTileset
}

export function applyCurrentStyle(
  C: any, tileset: any, modelIndex: number, opacity: number,
): void {
  if (!isTilesetAlive(tileset, null)) return
  const model = MODELS[modelIndex]
  const styleName = model.styleOptions[model.styleIndex]

  tileset.style = undefined
  tileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.HIGHLIGHT ?? 0
  tileset.colorBlendAmount = opacity

  switch (model.id) {
    case 'dayanta':
      switch (styleName) {
        case '原始纹理': break
        case '蓝色调':
          tileset.style = new C.Cesium3DTileStyle({ color: "color('#4488cc')" })
          tileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.REPLACE ?? 1
          break
        case '半透明':
          tileset.style = new C.Cesium3DTileStyle({ color: "color('white', 0.35)" })
          tileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.MIX ?? 0
          break
      }
      break
    case 'requestVolume':
      switch (styleName) {
        case '原始': break
        case '蓝色调':
          tileset.style = new C.Cesium3DTileStyle({ color: "color('#5b9bd5')" })
          tileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.REPLACE ?? 1
          break
        case '暖色调':
          tileset.style = new C.Cesium3DTileStyle({ color: "color('#e8923f')" })
          tileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.REPLACE ?? 1
          break
        case '半透明':
          tileset.style = new C.Cesium3DTileStyle({ color: "color('white', 0.4)" })
          tileset.colorBlendMode = C.Cesium3DTileColorBlendMode?.MIX ?? 0
          break
      }
      break
  }
}

export function switchModel(
  modelIndex: number, settings: any, guiStyleCtrl: any,
): void {
  const model = MODELS[modelIndex]
  settings.modelName = model.name
  if (guiStyleCtrl) {
    settings.styleMode = model.styleOptions[model.styleIndex]
    guiStyleCtrl.options(model.styleOptions).setValue(settings.styleMode)
  }
}

export function switchStyle(
  styleName: string, modelIndex: number, settings: any,
): void {
  const model = MODELS[modelIndex]
  const idx = model.styleOptions.indexOf(styleName)
  if (idx === -1) return
  model.styleIndex = idx
  settings.styleMode = styleName
}

export function setupPickHandler(
  viewer: Cesium.Viewer, C: any, pickEnabled: () => boolean,
  modelIndex: () => number, setPickInfo: (info: any) => void,
): any {
  const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((movement: any) => {
    if (!pickEnabled() || viewer.isDestroyed()) return
    const pos = movement.position ?? movement.endPosition
    if (!pos) return

    const picked = viewer.scene.pick(pos)
    if (!picked) { setPickInfo(null); return }

    const model = MODELS[modelIndex()]
    const props: { key: string; value: string }[] = []
    const { content, primitive } = picked

    if (content) {
      try {
        const url = typeof content.url === 'function' ? content.url() : content.url
        if (url) props.push({ key: 'Content URL', value: String(url) })
      } catch (_) { /* ignore */ }
      if (content.featuresLength !== undefined) {
        props.push({ key: 'Features', value: String(content.featuresLength) })
      }
      const bt = content.batchTable?._properties
      if (bt) {
        for (const [k, v] of Object.entries(bt as Record<string, unknown>).slice(0, 5)) {
          props.push({ key: k, value: String(v) })
        }
      }
    }
    if (primitive?._url) {
      props.push({ key: 'Tileset', value: primitive._url.split('/').pop() || '' })
    }
    if (props.length === 0) {
      props.push({ key: '类型', value: model.id === 'dayanta' ? '倾斜摄影 Mesh' : '建筑/点云' })
    }
    setPickInfo({ visible: true, modelName: model.name, properties: props })
  }, C.ScreenSpaceEventType.LEFT_CLICK)
  return handler
}

export function flyToView(
  viewer: Cesium.Viewer, C: any, modelIndex: number, headingDeg: number, pitchDeg: number,
): void {
  const [lon, lat, h] = MODELS[modelIndex].homePosition
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(lon, lat, h),
    orientation: { heading: C.Math.toRadians(headingDeg), pitch: C.Math.toRadians(pitchDeg), roll: 0 },
    duration: 1.0,
  })
}

export function setupGUI(
  stage: HTMLElement, settings: any, guiStyleCtrl: { value: any },
  onModelChange: (name: string) => void,
  onStyleChange: (name: string) => void,
  onOpacityChange: () => void,
  onBoundingVolumeChange: (v: boolean) => void,
  onFlyToView: (heading: number, pitch: number) => void,
  onReset: () => void,
  currentModelIndex: () => number,
) {
  const gui = createDemoGui(stage)

  gui.add(settings, 'modelName', MODELS.map(m => m.name)).name('模型选择')
    .onChange(onModelChange)

  guiStyleCtrl.value = gui.add(settings, 'styleMode', MODELS[currentModelIndex()].styleOptions)
    .name('着色方案').onChange(onStyleChange)

  gui.add(settings, 'opacity', 0.1, 1.0, 0.05).name('透明度').onChange(onOpacityChange)
  gui.add(settings, 'pickEnabled').name('拾取信息')

  const dbg = gui.addFolder('调试')
  dbg.add(settings, 'showBoundingVolume').name('显示包围盒').onChange(onBoundingVolumeChange)

  const cam = gui.addFolder('相机')
  cam.add({ f: () => onFlyToView(0, -90) }, 'f').name('正视')
  cam.add({ f: () => onFlyToView(0, 0) }, 'f').name('俯视')
  cam.add({ f: () => onFlyToView(90, -45) }, 'f').name('侧视')
  cam.add({ f: onReset }, 'f').name('重置')

  return gui
}
