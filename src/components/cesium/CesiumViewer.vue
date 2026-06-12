<script setup lang="ts">
/**
 * CesiumViewer — Cesium 基础组件
 *
 * 封装 Viewer 创建/销毁、自适应 resize、底图选择。
 * 其他页面只需引入此组件，@ready 拿到 viewer 后添加业务功能。
 *
 * @example
 * <CesiumViewer @ready="onReady" imagery="osm" />
 *
 * @emits ready(viewer)
 */

import { ref, onMounted, onUnmounted, useTemplateRef } from 'vue'

// ==================== Props ====================
const props = withDefaults(
  defineProps<{
    imagery?: 'osm' | 'ion' | 'bing' | 'none'
    terrain?: 'ellipsoid' | 'ion' | 'none'
    accessToken?: string
    initialPosition?: [number, number, number]
    showCredit?: boolean
    sceneMode?: '3d' | '2d' | 'columbus'
    skyAtmosphere?: boolean
    skyBox?: boolean
  }>(),
  {
    imagery: 'osm',
    terrain: 'ellipsoid',
    initialPosition: () => [116.397, 39.909, 10_000_000],
    showCredit: false,
    sceneMode: '3d',
    skyAtmosphere: true,
    skyBox: true,
  },
)

const emit = defineEmits<{ ready: [viewer: Cesium.Viewer] }>()

// ==================== State ====================
const containerRef = useTemplateRef<HTMLDivElement>('container')
const viewer = ref<Cesium.Viewer | null>(null)
const isReady = ref(false)
const initError = ref<string | null>(null)

let resizeObserver: ResizeObserver | null = null

// ==================== 底图工厂 ====================
function createImageryProvider(): any {
  const C = window.Cesium
  if (!C) return undefined

  switch (props.imagery) {
    case 'osm':
      // 使用 Cesium 内置 OSM 默认 URL 模板，不要传自定义 url
      return new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })

    case 'ion': {
      const token = props.accessToken || (C as any).Ion?.defaultAccessToken
      if (token) {
        ;(C as any).Ion.defaultAccessToken = token
        return C.IonImageryProvider?.fromAssetId
          ? C.IonImageryProvider.fromAssetId(2)
          : new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
      }
      console.warn('[CesiumViewer] Ion 需 Token，fallback → OSM')
      return new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
    }

    case 'bing': {
      if (props.accessToken) {
        return new C.BingMapsImageryProvider({
          url: 'https://dev.virtualearth.net',
          key: props.accessToken,
        })
      }
      console.warn('[CesiumViewer] Bing 需 Token，fallback → OSM')
      return new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
    }

    case 'none':
    default:
      return undefined
  }
}

function createTerrainProvider(): any {
  const C = window.Cesium
  if (!C) return undefined

  switch (props.terrain) {
    case 'ellipsoid':
      return new C.EllipsoidTerrainProvider()
    case 'ion': {
      const token = props.accessToken || (C as any).Ion?.defaultAccessToken
      if (token) return C.createWorldTerrain?.() ?? new C.EllipsoidTerrainProvider()
      console.warn('[CesiumViewer] Ion terrain 需 Token，fallback → Ellipsoid')
      return new C.EllipsoidTerrainProvider()
    }
    case 'none':
    default:
      return undefined
  }
}

// ==================== 高度修正 ====================
/**
 * 强制 Cesium 内部 DOM 填满容器高度
 * Cesium 创建的 .cesium-viewer / .cesium-widget / canvas 默认没有 height:100%
 */
function forceFillHeight(v: Cesium.Viewer) {
  const root = v.container.parentElement // .cesium-viewer-root
  if (root) {
    root.style.height = '100%'
    root.style.width = '100%'
  }

  const el = v.container // div we passed to Viewer
  el.style.height = '100%'
  el.style.width = '100%'

  // cesium-viewer → cesium-widget → canvas
  const cv = el.querySelector('.cesium-viewer') as HTMLElement
  const cw = el.querySelector('.cesium-widget') as HTMLElement
  const canvas = v.canvas as HTMLElement

  if (cv) { cv.style.height = '100%'; cv.style.width = '100%' }
  if (cw) { cw.style.height = '100%'; cw.style.width = '100%' }
  if (canvas) { canvas.style.height = '100%'; canvas.style.width = '100%' }
}

// ==================== 初始化 ====================
onMounted(() => {
  if (!containerRef.value) return

  try {
    const C = window.Cesium
    if (!C) throw new Error('window.Cesium 未加载')

    const imageryProvider = createImageryProvider()
    const terrainProvider = createTerrainProvider()
    const sceneModeMap: Record<string, number> = {
      '3d': C.SceneMode?.SCENE3D ?? 1,
      '2d': C.SceneMode?.SCENE2D ?? 2,
      columbus: C.SceneMode?.COLUMBUS_VIEW ?? 3,
    }

    const v = new C.Viewer(containerRef.value, {
      imageryProvider,
      terrainProvider,
      sceneMode: sceneModeMap[props.sceneMode] ?? 1,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      geocoder: false,
      selectionIndicator: false,
      infoBox: false,
    })

    // 场景设置
    if (v.scene) {
      v.scene.skyAtmosphere.show = props.skyAtmosphere
      v.scene.skyBox.show = props.skyBox
    }

    // 版权隐藏
    if (!props.showCredit && v.cesiumWidget) {
      v.cesiumWidget.creditContainer.style.display = 'none'
    }

    // ---- 高度强制填充 ----
    forceFillHeight(v)

    // ---- 自适应 resize ----
    const doResize = () => {
      if (v && !v.isDestroyed()) {
        forceFillHeight(v)
        v.resize()
      }
    }

    resizeObserver = new ResizeObserver(() => doResize())
    resizeObserver.observe(containerRef.value)

    // 多次延时确保首次渲染后尺寸正确
    setTimeout(() => doResize(), 50)
    setTimeout(() => doResize(), 200)
    setTimeout(() => doResize(), 600)

    // ---- 相机 ----
    const [lon, lat, height] = props.initialPosition
    v.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(lon, lat, height),
      duration: 1.5,
    })

    viewer.value = v
    isReady.value = true
    emit('ready', v)
  } catch (e: any) {
    initError.value = e.message || String(e)
    console.error('[CesiumViewer] 失败:', e)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (viewer.value && !viewer.value.isDestroyed()) {
    viewer.value.destroy()
  }
})

defineExpose({ viewer, isReady })
</script>

<template>
  <div class="absolute inset-0">
    <!-- Cesium 容器 -->
    <div
      ref="container"
      class="cesium-host w-full h-full"
    />

    <!-- 错误 -->
    <div
      v-if="initError"
      class="absolute inset-0 flex items-center justify-center bg-zinc-950/90 z-20"
    >
      <div class="text-center max-w-md">
        <p class="text-red-400 font-semibold mb-2">Cesium 初始化失败</p>
        <p class="text-sm text-zinc-400 font-mono break-all">{{ initError }}</p>
      </div>
    </div>

    <!-- 加载 -->
    <div
      v-else-if="!isReady"
      class="absolute inset-0 flex items-center justify-center bg-surface z-10"
    >
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span class="text-sm text-zinc-500">加载 Cesium...</span>
      </div>
    </div>
  </div>
</template>

<style>
/*
 * NOT scoped — 必须穿透到 Cesium 内部 DOM
 * Cesium 创建的 .cesium-viewer / .cesium-widget / canvas 不继承高度
 */
.cesium-host {
  position: relative;
  overflow: hidden;
}

/* Cesium 内部容器：全部撑满 */
.cesium-host .cesium-viewer,
.cesium-host .cesium-widget,
.cesium-host .cesium-widget canvas {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
}
</style>
