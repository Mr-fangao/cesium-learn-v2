<script setup lang="ts">
import { darkTheme, zhCN } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import AppLayout from '@/components/layout/AppLayout.vue'

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
        <!-- AppLayout 内部已包含 router-view -->
        <AppLayout />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
