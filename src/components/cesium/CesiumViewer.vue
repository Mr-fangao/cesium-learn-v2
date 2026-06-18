<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    imagery?: 'tianditu' | 'ion' | 'bing' | 'none'
    tiandituStyle?: 'vector' | 'image'
    terrain?: 'ellipsoid' | 'ion' | 'none'
    accessToken?: string
    initialPosition?: [number, number, number]
    showCredit?: boolean
    sceneMode?: '3d' | '2d' | 'columbus'
    skyAtmosphere?: boolean
    skyBox?: boolean
  }>(),
  {
    imagery: 'tianditu',
    tiandituStyle: 'image',
    terrain: 'ellipsoid',
    initialPosition: () => [116.397, 39.909, 10_000_000],
    showCredit: false,
    sceneMode: '3d',
    skyAtmosphere: true,
    skyBox: true,
  },
)

const emit = defineEmits<{ ready: [viewer: Cesium.Viewer] }>()

// ⚠️ 变量名必须和模板 ref="container" 一致
const container = ref<HTMLDivElement | null>(null)
const viewer = ref<Cesium.Viewer | null>(null)
const isReady = ref(false)
const initError = ref<string | null>(null)
let resizeObserver: ResizeObserver | null = null
let currentBaseLayer: any = null
let currentLabelLayer: any = null

/** 天地图 Token，从环境变量读取 */
const TIANDITU_TOKEN = import.meta.env.VITE_TIANDITU_TOKEN as string

/** 创建天地图影像 Provider */
type TiandituLayer = 'vec_w' | 'cva_w' | 'img_w' | 'cia_w'

function makeTiandituProvider(C: any, layer: TiandituLayer) {
  return new C.UrlTemplateImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/DataServer?T=${layer}&x={x}&y={y}&l={z}&tk=${TIANDITU_TOKEN}`,
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    minimumLevel: 1,
    maximumLevel: 16,
  })
}

function makeImageryProvider(C: any) {
  switch (props.imagery) {
    case 'tianditu': {
      // 天地图走 imageryLayers 添加，不走构造函数
      return false
    }
    case 'ion': {
      const token = props.accessToken || C.Ion?.defaultAccessToken
      if (token) { C.Ion.defaultAccessToken = token; return C.IonImageryProvider?.fromAssetId?.(2) }
      // 无 Ion Token → 退回天地图
      if (TIANDITU_TOKEN && TIANDITU_TOKEN !== 'your_token_here') return false
      return undefined
    }
    case 'bing':
      return props.accessToken
        ? new C.BingMapsImageryProvider({ url: 'https://dev.virtualearth.net', key: props.accessToken })
        : (TIANDITU_TOKEN && TIANDITU_TOKEN !== 'your_token_here')
          ? false
          : undefined
    default: return undefined
  }
}

/** 更新天地图图层（支持动态切换矢量/影像） */
function applyTiandituLayers(C: any, v: Cesium.Viewer) {
  const isVector = props.tiandituStyle === 'vector'

  // 移除旧图层
  if (currentBaseLayer) { v.imageryLayers.remove(currentBaseLayer); currentBaseLayer = null }
  if (currentLabelLayer) { v.imageryLayers.remove(currentLabelLayer); currentLabelLayer = null }

  // 添加新图层
  currentBaseLayer = v.imageryLayers.addImageryProvider(
    makeTiandituProvider(C, isVector ? 'vec_w' : 'img_w'),
  )
  currentLabelLayer = v.imageryLayers.addImageryProvider(
    makeTiandituProvider(C, isVector ? 'cva_w' : 'cia_w'),
  )

  v.scene.requestRender()
}

function makeTerrainProvider(C: any) {
  if (props.terrain === 'ion') {
    const token = props.accessToken || C.Ion?.defaultAccessToken
    if (!token) {
      // 无 Token → 退回椭球
      return props.terrain === 'ellipsoid' ? new C.EllipsoidTerrainProvider() : undefined
    }
    // Cesium 1.111 中 createWorldTerrain 不存在，正确 API 是 Terrain.fromWorldTerrain()
    // 该 API 依赖 C.Ion.defaultAccessToken，这里临时 set/unset 避免影响 Viewer 构造时的默认底图
    const prevToken = C.Ion?.defaultAccessToken
    C.Ion.defaultAccessToken = token
    const wt = C.Terrain.fromWorldTerrain?.() ?? new C.EllipsoidTerrainProvider()
    C.Ion.defaultAccessToken = prevToken
    return wt
  }
  return props.terrain === 'ellipsoid' ? new C.EllipsoidTerrainProvider() : undefined
}

function forceHeight(v: Cesium.Viewer) {
  const el = v.container as HTMLElement
  el.style.width = '100%'; el.style.height = '100%'
  const ve = el.querySelector('.cesium-viewer') as HTMLElement | null
  const we = el.querySelector('.cesium-widget') as HTMLElement | null
  const cv = v.canvas as HTMLElement | null
  if (ve) { ve.style.width = '100%'; ve.style.height = '100%' }
  if (we) { we.style.width = '100%'; we.style.height = '100%' }
  if (cv) { cv.style.width = '100%'; cv.style.height = '100%' }
}

function initViewer() {
  const el = container.value
  if (!el) return

  try {
    const C = window.Cesium
    if (!C) throw new Error('window.Cesium 未加载')

    // 天地图 Token 缺失时给出明确提示
    if (props.imagery === 'tianditu' && (!TIANDITU_TOKEN || TIANDITU_TOKEN === 'your_token_here')) {
      throw new Error('天地图 Token 未配置，请在 .env 中设置 VITE_TIANDITU_TOKEN（申请地址: https://console.tianditu.gov.cn/）')
    }

    const imageryProvider = makeImageryProvider(C)
    // 当 makeImageryProvider 返回 false 时，表示要通过 imageryLayers 手动添加底图
    const useManualImagery = imageryProvider === false

    const v = new C.Viewer(el, {
      imageryProvider: useManualImagery ? undefined : imageryProvider,
      terrainProvider: makeTerrainProvider(C),
      sceneMode: (C.SceneMode?.SCENE3D ?? 1),
      animation: false, timeline: false,
      baseLayerPicker: false, fullscreenButton: false,
      homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, geocoder: false,
      selectionIndicator: false, infoBox: false,
    })

    // 天地图：底图 + 注记（通过 imageryLayers 添加，确保瓦片请求正确触发）
    if (useManualImagery) {
      applyTiandituLayers(C, v)
    }

    if (v.scene) {
      v.scene.skyAtmosphere.show = props.skyAtmosphere
      v.scene.skyBox.show = props.skyBox
      // 强制渲染一帧 — 解决路由跳转后场景不绘制的问题
      v.scene.requestRender()
    }
    if (!props.showCredit && v.cesiumWidget) {
      v.cesiumWidget.creditContainer.style.display = 'none'
    }

    forceHeight(v)

    const doResize = () => { if (v && !v.isDestroyed()) { forceHeight(v); v.resize() } }
    resizeObserver = new ResizeObserver(() => doResize())
    resizeObserver.observe(el)
    setTimeout(() => doResize(), 100)
    setTimeout(() => doResize(), 400)

    const [lon, lat, h] = props.initialPosition
    v.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(lon, lat, h),
      duration: 1.5,
    })

    viewer.value = v
    isReady.value = true
    emit('ready', v)
  } catch (e: any) {
    initError.value = e.message || String(e)
    console.error('[CesiumViewer]', e)
  }
}

// 监听样式切换，动态更新图层
watch(() => props.tiandituStyle, () => {
  const v = viewer.value
  if (!v || v.isDestroyed()) return
  const C = window.Cesium
  if (!C) return
  // 仅天地图模式下响应
  if (props.imagery !== 'tianditu') return
  applyTiandituLayers(C, v)
})

onMounted(async () => {
  if (!container.value) return
  await nextTick()
  initViewer()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (viewer.value && !viewer.value.isDestroyed()) viewer.value.destroy()
})

defineExpose({ viewer, isReady })
</script>

<template>
  <div class="cesium-viewer-root h-full w-full relative">
    <div ref="container" class="cesium-host h-full w-full" />

    <div v-if="initError" class="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/90">
      <div class="text-center max-w-md px-4">
        <p class="text-red-400 font-semibold mb-2">Cesium 初始化失败</p>
        <p class="text-sm text-zinc-400 font-mono break-all">{{ initError }}</p>
      </div>
    </div>

    <div v-else-if="!isReady" class="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span class="text-sm text-zinc-500">加载 Cesium...</span>
      </div>
    </div>
  </div>
</template>
