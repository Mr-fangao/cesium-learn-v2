<script setup lang="ts">
import { darkTheme, zhCN } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import AppLayout from '@/components/layout/AppLayout.vue'

/**
 * Naive UI 主题覆写 — 与全局暗色设计保持一致
 */
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#6366f1',
    primaryColorHover: '#818cf8',
    primaryColorPressed: '#4f46e5',
    primaryColorSuppl: '#6366f1',
    bodyColor: '#18181b',
    cardColor: '#18181b',
    modalColor: '#18181b',
    popoverColor: '#27272a',
    borderColor: '#3f3f46',
    textColorBase: '#f4f4f5',
    textColor1: '#f4f4f5',
    textColor2: '#a1a1aa',
    textColor3: '#71717a',
  },
}
</script>

<template>
  <n-config-provider
    :theme="darkTheme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
  >
    <n-message-provider>
      <n-dialog-provider>
        <AppLayout>
          <router-view v-slot="{ Component, route }">
            <transition
              name="page-fade"
              mode="out-in"
              appear
            >
              <component :is="Component" :key="route.path" />
            </transition>
          </router-view>
        </AppLayout>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
/* 页面切换动画 */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
