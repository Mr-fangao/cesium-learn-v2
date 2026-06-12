import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/Home.vue'),
    meta: { title: '展品集 — 首页' },
  },
  // ==================== Cesium 专题 ====================
  {
    path: '/cesium',
    name: 'cesium-demos',
    component: () => import('@/views/DemoIndex.vue'),
    meta: { title: 'Cesium Demos', category: 'cesium' },
    children: [
      {
        path: 'hello',
        name: 'cesium-hello',
        component: () => import('@/demos/cesium/HelloCesium.vue'),
        meta: { title: 'Hello Cesium — 地球初始化' },
      },
      {
        path: 'primitive-custom',
        name: 'cesium-primitive-custom',
        component: () => import('@/demos/cesium/PrimitiveCustom.vue'),
        meta: { title: '自定义 Primitive 几何体' },
      },
      {
        path: 'shader-water',
        name: 'cesium-shader-water',
        component: () => import('@/demos/cesium/ShaderWater.vue'),
        meta: { title: 'CustomShader — 动态水域' },
      },
    ],
  },
  // ==================== Three.js 专题 ====================
  {
    path: '/three',
    name: 'three-demos',
    component: () => import('@/views/DemoIndex.vue'),
    meta: { title: 'Three.js Demos', category: 'three' },
    children: [
      {
        path: 'hello',
        name: 'three-hello',
        component: () => import('@/demos/three/HelloThree.vue'),
        meta: { title: 'Hello Three.js — 场景初始化' },
      },
    ],
  },
  // ==================== Babylon.js 专题 ====================
  {
    path: '/babylon',
    name: 'babylon-demos',
    component: () => import('@/views/DemoIndex.vue'),
    meta: { title: 'Babylon.js Demos', category: 'babylon' },
    children: [
      {
        path: 'hello',
        name: 'babylon-hello',
        component: () => import('@/demos/babylon/HelloBabylon.vue'),
        meta: { title: 'Hello Babylon — 5 分钟搭建' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
