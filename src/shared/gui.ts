import { GUI } from 'lil-gui'

/**
 * 在指定容器右上角创建 lil-gui 面板
 *
 * 用法:
 *   const gui = createDemoGui(stage)
 *   gui.add(state, 'exaggeration', 1, 15, 0.5).name('地形夸张 ×')
 *   // onUnmounted 中 gui.destroy()
 *
 * @param stage  - 容器元素（通常为 .demo-stage）
 * @param width  - 面板宽度，默认 260
 */
export function createDemoGui(stage: HTMLElement, width = 260): GUI {
  const gui = new GUI({ autoPlace: false, width })
  Object.assign(gui.domElement.style, {
    position: 'absolute',
    top: '12px',
    right: '12px',
    zIndex: '10',
  })
  stage.appendChild(gui.domElement)
  return gui
}
