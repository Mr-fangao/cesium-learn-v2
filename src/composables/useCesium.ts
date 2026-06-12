import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Cesium Viewer 生命周期管理 Composable
 *
 * 前提：index.html 中已通过 `<script src="/Cesium/Cesium.js">` 加载 Cesium，
 *      执行后 `window.Cesium` 全局对象可用。
 *
 * --- 功能 ---
 * - 创建 / 销毁 Viewer
 * - 自动监听容器尺寸变化 → viewer.resize()
 * - 窗口 resize 时同步触发 resize
 *
 * @param container  挂载 Cesium 的 DOM 元素 Ref
 * @param options    可选配置
 */
export function useCesium(
  container: Ref<HTMLElement | null>,
  options: {
    initialPosition?: [number, number, number]
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

  let resizeObserver: ResizeObserver | null = null
  let windowResizeHandler: (() => void) | null = null

  onMounted(() => {
    if (!container.value) return

    try {
      const C = window.Cesium
      if (!C) throw new Error('window.Cesium 未加载，请检查 /Cesium/Cesium.js')

      // ========= 创建 Viewer =========
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

      if (hideCredit && v.cesiumWidget) {
        v.cesiumWidget.creditContainer.style.display = 'none'
      }

      // ========= 容器尺寸变化 → viewer.resize() =========
      const doResize = () => {
        if (v && !v.isDestroyed()) v.resize()
      }

      // ResizeObserver：flex 布局变化、侧栏收折
      resizeObserver = new ResizeObserver(() => doResize())
      resizeObserver.observe(container.value)

      // 浏览器窗口缩放
      windowResizeHandler = () => doResize()
      window.addEventListener('resize', windowResizeHandler)

      // ========= 飞向初始位置 =========
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

  return { viewer, isReady, error }
}
