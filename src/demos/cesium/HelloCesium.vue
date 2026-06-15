<script setup lang="ts">
/**
 * Hello Cesium — 地球初始化
 *
 * 基于 CesiumViewer 基础组件，演示：
 * 1. 引入 CesiumViewer → @ready 获取 viewer 实例
 * 2. Entity API 添加标记点/标签/多边形
 * 3. 相机控制（flyTo）
 * 4. lil-gui 控制面板（底图样式切换）
 */

import { ref, onUnmounted } from 'vue'
import { GUI } from 'lil-gui'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'

/** Viewer 就绪状态 */
const viewerReady = ref(false)

/** 当前 viewer 实例 */
let viewer: Cesium.Viewer | null = null

/** 天地图底图样式 */
const tiandituStyle = ref<'vector' | 'image'>('image')

/** dat.GUI 实例 */
let gui: GUI | null = null

/**
 * Viewer 就绪回调 — 拿到 viewer 后添加业务内容
 */
function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  viewerReady.value = true

  addDemoEntities(v)
  setupGUI()
}

/**
 * 创建 dat.GUI 控制面板（浮动在地图右上角）
 */
function setupGUI() {
  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (!stage) return

  gui = new GUI({ autoPlace: false, width: 200 })
  gui.domElement.style.position = 'absolute'
  gui.domElement.style.top = '12px'
  gui.domElement.style.right = '12px'
  gui.domElement.style.zIndex = '10'
  stage.appendChild(gui.domElement)

  const config = { 底图: '影像' }
  gui.add(config, '底图', ['影像', '矢量']).onChange((val: string) => {
    tiandituStyle.value = val === '矢量' ? 'vector' : 'image'
  })
}

/**
 * 在地球上添加演示标记
 */
/**
 * LabelStyle 枚举值 (Cesium 1.111):
 *   FILL: 0, OUTLINE: 1, FILL_AND_OUTLINE: 2
 * VerticalOrigin:
 *   CENTER: 0, BOTTOM: 1, BASELINE: 2, TOP: -1
 */
const FILL_AND_OUTLINE = 2
const VERTICAL_ORIGIN_BOTTOM = 1

function addDemoEntities(v: Cesium.Viewer) {
  const C = window.Cesium

  v.entities.add({
    name: '北京',
    position: C.Cartesian3.fromDegrees(116.397, 39.909),
    point: {
      pixelSize: 12,
      color: C.Color.fromCssColorString('#6366f1'),
      outlineColor: C.Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: '北京',
      font: '14px sans-serif',
      fillColor: C.Color.WHITE,
      outlineColor: C.Color.fromCssColorString('#1e1b4b'),
      outlineWidth: 3,
      style: FILL_AND_OUTLINE,
      verticalOrigin: VERTICAL_ORIGIN_BOTTOM,
      pixelOffset: new C.Cartesian2(0, -16),
    },
  })

  v.entities.add({
    name: '上海',
    position: C.Cartesian3.fromDegrees(121.473, 31.23),
    point: {
      pixelSize: 10,
      color: C.Color.fromCssColorString('#10b981'),
      outlineColor: C.Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: '上海',
      font: '14px sans-serif',
      fillColor: C.Color.WHITE,
      outlineColor: C.Color.fromCssColorString('#064e3b'),
      outlineWidth: 3,
      style: FILL_AND_OUTLINE,
      verticalOrigin: VERTICAL_ORIGIN_BOTTOM,
      pixelOffset: new C.Cartesian2(0, -14),
    },
  })

  v.entities.add({
    name: '北京-上海航线',
    polyline: {
      positions: C.Cartesian3.fromDegreesArray([116.397, 39.909, 121.473, 31.23]),
      width: 2,
      material: new C.PolylineDashMaterialProperty({
        color: C.Color.fromCssColorString('#818cf8').withAlpha(0.7),
        dashLength: 16,
      }),
    },
  })
}

/** 飞到指定位置 */
function flyTo(lon: number, lat: number, height: number) {
  if (!viewer) return
  viewer.camera.flyTo({
    destination: window.Cesium.Cartesian3.fromDegrees(lon, lat, height),
    duration: 1.5,
  })
}

onUnmounted(() => {
  gui?.destroy()
  gui = null
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <!-- 顶部工具栏 — h-12 与侧栏 Logo 高度对齐 -->
    <div
      class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface"
    >
      <h2 class="font-semibold text-sm">Hello Cesium — 地球初始化</h2>

      <!-- 快捷定位按钮 -->
      <div class="flex items-center gap-1">
        <button
          class="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          @click="flyTo(116.397, 39.909, 10_000_000)"
        >
          北京
        </button>
        <button
          class="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          @click="flyTo(121.473, 31.23, 8_000_000)"
        >
          上海
        </button>
        <button
          class="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          @click="flyTo(-74.006, 40.713, 5_000_000)"
        >
          纽约
        </button>
      </div>

      <span class="text-xs text-zinc-500 hidden sm:inline ml-auto">
        标记 / 标签 / 虚线航线
      </span>

      <div class="flex items-center gap-2">
        <span
          class="w-2 h-2 rounded-full"
          :class="viewerReady ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'"
        />
      </div>
    </div>

    <!-- Cesium 场景区域 — flex-1 填充剩余高度 -->
    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer
        :tianditu-style="tiandituStyle"
        :initial-position="[116.397, 39.909, 10_000_000]"
        @ready="onViewerReady"
      />
    </div>
  </div>
</template>
