<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Home,
  Globe,
  Box,
  Pyramid,
  Code2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const collapsed = ref(false)
const siderWidth = computed(() => (collapsed.value ? 64 : 240))

const navGroups = [
  {
    label: 'Cesium',
    icon: Globe,
    children: [
      { label: 'Hello Cesium', path: '/cesium/hello' },
      { label: '自定义 Primitive', path: '/cesium/primitive-custom' },
      { label: 'Shader 水域', path: '/cesium/shader-water' },
    ],
  },
  {
    label: 'Three.js',
    icon: Box,
    children: [{ label: 'Hello Three', path: '/three/hello' }],
  },
  {
    label: 'Babylon.js',
    icon: Pyramid,
    children: [{ label: 'Hello Babylon', path: '/babylon/hello' }],
  },
]

const activeKey = computed(() => route.path)

function go(p: string) {
  router.push(p)
}
</script>

<template>
  <!--
    app-shell: 全屏 flex 行
    左侧 sidebar（固定宽度）+ 右侧 main（flex-1 填满剩余）
    不使用任何 Naive UI 布局组件，纯 CSS flex
  -->
  <div class="app-shell flex h-full w-full bg-zinc-950">

    <!-- ====== 左侧菜单栏 ====== -->
    <aside
      class="app-sider flex flex-col shrink-0 border-r border-surface-border bg-surface transition-all duration-200"
      :style="{ width: siderWidth + 'px' }"
    >
      <!-- Logo -->
      <div
        class="shrink-0 h-12 flex items-center gap-2 px-3 border-b border-surface-border"
        :class="collapsed ? 'justify-center' : ''"
      >
        <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shrink-0">
          <Code2 :size="15" />
        </div>
        <span v-if="!collapsed" class="font-semibold text-sm whitespace-nowrap">CesiumLearn v2</span>
      </div>

      <!-- 菜单列表: flex-1 + overflow-y-auto 占满剩余高度 -->
      <nav class="flex-1 overflow-y-auto py-2 px-2">
        <!-- 首页 -->
        <div
          class="nav-item mb-0.5"
          :class="{ 'nav-item--active': activeKey === '/' }"
          @click="go('/')"
        >
          <Home :size="20" />
          <span v-if="!collapsed" class="ml-3 text-sm">展品集首页</span>
        </div>

        <!-- 分组 -->
        <template v-for="group in navGroups" :key="group.label">
          <div
            class="flex items-center px-3 pt-3 pb-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider"
            :class="collapsed ? 'justify-center' : ''"
          >
            <span v-if="!collapsed">{{ group.label }}</span>
          </div>
          <div
            v-for="child in group.children"
            :key="child.path"
            class="nav-item"
            :class="{ 'nav-item--active': activeKey === child.path }"
            @click="go(child.path)"
          >
            <component :is="group.icon" :size="18" />
            <span v-if="!collapsed" class="ml-3 text-sm truncate">{{ child.label }}</span>
          </div>
        </template>
      </nav>

      <!-- 底部操作 -->
      <div class="shrink-0 border-t border-surface-border p-2">
        <a
          href="https://github.com/Mr-fangao/cesium-learn-v2"
          target="_blank"
          class="nav-item"
          :class="collapsed ? 'justify-center' : ''"
        >
          <ExternalLink :size="18" />
          <span v-if="!collapsed" class="ml-3 text-sm">GitHub</span>
        </a>
        <div
          class="nav-item mt-0.5"
          :class="collapsed ? 'justify-center' : ''"
          @click="collapsed = !collapsed"
        >
          <component :is="collapsed ? ChevronRight : ChevronLeft" :size="18" />
          <span v-if="!collapsed" class="ml-3 text-sm text-zinc-500">收起侧栏</span>
        </div>
      </div>
    </aside>

    <!-- ====== 右侧内容区 ====== -->
    <main class="app-main flex-1 min-w-0 overflow-hidden">
      <router-view v-slot="{ Component, route: r }">
        <!--
          mode="out-in": 旧页面先完全离开，再挂载新页面。
          新页面进入时不设 opacity 过渡（只淡出旧页面），
          确保 Cesium WebGL 容器挂载时就是 opacity:1。
        -->
        <transition name="page-fade" mode="out-in">
          <component :is="Component" :key="r.path" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
/* ---- 菜单项 ---- */
.nav-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: #a1a1aa;
  transition: all 0.15s ease;
  user-select: none;
}
.nav-item:hover {
  color: #f4f4f5;
  background: #27272a;
}
.nav-item--active {
  color: #818cf8;
  background: rgba(99, 102, 241, 0.12);
}

/* ---- 页面切换动画 ----
   只淡出旧页面，新页面进入时直接显示。
   原因：Cesium 在 opacity:0 的元素上创建 WebGL 上下文会失败。 ---- */
.page-fade-leave-active {
  transition: opacity 0.15s ease;
}
.page-fade-leave-to {
  opacity: 0;
}
</style>
