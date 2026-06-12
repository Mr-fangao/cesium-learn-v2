<script setup lang="ts">
/**
 * Hello Cesium — 地球初始化
 *
 * 基于 CesiumViewer 基础组件，演示：
 * 1. 引入 CesiumViewer → @ready 获取 viewer 实例
 * 2. Entity API 添加标记点/标签/多边形
 * 3. 相机控制（flyTo）
 */

import { ref } from 'vue'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'

/** Viewer 就绪状态 */
const viewerReady = ref(false)

/** 当前 viewer 实例 */
let viewer: Cesium.Viewer | null = null

/**
 * Viewer 就绪回调 — 拿到 viewer 后添加业务内容
 */
function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  viewerReady.value = true

  // 添加几个标记点做演示
  addDemoEntities(v)
}

/**
 * 在地球上添加演示标记
 */
function addDemoEntities(v: Cesium.Viewer) {
  const C = window.Cesium

  // ---- 北京标记 ----
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
      style: C.LabelStyle?.FILL_AND_OUTLINE ?? 1,
      verticalOrigin: C.VerticalOrigin?.BOTTOM ?? 1,
      pixelOffset: new C.Cartesian2(0, -16),
    },
  })

  // ---- 上海标记 ----
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
      style: C.LabelStyle?.FILL_AND_OUTLINE ?? 1,
      verticalOrigin: C.VerticalOrigin?.BOTTOM ?? 1,
      pixelOffset: new C.Cartesian2(0, -14),
    },
  })

  // ---- 飞行航线 ----
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
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- 顶部工具栏 -->
    <div
      class="shrink-0 px-6 py-3 bg-surface border-b border-surface-border flex items-center gap-4"
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
        底图 OpenStreetMap · 标记 / 标签 / 虚线航线
      </span>

      <div class="flex items-center gap-2 ml-auto sm:ml-0">
        <span
          class="w-2 h-2 rounded-full"
          :class="viewerReady ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'"
        />
      </div>
    </div>

    <!-- Cesium 场景 — relative + flex-1 让 absolute inset-0 的 CesiumViewer 正确填充 -->
    <div class="flex-1 w-full relative min-h-0">
      <CesiumViewer
        imagery="osm"
        :initial-position="[116.397, 39.909, 10_000_000]"
        @ready="onViewerReady"
      />
    </div>
  </div>
</template>
