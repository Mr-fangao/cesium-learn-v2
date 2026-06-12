<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutContent } from 'naive-ui'
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

interface NavItem {
  label: string
  icon: any
  children: { label: string; path: string }[]
}

const navItems: NavItem[] = [
  {
    label: 'Cesium',
    icon: Globe,
    children: [
      { label: 'Hello Cesium — 地球初始化', path: '/cesium/hello' },
      { label: '自定义 Primitive 几何体', path: '/cesium/primitive-custom' },
      { label: 'CustomShader — 动态水域', path: '/cesium/shader-water' },
    ],
  },
  {
    label: 'Three.js',
    icon: Box,
    children: [
      { label: 'Hello Three — 场景初始化', path: '/three/hello' },
    ],
  },
  {
    label: 'Babylon.js',
    icon: Pyramid,
    children: [
      { label: 'Hello Babylon — 5 分钟搭建', path: '/babylon/hello' },
    ],
  },
]

const activeKey = computed(() => route.path)

function navigateTo(path: string) {
  router.push(path)
}
</script>

<template>
  <NLayout class="app-layout" has-sider>
    <!-- ====== 侧边栏 ====== -->
    <NLayoutSider
      bordered
      :collapsed="collapsed"
      :width="siderWidth"
      :native-scrollbar="false"
      class="app-sider"
    >
      <div class="flex flex-col h-full bg-surface">
        <!-- Logo -->
        <div
          class="flex items-center gap-3 px-4 h-16 border-b border-surface-border shrink-0"
          :class="collapsed ? 'justify-center' : ''"
        >
          <div
            class="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-white shrink-0"
          >
            <Code2 :size="18" />
          </div>
          <transition name="fade">
            <span v-if="!collapsed" class="font-semibold text-base whitespace-nowrap">
              CesiumLearn v2
            </span>
          </transition>
        </div>

        <!-- 导航 -->
        <div class="flex-1 overflow-y-auto py-3 px-2">
          <div
            class="nav-item mb-2"
            :class="{ active: activeKey === '/' }"
            @click="navigateTo('/')"
          >
            <Home :size="20" />
            <span v-if="!collapsed" class="ml-3 text-sm">展品集首页</span>
          </div>

          <div v-for="group in navItems" :key="group.label" class="mb-1">
            <div
              class="flex items-center px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider"
              :class="collapsed ? 'justify-center' : ''"
            >
              <transition name="fade">
                <span v-if="!collapsed">{{ group.label }}</span>
              </transition>
            </div>
            <div
              v-for="child in group.children"
              :key="child.path"
              class="nav-item"
              :class="{ active: activeKey === child.path }"
              @click="navigateTo(child.path)"
            >
              <component :is="group.icon" :size="18" />
              <span v-if="!collapsed" class="ml-3 text-sm truncate">{{ child.label }}</span>
            </div>
          </div>
        </div>

        <!-- 底部 -->
        <div class="border-t border-surface-border p-2 shrink-0">
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
            class="nav-item"
            :class="collapsed ? 'justify-center' : ''"
            @click="collapsed = !collapsed"
          >
            <component :is="collapsed ? ChevronRight : ChevronLeft" :size="18" />
            <span v-if="!collapsed" class="ml-3 text-sm text-zinc-500">收起侧栏</span>
          </div>
        </div>
      </div>
    </NLayoutSider>

    <!-- ====== 右侧内容区 — 绝对填满 ====== -->
    <NLayoutContent class="app-content">
      <slot />
    </NLayoutContent>
  </NLayout>
</template>

<style scoped>
/* ---- nav-item 交互 ---- */
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
.nav-item.active {
  color: #818cf8;
  background: rgba(99, 102, 241, 0.12);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<!-- 全局非 scoped 样式 — 覆盖 Naive UI 内部元素 -->
<style>
/* Naive UI Layout 全高度 */
.app-layout,
.app-layout .n-layout,
.app-layout .n-layout-scroll-container,
.app-layout .n-layout-content,
.app-content,
.app-content .n-scrollbar,
.app-content .n-scrollbar-container,
.app-content .n-scrollbar-content {
  height: 100% !important;
  max-height: 100% !important;
}

/* Naive UI Sider — flex 列填满 */
.app-sider {
  height: 100% !important;
}

/* 确保侧边栏内容区结构正确 */
.app-sider .n-layout-sider-scroll-container {
  height: 100% !important;
}
</style>
