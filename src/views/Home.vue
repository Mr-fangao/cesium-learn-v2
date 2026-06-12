<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Globe,
  Box,
  Pyramid,
  ArrowRight,
  Sparkles,
  Layers,
  Zap,
  Clock,
  Code2,
  Cpu,
  Monitor,
  Terminal,
  Server,
} from '@lucide/vue'

const router = useRouter()

/** 页面加载完成标志，用于触发入场动画 */
const mounted = ref(false)
onMounted(() => {
  // 延迟一帧触发动画，确保 CSS transition 生效
  requestAnimationFrame(() => {
    mounted.value = true
  })
})

/** 技术栈卡片 */
const techCards = [
  {
    title: 'CesiumJS',
    subtitle: '3D 地球引擎',
    icon: Globe,
    gradient: 'from-indigo-500 via-purple-500 to-violet-500',
    borderGlow: 'shadow-indigo-500/20',
    percentage: 60,
    description:
      'Quadtree LOD 地形渲染 · 3D Tiles 城市级加载 · CustomShader 后处理 · 时序 CZML 可视化 · GPU 实例化海量数据',
    demos: ['地球初始化', '自定义 Primitive', 'Shader 水域', '3D Tiles 专题'],
    route: '/cesium/hello',
    priority: '核心',
    priorityStyle: 'border-indigo-400/30 text-indigo-300 bg-indigo-500/10',
  },
  {
    title: 'Three.js',
    subtitle: '通用 3D 渲染库',
    icon: Box,
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
    borderGlow: 'shadow-emerald-500/20',
    percentage: 30,
    description:
      'PBR 材质 · ShaderMaterial 自定义着色 · 后处理 EffectComposer · InstancedMesh 十万级渲染 · 骨骼动画',
    demos: ['场景初始化', 'PBR 材质专题', '后处理管线', 'InstancedMesh'],
    route: '/three/hello',
    priority: '次重点',
    priorityStyle: 'border-emerald-400/30 text-emerald-300 bg-emerald-500/10',
  },
  {
    title: 'Babylon.js',
    subtitle: '3D 游戏引擎',
    icon: Pyramid,
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
    borderGlow: 'shadow-orange-500/20',
    percentage: 10,
    description:
      '引擎式开箱即用 · Node Material 可视化 · 内置物理引擎 Havok · GUI 系统 · 一键后处理管线',
    demos: ['5 分钟搭建', 'Node Material', '物理模拟', '后处理'],
    route: '/babylon/hello',
    priority: '了解',
    priorityStyle: 'border-zinc-500/30 text-zinc-400 bg-zinc-500/10',
  },
]

/** 项目技术栈标签 */
const stackTags = [
  { label: 'Vue 3.5', icon: Code2 },
  { label: 'Vite 8', icon: Zap },
  { label: 'TypeScript 6', icon: Terminal },
  { label: 'Pinia 3', icon: Server },
  { label: 'Naive UI', icon: Monitor },
  { label: 'Tailwind v4', icon: Cpu },
]

function goTo(route: string) {
  router.push(route)
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <!-- ============================================================
         Hero 区域 — 渐变背景 + 动态光效
         ============================================================ -->
    <div class="relative overflow-hidden border-b border-surface-border">
      <!-- 背景网格光效 -->
      <div
        class="absolute inset-0 opacity-20"
        style="
          background-image:
            linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        "
      />
      <!-- 顶部渐变光晕 -->
      <div
        class="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-accent/10 blur-[120px] pointer-events-none"
      />
      <!-- 第二个光晕 -->
      <div
        class="absolute -bottom-20 right-0 w-[400px] h-[300px] rounded-full bg-purple-500/8 blur-[100px] pointer-events-none"
      />

      <div class="relative max-w-5xl mx-auto px-8 py-20">
        <!-- 标签 -->
        <div
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent-light text-xs font-medium mb-6"
          :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
          style="transition: all 0.5s ease 0.1s"
        >
          <Sparkles :size="13" class="text-accent-light" />
          前端 · 3D 可视化 · 面试作品集
        </div>

        <!-- 主标题 -->
        <h1
          class="text-6xl font-extrabold tracking-tight mb-4"
          :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'"
          style="transition: all 0.6s ease 0.2s"
        >
          <span class="text-white">3D 前端技术</span>
          <br class="sm:hidden" />
          <span
            class="bg-gradient-to-r from-accent-light via-purple-400 to-pink-400 bg-clip-text text-transparent"
          >
            学习展品集
          </span>
        </h1>

        <!-- 副标题 -->
        <p
          class="text-lg text-zinc-400 max-w-xl leading-relaxed mb-2"
          :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'"
          style="transition: all 0.6s ease 0.35s"
        >
          以场景 Demo 驱动的 Cesium / Three.js / Babylon.js 学习路线
        </p>
        <p
          class="text-sm text-zinc-500 max-w-xl mb-8"
          :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'"
          style="transition: all 0.6s ease 0.45s"
        >
          每个 Demo 附带 <span class="text-zinc-400">详细 Shader 计算推导注释</span>，
          从 API 使用到 GPU 管线原理。
        </p>

        <!-- CTA 按钮 -->
        <div
          class="flex gap-4"
          :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
          style="transition: all 0.5s ease 0.55s"
        >
          <button
            class="group relative px-6 py-3 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold transition-all duration-200 flex items-center gap-2 overflow-hidden"
            @click="goTo('/cesium/hello')"
          >
            <!-- 按钮光效 -->
            <div
              class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"
            />
            <span class="relative z-10 flex items-center gap-2">
              开始学习
              <ArrowRight :size="17" class="group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
          <a
            href="https://github.com/Mr-fangao/cesium-learn-v2"
            target="_blank"
            class="px-6 py-3 rounded-xl border border-surface-border hover:border-accent/40 text-zinc-300 hover:text-white transition-all duration-200 font-medium"
          >
            GitHub 源码
          </a>
        </div>
      </div>
    </div>

    <!-- ============================================================
         技术栈标签栏
         ============================================================ -->
    <div class="border-b border-surface-border bg-surface/30">
      <div class="max-w-5xl mx-auto px-8 py-4 flex items-center gap-3 flex-wrap">
        <span class="text-xs text-zinc-500 font-medium uppercase tracking-wider mr-1">
          技术栈
        </span>
        <span
          v-for="tag in stackTags"
          :key="tag.label"
          class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-400 border border-surface-border"
        >
          <component :is="tag.icon" :size="12" />
          {{ tag.label }}
        </span>
      </div>
    </div>

    <!-- ============================================================
         核心内容 — 技术卡片 + 学习路线
         ============================================================ -->
    <div class="max-w-5xl mx-auto px-8 py-14">
      <!-- 标题 -->
      <div
        class="flex items-center gap-3 mb-10"
        :class="mounted ? 'opacity-100' : 'opacity-0'"
        style="transition: opacity 0.6s ease 0.6s"
      >
        <Layers :size="22" class="text-accent-light" />
        <h2 class="text-xl font-bold">学习路线概览</h2>
        <span class="text-sm text-zinc-500">
          Cesium 60% · Three.js 30% · Babylon 10%
        </span>
      </div>

      <!-- 三栏卡片 -->
      <div
        class="grid gap-5"
        style="grid-template-columns: 6fr 3fr 1fr"
      >
        <div
          v-for="(card, i) in techCards"
          :key="card.title"
          class="group relative rounded-2xl border border-surface-border bg-surface/80 backdrop-blur-sm hover:scale-[1.02] hover:border-accent/30 transition-all duration-400 overflow-hidden cursor-pointer"
          :class="[
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10',
            `hover:${card.borderGlow}`,
          ]"
          :style="`transition: all 0.4s ease, opacity 0.6s ease ${0.7 + i * 0.12}s, transform 0.6s ease ${0.7 + i * 0.12}s`"
          @click="goTo(card.route)"
        >
          <!-- 顶部渐变条 -->
          <div :class="['h-1 w-full bg-gradient-to-r', card.gradient]" />

          <!-- 卡片内容 -->
          <div class="p-5">
            <!-- 标题行 -->
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <div
                  :class="[
                    'w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg',
                    card.gradient,
                  ]"
                >
                  <component :is="card.icon" :size="22" />
                </div>
                <div>
                  <h3 class="font-bold text-base">{{ card.title }}</h3>
                  <p class="text-xs text-zinc-500">{{ card.subtitle }}</p>
                </div>
              </div>
              <span
                :class="[
                  'text-xs px-2.5 py-0.5 rounded-full border font-medium',
                  card.priorityStyle,
                ]"
              >
                {{ card.priority }}
              </span>
            </div>

            <!-- 学习占比进度条 -->
            <div class="mb-3">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-zinc-500">学习占比</span>
                <span class="text-xs font-semibold text-zinc-300">
                  {{ card.percentage }}%
                </span>
              </div>
              <div class="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  :class="['h-full rounded-full bg-gradient-to-r transition-all duration-1000', card.gradient]"
                  :style="`width: ${mounted ? card.percentage : 0}%`"
                />
              </div>
            </div>

            <!-- 描述 -->
            <p class="text-sm text-zinc-400 leading-relaxed mb-4">
              {{ card.description }}
            </p>

            <!-- Demo 列表 -->
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="demo in card.demos"
                :key="demo"
                class="text-xs px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-500 group-hover:text-zinc-300 group-hover:bg-zinc-700/80 transition-colors"
              >
                {{ demo }}
              </span>
            </div>
          </div>

          <!-- 悬停边框光效 -->
          <div
            class="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5 pointer-events-none group-hover:ring-accent/20 transition-all duration-400"
          />
        </div>
      </div>
    </div>

    <!-- ============================================================
         时间轴 / 学习阶段
         ============================================================ -->
    <div class="border-t border-surface-border">
      <div class="max-w-5xl mx-auto px-8 py-14">
        <div
          class="flex items-center gap-3 mb-10"
          :class="mounted ? 'opacity-100' : 'opacity-0'"
          style="transition: opacity 0.6s ease 1.0s"
        >
          <Clock :size="22" class="text-accent-light" />
          <h2 class="text-xl font-bold">学习阶段</h2>
          <span class="text-sm text-zinc-500">约 9 周完成</span>
        </div>

        <!-- 时间轴 -->
        <div class="relative">
          <!-- 竖线 -->
          <div class="absolute left-[19px] top-2 bottom-2 w-px bg-surface-border" />

          <div class="space-y-8">
            <div
              v-for="(phase, i) in [
                { week: 'W1-2', title: 'Cesium 核心渲染', desc: '渲染管线、Primitive API、CustomShader 入门' },
                { week: 'W3', title: 'Cesium 进阶', desc: '3D Tiles 专题、裁剪剖切、相机交互' },
                { week: 'W4-5', title: 'Cesium 高级', desc: 'CZML 时序、地形影像、拾取、性能优化' },
                { week: 'W6-7', title: 'Three.js 专题', desc: '核心架构、Shader 专题、后处理、InstancedMesh' },
                { week: 'W8', title: 'Three.js + Babylon', desc: 'Three 进阶 + Babylon 快速上手' },
                { week: 'W9+', title: '面试冲刺', desc: '查漏补缺、原理深挖、模拟面试' },
              ]"
              :key="phase.week"
              class="flex items-start gap-5 ml-1"
              :class="mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'"
              :style="`transition: all 0.5s ease ${1.1 + i * 0.08}s`"
            >
              <!-- 时间轴节点 -->
              <div
                class="relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                :class="i <= 3 ? 'bg-accent/20 text-accent-light border border-accent/30' : 'bg-zinc-800 text-zinc-500 border border-surface-border'"
              >
                <span class="text-xs font-bold">{{ i + 1 }}</span>
              </div>
              <!-- 内容 -->
              <div class="pt-1">
                <div class="flex items-center gap-2 mb-0.5">
                  <span class="text-xs font-mono text-accent-light bg-accent/10 px-2 py-0.5 rounded">
                    {{ phase.week }}
                  </span>
                  <h4 class="font-semibold text-sm">{{ phase.title }}</h4>
                </div>
                <p class="text-sm text-zinc-500">{{ phase.desc }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================
         底部
         ============================================================ -->
    <div class="border-t border-surface-border">
      <div class="max-w-5xl mx-auto px-8 py-8 flex items-center justify-between text-sm text-zinc-600">
        <span>CesiumLearn v2 — Made with Vue 3 + Vite + Naive UI + Tailwind CSS</span>
        <span>2026 · Mr-fangao</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 响应式 */
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr !important;
  }
  h1 {
    font-size: 2.5rem !important;
  }
}
</style>
