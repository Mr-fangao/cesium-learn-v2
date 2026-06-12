<script setup lang="ts">
/**
 * Demo 页面的父路由出口
 * 子路由（如 /cesium/hello）通过 router-view 渲染
 */
</script>

<template>
  <div class="h-full">
    <router-view v-slot="{ Component, route }">
      <transition name="demo-fade" mode="out-in" appear>
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>
  </div>
</template>

<style scoped>
.demo-fade-enter-active,
.demo-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.demo-fade-enter-from {
  opacity: 0;
  transform: translateX(16px);
}
.demo-fade-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
</style>
