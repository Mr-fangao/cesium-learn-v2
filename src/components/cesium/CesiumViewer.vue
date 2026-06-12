<script setup lang="ts">
/**
 * CesiumViewer — Cesium 基础组件
 *
 * 封装 Viewer 的创建、销毁、自适应 resize。
 * 其他页面只需引入此组件，拿到 viewer 实例后添加业务功能。
 *
 * --- 使用方式 ---
 * ```vue
 * <CesiumViewer @ready="onReady" imagery="osm">
 *   <div class="absolute top-4 left-4">覆盖层 UI</div>
 * </CesiumViewer>
 * ```
 *
 * @emits ready(viewer) — Viewer 创建完成，返回 Cesium.Viewer 实例
 */

import { ref, onMounted, onUnmounted, watch, useTemplateRef } from 'vue'

// ==================== Props ====================
const props = withDefaults(
  defineProps<{
    /**
     * 底图影像类型
     * - 'osm': OpenStreetMap（免费，无需 Token，默认）
     * - 'ion': Cesium Ion 全球影像（需设置 Cesium.Ion.defaultAccessToken）
     * - 'bing': Bing Maps（需要 accessToken prop）
     * - 'none': 不加载底图，只显示几何体和地形
     */
    imagery?: 'osm' | 'ion' | 'bing' | 'none'

    /**
     * 地形提供者
     * - 'ellipsoid': 默认椭球体（无地形起伏）
     * - 'ion': Cesium World Terrain（需 Token）
     * - 'none': 无地形
     */
    terrain?: 'ellipsoid' | 'ion' | 'none'

    /**
     * Bing Maps / Cesium Ion Access Token
     * 若 imagery='ion' 或 terrain='ion'，优先用此 prop，
     * 否则fallback到 Cesium.Ion.defaultAccessToken
     */
    accessToken?: string

    /** 初始相机经纬度 [lng, lat, height(m)] */
    initialPosition?: [number, number, number]

    /** 是否显示 Cesium Ion 版权信息 */
    showCredit?: boolean

    /** 初始场景模式 */
    sceneMode?: '3d' | '2d' | 'columbus'

    /** 是否显示大气层效果 */
    skyAtmosphere?: boolean

    /** 是否显示星空 */
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

// ==================== Emits ====================
const emit = defineEmits<{
  ready: [viewer: Cesium.Viewer]
}>()

// ==================== State ====================
const containerRef = useTemplateRef<HTMLDivElement>('container')
const viewer = ref<Cesium.Viewer | null>(null)
const isReady = ref(false)
const initError = ref<string | null>(null)

let resizeObserver: ResizeObserver | null = null
let windowResizeHandler: (() => void) | null = null

// ==================== 底图工厂 ====================
function createImageryProvider(): any {
  const C = window.Cesium
  if (!C) return undefined

  switch (props.imagery) {
    case 'osm': {
      // OpenStreetMap — 免费，无需 Token，地球马上能看见
      return new C.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
        maximumLevel: 18,
      })
    }
    case 'ion': {
      const token = props.accessToken || (C as any).Ion?.defaultAccessToken
      if (token) {
        ;(C as any).Ion.defaultAccessToken = token
        return C.IonImageryProvider?.fromAssetId
          ? C.IonImageryProvider.fromAssetId(2) // Bing Maps Aerial
          : new C.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
      }
      // fallback to OSM
      console.warn('[CesiumViewer] Ion imagery 需要 accessToken，已 fallback 到 OSM')
      return new C.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
    }
    case 'bing': {
      if (props.accessToken) {
        return new C.BingMapsImageryProvider({
          url: 'https://dev.virtualearth.net',
          key: props.accessToken,
        })
      }
      console.warn('[CesiumViewer] Bing imagery 需要 accessToken，已 fallback 到 OSM')
      return new C.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
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
      if (token) {
        return C.createWorldTerrain?.() ?? new C.EllipsoidTerrainProvider()
      }
      console.warn('[CesiumViewer] Ion terrain 需要 accessToken，已 fallback 到 Ellipsoid')
      return new C.EllipsoidTerrainProvider()
    }
    case 'none':
    default:
      return undefined
  }
}

// ==================== 初始化 ====================
onMounted(() => {
  if (!containerRef.value) return

  try {
    const C = window.Cesium
    if (!C) throw new Error('window.Cesium 未加载')

    // 合成 Viewer 配置
    const imageryProvider = createImageryProvider()
    const terrainProvider = createTerrainProvider()

    const sceneModeMap: Record<string, number> = {
      '3d': C.SceneMode?.SCENE3D ?? 1,
      '2d': C.SceneMode?.SCENE2D ?? 2,
      columbus: C.SceneMode?.COLUMBUS_VIEW ?? 3,
    }

    const v = new C.Viewer(containerRef.value, {
      // ---- 底图 ----
      imageryProvider,
      terrainProvider,
      // ---- 场景 ----
      sceneMode: sceneModeMap[props.sceneMode] ?? 1,
      // ---- UI 控件全部关闭 ----
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

    // skyBox / skyAtmosphere 在 Viewer 创建后通过 scene 设置
    // 直接在构造函数传参在 Cesium 1.111 中有兼容性问题
    if (v.scene) {
      v.scene.skyAtmosphere.show = props.skyAtmosphere
      v.scene.skyBox.show = props.skyBox
    }

    // 版权信息
    if (!props.showCredit && v.cesiumWidget) {
      v.cesiumWidget.creditContainer.style.display = 'none'
    }

    // ---- 自适应 resize ----
    const doResize = () => {
      if (v && !v.isDestroyed()) {
        // 强制 canvas 填满容器
        const canvas = v.canvas
        if (canvas) {
          canvas.style.width = '100%'
          canvas.style.height = '100%'
        }
        v.resize()
      }
    }

    resizeObserver = new ResizeObserver(() => doResize())
    resizeObserver.observe(containerRef.value)

    windowResizeHandler = () => doResize()
    window.addEventListener('resize', windowResizeHandler)

    // 首次强制 resize（解决初始时 canvas 尺寸不对的问题）
    // Cesium 在构造后 canvas 可能未立即计算正确尺寸
    setTimeout(() => doResize(), 100)
    setTimeout(() => doResize(), 500)

    // ---- 相机飞到初始位置 ----
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
    console.error('[CesiumViewer] 初始化失败:', e)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (windowResizeHandler) {
    window.removeEventListener('resize', windowResizeHandler)
    windowResizeHandler = null
  }
  if (viewer.value && !viewer.value.isDestroyed()) {
    viewer.value.destroy()
  }
})

// ==================== 暴露方法 ====================
defineExpose({
  viewer,
  isReady,
  /** 手动触发 resize */
  resize() {
    if (viewer.value && !viewer.value.isDestroyed()) {
      viewer.value.resize()
    }
  },
})
</script>

<template>
  <div class="cesium-viewer-root w-full h-full relative min-h-0">
    <!-- Cesium 挂载容器 — 必须 100% 填充 -->
    <div
      ref="container"
      class="cesium-container w-full h-full"
    />

    <!-- 错误提示 -->
    <div
      v-if="initError"
      class="absolute inset-0 flex items-center justify-center bg-zinc-950/90 z-20"
    >
      <div class="text-center max-w-md">
        <p class="text-red-400 font-semibold mb-2">Cesium 初始化失败</p>
        <p class="text-sm text-zinc-400 font-mono break-all">{{ initError }}</p>
      </div>
    </div>

    <!-- 加载遮罩 -->
    <div
      v-else-if="!isReady"
      class="absolute inset-0 flex items-center justify-center bg-surface z-10"
    >
      <div class="flex flex-col items-center gap-3">
        <div
          class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"
        />
        <span class="text-sm text-zinc-500">加载 Cesium...</span>
      </div>
    </div>

    <!-- 覆盖层插槽 -->
    <slot v-if="isReady && viewer" :viewer="viewer" />
  </div>
</template>

<style scoped>
/*
 * 关键：Cesium 生成的 canvas 需要绝对定位填满容器
 * viewer 内部会给 canvas 设 position: absolute
 */
.cesium-viewer-root {
  min-height: 0;
}

/*
 * Cesium Widget 默认样式中有一些影响布局的规则，
 * 这里确保容器始终 100% 填充。
 */
.cesium-container :deep(.cesium-viewer),
.cesium-container :deep(.cesium-widget),
.cesium-container :deep(.cesium-widget canvas) {
  width: 100% !important;
  height: 100% !important;
}
</style>
