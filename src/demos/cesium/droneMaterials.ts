/**
 * 自定义 Polyline 材质（从 dk-aircraft 源码适配 Cesium IIFE 环境）
 *
 * 材质列表:
 *   - PolylineGlowMaterialProperty  — 发光管效果（默认航迹）
 *   - PolylineArrowMaterialProperty  — 带箭头方向指示
 *   - GradientMaterialProperty       — 渐变透明度
 *
 * 使用方式:
 *   import { registerDroneMaterials } from './droneMaterials'
 *   registerDroneMaterials()
 *   entity.polyline.material = new PolylineGlowMaterialProperty({ color: ... })
 */

const CzmProperty = (Cesium.Property as any)

/* ================================================================
 * 工具: AbstractMaterialProperty 基类 + setProperty
 * 直接从参考源码拷贝，适配 IIFE 环境
 * ================================================================ */

abstract class AbstractMaterialProperty {
  abstract readonly isConstant: boolean
  abstract readonly definitionChanged: Cesium.Event
  abstract getType(time: Cesium.JulianDate): string
  abstract getValue(time: Cesium.JulianDate, result?: object): object
  abstract equals(other: Cesium.Property): boolean
}

function setProperty(self: any, name: string, value: any) {
  const privateName = `_${name}`
  const subscriptionName = `_${name}Subscription`
  const oldValue = self[privateName]
  const subscription = self[subscriptionName]
  if (Cesium.defined(subscription)) {
    subscription()
    self[subscriptionName] = undefined
  }
  const hasValue = value !== undefined
  if (hasValue && (!Cesium.defined(value) || !Cesium.defined(value.getValue))) {
    value = new Cesium.ConstantProperty(value)
  }
  if (oldValue !== value) {
    self[privateName] = value
    self._definitionChanged.raiseEvent(self, name, value, oldValue)
  }
  if (Cesium.defined(value) && Cesium.defined(value.definitionChanged)) {
    self[subscriptionName] = value.definitionChanged.addEventListener(() => {
      self._definitionChanged.raiseEvent(self, name, value, value)
    }, self)
  }
}

function registerMaterial(type: string, template: any) {
  (Cesium.Material as any)._materialCache.addMaterial(type, template)
}

/* ================================================================
 * PolylineGlow — 发光效果
 * ================================================================ */

const timeScratch = Cesium.JulianDate.now()

export class PolylineGlowMaterialProperty extends AbstractMaterialProperty {
  private _definitionChanged = new Cesium.Event()
  private _color: Cesium.Property | undefined
  private _glowPower: Cesium.Property | undefined
  private _taperPower: Cesium.Property | undefined
  private _inverse: Cesium.Property | undefined
  private _useGlow: Cesium.Property | undefined
  private _gradient: Cesium.Property | undefined
  private _gradientDirectionInverse: Cesium.Property | undefined

  static MaterialType = 'DK.PolylineGlow'

  constructor(opts?: Partial<{
    color: Cesium.Color; glowPower: number; taperPower: number
    inverse: boolean; useGlow: boolean; gradient: boolean; gradientDirectionInverse: boolean
  }>) {
    super()
    this.color = new Cesium.ConstantProperty(opts?.color ?? Cesium.Color.fromCssColorString('#00CFF8'))
    this.glowPower = opts?.glowPower ?? 0.25
    this.taperPower = opts?.taperPower ?? 1.0
    this.inverse = opts?.inverse ?? false
    this.useGlow = opts?.useGlow ?? true
    this.gradient = opts?.gradient ?? false
    this.gradientDirectionInverse = opts?.gradientDirectionInverse ?? false
  }

  get color() { return this._color }
  set color(v: Cesium.Property | undefined) { setProperty(this, 'color', v) }
  get glowPower() { return this._glowPower }
  set glowPower(v: any) { setProperty(this, 'glowPower', v) }
  get taperPower() { return this._taperPower }
  set taperPower(v: any) { setProperty(this, 'taperPower', v) }
  get inverse() { return this._inverse }
  set inverse(v: any) { setProperty(this, 'inverse', v) }
  get useGlow() { return this._useGlow }
  set useGlow(v: any) { setProperty(this, 'useGlow', v) }
  get gradient() { return this._gradient }
  set gradient(v: any) { setProperty(this, 'gradient', v) }
  get gradientDirectionInverse() { return this._gradientDirectionInverse }
  set gradientDirectionInverse(v: any) { setProperty(this, 'gradientDirectionInverse', v) }

  get definitionChanged() { return this._definitionChanged }
  getType() { return PolylineGlowMaterialProperty.MaterialType }
  get isConstant() {
    return CzmProperty.isConstant(this._color) && CzmProperty.isConstant(this._glowPower)
      && CzmProperty.isConstant(this._taperPower) && CzmProperty.isConstant(this._inverse)
      && CzmProperty.isConstant(this._useGlow)
  }

  getValue(time: Cesium.JulianDate, result?: any): object {
    if (!Cesium.defined(time)) time = Cesium.JulianDate.now(timeScratch)
    if (!Cesium.defined(result)) result = {}
    result.color = CzmProperty.getValueOrClonedDefault(this._color, time, Cesium.Color.WHITE, result.color)
    result.glowPower = CzmProperty.getValueOrClonedDefault(this._glowPower, time, 0.25, result.glowPower)
    result.taperPower = CzmProperty.getValueOrClonedDefault(this._taperPower, time, 1.0, result.taperPower)
    result.inverse = CzmProperty.getValueOrClonedDefault(this._inverse, time, false, result.inverse)
    result.useGlow = CzmProperty.getValueOrClonedDefault(this._useGlow, time, true, result.useGlow)
    result.gradient = CzmProperty.getValueOrClonedDefault(this._gradient, time, false, result.gradient)
    result.gradientDirectionInverse = CzmProperty.getValueOrClonedDefault(this._gradientDirectionInverse, time, false, result.gradientDirectionInverse)
    return result
  }

  equals(other: PolylineGlowMaterialProperty) {
    return this === other || (other instanceof PolylineGlowMaterialProperty
      && CzmProperty.equals(this._color, other._color))
  }
}

/* ================================================================
 * PolylineArrow — 带方向箭头的线
 * ================================================================ */

export class PolylineArrowMaterialProperty extends AbstractMaterialProperty {
  private _definitionChanged = new Cesium.Event()
  private _color: Cesium.Property | undefined
  private _outlineColor: Cesium.Property | undefined
  private _outlineWidth: Cesium.Property | undefined
  private _directionColor: Cesium.Property | undefined
  private _directionInverse: Cesium.Property | undefined
  private _gradient: Cesium.Property | undefined
  private _gradientDirectionInverse: Cesium.Property | undefined

  static MaterialType = 'DK.PolylineArrow'

  constructor(opts?: Partial<{
    color: Cesium.Color; outlineColor: Cesium.Color; outlineWidth: number
    directionColor: Cesium.Color; directionInverse: boolean
    gradient: boolean; gradientDirectionInverse: boolean
  }>) {
    super()
    this.color = new Cesium.ConstantProperty(opts?.color ?? Cesium.Color.fromCssColorString('#00CFF8'))
    this.outlineColor = new Cesium.ConstantProperty(opts?.outlineColor ?? new Cesium.Color(0.7, 0.5, 0.05, 1.0))
    this.outlineWidth = opts?.outlineWidth ?? 0.5
    this.directionColor = new Cesium.ConstantProperty(opts?.directionColor ?? Cesium.Color.WHITE)
    this.directionInverse = opts?.directionInverse ?? false
    this.gradient = opts?.gradient ?? false
    this.gradientDirectionInverse = opts?.gradientDirectionInverse ?? false
  }

  get color() { return this._color }
  set color(v: Cesium.Property | undefined) { setProperty(this, 'color', v) }
  get outlineColor() { return this._outlineColor }
  set outlineColor(v: Cesium.Property | undefined) { setProperty(this, 'outlineColor', v) }
  get outlineWidth() { return this._outlineWidth }
  set outlineWidth(v: any) { setProperty(this, 'outlineWidth', v) }
  get directionColor() { return this._directionColor }
  set directionColor(v: Cesium.Property | undefined) { setProperty(this, 'directionColor', v) }
  get directionInverse() { return this._directionInverse }
  set directionInverse(v: any) { setProperty(this, 'directionInverse', v) }
  get gradient() { return this._gradient }
  set gradient(v: any) { setProperty(this, 'gradient', v) }
  get gradientDirectionInverse() { return this._gradientDirectionInverse }
  set gradientDirectionInverse(v: any) { setProperty(this, 'gradientDirectionInverse', v) }

  get definitionChanged() { return this._definitionChanged }
  getType() { return PolylineArrowMaterialProperty.MaterialType }
  get isConstant() {
    return CzmProperty.isConstant(this._color) && CzmProperty.isConstant(this._outlineColor)
  }

  getValue(time: Cesium.JulianDate, result?: any): object {
    if (!Cesium.defined(time)) time = Cesium.JulianDate.now(timeScratch)
    if (!Cesium.defined(result)) result = {}
    result.color = CzmProperty.getValueOrClonedDefault(this._color, time, Cesium.Color.WHITE, result.color)
    result.outlineColor = CzmProperty.getValueOrClonedDefault(this._outlineColor, time, Cesium.Color.WHITE, result.outlineColor)
    result.outlineWidth = CzmProperty.getValueOrClonedDefault(this._outlineWidth, time, 0.5, result.outlineWidth)
    result.directionColor = CzmProperty.getValueOrClonedDefault(this._directionColor, time, Cesium.Color.WHITE, result.directionColor)
    result.directionInverse = CzmProperty.getValueOrClonedDefault(this._directionInverse, time, false, result.directionInverse)
    result.gradient = CzmProperty.getValueOrClonedDefault(this._gradient, time, false, result.gradient)
    result.gradientDirectionInverse = CzmProperty.getValueOrClonedDefault(this._gradientDirectionInverse, time, false, result.gradientDirectionInverse)
    return result
  }

  equals(other: PolylineArrowMaterialProperty) {
    return this === other || (other instanceof PolylineArrowMaterialProperty
      && CzmProperty.equals(this._color, other._color))
  }
}

/* ================================================================
 * Gradient — 渐变透明度线
 * ================================================================ */

export class GradientMaterialProperty extends AbstractMaterialProperty {
  private _definitionChanged = new Cesium.Event()
  private _color: Cesium.Property | undefined

  static MaterialType = 'DK.Gradient'

  constructor(opts?: { color: Cesium.Color }) {
    super()
    this.color = new Cesium.ConstantProperty(opts?.color ?? Cesium.Color.CYAN)
  }

  get color() { return this._color }
  set color(v: Cesium.Property | undefined) { setProperty(this, 'color', v) }
  get definitionChanged() { return this._definitionChanged }
  getType() { return GradientMaterialProperty.MaterialType }
  get isConstant() { return CzmProperty.isConstant(this._color) }

  getValue(time: Cesium.JulianDate, result?: any): object {
    if (!Cesium.defined(time)) time = Cesium.JulianDate.now(timeScratch)
    if (!Cesium.defined(result)) result = {}
    result.color = CzmProperty.getValueOrClonedDefault(this._color, time, Cesium.Color.WHITE, result.color)
    return result
  }

  equals(other: GradientMaterialProperty) {
    return this === other || (other instanceof GradientMaterialProperty
      && CzmProperty.equals(this._color, other._color))
  }
}

/* ================================================================
 * 注册所有材质到 Cesium Material 系统
 * ================================================================ */

export function registerDroneMaterials() {
  // PolylineGlow
  registerMaterial(PolylineGlowMaterialProperty.MaterialType, {
    fabric: {
      type: PolylineGlowMaterialProperty.MaterialType,
      uniforms: {
        color: Cesium.Color.fromCssColorString('#00CFF8'),
        glowPower: 0.25,
        taperPower: 1.0,
        inverse: false,
        useGlow: true,
        gradient: false,
        gradientDirectionInverse: false,
      },
      source: /* glsl */ `
uniform vec4 color;
uniform float glowPower;
uniform float taperPower;
uniform bool inverse;
uniform bool useGlow;
uniform bool gradient;
uniform bool gradientDirectionInverse;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  if (inverse) st.s = 1.0 - st.s;
  float glow = glowPower / abs(st.t - 0.5) - (glowPower / 0.5);
  if (taperPower <= 0.99999) {
    glow *= min(1.0, taperPower / (0.5 - st.s * 0.5) - (taperPower / 0.5));
  }
  vec4 fragColor;
  fragColor.rgb = max(vec3(glow - 1.0 + color.rgb), color.rgb);
  fragColor.a = clamp(0.0, 1.0, glow) * color.a;
  fragColor = czm_gammaCorrect(fragColor);
  material.emission = (useGlow ? fragColor : color).rgb;
  material.alpha = fragColor.a;
  if (gradient) material.alpha *= gradientDirectionInverse ? (1.0 - st.s) : st.s;
  return material;
}`,
    },
    translucent: () => true,
  })

  // PolylineArrow
  registerMaterial(PolylineArrowMaterialProperty.MaterialType, {
    fabric: {
      type: PolylineArrowMaterialProperty.MaterialType,
      uniforms: {
        color: Cesium.Color.fromCssColorString('#00CFF8'),
        directionColor: Cesium.Color.WHITE,
        directionInverse: false,
        outlineColor: new Cesium.Color(0.7, 0.5, 0.05, 1.0),
        outlineWidth: 0.5,
        gradient: false,
        gradientDirectionInverse: false,
      },
      source: /* glsl */ `
#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
uniform vec4 color;
uniform vec4 directionColor;
uniform vec4 outlineColor;
uniform float outlineWidth;
uniform bool directionInverse;
uniform bool gradient;
uniform bool gradientDirectionInverse;

in float v_width;
in float v_polylineAngle;

const float fragLength = 100.0;
const float startPosition = 0.45;
const float endPosition = 0.55;

mat2 rotate(float rad) {
  float c = cos(rad); float s = sin(rad);
  return mat2(c, s, -s, c);
}

float getPointOnLine(vec2 p0, vec2 p1, float x) {
  float slope = (p0.y - p1.y) / (p0.x - p1.x);
  return slope * (x - p0.x) + p0.y;
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  float halfInteriorWidth = 0.5 * (v_width - outlineWidth) / v_width;
  float b = step(0.5 - halfInteriorWidth, st.t);
  b *= 1.0 - step(0.5 + halfInteriorWidth, st.t);
  vec4 currentColor = mix(outlineColor, color, b);
  float d1 = abs(st.t - (0.5 - halfInteriorWidth));
  float d2 = abs(st.t - (0.5 + halfInteriorWidth));
  vec4 outColor = czm_antialias(outlineColor, color, currentColor, min(d1, d2));
  outColor = czm_gammaCorrect(outColor);

  float angle = directionInverse ? v_polylineAngle + radians(180.0) : v_polylineAngle;
  vec2 pos = rotate(angle) * gl_FragCoord.xy;
  float maskS = fract(pos.x / (fragLength * czm_pixelRatio));
  bool isDirection = (maskS > startPosition) && (maskS <= endPosition);

  vec4 fragColor;
  if (isDirection) {
    float arrowWidth = (endPosition - startPosition) / 2.0;
    float midS = startPosition + arrowWidth;
    float t = 1.0;
    if (maskS < midS) {
      vec2 center = vec2(midS, 0.5);
      float upper = getPointOnLine(vec2(startPosition, 1.0), center, maskS);
      float lower = getPointOnLine(vec2(startPosition, 0.0), center, maskS);
      t *= 1.0 - step(upper, maskS);
      t *= step(lower, maskS);
      t = 1.0 - t;
    } else {
      vec2 center = vec2(endPosition, 0.5);
      float upper = getPointOnLine(vec2(midS, 1.0), center, maskS);
      float lower = getPointOnLine(vec2(midS, 0.0), center, maskS);
      t *= 1.0 - step(upper, maskS);
      t *= step(lower, maskS);
    }
    fragColor = mix(outColor, directionColor, clamp(t, 0.0, 1.0));
  } else {
    fragColor = outColor;
  }
  fragColor = czm_gammaCorrect(fragColor);
  material.diffuse = fragColor.rgb;
  material.alpha = fragColor.a;
  if (gradient) material.alpha *= gradientDirectionInverse ? (1.0 - st.s) : st.s;
  return material;
}`,
    },
    translucent: () => true,
  })

  // Gradient
  registerMaterial(GradientMaterialProperty.MaterialType, {
    fabric: {
      type: GradientMaterialProperty.MaterialType,
      uniforms: { center: new Cesium.Cartesian2(0.5, 0.5), color: Cesium.Color.WHITE },
      source: /* glsl */ `
uniform vec2 center;
uniform vec4 color;
float reduce(float x, float k) { return min((exp(k * x) - 1.0) / (exp(3.0) - 3.0), 1.0); }
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  material.diffuse = color.rgb;
  material.alpha = color.a * reduce(distance(materialInput.st, center), 4.545);
  return material;
}`,
    },
    translucent: () => true,
  })
}
