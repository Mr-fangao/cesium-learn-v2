<script setup lang="ts">
/**
 * Hello Cesium — 地球初始化
 *
 * 学习要点：
 * 1. Cesium Viewer 的创建与销毁生命周期
 * 2. window.Cesium 全局加载方式（IIFE）
 * 3. 相机控制：Cartesian3.fromDegrees + flyTo
 * 4. Cesium Ion 默认底图服务
 * 5. ResizeObserver 自动适配容器尺寸
 */

import { ref } from 'vue'
import { useCesium } from '@/composables/useCesium'

const containerRef = ref<HTMLDivElement | null>(null)
const { viewer, isReady, error } = useCesium(containerRef)
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- 顶部说明栏 -->
    <div
      class="shrink-0 px-6 py-3 bg-surface border-b border-surface-border flex items-center gap-4"
    >
      <h2 class="font-semibold text-sm">Hello Cesium — 地球初始化</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">
        默认底图 Cesium Ion · 相机飞向北京上空 10,000km
      </span>
      <div class="ml-auto flex items-center gap-2">
        <span
          class="w-2 h-2 rounded-full"
          :class="error ? 'bg-red-500' : isReady ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'"
        />
        <span class="text-xs text-zinc-400">
          {{ error ? 'Error' : isReady ? 'Ready' : 'Loading...' }}
        </span>
      </div>
    </div>

    <!-- Cesium 画布 — 必须用 w-full + min-h-0 在 flex 列中正确填充 -->
    <div
      ref="containerRef"
      class="flex-1 w-full min-h-0 relative"
    >
      <!-- 错误提示 -->
      <div
        v-if="error"
        class="absolute inset-0 flex items-center justify-center bg-surface z-10"
      >
        <div class="text-center">
          <p class="text-red-400 font-medium mb-2">Cesium 初始化失败</p>
          <p class="text-sm text-zinc-500 font-mono">{{ error }}</p>
        </div>
      </div>

      <!-- 加载中的遮罩 -->
      <div
        v-else-if="!isReady"
        class="absolute inset-0 flex items-center justify-center bg-surface z-10"
      >
        <div class="flex flex-col items-center gap-3">
          <div
            class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"
          />
          <span class="text-sm text-zinc-500">Loading Cesium Viewer...</span>
        </div>
      </div>
    </div>
  </div>
</template>
