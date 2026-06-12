<script setup lang="ts">
/**
 * CesiumViewer — Cesium 基础组件
 *
 * 等父容器有实际尺寸后才初始化 Viewer，解决路由跳转时容器可能为 0 的问题。
 */

import { ref, onMounted, onUnmounted, useTemplateRef } from 'vue'

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

const containerRef = useTemplateRef<HTMLDivElement>('container')
const viewer = ref<Cesium.Viewer | null>(null)
const isReady = ref(false)
const initError = ref<string | null>(null)

/** 用于清理的引用 */
let resizeObserver: ResizeObserver | null = null
let initObserver: ResizeObserver | null = null

// ---- helpers ----

function makeImageryProvider(C: any) {
  switch (props.imagery) {
    case 'osm':
      return new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
    case 'ion': {
      const t = props.accessToken || C.Ion?.defaultAccessToken
      if (t) { C.Ion.defaultAccessToken = t; return C.IonImageryProvider?.fromAssetId?.(2) }
      return new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
    }
    case 'bing':
      return props.accessToken
        ? new C.BingMapsImageryProvider({ url: 'https://dev.virtualearth.net', key: props.accessToken })
        : new C.OpenStreetMapImageryProvider({ maximumLevel: 18 })
    default:
      return undefined
  }
}

function makeTerrainProvider(C: any) {
  if (props.terrain === 'ion') {
    const t = props.accessToken || C.Ion?.defaultAccessToken
    if (t) return C.createWorldTerrain?.() ?? new C.EllipsoidTerrainProvider()
  }
  return props.terrain === 'ellipsoid' ? new C.EllipsoidTerrainProvider() : undefined
}

function fillDomHeight(v: Cesium.Viewer) {
  const el = v.container as HTMLElement
  el.style.width = '100%'
  el.style.height = '100%'
  const ve = el.querySelector('.cesium-viewer') as HTMLElement | null
  const we = el.querySelector('.cesium-widget') as HTMLElement | null
  const cv = v.canvas as HTMLElement | null
  if (ve) { ve.style.width = '100%'; ve.style.height = '100%' }
  if (we) { we.style.width = '100%'; we.style.height = '100%' }
  if (cv) { cv.style.width = '100%'; cv.style.height = '100%' }
}

// ---- 初始化（等容器有尺寸后执行） ----

function initViewer() {
  const el = containerRef.value
  if (!el) return

  try {
    const C = window.Cesium
    if (!C) throw new Error('window.Cesium 未加载')

    const sm: Record<string, number> = {
      '3d': C.SceneMode?.SCENE3D ?? 1,
      '2d': C.SceneMode?.SCENE2D ?? 2,
      columbus: C.SceneMode?.COLUMBUS_VIEW ?? 3,
    }

    const v = new C.Viewer(el, {
      imageryProvider: makeImageryProvider(C),
      terrainProvider: makeTerrainProvider(C),
      sceneMode: sm[props.sceneMode] ?? 1,
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

    fillDomHeight(v)

    // resize 监听
    const doResize = () => {
      if (v && !v.isDestroyed()) { fillDomHeight(v); v.resize() }
    }
    resizeObserver = new ResizeObserver(() => doResize())
    resizeObserver.observe(el)
    setTimeout(() => doResize(), 50)
    setTimeout(() => doResize(), 300)

    // 相机
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

onMounted(() => {
  const el = containerRef.value
  if (!el) return

  // 关键修复：等容器有非 0 尺寸再初始化
  // 路由跳转时 transition 期间容器可能还没完成布局，
  // ResizeObserver 确保在容器真正有尺寸时才创建 Viewer
  const rect = el.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    // 已有尺寸（首次加载或刷新页面），直接初始化
    initViewer()
  } else {
    // 容器无尺寸（路由跳转过渡中），等 ResizeObserver 通知
    initObserver = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      if (r.width > 0 && r.height > 0) {
        initObserver?.disconnect()
        initObserver = null
        initViewer()
      }
    })
    initObserver.observe(el)
  }
})

onUnmounted(() => {
  initObserver?.disconnect()
  resizeObserver?.disconnect()
  if (viewer.value && !viewer.value.isDestroyed()) {
    viewer.value.destroy()
  }
})

defineExpose({ viewer, isReady })
</script>

<template>
  <div class="cesium-viewer-root h-full w-full relative">
    <div ref="container" class="cesium-host h-full w-full" />

    <!-- 错误 -->
    <div v-if="initError" class="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/90">
      <div class="text-center max-w-md px-4">
        <p class="text-red-400 font-semibold mb-2">Cesium 初始化失败</p>
        <p class="text-sm text-zinc-400 font-mono break-all">{{ initError }}</p>
      </div>
    </div>

    <!-- 加载 -->
    <div v-else-if="!isReady" class="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span class="text-sm text-zinc-500">加载 Cesium...</span>
      </div>
    </div>
  </div>
</template>
