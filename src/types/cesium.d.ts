/**
 * Cesium 全局类型声明
 *
 * Cesium 以 IIFE 加载，挂载到 window.Cesium。
 * 这里声明全局 Cesium 命名空间，避免 TS 报错。
 */

// Cesium 核心类型（简化版，只声明用到的）
declare namespace Cesium {
  class Viewer {
    constructor(container: HTMLElement | string, options?: ViewerOptions)
    camera: Camera
    scene: Scene
    entities: EntityCollection
    cesiumWidget: CesiumWidget
    isDestroyed(): boolean
    destroy(): void
  }

  interface ViewerOptions {
    animation?: boolean
    timeline?: boolean
    baseLayerPicker?: boolean
    fullscreenButton?: boolean
    homeButton?: boolean
    sceneModePicker?: boolean
    navigationHelpButton?: boolean
    geocoder?: boolean
    imageryProvider?: any
    terrainProvider?: any
    [key: string]: any
  }

  class Camera {
    flyTo(options: { destination: Cartesian3; duration?: number }): void
  }

  class Scene {
    globe: Globe
    primitives: any
    render(): void
    [key: string]: any
  }

  class Globe {
    depthTestAgainstTerrain: boolean
  }

  class Cartesian3 {
    static fromDegrees(longitude: number, latitude: number, height?: number): Cartesian3
  }

  class CesiumWidget {
    creditContainer: HTMLElement
  }

  class EntityCollection {
    [key: string]: any
  }
}

declare global {
  interface Window {
    Cesium: typeof Cesium & {
      Viewer: typeof Cesium.Viewer
      Cartesian3: typeof Cesium.Cartesian3
      [key: string]: any
    }
  }
}

export {}
