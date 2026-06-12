<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Globe, Box, Pyramid, ArrowRight, Sparkles, Layers } from '@lucide/vue'

const router = useRouter()

/** 技术栈卡片 */
const techCards = [
  {
    title: 'CesiumJS',
    subtitle: '3D 地球引擎',
    icon: Globe,
    gradient: 'from-indigo-500 to-purple-600',
    description:
      'Quadtree LOD 地形渲染 · 3D Tiles 城市级加载 · CustomShader 后处理 · 时序 CZML 可视化 · GPU 实例化海量数据',
    demos: ['地球初始化', '自定义 Primitive', 'Shader 水域', '3D Tiles 专题'],
    route: '/cesium/hello',
    priority: '核心',
  },
  {
    title: 'Three.js',
    subtitle: '通用 3D 渲染库',
    icon: Box,
    gradient: 'from-emerald-500 to-teal-600',
    description:
      'PBR 材质 · ShaderMaterial 自定义着色 · 后处理 EffectComposer · InstancedMesh 十万级渲染 · 骨骼动画',
    demos: ['场景初始化', 'PBR 材质专题', '后处理管线', 'InstancedMesh'],
    route: '/three/hello',
    priority: '次重点',
  },
  {
    title: 'Babylon.js',
    subtitle: '3D 游戏引擎',
    icon: Pyramid,
    gradient: 'from-orange-500 to-red-600',
    description:
      '引擎式开箱即用 · Node Material 可视化 · 内置物理引擎 Havok · GUI 系统 · 一键后处理管线',
    demos: ['5 分钟搭建', 'Node Material', '物理模拟', '后处理'],
    route: '/babylon/hello',
    priority: '了解',
  },
]

function goTo(route: string) {
  router.push(route)
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <!-- 头部 Hero -->
    <div class="relative overflow-hidden border-b border-surface-border">
      <!-- 背景装饰 -->
      <div class="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent pointer-events-none" />
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      <div class="relative max-w-5xl mx-auto px-8 py-16">
        <div class="flex items-center gap-3 mb-4">
          <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent-light text-xs font-medium">
            <Sparkles :size="14" />
            面试作品集
          </div>
        </div>
        <h1 class="text-5xl font-bold tracking-tight mb-4">
          <span class="bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent">
            3D 前端技术
          </span>
          <span class="bg-gradient-to-r from-accent-light to-purple-400 bg-clip-text text-transparent">
            学习展品集
          </span>
        </h1>
        <p class="text-lg text-zinc-400 max-w-2xl">
          以场景 Demo 驱动的 Cesium / Three.js / Babylon.js 学习路线。
          每个 Demo 附带详细 Shader 计算推导注释，从 API 使用到 GPU 管线原理。
        </p>

        <div class="flex gap-4 mt-8">
          <button
            class="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-light text-white font-medium transition-colors flex items-center gap-2"
            @click="goTo('/cesium/hello')"
          >
            开始学习
            <ArrowRight :size="16" />
          </button>
          <a
            href="https://github.com/Mr-fangao/cesium-learn-v2"
            target="_blank"
            class="px-5 py-2.5 rounded-lg border border-surface-border hover:border-accent/50 text-zinc-300 transition-colors font-medium"
          >
            GitHub →
          </a>
        </div>
      </div>
    </div>

    <!-- 技术栈卡片区 -->
    <div class="max-w-5xl mx-auto px-8 py-12">
      <div class="flex items-center gap-2 mb-8">
        <Layers :size="20" class="text-accent-light" />
        <h2 class="text-xl font-semibold">学习路线概览</h2>
        <span class="text-sm text-zinc-500 ml-2">
          Cesium 60% · Three.js 30% · Babylon 10%
        </span>
      </div>

      <div class="grid gap-6" style="grid-template-columns: 6fr 3fr 1fr">
        <!-- 动态列宽：Cesium 最宽，Babylon 最窄 -->
        <div
          v-for="card in techCards"
          :key="card.title"
          class="group relative rounded-xl border border-surface-border bg-surface hover:border-accent/30 transition-all duration-300 overflow-hidden cursor-pointer"
          @click="goTo(card.route)"
        >
          <!-- 顶部渐变条 -->
          <div :class="['h-1.5 w-full bg-gradient-to-r', card.gradient]" />

          <div class="p-6">
            <!-- 标题行 -->
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-3">
                <div
                  :class="[
                    'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white',
                    card.gradient,
                  ]"
                >
                  <component :is="card.icon" :size="20" />
                </div>
                <div>
                  <h3 class="font-semibold text-lg">{{ card.title }}</h3>
                  <p class="text-xs text-zinc-500">{{ card.subtitle }}</p>
                </div>
              </div>
              <span
                class="text-xs px-2 py-0.5 rounded-full border"
                :class="
                  card.priority === '核心'
                    ? 'border-accent/30 text-accent-light bg-accent/10'
                    : card.priority === '次重点'
                      ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                      : 'border-zinc-700 text-zinc-400 bg-zinc-800'
                "
              >
                {{ card.priority }}
              </span>
            </div>

            <!-- 描述 -->
            <p class="text-sm text-zinc-400 leading-relaxed mt-3">
              {{ card.description }}
            </p>

            <!-- Demo 列表 -->
            <div class="flex flex-wrap gap-2 mt-4">
              <span
                v-for="demo in card.demos"
                :key="demo"
                class="text-xs px-2 py-1 rounded-md bg-zinc-800 text-zinc-400 group-hover:text-zinc-300 transition-colors"
              >
                {{ demo }}
              </span>
            </div>
          </div>

          <!-- 悬停光效 -->
          <div
            class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            :class="[
              'bg-gradient-to-br from-transparent via-transparent to-transparent',
              card.priority === '核心' ? 'group-hover:from-accent/3' : '',
            ]"
          />
        </div>
      </div>
    </div>

    <!-- 底部 -->
    <div class="border-t border-surface-border py-8 text-center text-sm text-zinc-600">
      CesiumLearn v2 — Built with Vue 3 + Vite + Naive UI + Tailwind CSS
    </div>
  </div>
</template>

<style scoped>
/* 响应式：小屏时卡片垂直排列 */
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr !important;
  }
}
</style>
