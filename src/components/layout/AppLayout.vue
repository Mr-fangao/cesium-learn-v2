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

/** 统一的 header 高度 — 侧栏 Logo 和所有 Demo 页顶栏对齐 */
const HEADER_H = 'h-12'

interface NavGroup {
  label: string
  icon: any
  children: { label: string; path: string }[]
}

const navGroups: NavGroup[] = [
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
  <NLayout id="app-layout" has-sider>
    <!-- ========== 侧边栏 ========== -->
    <NLayoutSider
      id="app-sider"
      bordered
      :collapsed="collapsed"
      :width="siderWidth"
      :native-scrollbar="false"
      class="bg-surface border-r border-surface-border"
    >
      <div class="sider-inner flex flex-col h-full">
        <!-- Logo -->
        <div
          class="sider-logo flex items-center gap-3 px-4 border-b border-surface-border shrink-0"
          :class="[HEADER_H, collapsed ? 'justify-center' : '']"
        >
          <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shrink-0">
            <Code2 :size="16" />
          </div>
          <transition name="fade">
            <span v-if="!collapsed" class="font-semibold text-sm whitespace-nowrap">
              CesiumLearn v2
            </span>
          </transition>
        </div>

        <!-- 导航列表 -->
        <div class="sider-nav flex-1 overflow-y-auto py-3 px-2">
          <!-- 首页 -->
          <div
            class="nav-item mb-1"
            :class="{ 'nav-item--active': activeKey === '/' }"
            @click="navigateTo('/')"
          >
            <Home :size="20" />
            <span v-if="!collapsed" class="ml-3 text-sm">展品集首页</span>
          </div>

          <!-- 分组 -->
          <template v-for="group in navGroups" :key="group.label">
            <div
              class="nav-section-title flex items-center px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider"
              :class="collapsed ? 'justify-center' : ''"
            >
              <span v-if="!collapsed">{{ group.label }}</span>
            </div>

            <div
              v-for="child in group.children"
              :key="child.path"
              class="nav-item"
              :class="{ 'nav-item--active': activeKey === child.path }"
              @click="navigateTo(child.path)"
            >
              <component :is="group.icon" :size="18" />
              <span v-if="!collapsed" class="ml-3 text-sm truncate">{{ child.label }}</span>
            </div>
          </template>
        </div>

        <!-- 底部操作 -->
        <div class="sider-footer border-t border-surface-border p-2 shrink-0">
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

    <!-- ========== 右侧内容区 ========== -->
    <NLayoutContent id="app-content" class="bg-zinc-950">
      <slot />
    </NLayoutContent>
  </NLayout>
</template>

<style scoped>
/* ---- nav-item — 菜单项通用样式 ---- */
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

.nav-section-title {
  letter-spacing: 0.05em;
}

/* ---- transition ---- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---- 侧栏内部 flex 结构辅助 ---- */
.sider-inner {
  min-height: 0;
}
</style>
