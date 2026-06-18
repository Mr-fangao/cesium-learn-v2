/**
 * PostProcessDemo 逻辑 — 后处理特效实验台
 *
 * 内置效果: Bloom, 亮度, 夜视, 剪影
 * 自定义 GLSL: 暗角, 色调映射, 锐化
 */

import { createDemoGui } from '@/shared/gui'

/* ================================================================
 * GLSL 着色器
 * ================================================================ */

export const SHADER_VIGNETTE = /* glsl */ `
uniform sampler2D colorTexture;
uniform float uStrength;
in vec2 v_textureCoordinates;

void main(void) {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  vec2 uv = v_textureCoordinates - 0.5;
  float dist = length(uv);
  float vignette = 1.0 - dist * 1.4;
  vignette = smoothstep(0.0, 1.0, vignette);
  vignette = mix(1.0, vignette, uStrength);
  out_FragColor = vec4(color.rgb * vignette, 1.0);
}`

export const SHADER_COLOR_GRADE = /* glsl */ `
uniform sampler2D colorTexture;
uniform float uStrength;
in vec2 v_textureCoordinates;

void main(void) {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadows = vec3(0.0, 0.02, 0.06);
  vec3 midtones = vec3(0.95, 0.90, 0.85);
  vec3 highlights = vec3(1.08, 0.95, 0.82);
  vec3 graded = mix(shadows, midtones, smoothstep(0.0, 0.5, lum));
  graded = mix(graded, highlights, smoothstep(0.5, 1.0, lum));
  out_FragColor = vec4(mix(color.rgb, graded, uStrength), 1.0);
}`

export const SHADER_SHARPEN = /* glsl */ `
uniform sampler2D colorTexture;
uniform vec2 uPixelSize;
uniform float uStrength;
in vec2 v_textureCoordinates;

void main(void) {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  vec4 n = texture(colorTexture, v_textureCoordinates - vec2(0.0, uPixelSize.y));
  vec4 s = texture(colorTexture, v_textureCoordinates + vec2(0.0, uPixelSize.y));
  vec4 e = texture(colorTexture, v_textureCoordinates + vec2(uPixelSize.x, 0.0));
  vec4 w = texture(colorTexture, v_textureCoordinates - vec2(uPixelSize.x, 0.0));
  vec4 sharp = color * 5.0 - (n + s + e + w);
  out_FragColor = vec4(mix(color.rgb, sharp.rgb, uStrength), 1.0);
}`

/* ================================================================
 * 自定义效果管理
 * ================================================================ */

const CUSTOM_EFFECTS = [
  { key: 'vignette', shader: SHADER_VIGNETTE },
  { key: 'colorGrade', shader: SHADER_COLOR_GRADE },
  { key: 'sharpen', shader: SHADER_SHARPEN },
]

export function addCustomEffect(
  viewer: Cesium.Viewer, C: any, key: string,
  customStages: Record<string, any>, effects: any,
): void {
  if (customStages[key]) return
  const def = CUSTOM_EFFECTS.find(e => e.key === key)
  if (!def) return

  const uniforms: any = {}
  const strengthMap: Record<string, string> = {
    vignette: 'vignetteStrength', colorGrade: 'colorGradeStrength', sharpen: 'sharpenStrength',
  }
  uniforms.uStrength = (effects as any)[strengthMap[key]] ?? 0.5
  if (key === 'sharpen') {
    uniforms.uPixelSize = {
      x: 1.0 / viewer.canvas.clientWidth,
      y: 1.0 / viewer.canvas.clientHeight,
    }
  }

  const stage = new C.PostProcessStage({
    fragmentShader: def.shader, uniforms, name: `pp_${key}`,
  })
  viewer.scene.postProcessStages.add(stage)
  customStages[key] = stage
}

export function removeCustomEffect(
  viewer: Cesium.Viewer | null, key: string,
  customStages: Record<string, any>,
): void {
  if (!viewer || !customStages[key]) return
  viewer.scene.postProcessStages.remove(customStages[key])
  customStages[key] = null
}

export function updateUniform(
  key: string, uniformName: string, value: number,
  customStages: Record<string, any>,
): void {
  const stage = customStages[key]
  if (!stage?.uniforms) return
  if (uniformName === 'uPixelSize') {
    stage.uniforms.uPixelSize = { x: value, y: value }
  } else {
    stage.uniforms[uniformName] = value
  }
}

/* ================================================================
 * 内置效果
 * ================================================================ */

export function toggleBloom(viewer: Cesium.Viewer | null, v: boolean, intensity: number): void {
  if (!viewer) return
  viewer.scene.postProcessStages.bloom.enabled = v
  viewer.scene.postProcessStages.bloom.uniforms.intensity = intensity
}

export function toggleBrightness(
  viewer: Cesium.Viewer | null, C: any, v: boolean, brightnessValue: number,
  customStages: Record<string, any>,
): void {
  if (!viewer) return
  const key = 'brightness'
  if (v) {
    if (customStages[key]) return
    const stage = C.PostProcessStageLibrary.createBrightnessStage()
    stage.uniforms.brightness = brightnessValue
    viewer.scene.postProcessStages.add(stage)
    customStages[key] = stage
  } else {
    if (customStages[key]) {
      viewer.scene.postProcessStages.remove(customStages[key])
      customStages[key] = null
    }
  }
}

export function toggleNightVision(
  viewer: Cesium.Viewer | null, C: any, v: boolean,
  customStages: Record<string, any>,
): void {
  if (!viewer) return
  const key = 'nightVision'
  if (v) {
    if (customStages[key]) return
    const stage = C.PostProcessStageLibrary.createNightVisionStage()
    viewer.scene.postProcessStages.add(stage)
    customStages[key] = stage
  } else {
    if (customStages[key]) {
      viewer.scene.postProcessStages.remove(customStages[key])
      customStages[key] = null
    }
  }
}

export function toggleSilhouette(
  viewer: Cesium.Viewer | null, C: any, v: boolean, color: string,
  customStages: Record<string, any>,
): void {
  if (!viewer) return
  const key = 'silhouette'
  if (v) {
    if (customStages[key]) return
    if (!C.PostProcessStageLibrary.isSilhouetteSupported(viewer.scene)) {
      console.warn('[PostProcess] 当前环境不支持剪影')
      return
    }
    const stage = C.PostProcessStageLibrary.createSilhouetteStage()
    stage.uniforms.color = C.Color.fromCssColorString(color)
    stage.uniforms.length = 0.25
    viewer.scene.postProcessStages.add(stage)
    customStages[key] = stage
  } else {
    if (customStages[key]) {
      viewer.scene.postProcessStages.remove(customStages[key])
      customStages[key] = null
    }
  }
}

export function resetAll(viewer: Cesium.Viewer | null, effects: any, customStages: Record<string, any>): void {
  for (const [k, v] of Object.entries(customStages)) {
    if (v) { viewer?.scene.postProcessStages.remove(v); customStages[k] = null }
  }
  if (viewer) viewer.scene.postProcessStages.bloom.enabled = false
  const keys = ['bloom', 'brightness', 'nightVision', 'silhouette', 'vignette', 'colorGrade', 'sharpen']
  for (const k of keys) (effects as any)[k] = false
}

/* ================================================================
 * GUI
 * ================================================================ */

export function setupGUI(
  stage: HTMLElement, effects: any, viewer: () => Cesium.Viewer | null, C: () => any,
  customStages: Record<string, any>,
): any {
  const gui = createDemoGui(stage, 280)

  const builtin = gui.addFolder('内置效果')

  const fBloom = builtin.addFolder('泛光 Bloom')
  fBloom.add(effects, 'bloom').name('启用').onChange((v: boolean) => toggleBloom(viewer(), v, effects.bloomIntensity))
  fBloom.add(effects, 'bloomIntensity', 0, 2, 0.05).name('强度')
    .onChange((v: number) => { const vv = viewer(); if (vv) vv.scene.postProcessStages.bloom.uniforms.intensity = v })

  const fBright = builtin.addFolder('亮度 Brightness')
  fBright.add(effects, 'brightness').name('启用')
    .onChange((v: boolean) => toggleBrightness(viewer(), C(), v, effects.brightnessValue, customStages))
  fBright.add(effects, 'brightnessValue', 0.1, 3, 0.05).name('倍率')
    .onChange((v: number) => { const s = customStages['brightness']; if (s?.uniforms) s.uniforms.brightness = v })

  builtin.add(effects, 'nightVision').name('夜视 NightVision')
    .onChange((v: boolean) => toggleNightVision(viewer(), C(), v, customStages))

  const fSil = builtin.addFolder('剪影 Silhouette')
  fSil.add(effects, 'silhouette').name('启用')
    .onChange((v: boolean) => toggleSilhouette(viewer(), C(), v, effects.silhouetteColor, customStages))
  fSil.addColor(effects, 'silhouetteColor').name('边缘颜色')

  const custom = gui.addFolder('自定义 GLSL 效果')

  const fVig = custom.addFolder('暗角 Vignette')
  fVig.add(effects, 'vignette').name('启用')
    .onChange((v: boolean) => v ? addCustomEffect(viewer()!, C(), 'vignette', customStages, effects) : removeCustomEffect(viewer(), 'vignette', customStages))
  fVig.add(effects, 'vignetteStrength', 0, 1.5, 0.05).name('强度')
    .onChange((v: number) => updateUniform('vignette', 'uStrength', v, customStages))

  const fGrade = custom.addFolder('色调映射 ColorGrade')
  fGrade.add(effects, 'colorGrade').name('启用')
    .onChange((v: boolean) => v ? addCustomEffect(viewer()!, C(), 'colorGrade', customStages, effects) : removeCustomEffect(viewer(), 'colorGrade', customStages))
  fGrade.add(effects, 'colorGradeStrength', 0, 1, 0.05).name('强度')
    .onChange((v: number) => updateUniform('colorGrade', 'uStrength', v, customStages))

  const fSharp = custom.addFolder('锐化 Sharpen')
  fSharp.add(effects, 'sharpen').name('启用')
    .onChange((v: boolean) => v ? addCustomEffect(viewer()!, C(), 'sharpen', customStages, effects) : removeCustomEffect(viewer(), 'sharpen', customStages))
  fSharp.add(effects, 'sharpenStrength', 0, 1, 0.05).name('强度')
    .onChange((v: number) => updateUniform('sharpen', 'uStrength', v, customStages))

  gui.add({ resetAll: () => resetAll(viewer(), effects, customStages) }, 'resetAll').name('✕ 重置全部效果')
  return gui
}
