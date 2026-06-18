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
    path: '/cesium/primitive-custom',
    name: 'cesium-primitive-custom',
    component: () => import('@/demos/cesium/primitive-custom/PrimitiveCustom.vue'),
  },
  {
    path: '/cesium/shader-water',
    name: 'cesium-shader-water',
    component: () => import('@/demos/cesium/shader-water/ShaderWater.vue'),
  },
  {
    path: '/cesium/volume-cloud',
    name: 'cesium-volume-cloud',
    component: () => import('@/demos/cesium/volume-cloud/VolumeCloud.vue'),
  },
  {
    path: '/cesium/3dtiles',
    name: 'cesium-3dtiles',
    component: () => import('@/demos/cesium/tileset-demo/TilesetDemo.vue'),
  },
  {
    path: '/cesium/drone-fleet',
    name: 'cesium-drone-fleet',
    component: () => import('@/demos/cesium/drone-fleet/DroneFleet.vue'),
  },
  {
    path: '/cesium/post-process',
    name: 'cesium-post-process',
    component: () => import('@/demos/cesium/post-process/PostProcessDemo.vue'),
  },
  {
    path: '/cesium/rocket-launch',
    name: 'cesium-rocket-launch',
    component: () => import('@/demos/cesium/rocket-launch/RocketLaunch.vue'),
  },
  {
    path: '/cesium/terrain-analysis',
    name: 'cesium-terrain-analysis',
    component: () => import('@/demos/cesium/terrain-analysis/TerrainAnalysis.vue'),
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
