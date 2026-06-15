<script setup lang="ts">
/**
 * TutorialModal — 可复用教程弹窗
 *
 * 用法：
 *   <TutorialModal v-model:visible="showTutorial" title="Primitive 教程">
 *     <p>你的教程内容...</p>
 *   </TutorialModal>
 *
 * 特性：ESC 关闭、点击遮罩关闭、深色主题、滚动内容区
 */

import { watch, nextTick, ref, onUnmounted } from 'vue'

const props = defineProps<{
  visible: boolean
  title: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

// 动画状态 — 解决 Transition+Teleport 的 DOM 泄漏问题
// 方案: v-show 保证元素永不从 DOM 移除 + nextTick 驱动 CSS transition
const animated = ref(false)

function close() {
  // 先触发 fade-out 动画
  animated.value = false
  // 等 transition 完成 (200ms) 再收 v-show
  setTimeout(() => {
    emit('update:visible', false)
  }, 200)
}

function onOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('tutorial-overlay')) {
    close()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

// 打开: visible → true 立即显示 + nextTick 触发 fade-in
// 关闭: 先触发 fade-out → 200ms 后 visible → false
watch(() => props.visible, (v) => {
  if (v) {
    document.addEventListener('keydown', onKeydown)
    document.body.style.overflow = 'hidden'
    nextTick(() => { animated.value = true })
  } else {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
    animated.value = false
  }
})

// 防御: 组件卸载时弹窗仍开着 → 强制清理全局副作用
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <!-- v-show 替代 v-if: 元素永不移除，避免 Transition+Teleport DOM 泄漏 -->
    <div
      v-show="visible"
      class="tutorial-overlay"
      :class="{ 'tutorial-overlay--in': animated }"
      @click="onOverlayClick"
    >
      <div
        class="tutorial-panel"
        :class="{ 'tutorial-panel--in': animated }"
        role="dialog"
        aria-modal="true"
      >
        <!-- 标题栏 -->
        <div class="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 class="text-base font-semibold text-white">{{ title }}</h2>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            @click="close"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <!-- 内容区 — 可滚动 -->
        <div class="flex-1 overflow-y-auto px-6 py-5 text-sm text-zinc-300 leading-relaxed space-y-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ---------- 遮罩 ---------- */
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.6);
  backdrop-filter: blur(4px);
  padding: 1rem;
  /* 默认隐藏状态 — 由 v-show 切换 display:block/none */
  opacity: 0;
  transition: opacity 0.2s ease;
}
.tutorial-overlay--in {
  opacity: 1;
}

/* ---------- 面板 ---------- */
.tutorial-panel {
  width: 100%;
  max-width: 48rem;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: #18181b;
  border: 1px solid rgb(63 63 70 / 0.5);
  border-radius: 1rem;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.8);
  opacity: 0;
  transform: scale(0.95) translateY(12px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.tutorial-panel--in {
  opacity: 1;
  transform: scale(1) translateY(0);
}

/* ---------- 内容排版 ---------- */
.tutorial-panel :deep(h3) {
  font-size: 0.95rem;
  font-weight: 600;
  color: #a5b4fc;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}
.tutorial-panel :deep(h3:first-child) {
  margin-top: 0;
}
.tutorial-panel :deep(code) {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
  background: #27272a;
  padding: 1px 5px;
  border-radius: 4px;
  color: #fbbf24;
}
.tutorial-panel :deep(pre) {
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  padding: 12px 16px;
  overflow-x: auto;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.78rem;
  line-height: 1.6;
  color: #d4d4d8;
}
.tutorial-panel :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}
.tutorial-panel :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
}
.tutorial-panel :deep(li) {
  margin-bottom: 0.25rem;
}
.tutorial-panel :deep(strong) {
  color: #e4e4e7;
}
</style>
