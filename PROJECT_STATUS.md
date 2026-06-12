# CesiumLearn v2 — 项目状态总览

> 最后更新：2026-06-12

---

## 一、项目结构

```
cesium-learn-v2/
├── index.html                        # Cesium 全局脚本加载 + CESIUM_BASE_URL
├── vite.config.ts                    # Vite 配置：Tailwind v4、Cesium 静态资源拷贝、@别名
├── package.json                      # 依赖清单
├── tsconfig.json / tsconfig.app.json # TS 配置
├── PROJECT_STATUS.md                 # 本文件
├── LEARNING_ROADMAP.md               # 学习路线文档
│
└── src/
    ├── main.ts                       # 入口：挂载 Pinia / Router / Naive UI
    ├── App.vue                       # 根组件：Naive UI 主题 + 高度链包装
    ├── style.css                     # 全局样式：Tailwind / Cesium CSS / Token / 滚动条
    │
    ├── router/index.ts               # 路由表（hash 模式，6 条路由全拍平）
    ├── types/cesium.d.ts             # window.Cesium 全局类型声明
    │
    ├── components/
    │   ├── layout/AppLayout.vue      # 布局骨架：纯 CSS flex 左右两栏
    │   └── cesium/CesiumViewer.vue   # Cesium 基础组件：创建/销毁/自适应/底图
    │
    ├── views/
    │   └── Home.vue                  # 首页展品集：Hero + 技术卡片 + 时间轴
    │
    └── demos/
        ├── cesium/
        │   ├── HelloCesium.vue       # ✅ 已完成：地球初始化 + 标记点 + 航线
        │   ├── PrimitiveCustom.vue   # ⏳ 骨架：自定义 Primitive 几何体
        │   └── ShaderWater.vue       # ⏳ 骨架：CustomShader 动态水域
        ├── three/
        │   └── HelloThree.vue        # ⏳ 骨架：Three.js 场景初始化
        └── babylon/
            └── HelloBabylon.vue      # ⏳ 骨架：Babylon.js 5 分钟搭建
```

---

## 二、技术栈

| 层 | 选型 | 版本 |
|----|------|------|
| 框架 | Vue 3 + `<script setup>` + TS | 3.5 |
| 构建 | Vite | 8 |
| 语言 | TypeScript | 6 |
| 路由 | Vue Router (hash) | 4 |
| 状态 | Pinia | 3 |
| UI 组件 | Naive UI（仅小组件，不做布局） | 2.44 |
| CSS | Tailwind CSS v4 + 自定义 Token | 4.3 |
| 原子工具 | @vueuse/core | 14 |
| 图标 | @lucide/vue | 1.17 |
| 3D 引擎 | CesiumJS（全局 IIFE 加载） | 1.111 |
| 底图 | OpenStreetMap（免费，无需 Token） | — |

---

## 三、架构决策记录

### 3.1 Cesium 加载方式：全局 IIFE
- **决策**：`<script src="/Cesium/Cesium.js">` 挂载到 `window.Cesium`
- **原因**：Cesium 1.111 的 ESM Source 模块与 `@cesium/engine` 版本不匹配（`TerrainExaggeration` 缺失），且预构建包是 UMD 格式不支持 tree-shaking 的 named import
- **代价**：无法按需引入，整个 Cesium.js (4MB+) 全量加载
- **静态资源**：Worker / Assets / Widgets 通过 `vite-plugin-static-copy` 复制

### 3.2 布局方案：纯 CSS Flex，放弃 Naive UI 布局组件
- **决策**：AppLayout 用 `<div class="app-shell flex">` 替代 `NLayout/NLayoutSider/NLayoutContent`
- **原因**：Naive UI 布局组件内部 3-4 层 wrapper（`n-scrollbar` → `n-scrollbar-container` → `n-scrollbar-content`），阻断 `height:100%` 传递链
- **当前结构**：
  ```
  app-shell (flex row, h-full)
  ├── app-sider (固定宽 240/64px, flex-col)
  │   ├── Logo (h-12)
  │   ├── nav (flex-1 overflow-y-auto)
  │   └── footer (shrink-0)
  └── app-main (flex-1 overflow-hidden)
      └── router-view → 页面各自控制 overflow
  ```

### 3.3 路由跳转不渲染地球的根因
- **问题**：首页 → Cesium demo 跳转后地球不显示，刷新才正常
- **排查路径**：
  1. ❌ `window.CESIUM_BASE_URL` 未设 → 修复后仍不行
  2. ❌ 容器高度塌陷 → 多次 CSS 修复仍不行
  3. ❌ `ref()` 变量名与模板 `ref="container"` 不匹配 → 修复后仍不行
  4. ❌ `nextTick` / `requestAnimationFrame` 延迟 → 无效
  5. ✅ **根因**：`<transition mode="out-in">` 包裹 `<component :is="Component">` 导致 Cesium WebGL 上下文初始化失败
- **最终修复**：去掉 `<transition>`，直接 `<component :is="Component" :key="r.path" />`

---

## 四、进度总览

| Demo | 状态 | 说明 |
|------|------|------|
| Hello Cesium | ✅ 完成 | 地球初始化 + OSM 底图 + 北京/上海标记 + 虚线航线 + 快捷定位 |
| 自定义 Primitive | ⏳ 骨架 | 已挂 CesiumViewer，待写几何体逻辑 |
| Shader 水域 | ⏳ 骨架 | 已挂 CesiumViewer，待写 CustomShader |
| Hello Three.js | ⏳ 骨架 | 占位页面 |
| Hello Babylon | ⏳ 骨架 | 占位页面 |
| 首页展品集 | ✅ 完成 | Hero + 技术卡片 + 进度条 + 时间轴 |

---

## 五、待优化点

### 5.1 性能
- [ ] Cesium.js 全量加载（4MB），后续可考虑按需拆包或 CDN
- [ ] Naive UI 全量引入导致 vendor chunk 1.4MB，可按需引入组件
- [ ] 地球 demo 的 OSM 瓦片加载无缓存策略，可加 `maximumLevel` 限制
- [ ] Home.vue 的入场动画用 inline style 写 transition-delay，可改用 Vue `<TransitionGroup>`

### 5.2 代码质量
- [ ] `window.Cesium` 类型声明不完整（`cesium.d.ts` 只有骨架），可引入官方 `@types/cesium` 或补全
- [ ] CesiumViewer 的 `makeImageryProvider` 内 `any` 类型应收敛
- [ ] 错误处理不统一：CesiumViewer 有 try-catch，HelloCesium 的 addDemoEntities 没有
- [ ] 首页 `techCards` 数据硬编码在组件内，可抽到独立数据文件
- [ ] 导航菜单项 `navGroups` 与路由表手动同步，可用 `router.getRoutes()` 自动生成

### 5.3 工程化
- [ ] 无 ESLint/Prettier 配置
- [ ] 无 `vite.config.ts` 中 `build.rollupOptions.output.manualChunks` 分包
- [ ] 无 `.env` 环境变量管理（如 Cesium Ion Token）

---

## 六、后续开发计划

按 `LEARNING_ROADMAP.md` 的顺序：

### Phase 1：Cesium 核心（当前）
1. **自定义 Primitive 几何体**：`Geometry + GeometryAttribute + Primitive` 手写六边形柱状图
2. **CustomShader 动态水域**：`CustomShader` API + 片元着色器（法线扰动 + Fresnel 公式推导）

### Phase 2：Cesium 进阶
3. **3D Tiles 专题**：加载城市模型 + 属性着色 + 单体化拾取
4. **裁剪剖切**：`ClippingPlaneCollection` 任意平面剖切
5. **CZML 时序**：卫星轨道动画 + 时间轴控制

### Phase 3：Three.js
6. **Three 核心 Demo**：对照 Cesium 差异学习
7. **Shader 专题**：ShaderMaterial + 菲涅尔边缘光 + 卡通渲染

### Phase 4：Babylon.js
8. **快速搭建 + Node Material**

---

## 七、聊天要点压缩

### 环境搭建
- 安装 `gh` CLI → 登录 GitHub (Mr-fangao) → 创建 `cesium-learn-v2` 仓库
- Vue 3.5 + Vite 8 + TS 6 + Pinia 3 + Naive UI + Tailwind v4 + Cesium 1.111

### 样式 & 布局
- 首页：Hero 渐变背景 + 三栏卡片 (6:3:1 grid) + 动画入场 + 学习阶段时间轴
- 布局：从 Naive UI 布局组件迁移到纯 CSS flex（因高度链断裂）
- 统一 `h-12` header：侧栏 Logo 和 Demo 顶栏对齐
- 语义类名：`.app-shell` / `.app-sider` / `.app-main` / `.demo-page` / `.demo-header` / `.demo-stage` / `.nav-item--active`

### Cesium 集成
- Cesium 1.111 全局 IIFE 加载 → `window.Cesium`
- 静态资源通过 `vite-plugin-static-copy` 复制到 `/Cesium/`
- 必须在 Cesium.js 前设 `window.CESIUM_BASE_URL = '/Cesium/'`
- 默认底图 OpenStreetMap（免费），避免内置 Ion Token 过期 401
- CesiumViewer 组件：`imagery` / `terrain` / `initialPosition` props + `@ready` emit

### Bug 追踪史
1. 地球不显示 → OSM URL 格式错误 → 改用 Cesium 内置默认 URL
2. Canvas 不填充 → 容器高度塌陷 → ResizeObserver + forceHeight
3. 首页卡片无法左右滚动 → `overflow-y-auto` → `overflow-auto`
4. 侧栏不到底 → Naive UI wrapper 阻断 → 放弃 NLayout，纯 CSS flex
5. 路由跳转后地球消失 → 排查 5 轮 → **根因：`<transition>` 导致 WebGL 失败** → 去掉 transition

### 清理
- 删除 `useCesium.ts`（被 CesiumViewer 替代）
- 删除 `DemoIndex.vue`（路由拍平）
- 删除 `.page-fade-*` 过渡 CSS
- 修复 `ref()` 变量名与模板不匹配的 bug
- HelloCesium 枚举值硬编码（避免可选链脆弱性）
