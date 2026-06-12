import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  // ---- 首页 ----
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/Home.vue'),
  },

  // ---- Cesium 专题 ----
  {
    path: '/cesium/hello',
    name: 'cesium-hello',
    component: () => import('@/demos/cesium/HelloCesium.vue'),
  },
  {
    path: '/cesium/primitive-custom',
    name: 'cesium-primitive-custom',
    component: () => import('@/demos/cesium/PrimitiveCustom.vue'),
  },
  {
    path: '/cesium/shader-water',
    name: 'cesium-shader-water',
    component: () => import('@/demos/cesium/ShaderWater.vue'),
  },

  // ---- Three.js 专题 ----
  {
    path: '/three/hello',
    name: 'three-hello',
    component: () => import('@/demos/three/HelloThree.vue'),
  },

  // ---- Babylon.js 专题 ----
  {
    path: '/babylon/hello',
    name: 'babylon-hello',
    component: () => import('@/demos/babylon/HelloBabylon.vue'),
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
