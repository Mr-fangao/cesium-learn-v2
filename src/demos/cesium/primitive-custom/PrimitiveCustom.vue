<script setup lang="ts">
/**
 * PrimitiveCustom — 自定义六边形柱状图
 *
 * 演示 Cesium Primitive API 的核心概念:
 *   Geometry → GeometryInstance → Primitive → 渲染管线
 */

import { ref, reactive, onUnmounted } from 'vue'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'
import { buildPrimitive, setupGUI } from './primitiveCustom'
import type { PrimitiveSettings } from './primitiveCustom'

const viewerReady = ref(false)
const showTutorial = ref(false)

let viewer: Cesium.Viewer | null = null
let C: any = null
let gui: any = null
let primitive: any = null

const settings = reactive<PrimitiveSettings>({
  count: 8,
  height: 300,
  radius: 80,
  spacing: 600,
})

function rebuild() {
  if (!viewer || !C) return
  if (primitive) { viewer.scene.primitives.remove(primitive); primitive = null }
  primitive = buildPrimitive(viewer, C, settings)
}

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  C = window.Cesium
  viewerReady.value = true

  v.scene.globe.depthTestAgainstTerrain = true
  primitive = buildPrimitive(v, C, settings)

  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (stage) gui = setupGUI(stage, settings, rebuild)

  v.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(116.410, 39.920, 2000),
    orientation: {
      heading: C.Math.toRadians(25),
      pitch: C.Math.toRadians(-40),
      roll: 0,
    },
    duration: 1.5,
  })
}

onUnmounted(() => {
  gui?.destroy()
  gui = null
  if (primitive && viewer && !viewer.isDestroyed()) {
    viewer.scene.primitives.remove(primitive)
    primitive = null
  }
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">自定义 Primitive — 六边形柱状图</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">
        CylinderGeometry(slices:6) · PerInstanceColorAppearance · translucent
      </span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer :initial-position="[116.397, 39.909, 2_000]" @ready="onViewerReady" />
    </div>

    <TutorialModal v-model:visible="showTutorial" title="Primitive API 六边形柱状图 · 代码教程">
      <h3>1. 为什么要学 Primitive？</h3>
      <p>
        Cesium 有两套渲染 API：高级的 <strong>Entity</strong>（点、线、面、模型，开箱即用）
        和底层的 <strong>Primitive</strong>（几何体 + 外观，手动组装）。
        当你需要 <strong>高性能批量渲染</strong> 或 <strong>自定义几何形状</strong> 时，
        Entity 的逐对象管理就太慢了——几百个 Entity 会让帧率掉到个位数。
        Primitive 用 <strong>Geometry Instancing</strong>（几何实例化）让 GPU 一次性
        绘制所有副本，是 Cesium 大批量渲染的正确答案。
      </p>

      <h3>2. 几何体：CylinderGeometry(slices:6)</h3>
      <p>一个圆柱由 <code>slices</code> 个侧面组成。<code>slices:6</code> 把圆周 6 等分 → <strong>正六棱柱</strong>。几何体中心在原点、沿 Z 轴站立：</p>
      <pre><code>new Cesium.CylinderGeometry({
  length: height,       // Z 轴方向高度
  topRadius: radius,    // 顶面外接圆半径
  bottomRadius: radius, // 底面外接圆半径（等粗）
  slices: 6,            // ← 关键：6 = 六边形
})</code></pre>
      <p><strong>为什么不用 PolygonGeometry + extrudedHeight？</strong><br />
        PolygonGeometry 的 <code>height</code> / <code>extrudedHeight</code> 沿 WGS84 椭球法线方向挤压，
        配合 <code>modelMatrix</code>（ENU 局部坐标系）时坐标系容易"打架"——多边形可能躺着贴在地表，
        而非站立。CylinderGeometry 天然就是站立姿态，是正确的选择。</p>

      <h3>3. 坐标变换：eastNorthUpToFixedFrame</h3>
      <p>这是整个 demo 的 <strong>核心变换</strong>。它构建一个 4×4 矩阵，把局部 ENU 坐标映射到 ECEF（地心地固）坐标：</p>
      <pre><code>// 列0 = East  (切线方向，指向东)
// 列1 = North (切线方向，指向北)
// 列2 = Up    (椭球法线，指向天顶)
// 列3 = 原点   (经纬度对应的 ECEF 坐标)

const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(
  Cesium.Cartesian3.fromDegrees(lon, lat, height / 2),
)</code></pre>
      <p><strong>为什么传 height/2？</strong><br />
        CylinderGeometry 的中心在原点，底面在 z = -length/2。
        如果 ENU 原点高度 = 0（贴地），则柱体有一半被埋入椭球。
        原点抬高 height/2 后，底面刚好对齐地表——这是一个常见的"抬升半高"技巧。</p>

      <h3>4. 外观：PerInstanceColorAppearance</h3>
      <p>这个 Appearance 不需要纹理、不需要光照贴图，<strong>直接从每个 GeometryInstance 的 attributes.color 中取色</strong>：</p>
      <pre><code>new Cesium.PerInstanceColorAppearance({
  flat: true,         // 平面着色：每个三角面一种颜色，棱角分明
  translucent: true,  // 半透明通道：先画不透明物体，再按距离排序画半透明
})</code></pre>
      <p><strong>flat vs smooth：</strong>柱体侧面本身是平面，flat 着色反而更真实——每个面颜色一致，
        不会被 Gouraud 插值"抹平"棱角。</p>
      <p><strong>半透明排序：</strong>Cesium 对半透明 primitive 按相机距离排序（远的先画），
        保证前后遮挡的 alpha 混合正确。缺点是 400 根柱体排序有 CPU 开销，
        但实测 400 个 GeometryInstance 合并在一个 Primitive 中，排序只算 1 次。</p>

      <h3>5. 实例化：GeometryInstances</h3>
      <p>所有柱子 <strong>共享同一份 Geometry</strong>（形状相同），只在两个地方不同：</p>
      <ul>
        <li><code>modelMatrix</code> — 决定"放在地球哪里"</li>
        <li><code>attributes.color</code> — 决定"什么颜色"</li>
      </ul>
      <pre><code>const instances = []
for (each grid cell) {
  instances.push(new Cesium.GeometryInstance({
    geometry,  // ← 同一个 geometry！
    modelMatrix: ...,
    attributes: { color: ... },
  }))
}

new Cesium.Primitive({ geometryInstances: instances, ... })</code></pre>
      <p>GPU 只需存储一份顶点数据，通过实例化矩阵和实例颜色在渲染时展开。400 根柱子 ≈ 1 次 draw call。</p>

      <h3>6. 为什么异步关掉？</h3>
      <pre><code>asynchronous: false</code></pre>
      <p>Cesium 默认会把几何体编译放到 Web Worker 中异步执行（不卡主线程）。
        但同步创建有几方面好处：(1) 几何体立即出现，无闪烁；
        (2) 滑块拖动重建时响应即时；(3) 我们的几何体很小，编译 &lt; 1ms，异步反而增加延迟。</p>

      <h3>7. 颜色渐变算法</h3>
      <pre><code>// HSL 颜色空间: hue 从 240°(蓝) 渐变到 0°(红)
const hue = (1 - col / Math.max(count - 1, 1)) * (240 / 360)
const color = Cesium.Color.fromHsl(hue, 0.7, 0.55, 0.55)
//                                        ↑     ↑     ↑
//                                       色相  饱和度 透明度</code></pre>
      <p>选 HSL 而非 RGB 的原因：HSL 沿色相环渐变比 RGB 线性插值更均匀、更鲜艳，
        不会出现 RGB 插值中间的"灰色地带"。</p>

      <h3>8. 性能：400 根柱子能跑吗？</h3>
      <p>
        一根六棱柱 ≈ 6×2（侧面）+ 6（顶面）+ 6（底面）= <strong>24 个三角形</strong>。
        400 根 × 24△ = 9600△。现代 GPU 画 1 万三角形只需 &lt; 1ms。
        真正的瓶颈是半透明的 overdraw（像素被重复绘制），400 根柱体重叠区域可能反复 blend。
        如果你觉得卡，把 count 降到 15 以下即可。
      </p>
    </TutorialModal>
  </div>
</template>
