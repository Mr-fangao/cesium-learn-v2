<script setup lang="ts">
/**
 * Hello Cesium — 地球初始化
 *
 * 学习要点：
 * 1. Cesium Viewer 的基本创建与销毁
 * 2. 相机控制（flyTo / setView）
 * 3. Entity API 快速添加标记点
 * 4. Cesium 的默认地形和底图服务（Ion）
 */

import { ref } from 'vue'
import { useCesium } from '@/composables/useCesium'

const containerRef = ref<HTMLDivElement | null>(null)
const { viewer, isReady, error } = useCesium(containerRef)
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 顶部说明栏 -->
    <div class="shrink-0 px-6 py-3 bg-surface border-b border-surface-border flex items-center gap-4">
      <h2 class="font-semibold">Hello Cesium — 地球初始化</h2>
      <span class="text-xs text-zinc-500">
        相机已自动飞向北京 · 使用 useCesium Composable 管理生命周期
      </span>
      <div class="ml-auto flex items-center gap-2">
        <span
          class="w-2 h-2 rounded-full"
          :class="isReady ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'"
        />
        <span class="text-xs text-zinc-400">
          {{ isReady ? 'Viewer Ready' : 'Initializing...' }}
        </span>
      </div>
    </div>

    <!-- Cesium 画布 -->
    <div ref="containerRef" class="flex-1 relative">
      <!-- 加载遮罩 -->
      <div
        v-if="!isReady"
        class="absolute inset-0 flex items-center justify-center bg-surface z-10"
      >
        <div class="flex flex-col items-center gap-3">
          <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span class="text-sm text-zinc-500">Loading Cesium Viewer...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Cesium 的 Viewer 会填充容器，确保容器有明确尺寸 */
</style>
