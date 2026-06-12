<script setup lang="ts">
/**
 * CustomShader — 动态水域
 *
 * 基于 CesiumViewer 组件，后续会实现：
 * 1. Cesium CustomShader API
 * 2. 片元着色器：水面波纹 + 菲涅尔反射
 * 3. 时间驱动的动画 (czm_frameNumber)
 * 4. 法线扰动与 Fresnel 公式推导
 */
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'

function onViewerReady(v: Cesium.Viewer) {
  console.log('[ShaderWater] viewer ready, waiting for implementation')
}
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">CustomShader — 动态水域</h2>
      <span class="text-xs text-zinc-500">🚧 施工中 — 基于 CesiumViewer 组件</span>
    </div>
    <div class="demo-stage flex-1 w-full min-h-0">
      <CesiumViewer imagery="osm" @ready="onViewerReady" />
    </div>
  </div>
</template>
