<script setup lang="ts">
/**
 * CesiumViewer — Cesium 基础组件
 *
 * 封装 Viewer 创建/销毁、自适应 resize、底图选择。
 * 需要父元素有明确高度（h-full / flex-1 均可）。
 *
 * @example
 * <CesiumViewer @ready="onReady" imagery="osm" />
 * @emits ready(viewer) — Viewer 实例就绪
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
      return new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
    case 'ion': {
      const token = props.accessToken || (C as any).Ion?.defaultAccessToken
      if (token) {
        (C as any).Ion.defaultAccessToken = token
        return C.IonImageryProvider?.fromAssetId?.(2)
          ?? new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
      }
      return new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
    }
    case 'bing': {
      if (props.accessToken) {
        return new C.BingMapsImageryProvider({
          url: 'https://dev.virtualearth.net',
          key: props.accessToken,
        })
      }
      return new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
    }
    default:
      return undefined
  }
}

function createTerrainProvider(): any {
  const C = window.Cesium
  if (!C) return undefined

  if (props.terrain === 'ion') {
    const token = props.accessToken || (C as any).Ion?.defaultAccessToken
    if (token) return C.createWorldTerrain?.() ?? new C.EllipsoidTerrainProvider()
  }
  return props.terrain === 'ellipsoid' ? new C.EllipsoidTerrainProvider() : undefined
}

// ==================== 填充 Cesium 内部 DOM 高度 ====================
function fillInternalHeight(v: Cesium.Viewer) {
  // Cesium 在容器内创建 .cesium-viewer > .cesium-widget > canvas
  // 这些元素默认不填满容器，需要显式设 100%
  const host = v.container as HTMLElement
  host.style.width = '100%'
  host.style.height = '100%'

  const viewerEl = host.querySelector('.cesium-viewer') as HTMLElement | null
  const widgetEl = host.querySelector('.cesium-widget') as HTMLElement | null
  const canvas = v.canvas as HTMLElement | null

  if (viewerEl) { viewerEl.style.width = '100%'; viewerEl.style.height = '100%' }
  if (widgetEl) { widgetEl.style.width = '100%'; widgetEl.style.height = '100%' }
  if (canvas) { canvas.style.width = '100%'; canvas.style.height = '100%' }
}

// ==================== 初始化 ====================
onMounted(() => {
  if (!containerRef.value) return

  try {
    const C = window.Cesium
    if (!C) throw new Error('window.Cesium 未加载')

    const sceneModeMap: Record<string, number> = {
      '3d': C.SceneMode?.SCENE3D ?? 1,
      '2d': C.SceneMode?.SCENE2D ?? 2,
      columbus: C.SceneMode?.COLUMBUS_VIEW ?? 3,
    }

    const v = new C.Viewer(containerRef.value, {
      imageryProvider: createImageryProvider(),
      terrainProvider: createTerrainProvider(),
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

    if (v.scene) {
      v.scene.skyAtmosphere.show = props.skyAtmosphere
      v.scene.skyBox.show = props.skyBox
    }

    if (!props.showCredit && v.cesiumWidget) {
      v.cesiumWidget.creditContainer.style.display = 'none'
    }

    fillInternalHeight(v)

    // ---- resize 监听 ----
    const doResize = () => {
      if (v && !v.isDestroyed()) {
        fillInternalHeight(v)
        v.resize()
      }
    }

    resizeObserver = new ResizeObserver(() => doResize())
    resizeObserver.observe(containerRef.value)

    // 多次延时确保首次布局完成后尺寸正确
    setTimeout(() => doResize(), 50)
    setTimeout(() => doResize(), 300)

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
    console.error('[CesiumViewer]', e)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (viewer.value && !viewer.value.isDestroyed()) {
    viewer.value.destroy()
  }
})

defineExpose({ viewer, isReady })
</script>

<template>
  <!--
    cesium-viewer-root: 填满父容器
    依赖父元素有明确高度，比如 class="h-full" 或 flex-1
  -->
  <div class="cesium-viewer-root h-full w-full relative">
    <!-- Cesium 会将 Viewer 的内容渲染到这个 div -->
    <div
      ref="container"
      class="cesium-host h-full w-full"
    />

    <!-- 错误遮罩 -->
    <div
      v-if="initError"
      class="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/90"
    >
      <div class="text-center max-w-md px-4">
        <p class="text-red-400 font-semibold mb-2">Cesium 初始化失败</p>
        <p class="text-sm text-zinc-400 font-mono break-all">{{ initError }}</p>
      </div>
    </div>

    <!-- 加载遮罩 -->
    <div
      v-else-if="!isReady"
      class="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950"
    >
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span class="text-sm text-zinc-500">加载 Cesium...</span>
      </div>
    </div>
  </div>
</template>
