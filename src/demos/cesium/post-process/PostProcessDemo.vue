<script setup lang="ts">
/**
 * PostProcessDemo — 后处理特效实验台
 */

import { ref, reactive, onUnmounted } from 'vue'
import CesiumViewer from '@/components/cesium/CesiumViewer.vue'
import TutorialModal from '@/components/common/TutorialModal.vue'
import { setupGUI, resetAll } from './postProcessDemo'

const showTutorial = ref(false)

const effects = reactive({
  bloom: false, bloomIntensity: 0.5,
  brightness: false, brightnessValue: 1.2,
  nightVision: false,
  silhouette: false, silhouetteColor: '#00ffff',
  vignette: false, vignetteStrength: 0.6,
  colorGrade: false, colorGradeStrength: 0.3,
  sharpen: false, sharpenStrength: 0.5,
})

let viewer: Cesium.Viewer | null = null
let C: any = null
let gui: any = null
let tileset: any = null
const customStages: Record<string, any> = {}

function onViewerReady(v: Cesium.Viewer) {
  viewer = v
  C = (window as any).Cesium
  if (!C) return

  // 尝试加载大雁塔 3D Tiles
  const tilesetUrl = '/data/3dtiles/dayanta/tileset.json'
  fetch(tilesetUrl, { method: 'HEAD' })
    .then(r => r.ok ? C.Cesium3DTileset.fromUrl(tilesetUrl) : null)
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
        viewer!.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(121.50, 31.23, 15000),
          orientation: { heading: C.Math.toRadians(0), pitch: C.Math.toRadians(-55), roll: 0 },
          duration: 2.0,
        })
      }
    })

  // POI 标注
  const POIS = [
    { lon: 108.959, lat: 34.218, alt: 720, label: '大雁塔', color: C.Color.CYAN },
    { lon: 108.963, lat: 34.215, alt: 710, label: '南广场', color: C.Color.LIME },
    { lon: 108.955, lat: 34.221, alt: 715, label: '北广场', color: C.Color.YELLOW },
  ]
  for (const poi of POIS) {
    v.entities.add({
      position: C.Cartesian3.fromDegrees(poi.lon, poi.lat, poi.alt),
      point: { pixelSize: 10, color: poi.color },
      label: { text: poi.label, font: '12px monospace', fillColor: C.Color.WHITE,
        verticalOrigin: C.VerticalOrigin.BOTTOM, pixelOffset: new C.Cartesian2(0, -12) },
    })
  }

  if (v.scene.msaaLevel !== undefined) v.scene.msaaLevel = 4
  if (v.scene.fxaa !== undefined) v.scene.fxaa = true

  const stage = document.querySelector('.demo-stage') as HTMLElement
  if (stage) gui = setupGUI(stage, effects, () => viewer, () => C, customStages)
}

onUnmounted(() => {
  gui?.destroy(); gui = null
  resetAll(viewer, effects, customStages)
  if (tileset && viewer && !viewer.isDestroyed()) viewer.scene.primitives.remove(tileset)
})
</script>

<template>
  <div class="demo-page h-full flex flex-col min-h-0">
    <div class="demo-header shrink-0 h-12 px-6 border-b border-surface-border flex items-center gap-3 bg-surface">
      <h2 class="font-semibold text-sm">后处理特效实验台</h2>
      <span class="text-xs text-zinc-500 hidden sm:inline">PostProcessStage · Bloom · Silhouette · Custom GLSL</span>
      <button class="text-xs px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors ml-auto" @click="showTutorial = true">📖 教程</button>
    </div>

    <div class="demo-stage flex-1 w-full relative min-h-0">
      <CesiumViewer :initial-position="[108.96, 34.22, 5_000]" scene-mode="3d" @ready="onViewerReady" />
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
      <pre><code>const stage = new Cesium.PostProcessStage({
  fragmentShader: `... GLSL ...`,
  uniforms: { uStrength: 0.5 },
  name: 'my_effect',
})
viewer.scene.postProcessStages.add(stage)
stage.uniforms.uStrength = 0.8  // 运行时修改
viewer.scene.postProcessStages.remove(stage)</code></pre>

      <h3>三、片段着色器规范</h3>
      <table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.78rem;">
        <thead><tr style="background:#27272a;text-align:left;">
          <th style="padding:6px 10px;border:1px solid #3f3f46;">变量</th><th style="padding:6px 10px;border:1px solid #3f3f46;">类型</th><th style="padding:6px 10px;border:1px solid #3f3f46;">说明</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>colorTexture</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">sampler2D</td><td style="padding:6px 10px;border:1px solid #3f3f46;">场景颜色纹理（自动注入）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>depthTexture</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">sampler2D</td><td style="padding:6px 10px;border:1px solid #3f3f46;">深度纹理（自动注入）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>v_textureCoordinates</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">vec2</td><td style="padding:6px 10px;border:1px solid #3f3f46;">纹理坐标 [0,1]（自动注入）</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #3f3f46;"><code>out_FragColor</code></td><td style="padding:6px 10px;border:1px solid #3f3f46;">vec4</td><td style="padding:6px 10px;border:1px solid #3f3f46;">输出颜色（必须写入）</td></tr>
        </tbody>
      </table>

      <h3>四、内置效果 PostProcessStageLibrary</h3>
      <pre><code>viewer.scene.postProcessStages.bloom.enabled = true
viewer.scene.postProcessStages.bloom.uniforms.intensity = 0.5
Cesium.PostProcessStageLibrary.createBrightnessStage()
Cesium.PostProcessStageLibrary.createNightVisionStage()
Cesium.PostProcessStageLibrary.createSilhouetteStage()</code></pre>

      <h3>五、自定义 GLSL 推导</h3>
      <p><strong>暗角 Vignette</strong>: 像素离中心越远 → 乘越小的系数。dist = length(uv - 0.5)，vignette = smoothstep(0, 1, 1 - dist * 1.4)。</p>
      <p><strong>色调映射 ColorGrade</strong>: 按 BT.709 亮度分三段插值——暗部偏蓝，亮部偏暖，模拟电影 Teal & Orange 风格。</p>
      <p><strong>锐化 Sharpen</strong>: 5-tap 卷积核 center*5 - neighbors*1，平坦区域不变，边缘差异被放大。</p>

      <h3>六、面试话术</h3>
      <p><strong>Q: "Cesium 后处理怎么做？"</strong></p>
      <p>A: "用 <code>PostProcessStage</code> 写 GLSL 片段着色器，通过 <code>viewer.scene.postProcessStages.add()</code> 注入渲染管线。Cesium 自动提供 <code>colorTexture</code>、<code>depthTexture</code>、<code>v_textureCoordinates</code>，只写片段着色器就够了。常见效果有内置 <code>PostProcessStageLibrary</code> 工厂函数，自定义效果把 GLSL 字符串和 uniforms 传进去即可。"</p>
    </TutorialModal>
  </div>
</template>
