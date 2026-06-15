<script setup lang="ts">
/**
 * ShaderWater — Material fabric 动态水域
 *
 * 方案: EllipsoidSurfaceAppearance + 自定义 Material fabric (czm_getMaterial)
 * 波浪: 主浪 8 方向 + 细浪 6 方向，对角线传播，无轴向横竖纹
 * 光学: Fresnel (Schlick) + 波峰增亮
 */

import { ref, onUnmounted } from 'vue'
import { GUI } from 'lil-gui'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'

/* ================================================================
 * 状态
 * ================================================================ */

const viewerReady = ref(false)
const showTutorial = ref(false)

let viewer: Cesium.Viewer | null = null
let gui: GUI | null = null
let primitive: any = null
let material: any = null
let timeUpdater: (() => void) | null = null

const settings = {
  amplitude: 1.0,
  frequency: 12,
  speed: 1.0,
  fresnelPower: 2.5,
  shallowColor: '#40c8e0',
  deepColor: '#0a3d6b',
  alpha: 0.85,
}

/* ================================================================
 * GLSL 着色器
 * ================================================================ */

const SHADER_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);

  vec3 V = normalize(materialInput.positionToEyeEC);
  vec3 N = normalize(materialInput.normalEC);
  vec2 uv = materialInput.st;

  float A = uAmplitude;
  float F = uFrequency;
  float t = uTime * uSpeed;

  // === 两层波浪叠加 ===
  // 主浪 (8 dir): 大振幅大波长，基础起伏
  // 细浪 (6 dir): 小振幅短波长，表面纹理
  float h = 0.0, gx = 0.0, gy = 0.0;

  // —— 主浪层 ——
  for (int i = 0; i < 8; i++) {
    float angle = 6.283185307 * float(i) / 8.0 + 0.28 * float(i);
    vec2 dir = vec2(cos(angle), sin(angle));
    float Fi = F * (0.85 + 0.3 * float(i) / 7.0);       // 频率微变
    float Si = 0.55 + 0.45 * sin(float(i) * 1.7);        // 速度各异
    float w  = 0.35;

    float phase = Fi * dot(uv, dir) + t * Si;
    h  += w * sin(phase);
    gx += w * Fi * dir.x * cos(phase);
    gy += w * Fi * dir.y * cos(phase);
  }

  // —— 细浪层（更小更快，表面高频纹理） ——
  for (int j = 0; j < 6; j++) {
    float angle = 6.283185307 * float(j) / 6.0 + 1.2;
    vec2 dir = vec2(cos(angle), sin(angle));
    float Fi = F * 3.2 * (0.9 + 0.2 * float(j) / 5.0);
    float Si = 1.3 + 0.5 * cos(float(j) * 2.1);
    float w  = 0.08;

    float phase = Fi * dot(uv, dir) + t * Si;
    h  += w * sin(phase);
    gx += w * Fi * dir.x * cos(phase);
    gy += w * Fi * dir.y * cos(phase);
  }

  h  *= A;
  gx *= A;
  gy *= A;

  // === 法线扰动 ===
  float bump = 0.1;
  vec3 waveN = normalize(N + vec3(-gx * bump, -gy * bump, 0.0));

  // === Fresnel (Schlick) ===
  float NdotV = abs(dot(waveN, V));
  float fresnel = pow(1.0 - NdotV, uFresnelPower);

  // === 颜色 ===
  vec3 shallowColor = vec3(uShallowR, uShallowG, uShallowB);
  vec3 deepColor    = vec3(uDeepR, uDeepG, uDeepB);
  vec3 waterColor   = mix(deepColor, shallowColor, fresnel);

  // 波峰微亮（模拟泡沫/高光）
  float crest = smoothstep(0.0, 1.5, h + 0.5);
  waterColor = mix(waterColor, waterColor * 1.25, crest * 0.25);

  material.diffuse = waterColor;
  material.alpha   = uAlpha;

  return material;
}
`

/* ================================================================
 * 构建
 * ================================================================ */

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  }
}

function buildMaterial(C: any) {
  const s = hexToRgb(settings.shallowColor)
  const d = hexToRgb(settings.deepColor)
  return new C.Material({
    fabric: {
      type: 'WaterCustom',
      uniforms: {
        uTime: 0.0,
        uAmplitude: settings.amplitude,
        uFrequency: settings.frequency,
        uSpeed: settings.speed,
        uFresnelPower: settings.fresnelPower,
        uAlpha: settings.alpha,
        uShallowR: s.r, uShallowG: s.g, uShallowB: s.b,
        uDeepR: d.r, uDeepG: d.g, uDeepB: d.b,
      },
      source: SHADER_SOURCE,
    },
  })
}

function buildPrimitive() {
  if (!viewer || viewer.isDestroyed()) return
  const C = window.Cesium

  if (primitive) { viewer.scene.primitives.remove(primitive); primitive = null }
  if (timeUpdater) { viewer.scene.preUpdate.removeEventListener(timeUpdater); timeUpdater = null }

  material = buildMaterial(C)

  const rect = C.Rectangle.fromDegrees(115.5, 39.0, 117.5, 40.5)
  const geometry = new C.RectangleGeometry({
    rectangle: rect,
    vertexFormat: C.VertexFormat.ALL,
    height: 1,
    granularity: 0.05 * (Math.PI / 180),
  })

  const instance = new C.GeometryInstance({ geometry, id: 'water-surface' })

  const appearance = new C.EllipsoidSurfaceAppearance({
    aboveGround: false,
    material,
    translucent: true,
  })

  primitive = new C.Primitive({
    geometryInstances: [instance],
    appearance,
    asynchronous: false,
  })

  viewer.scene.primitives.add(primitive)

  const start = performance.now()
  timeUpdater = () => {
    if (material && !material.isDestroyed?.()) {
      material.uniforms.uTime = (performance.now() - start) / 1000.0
    }
  }
  viewer.scene.preUpdate.addEventListener(timeUpdater)
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

  gui.add(settings, 'amplitude', 0.0, 2.0).name('波幅').onChange(buildPrimitive)
  gui.add(settings, 'frequency', 3, 30).name('频率').onChange(buildPrimitive)
  gui.add(settings, 'speed', 0.1, 3.0).name('速度').onChange(buildPrimitive)
  gui.add(settings, 'fresnelPower', 0.5, 5.0).name('Fresnel 强度').onChange(buildPrimitive)
  gui.add(settings, 'alpha', 0.3, 1.0).name('透明度').onChange(buildPrimitive)
  gui.addColor(settings, 'shallowColor').name('浅水色').onChange(buildPrimitive)
  gui.addColor(settings, 'deepColor').name('深水色').onChange(buildPrimitive)
}

/* ================================================================
 * 生命周期
 * ================================================================ */

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  viewerReady.value = true
  buildPrimitive()
  setupGUI()

  const C = window.Cesium as any
  v.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(116.4, 39.7, 150000),
    orientation: {
      heading: C.Math.toRadians(15),
      pitch: C.Math.toRadians(-55),
      roll: 0,
    },
    duration: 2.0,
  })
}

onUnmounted(() => {
  gui?.destroy(); gui = null
  if (timeUpdater && viewer && !viewer.isDestroyed()) {
    viewer.scene.preUpdate.removeEventListener(timeUpdater); timeUpdater = null
  }
  if (primitive && viewer && !viewer.isDestroyed()) {
    viewer.scene.primitives.remove(primitive); primitive = null
  }
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">CustomShader — 动态水域</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">Material fabric · 8+6 directional waves · Fresnel</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer :initial-position="[116.5, 39.7, 150_000]" @ready="onViewerReady" />
    </div>

    <TutorialModal v-model:visible="showTutorial" title="Material fabric 动态水域 · 完整教程">

      <h3>0. 踩坑总览：为什么不用 CustomShader？</h3>
      <p>这是我开发本 Demo 踩过的<strong>最大的坑</strong>。Cesium 提供两种自定义着色器方案：</p>
      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.8rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">方案</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">机制</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">Cesium 1.111 兼容</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>CustomShader</code></td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">运行时注入到 Appearance shader</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;color:#f87171;">❌ Primitive 不支持</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><strong>Material fabric</strong></td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;">构建时<strong>嵌入</strong>到 Appearance shader</td>
            <td style="padding:6px 10px;border:1px solid #3f3f46;color:#4ade80;">✅ 稳定</td></tr>
        </tbody>
      </table>
      <p><code>CustomShader</code> 最初为 <code>ModelExperimental</code>（3D Tiles 新管线）设计。在 Cesium 1.111 中，
      对传统 <code>Primitive</code> 的注入机制未经充分测试——<code>fragmentMain</code> 无论怎么写都不生效。
      <strong>Material fabric 是 Cesium 1.0 起就存在的稳定 API</strong>，GLSL 直接写入 Appearance 的着色器源码，无注入环节。</p>

      <h3>1. 架构：谁负责什么</h3>
      <pre><code>EllipsoidSurfaceAppearance  →  几何渲染 + 椭球法线 + 深度写入 + 半透明混合
    └── Material fabric       →  片元颜色计算（波浪 + Fresnel + 颜色混合）
        └── preUpdate timer   →  每帧更新 uTime uniform，驱动动画</code></pre>
      <p>Appearance 管"怎么画"，Material 管"画什么颜色"，职责分离。</p>

      <h3>2. 波浪算法：为什么 8+6 方向？</h3>
      <p><strong>初版用 sin(F·x)·cos(F·y)：</strong> X/Y 轴向对齐的波峰形成横竖棋盘格——也就是肉眼看到的"方格网"。波频率越高，网格越密。</p>
      <p><strong>改成对角线方向：</strong></p>
      <pre><code>for (int i = 0; i &lt; 8; i++) {
    vec2 dir = vec2(cos(angle_i), sin(angle_i));  // 8 个不同方向
    h += w * sin(F * dot(uv, dir) + t * speed);   // 每条是 1D 正弦波沿 dir 传播
}</code></pre>
      <p>8 条方向互不平行（45° 间隔 + 微偏）→ 叠加后形成自然曲面波纹，
      没有轴向对齐就没有横竖纹。再加 6 条高频细浪（3.2× 频率，小振幅）模拟水面纹理。</p>
      <p><strong>要复刻到其他项目：</strong> 核心就这两层循环，方向数 → 越多越自然但越耗 GPU，8+6 是平衡点。</p>

      <h3>3. 法线扰动：波浪的光照反馈</h3>
      <pre><code>gx += w * F * dir.x * cos(phase);  // 高度对 x 的偏导
gy += w * F * dir.y * cos(phase);  // 高度对 y 的偏导

vec3 waveN = normalize(N + vec3(-gx * bump, -gy * bump, 0.0));</code></pre>
      <p>梯度 (-gx, -gy) 告诉法线朝波浪下坡方向倾斜。bump=0.1 是经验值——太大像碎玻璃，太小看不出光照变化。</p>
      <p><strong>为什么 bump 要这么小？</strong> 这里的 gx/gy 在 UV 坐标系中（[0,1] 范围），
      1 个 UV 单位 ≈ 180km。gx 的值通常几十到几百，直接加到法线上会让法线剧烈旋转。
      乘 0.1 缩放回合理范围。</p>

      <h3>4. Fresnel：你为什么能看到水底？</h3>
      <pre><code>float fresnel = pow(1.0 - N·V, power);

// N·V → 1 (垂直俯视) → fresnel → 0 → deepColor   // 看穿水底
// N·V → 0 (贴近水面) → fresnel → 1 → shallowColor // 看到反射</code></pre>
      <p>这就是为什么站在湖边——脚下水透明见底，远处湖面反光耀眼。菲涅尔方程描述的就是这个物理现象。
      Schlick 近似 <code>(1-cosθ)^p</code> 是完整版的简化（假设零角反射率 F₀≈0），p 控制衰减速度。</p>

      <h3>5. 波峰增亮：伪高光</h3>
      <pre><code>float crest = smoothstep(0.0, 1.5, h + 0.5);  // 波峰处接近 1
waterColor = mix(waterColor, waterColor * 1.25, crest * 0.25);</code></pre>
      <p>不是物理正确的高光（那需要视线/光源/法线三角计算），但性能友好、视觉有效——波峰亮一点，波谷暗一点，立体感提升明显。</p>

      <h3>6. geometry 参数解释</h3>
      <pre><code>RectangleGeometry({
  rectangle:    Rectangle.fromDegrees(115.5, 39, 117.5, 40.5), // 2°×1.5° ≈ 180×170 km
  vertexFormat: VertexFormat.ALL,  // 需要 position + normal + st
  height:       1,                 // 抬离椭球 1m（防止 z-fighting 闪烁）
  granularity:  0.05°,            // 三角面密度：默认 1° 只有 8 个△ → 0.05° 约 500 个△
})</code></pre>

      <h3>7. 如何移植到你的项目</h3>
      <ol>
        <li>复制 <code>SHADER_SOURCE</code> 中的 GLSL 到你的 Material fabric</li>
        <li>调 <code>uTime</code> 驱动动画（<code>scene.preUpdate</code> 或 <code>requestAnimationFrame</code>）</li>
        <li>调 6 个 FLOAT uniform 传入颜色（拆成 R/G/B，避免 VEC3 兼容问题）</li>
        <li>选 <code>EllipsoidSurfaceAppearance</code> 或 <code>MaterialAppearance</code>（都能用 Material fabric）</li>
        <li>如果出现横竖纹/网格：检查波浪方向是否轴向对齐 → 改用对角方向</li>
      </ol>

    </TutorialModal>
  </div>
</template>
