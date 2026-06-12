<script setup lang="ts">
/**
 * 自定义 Primitive 几何体
 *
 * 基于 CesiumViewer 组件，后续会实现：
 * 1. Geometry + GeometryAttribute 手动构造几何
 * 2. Primitive vs GroundPrimitive 的区别
 * 3. Appearance 和 Material 的关系
 */
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'

function onViewerReady(v: Cesium.Viewer) {
  console.log('[PrimitiveCustom] viewer ready, waiting for implementation')
}
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">自定义 Primitive 几何体</h2>
      <span class="text-xs text-zinc-500">🚧 施工中 — 基于 CesiumViewer 组件</span>
    </div>
    <div class="demo-stage flex-1 w-full min-h-0">
      <CesiumViewer imagery="osm" @ready="onViewerReady" />
    </div>
  </div>
</template>
