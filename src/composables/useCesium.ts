import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Cesium Viewer 生命周期管理 Composable
 *
 * 前提：index.html 中已通过 `<script src="/Cesium/Cesium.js">` 加载 Cesium，
 *      执行后 `window.Cesium` 全局对象可用。
 *
 * --- 使用方式 ---
 * ```ts
 * const containerRef = ref<HTMLDivElement | null>(null)
 * const { viewer, isReady } = useCesium(containerRef)
 * ```
 *
 * 自动处理 Viewer 创建与销毁，避免内存泄漏。
 *
 * @param container  挂载 Cesium 的 DOM 元素 Ref
 * @param options    可选配置
 */
export function useCesium(
  container: Ref<HTMLElement | null>,
  options: {
    /** 初始经纬高 [lng, lat, height(m)]，默认北京上空 */
    initialPosition?: [number, number, number]
    /** 隐藏 Cesium Ion 版权信息，默认 true */
    hideCredit?: boolean
  } = {},
) {
  const {
    initialPosition = [116.397, 39.909, 10_000_000],
    hideCredit = true,
  } = options

  const viewer = ref<Cesium.Viewer | null>(null)
  const isReady = ref(false)
  const error = ref<string | null>(null)

  onMounted(() => {
    if (!container.value) return

    try {
      const C = window.Cesium
      if (!C) throw new Error('window.Cesium 未加载，请检查 /Cesium/Cesium.js')

      // 创建 Viewer（关闭所有默认 UI 控件）
      const v = new C.Viewer(container.value, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        geocoder: false,
      })

      // 隐藏 Ion 版权信息（作品集展示）
      if (hideCredit && v.cesiumWidget) {
        v.cesiumWidget.creditContainer.style.display = 'none'
      }

      // 飞向初始位置
      const [lon, lat, height] = initialPosition
      v.camera.flyTo({
        destination: C.Cartesian3.fromDegrees(lon, lat, height),
        duration: 1.5,
      })

      viewer.value = v
      isReady.value = true
    } catch (e: any) {
      error.value = e.message || String(e)
      console.error('useCesium init failed:', e)
    }
  })

  onUnmounted(() => {
    if (viewer.value && !viewer.value.isDestroyed()) {
      viewer.value.destroy()
    }
  })

  return { viewer, isReady, error }
}
