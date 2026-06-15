<script setup lang="ts">
/**
 * PrimitiveCustom — 自定义六边形柱状图
 *
 * 演示 Cesium Primitive API 的核心概念：
 *   1. Geometry        — 定义几何形状（六棱柱 = CylinderGeometry slices:6）
 *   2. GeometryInstance — 复刻多份，每份独立 modelMatrix + color
 *   3. Primitive       — 打包 instances + appearance 提交给渲染管线
 *   4. lil-gui         — 实时参数控制
 *
 * 坐标变换链路（4 步）:
 *   局部 ENU (East-North-Up)
 *     → eastNorthUpToFixedFrame (ENU→ECEF 4×4)
 *       → ECEF 地心地固坐标
 *         → Cesium 渲染管线 (MVP)
 */

import { ref, onUnmounted } from 'vue'
import { GUI } from 'lil-gui'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'

// ════════════════════════════════════════════════════════════════
// 响应式状态
// ════════════════════════════════════════════════════════════════

const viewerReady = ref(false)
const showTutorial = ref(false)

let viewer: Cesium.Viewer | null = null
let gui: GUI | null = null
let primitive: any = null

/**
 * 控件参数
 *
 * 为什么是这个默认值？
 *   count=8  → 64 根柱体，视觉密度适中，性能无压力
 *   height=300 → 侧面足够高，-40° 俯角能看到明显立体感
 *   radius=80 → 六边形不会太细（像针）也不会太粗（挤在一起）
 *   spacing=600 → 柱间留白约 600-2*80=440m，刚好区分个体
 */
const settings = {
  count: 8,
  height: 300,
  radius: 80,
  spacing: 600,
}

// ════════════════════════════════════════════════════════════════
// 几何体工厂
// ════════════════════════════════════════════════════════════════

/**
 * 创建六棱柱 Geometry
 *
 * CylinderGeometry(slices:6) 的妙处:
 *   - slices=6 让圆周被 6 等分 → 正六边形截面
 *   - 自带顶面 + 底面 + 侧面三角形剖分（无需手写）
 *   - 几何体中心在原点，沿 Z 轴站立:
 *       顶面 z=+length/2
 *       底面 z=-length/2
 *
 * 为什么不用 PolygonGeometry + extrudedHeight？
 *   - PolygonGeometry 的 height/extrudedHeight 相对 WGS84 椭球法线
 *   - 配合 ENU modelMatrix 时坐标系容易错位
 *   - CylinderGeometry 就是为此场景设计的
 */
function createHexPrism(C: any, radius: number, height: number) {
  return new C.CylinderGeometry({
    length: height,
    topRadius: radius,
    bottomRadius: radius,
    slices: 6,
  })
}

// ════════════════════════════════════════════════════════════════
// Primitive 构建 & 重建
// ════════════════════════════════════════════════════════════════

/**
 * 构建/重建整个柱状图 Primitive
 *
 * 性能策略:
 *   - 所有柱子共享一份 Geometry（没变的部分不重复创建）
 *   - 每根柱子不同的只是 modelMatrix 和 color
 *   - GeometryInstance 正是为此优化的：几何共享 + 实例差异化
 *   - asynchronous:false 同步提交，避免异步编译的白帧
 */
function buildPrimitive() {
  if (!viewer || viewer.isDestroyed()) return
  const C = window.Cesium

  // —— 清理旧 Primitive ——
  if (primitive) {
    viewer.scene.primitives.remove(primitive)
    primitive = null
  }

  const { count, height, radius, spacing } = settings

  // —— 经纬度→米 换算 ——
  // 地球非正球体，这里用近似公式（误差 < 0.5%，此场景足够）
  const centerLat = 39.909
  const METERS_PER_DEG_LAT = 111320
  const METERS_PER_DEG_LON = 111320 * Math.cos(centerLat * Math.PI / 180)

  const centerLon = 116.397
  const halfExtent = ((count - 1) * spacing) / 2

  const geometry = createHexPrism(C, radius, height)
  const instances: any[] = []

  // —— 网格排布 ——
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      const lon = centerLon + (col * spacing - halfExtent) / METERS_PER_DEG_LON
      const lat = centerLat + (row * spacing - halfExtent) / METERS_PER_DEG_LAT

      // —— 坐标系变换: ENU → ECEF ——
      // eastNorthUpToFixedFrame 构建 4×4 变换矩阵:
      //   列0 = East  (切线方向，指向东)
      //   列1 = North (切线方向，指向北)
      //   列2 = Up    (椭球法线，指向天)
      //   列3 = 原点   (经纬度对应的 ECEF 坐标)
      //
      // height/2 的用途:
      //   CylinderGeometry 中心在原点 → 底面在 z=-height/2
      //   eastNorthUpToFixedFrame 原点抬高 height/2 → ENU 原点升高
      //   → 柱底刚好贴地，不会半埋入椭球
      const modelMatrix = C.Transforms.eastNorthUpToFixedFrame(
        C.Cartesian3.fromDegrees(lon, lat, height / 2),
      )

      // —— 颜色: HSL 色带 ——
      // hue: 240°(蓝) → 0°(红)，按列渐变
      // alpha: 0.55 半透明，透过柱体仍能看到地表和邻近柱体
      const hue = (1 - col / Math.max(count - 1, 1)) * (240 / 360)
      const color = C.Color.fromHsl(hue, 0.7, 0.55, 0.55)

      instances.push(new C.GeometryInstance({
        geometry,
        modelMatrix,
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(color),
        },
      }))
    }
  }

  // —— 组装 Primitive ——
  // PerInstanceColorAppearance:
  //   无需纹理、无需光照贴图，直接从 GeometryInstance.attributes.color 取色
  // translucent: true → 进入半透明渲染通道（先画不透明物体，再画半透明）
  //   Cesium 按 primitive 级别排序，距离远的先画（overdraw order）
  // flat: true → 平面着色（不做 Gouraud 插值），棱角分明适合柱体
  primitive = new C.Primitive({
    geometryInstances: instances,
    appearance: new C.PerInstanceColorAppearance({
      flat: true,
      translucent: true,
    }),
    asynchronous: false,
  })

  viewer.scene.primitives.add(primitive)
}

// ════════════════════════════════════════════════════════════════
// lil-gui 控制面板
// ════════════════════════════════════════════════════════════════

function setupGUI() {
  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (!stage) return

  gui = new GUI({ autoPlace: false, width: 240 })
  gui.domElement.style.position = 'absolute'
  gui.domElement.style.top = '12px'
  gui.domElement.style.right = '12px'
  gui.domElement.style.zIndex = '10'
  stage.appendChild(gui.domElement)

  // add(obj, key, min, max, step) → 自动生成滑块
  // onChange → 任何参数变动都重建整个 Primitive（简单可靠）
  gui.add(settings, 'count', 1, 20, 1).name('数量 N×N').onChange(buildPrimitive)
  gui.add(settings, 'height', 50, 5000).name('高度 (m)').onChange(buildPrimitive)
  gui.add(settings, 'radius', 20, 500).name('半径 (m)').onChange(buildPrimitive)
  gui.add(settings, 'spacing', 100, 5000).name('间距 (m)').onChange(buildPrimitive)
}

// ════════════════════════════════════════════════════════════════
// 生命周期
// ════════════════════════════════════════════════════════════════

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  viewerReady.value = true

  // Globe.depthTestAgainstTerrain —— 开启后 Cesium 会用深度缓冲遮挡
  // 被地形挡住的柱体片段不绘制。当前地形是 Ellipsoid（椭球面），
  // 开启后柱体与地球曲面正确前后遮挡
  v.scene.globe.depthTestAgainstTerrain = true

  buildPrimitive()
  setupGUI()

  // 低空倾斜视角 —— 能看清柱体侧面纹理和空间排列
  const C = window.Cesium as any
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
    <!-- ═══ 顶部工具栏 ═══ -->
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">自定义 Primitive — 六边形柱状图</h2>

      <span class="text-xs text-zinc-500 hidden sm:inline">
        CylinderGeometry(slices:6) · PerInstanceColorAppearance · translucent
      </span>

      <!-- 教程按钮 -->
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true">
        📖 教程
      </button>
    </div>

    <!-- ═══ 场景区域 ═══ -->
    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer :initial-position="[116.397, 39.909, 2_000]" @ready="onViewerReady" />
    </div>

    <!-- ═══ 教程弹窗 ═══ -->
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
