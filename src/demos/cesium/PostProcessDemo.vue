<script setup lang="ts">
/**
 * PostProcessDemo — 后处理特效实验台
 *
 * 场景: 地球 + 大雁塔 3D Tiles + 几个标注点（极简场景，专注后处理学习）。
 *
 * 后处理效果:
 *   内置 — Bloom, 亮度, 夜视, 剪影（边缘检测+叠加）
 *   自定义 GLSL — 暗角(Vignette), 色调映射, 锐化
 *
 * 面试定位: "Cesium 后处理管线 — PostProcessStage / PostProcessStageLibrary / GLSL 着色器"
 */

import { ref, reactive, onUnmounted } from 'vue'
import { GUI } from 'lil-gui'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'

/* ================================================================
 * 1. 响应式状态
 * ================================================================ */

const showTutorial = ref(false)

const effects = reactive({
  // 内置效果
  bloom: false,
  bloomIntensity: 0.5,
  brightness: false,
  brightnessValue: 1.2,
  nightVision: false,
  silhouette: false,
  silhouetteColor: '#00ffff',

  // 自定义效果
  vignette: false,
  vignetteStrength: 0.6,
  colorGrade: false,
  colorGradeStrength: 0.3,
  sharpen: false,
  sharpenStrength: 0.5,
})

/* ================================================================
 * 2. 非响应式状态
 * ================================================================ */

let viewer: Cesium.Viewer | null = null
let gui: GUI | null = null
let tileset: Cesium.Cesium3DTileset | null = null

/** 自定义后处理 stage 引用（便于移除/重建） */
const customStages: Record<string, any> = {}

/* ================================================================
 * 3. GLSL 着色器源码
 * ================================================================ */

const SHADER_VIGNETTE = /* glsl */ `
uniform sampler2D colorTexture;
uniform float uStrength;
in vec2 v_textureCoordinates;

void main(void) {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  // 计算像素到屏幕中心的距离
  vec2 uv = v_textureCoordinates - 0.5;
  float dist = length(uv);
  // 暗角强度: 边缘越远越暗
  float vignette = 1.0 - dist * 1.4;
  vignette = smoothstep(0.0, 1.0, vignette);
  vignette = mix(1.0, vignette, uStrength);
  out_FragColor = vec4(color.rgb * vignette, 1.0);
}`

const SHADER_COLOR_GRADE = /* glsl */ `
uniform sampler2D colorTexture;
uniform float uStrength;
in vec2 v_textureCoordinates;

void main(void) {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  // 亮度加权（ITU-R BT.709 标准）
  float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  // 暗部偏蓝，亮部偏暖（模拟电影 Teal & Orange 风格）
  vec3 shadows = vec3(0.0, 0.02, 0.06);
  vec3 midtones = vec3(0.95, 0.90, 0.85);
  vec3 highlights = vec3(1.08, 0.95, 0.82);
  vec3 graded = mix(shadows, midtones, smoothstep(0.0, 0.5, lum));
  graded = mix(graded, highlights, smoothstep(0.5, 1.0, lum));
  out_FragColor = vec4(mix(color.rgb, graded, uStrength), 1.0);
}`

const SHADER_SHARPEN = /* glsl */ `
uniform sampler2D colorTexture;
uniform vec2 uPixelSize;
uniform float uStrength;
in vec2 v_textureCoordinates;

void main(void) {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  // 4 邻域采样
  vec4 n = texture(colorTexture, v_textureCoordinates - vec2(0.0, uPixelSize.y));
  vec4 s = texture(colorTexture, v_textureCoordinates + vec2(0.0, uPixelSize.y));
  vec4 e = texture(colorTexture, v_textureCoordinates + vec2(uPixelSize.x, 0.0));
  vec4 w = texture(colorTexture, v_textureCoordinates - vec2(uPixelSize.x, 0.0));
  // 5-tap 锐化卷积核: center * 5 - neighbors * 1
  vec4 sharp = color * 5.0 - (n + s + e + w);
  out_FragColor = vec4(mix(color.rgb, sharp.rgb, uStrength), 1.0);
}`

/* ================================================================
 * 4. Cesium 引用
 * ================================================================ */

function getCesium(): any { return (window as any).Cesium }

/* ================================================================
 * 5. 自定义后处理 — 创建 / 销毁
 * ================================================================ */

const CUSTOM_EFFECTS = [
  { key: 'vignette', shader: SHADER_VIGNETTE, uniforms: { uStrength: effects.vignetteStrength } },
  { key: 'colorGrade', shader: SHADER_COLOR_GRADE, uniforms: { uStrength: effects.colorGradeStrength } },
  { key: 'sharpen', shader: SHADER_SHARPEN, uniforms: { uStrength: effects.sharpenStrength, uPixelSize: {} as any } },
]

function addCustomEffect(key: string) {
  const C = getCesium()
  if (!C || !viewer || customStages[key]) return

  const def = CUSTOM_EFFECTS.find(e => e.key === key)
  if (!def) return

  const uniforms: any = {}
  for (const [k, v] of Object.entries(def.uniforms)) {
    uniforms[k] = key === 'sharpen' && k === 'uPixelSize'
      ? { x: 1.0 / viewer.canvas.clientWidth, y: 1.0 / viewer.canvas.clientHeight }
      : v
  }

  const stage = new C.PostProcessStage({
    fragmentShader: def.shader,
    uniforms,
    name: `pp_${key}`,
  })
  viewer.scene.postProcessStages.add(stage)
  customStages[key] = stage
}

function removeCustomEffect(key: string) {
  if (!viewer || !customStages[key]) return
  viewer.scene.postProcessStages.remove(customStages[key])
  customStages[key] = null
}

/* 更新 uniform（运行时调滑块） */
function updateUniform(key: string, uniformName: string, value: number) {
  const stage = customStages[key]
  if (!stage?.uniforms) return
  if (uniformName === 'uPixelSize') {
    stage.uniforms.uPixelSize = { x: value, y: value }
  } else {
    stage.uniforms[uniformName] = value
  }
}

/* ================================================================
 * 6. 内置效果
 * ================================================================ */

function toggleBloom(v: boolean) {
  if (!viewer) return
  viewer.scene.postProcessStages.bloom.enabled = v
  viewer.scene.postProcessStages.bloom.uniforms.intensity = effects.bloomIntensity
}

function toggleBrightness(v: boolean) {
  const C = getCesium()
  if (!C || !viewer) return
  const key = 'brightness'
  if (v) {
    if (customStages[key]) return
    const stage = C.PostProcessStageLibrary.createBrightnessStage()
    stage.uniforms.brightness = effects.brightnessValue
    viewer.scene.postProcessStages.add(stage)
    customStages[key] = stage
  } else {
    if (!customStages[key]) return
    viewer.scene.postProcessStages.remove(customStages[key])
    customStages[key] = null
  }
}

function toggleNightVision(v: boolean) {
  const C = getCesium()
  if (!C || !viewer) return
  const key = 'nightVision'
  if (v) {
    if (customStages[key]) return
    const stage = C.PostProcessStageLibrary.createNightVisionStage()
    viewer.scene.postProcessStages.add(stage)
    customStages[key] = stage
  } else {
    if (!customStages[key]) return
    viewer.scene.postProcessStages.remove(customStages[key])
    customStages[key] = null
  }
}

function toggleSilhouette(v: boolean) {
  const C = getCesium()
  if (!C || !viewer) return
  const key = 'silhouette'
  if (v) {
    if (customStages[key]) return
    if (!C.PostProcessStageLibrary.isSilhouetteSupported(viewer.scene)) {
      console.warn('[PostProcess] 当前环境不支持剪影（缺少 WEBGL_depth_texture）')
      return
    }
    const stage = C.PostProcessStageLibrary.createSilhouetteStage()
    stage.uniforms.color = C.Color.fromCssColorString(effects.silhouetteColor)
    stage.uniforms.length = 0.25
    viewer.scene.postProcessStages.add(stage)
    customStages[key] = stage
  } else {
    if (!customStages[key]) return
    viewer.scene.postProcessStages.remove(customStages[key])
    customStages[key] = null
  }
}

function resetAll() {
  for (const [k, v] of Object.entries(customStages)) {
    if (v) {
      viewer?.scene.postProcessStages.remove(v)
      customStages[k] = null
    }
  }
  // 关闭 bloom
  if (viewer) {
    viewer.scene.postProcessStages.bloom.enabled = false
  }
  // 重置所有开关
  effects.bloom = false
  effects.brightness = false
  effects.nightVision = false
  effects.silhouette = false
  effects.vignette = false
  effects.colorGrade = false
  effects.sharpen = false
}

/* ================================================================
 * 7. lil-gui
 * ================================================================ */

function setupGUI() {
  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (!stage) return

  gui = new GUI({ autoPlace: false, width: 280 })
  Object.assign(gui.domElement.style, {
    position: 'absolute', top: '12px', right: '12px', zIndex: '10',
  })
  stage.appendChild(gui.domElement)

  // ---- 内置效果 ----
  const builtin = gui.addFolder('内置效果')

  const fBloom = builtin.addFolder('泛光 Bloom')
  fBloom.add(effects, 'bloom').name('启用').onChange(toggleBloom)
  fBloom.add(effects, 'bloomIntensity', 0, 2, 0.05).name('强度')
    .onChange((v: number) => {
      if (viewer) viewer.scene.postProcessStages.bloom.uniforms.intensity = v
    })

  const fBright = builtin.addFolder('亮度 Brightness')
  fBright.add(effects, 'brightness').name('启用').onChange(toggleBrightness)
  fBright.add(effects, 'brightnessValue', 0.1, 3, 0.05).name('倍率')
    .onChange((v: number) => {
      const s = customStages['brightness']
      if (s?.uniforms) s.uniforms.brightness = v
    })

  builtin.add(effects, 'nightVision').name('夜视 NightVision').onChange(toggleNightVision)

  const fSil = builtin.addFolder('剪影 Silhouette')
  fSil.add(effects, 'silhouette').name('启用').onChange(toggleSilhouette)
  fSil.addColor(effects, 'silhouetteColor').name('边缘颜色')

  // ---- 自定义效果 ----
  const custom = gui.addFolder('自定义 GLSL 效果')

  const fVig = custom.addFolder('暗角 Vignette')
  fVig.add(effects, 'vignette').name('启用')
    .onChange((v: boolean) => v ? addCustomEffect('vignette') : removeCustomEffect('vignette'))
  fVig.add(effects, 'vignetteStrength', 0, 1.5, 0.05).name('强度')
    .onChange((v: number) => updateUniform('vignette', 'uStrength', v))

  const fGrade = custom.addFolder('色调映射 ColorGrade')
  fGrade.add(effects, 'colorGrade').name('启用')
    .onChange((v: boolean) => v ? addCustomEffect('colorGrade') : removeCustomEffect('colorGrade'))
  fGrade.add(effects, 'colorGradeStrength', 0, 1, 0.05).name('强度')
    .onChange((v: number) => updateUniform('colorGrade', 'uStrength', v))

  const fSharp = custom.addFolder('锐化 Sharpen')
  fSharp.add(effects, 'sharpen').name('启用')
    .onChange((v: boolean) => v ? addCustomEffect('sharpen') : removeCustomEffect('sharpen'))
  fSharp.add(effects, 'sharpenStrength', 0, 1, 0.05).name('强度')
    .onChange((v: number) => updateUniform('sharpen', 'uStrength', v))

  // ---- 操作 ----
  gui.add({ resetAll }, 'resetAll').name('✕ 重置全部效果')
}

/* ================================================================
 * 8. 场景 & 生命周期
 * ================================================================ */

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  const C = getCesium()
  if (!C) return

  // 加载大雁塔 3D Tiles（如果数据存在）
  const tilesetUrl = '/data/3dtiles/dayanta/tileset.json'
  fetch(tilesetUrl, { method: 'HEAD' })
    .then(r => {
      if (r.ok) {
        return C.Cesium3DTileset.fromUrl(tilesetUrl)
      }
      return null
    })
    .then(ts => {
      if (ts) {
        tileset = ts
        viewer!.scene.primitives.add(ts)
        viewer!.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(108.96, 34.22, 800),
          orientation: { heading: C.Math.toRadians(0), pitch: C.Math.toRadians(-35), roll: 0 },
          duration: 2.0,
        })
      } else {
        // 无模型时飞到上海
        viewer!.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(121.50, 31.23, 15000),
          orientation: { heading: C.Math.toRadians(0), pitch: C.Math.toRadians(-55), roll: 0 },
          duration: 2.0,
        })
      }
    })

  // 添加几个彩色标注点（提供几何体供边缘检测/剪影观察）
  const POIS = [
    { lon: 108.959, lat: 34.218, alt: 720, label: '大雁塔', color: C.Color.CYAN },
    { lon: 108.963, lat: 34.215, alt: 710, label: '南广场', color: C.Color.LIME },
    { lon: 108.955, lat: 34.221, alt: 715, label: '北广场', color: C.Color.YELLOW },
  ]
  for (const poi of POIS) {
    viewer.entities.add({
      position: C.Cartesian3.fromDegrees(poi.lon, poi.lat, poi.alt),
      point: { pixelSize: 10, color: poi.color },
      label: { text: poi.label, font: '12px monospace', fillColor: C.Color.WHITE,
        verticalOrigin: C.VerticalOrigin.BOTTOM, pixelOffset: new C.Cartesian2(0, -12) },
    })
  }

  // 抗锯齿
  if (viewer.scene.msaaLevel !== undefined) viewer.scene.msaaLevel = 4
  if (viewer.scene.fxaa !== undefined) viewer.scene.fxaa = true

  setupGUI()
}

onUnmounted(() => {
  gui?.destroy(); gui = null
  // 清理自定义 stages
  for (const [k, v] of Object.entries(customStages)) {
    if (v) { viewer?.scene.postProcessStages.remove(v); customStages[k] = null }
  }
  if (tileset && viewer && !viewer.isDestroyed()) {
    viewer.scene.primitives.remove(tileset)
  }
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">后处理特效实验台</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">PostProcessStage · Bloom · Silhouette · Custom GLSL</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto"
        @click="showTutorial = true"
      >📖 教程</button>
    </div>

    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer
        :initial-position="[108.96, 34.22, 5_000]"
        :scene-mode="'3d'"
        @ready="onViewerReady"
      />
    </div>

    <TutorialModal v-model:visible="showTutorial" title="后处理特效 · 技术详解">

      <h3>一、Cesium 后处理管线架构</h3>
      <pre><code>┌────────────────────────────────────────────────────────┐
│ Scene.render()                                         │
│   → 渲染 3D 场景到 colorTexture + depthTexture          │
│   → PostProcessStageCollection（按添加顺序执行）        │
│       ├─ Bloom / AO（最先，Scene 内置）                 │
│       ├─ 用户自定义 PostProcessStage / Composite         │
│       └─ FXAA（最后，抗锯齿）                            │
│   → 输出到屏幕                                          │
└────────────────────────────────────────────────────────┘</code></pre>
      <p>每个 PostProcessStage 本质是一个 <strong>全屏四边形</strong> 的片段着色器，输入是上一阶段的颜色和深度纹理，输出写入帧缓冲。</p>

      <h3>二、PostProcessStage 核心 API</h3>
      <pre><code>// 构造
const stage = new Cesium.PostProcessStage({
  fragmentShader: `... GLSL ...`,    // 必需: 片段着色器
  uniforms: { uStrength: 0.5 },      // 可选: 自定义 uniform
  name: 'my_effect',                 // 可选: 用于其他 stage 引用
})
// 添加到管线
viewer.scene.postProcessStages.add(stage)
// 运行时修改参数
stage.uniforms.uStrength = 0.8
// 启用/禁用
stage.enabled = false
// 移除（自动 destroy）
viewer.scene.postProcessStages.remove(stage)</code></pre>

      <h3>三、片段着色器规范</h3>
      <p>Cesium 自动注入以下变量，不需要手动声明：</p>
      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.78rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">变量</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">类型</th>
          <th style="padding:6px 10px;border:1px solid #3f3f46;">说明</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>colorTexture</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">sampler2D</td><td style="padding:6px 10px;border:1px solid #3f3f46;">场景颜色纹理（自动注入）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>depthTexture</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">sampler2D</td><td style="padding:6px 10px;border:1px solid #3f3f46;">深度纹理（自动注入，可选使用）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>v_textureCoordinates</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">vec2</td><td style="padding:6px 10px;border:1px solid #3f3f46;">纹理坐标 [0,1]（自动注入）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>czm_viewport</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">vec4</td><td style="padding:6px 10px;border:1px solid #3f3f46;">视口尺寸 (x, y, w, h)（内置 uniform）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>out_FragColor</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">vec4</td><td style="padding:6px 10px;border:1px solid #3f3f46;">输出颜色（必须写入）</td></tr>
        </tbody>
      </table>

      <h3>四、内置效果 PostProcessStageLibrary</h3>
      <p>Cesium 提供工厂函数，一行代码创建常见效果：</p>
      <pre><code>// 泛光 — Scene 内置，直接开
viewer.scene.postProcessStages.bloom.enabled = true
viewer.scene.postProcessStages.bloom.uniforms.intensity = 0.5

// 边缘检测
const edgeStage = Cesium.PostProcessStageLibrary.createEdgeDetectionStage()
edgeStage.uniforms.color = Cesium.Color.CYAN
edgeStage.uniforms.length = 0.25  // 检测阈值

// 剪影 = 边缘检测 + 颜色叠加
const silStage = Cesium.PostProcessStageLibrary.createSilhouetteStage()

// 亮度/夜视
Cesium.PostProcessStageLibrary.createBrightnessStage()      // brightness: 1.0=正常
Cesium.PostProcessStageLibrary.createNightVisionStage()     // 绿色夜视</code></pre>

      <h3>五、自定义 GLSL — 暗角推导</h3>
      <pre><code>// 目标: 屏幕四角变暗，突出中心
// 思路: 像素离中心越远 → 乘一个越小的系数

vec2 uv = v_textureCoordinates - 0.5;   // 原点移到中心 [-0.5, 0.5]
float dist = length(uv);                 // 到中心的欧氏距离 [0, ~0.707]
float vignette = 1.0 - dist * 1.4;      // 线性衰减 → 角落约 0
vignette = smoothstep(0.0, 1.0, vignette); // 平滑钳位 [0, 1]
float result = mix(1.0, vignette, strength); // 强度可调
out_FragColor = vec4(color.rgb * result, 1.0);</code></pre>

      <h3>六、自定义 GLSL — 色调映射推导</h3>
      <pre><code>// 目标: 暗部偏蓝、亮部偏暖（电影 Teal & Orange 风格）
// 思路: 按亮度分三段插值

float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)); // BT.709 亮度
vec3 shadows = vec3(0.0, 0.02, 0.06);     // 暗部 → 深蓝
vec3 highlights = vec3(1.08, 0.95, 0.82);  // 亮部 → 暖橙
// 三段混合: shadows (0~0.5) → midtones (过渡) → highlights (0.5~1.0)
vec3 graded = mix(shadows, highlights, smoothstep(0.2, 0.8, lum));
out_FragColor = vec4(mix(color.rgb, graded, strength), 1.0);</code></pre>

      <h3>七、自定义 GLSL — 锐化推导</h3>
      <pre><code>// 目标: 增强边缘，使细节更清晰
// 思路: 5-tap 卷积 — 当前像素权重 5，邻居权重 -1

vec4 n = texture(colorTexture, uv - vec2(0, p));   // 上
vec4 s = texture(colorTexture, uv + vec2(0, p));   // 下
vec4 e = texture(colorTexture, uv + vec2(p, 0));   // 右
vec4 w = texture(colorTexture, uv - vec2(p, 0));   // 左
// 如果在平坦区域: color ≈ neighbors → 结果 ≈ color
// 如果在边缘:    color ≠ neighbors → 差异被放大
vec4 sharp = color * 5.0 - (n + s + e + w);
out_FragColor = vec4(mix(color.rgb, sharp.rgb, strength), 1.0);</code></pre>

      <h3>八、面试话术</h3>
      <p><strong>Q: "Cesium 后处理怎么做？"</strong></p>
      <p>A: "用 <code>PostProcessStage</code> 写 GLSL 片段着色器，通过 <code>viewer.scene.postProcessStages.add()</code> 注入渲染管线。Cesium 自动提供 <code>colorTexture</code>、<code>depthTexture</code>、<code>v_textureCoordinates</code>，只写片段着色器就够了。常见效果 Cesium 有内置的 <code>PostProcessStageLibrary</code> 工厂函数，一行代码开 Bloom/EdgeDetection/NightVision。自定义效果就是把 GLSL 字符串和 uniforms 传进去，和写 ShaderToy 差不多。"</p>

      <p><strong>Q: "内置效果和自定义效果怎么选？"</strong></p>
      <p>A: "Bloom、亮度、夜视这种通用效果直接用内置的，省去重复造轮子。边缘检测内置的够用，但如果有特殊需求（比如只检测特定深度范围、不同颜色输出），就参考内置的 GLSL 自己写。自定义的核心优势是可以加 uniform 做参数化控制，比如暗角强度、色调强度，让用户在 GUI 里实时调节。"</p>

    </TutorialModal>
  </div>
</template>
