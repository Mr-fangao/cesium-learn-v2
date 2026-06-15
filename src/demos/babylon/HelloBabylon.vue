<script setup lang="ts">
/**
 * Hello Babylon.js — 入门 Demo
 *
 * 演示 Babylon.js 核心概念:
 *   1. Engine  — WebGL 引擎，管理渲染循环和上下文
 *   2. Scene   — 场景容器，容纳所有 3D 对象
 *   3. Camera  — 摄像机（ArcRotateCamera = 轨道相机）
 *   4. Light   — 光源（HemisphericLight 环境光 + PointLight 点光）
 *   5. Mesh    — 网格体 = 几何形状 + 材质
 *   6. Material — 材质（StandardMaterial 标准材质）
 *   7. Transform — position/rotation/scaling（Vector3）
 *
 * 坐标系: 左手系，Y 轴向上（X=右, Y=上, Z=屏幕外）
 *   与 Three.js 相同，与 Cesium ENU（Z=上）不同
 */

import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { GUI } from 'lil-gui'
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  PointLight,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  type Mesh,
} from '@babylonjs/core'
import TutorialModal from '@/components/common/TutorialModal.vue'

/* ================================================================
 * 响应式状态
 * ================================================================ */

const showTutorial = ref(false)
const canvas = ref<HTMLCanvasElement | null>(null)

let engine: Engine | null = null
let scene: Scene | null = null
let gui: GUI | null = null

// 场景中的动态对象
let centralSphere: Mesh | null = null
let orbiters: Mesh[] = []
let rotatingBox: Mesh | null = null

// lil-gui 参数
const settings = {
  mainColor: '#e67e22',
  orbitCount: 6,
  orbitRadius: 8,
  orbitSpeed: 0.8,
  boxRotateSpeed: 1.0,
}

/* ================================================================
 * 场景构建
 * ================================================================ */

/**
 * 初始化整个 Babylon 场景
 *
 * 调用顺序很重要:
 *   1. Engine( canvas ) — 获取 WebGL 上下文
 *   2. new Scene( engine ) — 创建空场景
 *   3. 添加 Camera / Light / Mesh — 填充场景
 *   4. engine.runRenderLoop — 启动渲染
 */
function initScene() {
  const cvs = canvas.value
  if (!cvs) return

  // —— Engine: WebGL 上下文管理器 ——
  // antialias: true — 启用 MSAA 抗锯齿
  // preserveDrawingBuffer: false — 不保留帧缓冲（性能更好）
  engine = new Engine(cvs, true, { preserveDrawingBuffer: false })

  // —— Scene: 容纳所有内容的容器 ——
  // clearColor 设置背景色（深灰蓝）
  scene = new Scene(engine)
  scene.clearColor = new Color4(0.08, 0.08, 0.15, 1.0)

  // —— Camera: 轨道相机 ——
  // ArcRotateCamera(name, alpha, beta, radius, target, scene)
  //   alpha = 水平旋转角（弧度）, 0 = 从 -Z 方向看
  //   beta  = 垂直角（弧度）, 0 = 俯视, PI/2 = 水平
  //   radius = 距目标点距离
  //   target = 注视点
  const camera = new ArcRotateCamera(
    'camera',
    Math.PI / 4,   // 45° 水平
    Math.PI / 3,   // 60° 垂直（略俯视）
    25,            // 距离
    Vector3.Zero(),
    scene,
  )
  // 允许鼠标/触摸控制
  camera.attachControl(cvs, true)
  // 限制缩放范围
  camera.lowerRadiusLimit = 5
  camera.upperRadiusLimit = 60

  // —— Lights: 光源 ——

  // HemisphericLight: 半球光 = 天空色 + 地面色
  //   模拟户外环境光: 上半球（天空方向）偏白，下半球（地面方向）偏暗
  const hemiLight = new HemisphericLight(
    'hemi',
    new Vector3(0, 1, 0),  // 方向: 正上方
    scene,
  )
  hemiLight.diffuse = new Color3(0.7, 0.7, 0.8)   // 天空光 = 淡蓝白
  hemiLight.groundColor = new Color3(0.2, 0.2, 0.25) // 地面光 = 深灰
  hemiLight.intensity = 0.8

  // PointLight: 点光源 = 灯泡效果，从中心球向外辐射
  const pointLight = new PointLight(
    'point',
    new Vector3(0, 4, 0),  // 位置: 中心球上方
    scene,
  )
  pointLight.diffuse = new Color3(1.0, 0.95, 0.8)  // 暖黄色
  pointLight.intensity = 0.6
  pointLight.range = 30  // 照射半径

  // —— Ground: 地面 ——
  // CreateGround(name, width, depth, subdivisions, scene)
  //   Babylon 中 "depth" = Z 轴方向（屏幕外），"width" = X 轴方向
  const ground = MeshBuilder.CreateGround('ground', {
    width: 30,
    height: 30,  // Babylon 用 height 表示 Z 方向
    subdivisions: 1,
  }, scene)
  const groundMat = new StandardMaterial('groundMat', scene)
  groundMat.diffuseColor = new Color3(0.15, 0.2, 0.15) // 深绿灰色
  groundMat.specularColor = new Color3(0, 0, 0)         // 无高光
  ground.material = groundMat
  ground.receiveShadows = true

  // —— Central Sphere: 中心球体 ——
  buildCentralSphere()

  // —— Orbiting Spheres: 环绕小球 ——
  buildOrbiters()

  // —— Rotating Box: 旋转立方体 ——
  buildRotatingBox()

  // —— 渲染循环 ——
  // runRenderLoop 会每帧自动调用 scene.render()
  engine.runRenderLoop(() => {
    if (!scene) return

    // 更新环绕球位置
    const time = performance.now() / 1000
    for (let i = 0; i < orbiters.length; i++) {
      const angle = time * settings.orbitSpeed + (Math.PI * 2 * i) / orbiters.length
      orbiters[i].position.x = Math.cos(angle) * settings.orbitRadius
      orbiters[i].position.z = Math.sin(angle) * settings.orbitRadius
      orbiters[i].position.y = Math.sin(angle * 3) * 1.5 // 上下浮动
    }

    // 更新旋转立方体
    if (rotatingBox) {
      rotatingBox.rotation.x += 0.01 * settings.boxRotateSpeed
      rotatingBox.rotation.y += 0.015 * settings.boxRotateSpeed
    }

    scene.render()
  })
}

/* ================================================================
 * 场景对象工厂
 * ================================================================ */

/** 中心大球 — 金属质感 */
function buildCentralSphere() {
  if (!scene) return
  const s = MeshBuilder.CreateSphere('central', { diameter: 4, segments: 32 }, scene)
  s.position = new Vector3(0, 2, 0) // 放在地面上方

  const mat = new StandardMaterial('centralMat', scene)
  mat.diffuseColor = Color3.FromHexString(settings.mainColor)
  mat.specularColor = new Color3(0.5, 0.5, 0.5)  // 金属高光
  mat.specularPower = 64                          // 高光集中度（越高越亮）
  mat.emissiveColor = new Color3(0.05, 0.03, 0.0)  // 微弱的自发光
  s.material = mat

  centralSphere = s
}

/** 环绕小球 — 半透明彩色 */
function buildOrbiters() {
  if (!scene) return
  // 清理旧球
  orbiters.forEach(o => o.dispose())
  orbiters = []

  for (let i = 0; i < settings.orbitCount; i++) {
    const o = MeshBuilder.CreateSphere('orbiter' + i, { diameter: 1, segments: 16 }, scene)
    const mat = new StandardMaterial('orbiterMat' + i, scene)
    // 每个球颜色微调，形成色带
    const hue = i / settings.orbitCount
    mat.diffuseColor = Color3.FromHexString(settings.mainColor)
      .scale(0.6 + 0.4 * hue)  // 明暗变化
    mat.specularColor = new Color3(0.3, 0.3, 0.3)
    mat.alpha = 0.7  // 半透明
    o.material = mat
    orbiters.push(o)
  }
}

/** 旋转立方体 — 展示 rotation 变换 */
function buildRotatingBox() {
  if (!scene) return
  if (rotatingBox) { rotatingBox.dispose(); rotatingBox = null }

  const b = MeshBuilder.CreateBox('box', { size: 2.5 }, scene)
  b.position = new Vector3(6, 3, 6)
  const mat = new StandardMaterial('boxMat', scene)
  mat.diffuseColor = new Color3(0.2, 0.4, 0.8) // 蓝色
  mat.specularColor = new Color3(0.4, 0.4, 0.4)
  b.material = mat

  rotatingBox = b
}

/** 重建动态对象（GUI 回调） */
function rebuildObjects() {
  if (!scene) return
  if (centralSphere) { centralSphere.dispose(); centralSphere = null }
  if (rotatingBox) { rotatingBox.dispose(); rotatingBox = null }
  buildCentralSphere()
  buildRotatingBox()
  buildOrbiters()
}

/* ================================================================
 * lil-gui
 * ================================================================ */

function setupGUI() {
  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (!stage) return

  gui = new GUI({ autoPlace: false, width: 260 })
  gui.domElement.style.position = 'absolute'
  gui.domElement.style.top = '12px'
  gui.domElement.style.right = '12px'
  gui.domElement.style.zIndex = '10'
  stage.appendChild(gui.domElement)

  gui.addColor(settings, 'mainColor').name('主色').onChange(rebuildObjects)
  gui.add(settings, 'orbitCount', 1, 12, 1).name('环绕球数').onChange(buildOrbiters)
  gui.add(settings, 'orbitRadius', 3, 15).name('轨道半径').onChange(() => {})
  gui.add(settings, 'orbitSpeed', 0.1, 3).name('轨道速度').onChange(() => {})
  gui.add(settings, 'boxRotateSpeed', 0.1, 3).name('方块转速').onChange(() => {})
}

/* ================================================================
 * 生命周期
 * ================================================================ */

onMounted(async () => {
  await nextTick()
  initScene()
  setupGUI()
})

onUnmounted(() => {
  gui?.destroy(); gui = null
  engine?.stopRenderLoop()
  engine?.dispose()
  engine = null
  scene = null
})

// 窗口大小自适应
function onResize() { engine?.resize() }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <!-- ═══ Header ═══ -->
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">Hello Babylon.js — 入门 Demo</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">Engine · Scene · ArcRotateCamera · StandardMaterial</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <!-- ═══ 场景区域 ═══ -->
    <div class="demo-stage flex-1 w-full relative min-h-0 bg-zinc-950">
      <canvas ref="canvas" class="w-full h-full block" />
    </div>

    <!-- ═══ 教程弹窗 ═══ -->
    <TutorialModal v-model:visible="showTutorial" title="Babylon.js 入门教程 · 从零开始的 3D 渲染引擎">

      <h3>0. Babylon.js 是什么？</h3>
      <p><strong>Babylon.js</strong> 是微软开源的 WebGL / WebGPU 3D 渲染引擎。
      如果说 Three.js 是"给你零件自己组装"，Babylon.js 就是"给你一辆调好的车直接开"——
      它内置了完整的物理引擎、粒子系统、后期特效、GUI 调试工具、glTF 加载器、动画系统。</p>
      <p>微软团队全职维护，文档极好，API 设计一致性强。适合<strong>快速搭建复杂 3D 应用</strong>（产品展示、游戏、可视化大屏）。</p>

      <h3>1. 三大引擎定位对比</h3>
      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.8rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;"></th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">Cesium</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">Three.js</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">Babylon.js</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">领域</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">GIS / 地球</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">通用 3D</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">通用 3D（偏游戏）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">坐标系</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">ECEF + ENU</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">右手 Y-up</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>左手 Y-up</strong></td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">哲学</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">最小化配置</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">极简核心 + 插件</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>电池全含</strong></td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">学习曲线</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">陡峭</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">中等</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">中等偏易</td></tr>
        </tbody>
      </table>

      <h3>2. 核心概念</h3>
      <p>Babylon.js 的架构是一个清晰的层次：</p>
      <pre><code>Engine          — WebGL 上下文管理器（一台电脑只有一个 Engine）
  └── Scene      — 场景容器（可以有多个 Scene）
      ├── Camera  — 视角（ArcRotateCamera / FreeCamera / ...）
      ├── Light   — 光源（Hemispheric / Point / Directional / Spot）
      └── Mesh    — 网格体
          ├── Geometry  — 形状（Sphere / Box / Ground / ...）
          └── Material  — 材质（StandardMaterial / PBRMaterial / ...）</code></pre>

      <h3>3. 坐标系</h3>
      <p>Babylon.js 使用<strong>左手坐标系</strong>（Left-Handed），Y 轴向上：</p>
      <pre><code>X → 右
Y → 上（与 Cesium ENU 的 Z 不同！）
Z → 远离屏幕（与 Three.js 相同）</code></pre>
      <p>当你从 Cesium 迁移过来时，注意 <strong>Cesium 的 Z=上，Babylon 的 Y=上</strong>。</p>

      <h3>4. 核心 API 快速参考</h3>
      <pre><code>// —— Engine ——
const engine = new Engine(canvas, antialias)

// —— Scene ——
const scene = new Scene(engine)
scene.clearColor = new Color4(r, g, b, a)

// —— Camera ——
const cam = new ArcRotateCamera("name", alpha, beta, radius, target, scene)
cam.attachControl(canvas, true)  // 开启鼠标/触摸交互

// —— Light ——
new HemisphericLight("name", direction, scene)  // 环境光
new PointLight("name", position, scene)         // 点光源

// —— Mesh ——
const sphere = MeshBuilder.CreateSphere("name", { diameter, segments }, scene)
sphere.position = new Vector3(x, y, z)  // 注意: y 向上
sphere.material = material

// —— Material ——
const mat = new StandardMaterial("name", scene)
mat.diffuseColor = new Color3(r, g, b)   // 基础色
mat.specularColor = new Color3(r, g, b)  // 高光色
mat.alpha = 0.7                          // 透明度

// —— 渲染循环 ——
engine.runRenderLoop(() => {
  // 更新逻辑...
  scene.render()
})

// —— 清理 ——
engine.stopRenderLoop()
engine.dispose()</code></pre>

      <h3>5. 本 Demo 场景结构</h3>
      <ul>
        <li><strong>Ground</strong> — 30×30 平面，深绿色，作为参考地面</li>
        <li><strong>Central Sphere</strong> — 直径 4，金属质感材质（高 specularPower），颜色由 GUI 控制</li>
        <li><strong>Orbiting Spheres</strong> — N 个直径 1 的小球，半透明（alpha 0.7），绕中心球公转 + 上下浮动</li>
        <li><strong>Rotating Box</strong> — 边长 2.5，蓝色，持续自转展示 rotation 变换</li>
        <li><strong>HemisphericLight</strong> — 天空/地面双色环境光，模拟自然光</li>
        <li><strong>PointLight</strong> — 中心球上方的暖色点光，制造高光和阴影层次</li>
      </ul>

      <h3>6. 关键 API 命名差异（Three.js → Babylon.js）</h3>
      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.8rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">概念</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">Three.js</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">Babylon.js</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">渲染器</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>WebGLRenderer</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Engine</code></td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">网格体</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Mesh</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Mesh</code></td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">轨道相机</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>OrbitControls</code>（插件）</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>ArcRotateCamera</code>（内置）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">颜色</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Color</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Color3</code> (RGB) / <code>Color4</code> (RGBA)</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">矢量</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Vector3</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>Vector3</code></td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">材质</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>MeshStandardMaterial</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>PBRMaterial</code> / <code>StandardMaterial</code></td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;">工厂方法</td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>new SphereGeometry()</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>MeshBuilder.CreateSphere()</code></td></tr>
        </tbody>
      </table>

      <h3>7. 下一步学习路径</h3>
      <ol>
        <li><strong>PBR 材质</strong> — <code>PBRMaterial</code> 替代 StandardMaterial，金属度/粗糙度工作流</li>
        <li><strong>glTF 加载</strong> — <code>SceneLoader.ImportMeshAsync()</code> 加载外部 3D 模型</li>
        <li><strong>粒子系统</strong> — <code>ParticleSystem</code> 火焰、烟雾、雨雪</li>
        <li><strong>GUI</strong> — <code>GUI.AdvancedDynamicTexture</code> 3D 空间中的 UI</li>
        <li><strong>物理引擎</strong> — Havok / Cannon.js 集成，碰撞检测</li>
        <li><strong>后期特效</strong> — <code>DefaultRenderingPipeline</code> 泛光、景深、色调映射</li>
      </ol>

    </TutorialModal>
  </div>
</template>
