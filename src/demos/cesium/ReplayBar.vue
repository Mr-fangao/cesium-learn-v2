<script setup lang="ts">
/**
 * ReplayBar — 底部回放控制栏
 *
 * 道具/事件纯数据流，不持有任何状态（状态在父组件 ReplayController 中）。
 * 样式: 暗色玻璃面板，居中覆盖在 demo-stage 底部。
 */

import { computed } from 'vue'
import { Play, Pause, RotateCcw, SkipForward } from '@lucide/vue'

const props = defineProps<{
  time: number
  totalDuration: number
  playing: boolean
  speed: number
}>()

const emit = defineEmits<{
  seek: [time: number]
  togglePlay: []
  restart: []
  setSpeed: [speed: number]
}>()

const SPEEDS = [0.5, 1, 2, 5, 10]

const sliderValue = computed({
  get: () => props.time,
  set: (v: number) => emit('seek', v),
})

const timeDisplay = computed(() => {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${fmt(props.time)} / ${fmt(props.totalDuration)}`
})

const hasData = computed(() => props.totalDuration > 0)
</script>

<template>
  <div
    v-if="hasData"
    class="replay-bar"
  >
    <!-- 重新开始 -->
    <button
      class="rb-btn"
      title="重新开始"
      @click="emit('restart')"
    >
      <RotateCcw :size="16" />
    </button>

    <!-- 播放/暂停 -->
    <button
      class="rb-btn rb-btn-play"
      :title="playing ? '暂停' : '播放'"
      @click="emit('togglePlay')"
    >
      <Pause v-if="playing" :size="16" />
      <Play v-else :size="16" class="ml-0.5" />
    </button>

    <!-- 时间轴滑块 -->
    <div class="rb-slider-wrap">
      <input
        v-model.number="sliderValue"
        type="range"
        class="rb-slider"
        :min="0"
        :max="totalDuration"
        :step="1"
      />
    </div>

    <!-- 时间显示 -->
    <span class="rb-time">{{ timeDisplay }}</span>

    <!-- 速度切换 -->
    <div class="rb-speeds">
      <button
        v-for="s in SPEEDS"
        :key="s"
        class="rb-speed-btn"
        :class="{ active: speed === s }"
        @click="emit('setSpeed', s)"
      >{{ s }}x</button>
    </div>

    <!-- 跳到末尾 -->
    <button
      class="rb-btn"
      title="跳到末尾"
      @click="emit('seek', totalDuration)"
    >
      <SkipForward :size="16" />
    </button>
  </div>

  <!-- 无数据状态 -->
  <div v-else class="replay-bar replay-bar--empty">
    <span class="text-zinc-500 text-xs">暂无回放数据</span>
  </div>
</template>

<style scoped>
/* —— 回放栏容器 —— */
.replay-bar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  z-index: 20;
  pointer-events: auto;
  max-width: calc(100vw - 40px);
}

.replay-bar--empty {
  padding: 8px 24px;
}

/* —— 按钮 —— */
.rb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #d4d4d8;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.rb-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.rb-btn-play {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.3);
}

.rb-btn-play:hover {
  background: rgba(99, 102, 241, 0.5);
}

/* —— 滑动条 —— */
.rb-slider-wrap {
  flex: 1;
  min-width: 120px;
  max-width: 400px;
}

.rb-slider {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.rb-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #818cf8;
  border: 2px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
}

.rb-slider::-webkit-slider-thumb:hover {
  background: #a5b4fc;
}

.rb-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #818cf8;
  border: 2px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
}

/* —— 时间显示 —— */
.rb-time {
  font-family: monospace;
  font-size: 12px;
  color: #a1a1aa;
  white-space: nowrap;
  user-select: none;
  min-width: 100px;
  text-align: center;
}

/* —— 速度按钮 —— */
.rb-speeds {
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 2px;
}

.rb-speed-btn {
  padding: 2px 7px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #a1a1aa;
  font-size: 11px;
  font-family: monospace;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.rb-speed-btn:hover {
  color: #d4d4d8;
}

.rb-speed-btn.active {
  background: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}
</style>
