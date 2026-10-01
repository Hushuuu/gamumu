<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { GameEvent } from '../../../shared/protocol'

type DrawTool = 'pen' | 'eraser'
type DrawPoint = [number, number]

const props = defineProps<{
  canDraw: boolean
  gameEvent: GameEvent | null
  turnNumber: number
}>()

const emit = defineEmits<{
  'game-action': [action: string, payload: Record<string, unknown>]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const tool = ref<DrawTool>('pen')
const remoteLastPoints = new Map<string, DrawPoint>()

let resizeObserver: ResizeObserver | undefined
let activePointerId: number | null = null
let activeStrokeId = ''
let activeStrokeTool: DrawTool = 'pen'
let activeStrokeWidth = 4
let localLastPoint: DrawPoint | null = null
let pendingPoints: DrawPoint[] = []
let startsStroke = false
let flushTimer: number | undefined

watch(() => props.turnNumber, () => {
  if (activePointerId !== null) {
    cancelStroke()
  }
  clearCanvas()
})
watch(() => props.gameEvent, applyGameEvent)
watch(() => props.canDraw, (canDraw) => {
  if (!canDraw && activePointerId !== null) {
    cancelStroke()
  }
})

onMounted(() => {
  const element = canvas.value
  if (!element) {
    return
  }

  resizeObserver = new ResizeObserver(resizeCanvas)
  resizeObserver.observe(element)
  resizeCanvas()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (flushTimer !== undefined) {
    window.clearInterval(flushTimer)
  }
})

function resizeCanvas(): void {
  const element = canvas.value
  if (!element) {
    return
  }

  const bounds = element.getBoundingClientRect()
  if (bounds.width === 0 || bounds.height === 0) {
    return
  }

  const ratio = window.devicePixelRatio || 1
  const width = Math.round(bounds.width * ratio)
  const height = Math.round(bounds.height * ratio)
  if (element.width === width && element.height === height) {
    return
  }

  const previous = document.createElement('canvas')
  previous.width = element.width
  previous.height = element.height
  if (previous.width > 0 && previous.height > 0) {
    previous.getContext('2d')?.drawImage(element, 0, 0)
  }

  element.width = width
  element.height = height
  const context = element.getContext('2d')
  if (!context) {
    return
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  if (previous.width > 0 && previous.height > 0) {
    context.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, bounds.width, bounds.height)
  }
}

function clearCanvas(): void {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context) {
    return
  }

  const bounds = element.getBoundingClientRect()
  context.clearRect(0, 0, bounds.width, bounds.height)
  remoteLastPoints.clear()
  localLastPoint = null
}

function cancelStroke(): void {
  if (flushTimer !== undefined) {
    window.clearInterval(flushTimer)
    flushTimer = undefined
  }
  activePointerId = null
  activeStrokeId = ''
  localLastPoint = null
  pendingPoints = []
  startsStroke = false
}

function normalizedPoint(event: PointerEvent): DrawPoint | null {
  const element = canvas.value
  if (!element) {
    return null
  }
  const bounds = element.getBoundingClientRect()
  if (bounds.width === 0 || bounds.height === 0) {
    return null
  }
  const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
  const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  return [x, y]
}

function drawPoint(point: DrawPoint, previous: DrawPoint | null, selectedTool: DrawTool, width: number): void {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context) {
    return
  }

  const bounds = element.getBoundingClientRect()
  const x = point[0] * bounds.width
  const y = point[1] * bounds.height
  context.save()
  context.globalCompositeOperation = selectedTool === 'eraser' ? 'destination-out' : 'source-over'
  context.strokeStyle = '#302d42'
  context.fillStyle = '#302d42'
  context.lineWidth = width
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  if (previous) {
    context.moveTo(previous[0] * bounds.width, previous[1] * bounds.height)
    context.lineTo(x, y)
    context.stroke()
  } else {
    context.arc(x, y, width / 2, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function startStroke(event: PointerEvent): void {
  if (!props.canDraw || event.button !== 0 || activePointerId !== null) {
    return
  }

  const element = canvas.value
  const point = normalizedPoint(event)
  if (!element || !point) {
    return
  }

  activePointerId = event.pointerId
  element.setPointerCapture(event.pointerId)
  activeStrokeId = crypto.randomUUID()
  activeStrokeTool = tool.value
  activeStrokeWidth = activeStrokeTool === 'eraser' ? 24 : 4
  localLastPoint = null
  pendingPoints = []
  startsStroke = true
  addPoint(point)
  flushTimer = window.setInterval(() => flushPoints(false), 50)
}

function moveStroke(event: PointerEvent): void {
  if (!props.canDraw || event.pointerId !== activePointerId) {
    return
  }

  const coalesced = event.getCoalescedEvents?.() ?? []
  for (const pointerEvent of coalesced.length > 0 ? coalesced : [event]) {
    const point = normalizedPoint(pointerEvent)
    if (point) {
      addPoint(point)
    }
  }
}

function addPoint(point: DrawPoint): void {
  drawPoint(point, localLastPoint, activeStrokeTool, activeStrokeWidth)
  localLastPoint = point
  pendingPoints.push(point)
}

function finishStroke(event?: PointerEvent): void {
  if (event && event.pointerId !== activePointerId) {
    return
  }
  if (activePointerId === null) {
    return
  }

  if (event) {
    const point = normalizedPoint(event)
    if (point) {
      addPoint(point)
    }
  }
  if (pendingPoints.length === 0 && localLastPoint) {
    pendingPoints.push(localLastPoint)
  }
  if (flushTimer !== undefined) {
    window.clearInterval(flushTimer)
    flushTimer = undefined
  }
  flushPoints(true)
  activePointerId = null
  activeStrokeId = ''
  localLastPoint = null
}

function flushPoints(endsStroke: boolean): void {
  if (!activeStrokeId || pendingPoints.length === 0) {
    return
  }

  let isFirstChunk = true
  while (pendingPoints.length > 0) {
    const points = pendingPoints.splice(0, 24)
    emit('game-action', 'stroke', {
      strokeId: activeStrokeId,
      tool: activeStrokeTool,
      width: activeStrokeWidth,
      points,
      startsStroke: startsStroke && isFirstChunk,
      endsStroke: endsStroke && pendingPoints.length === 0,
    })
    isFirstChunk = false
  }
  startsStroke = false
}

function applyGameEvent(event: GameEvent | null): void {
  if (event?.gameId !== 'draw-guess' || event.event !== 'stroke') {
    return
  }

  const { strokeId, tool: selectedTool, width, points, startsStroke: begins, endsStroke: ends } = event.payload
  if (
    typeof strokeId !== 'string' ||
    (selectedTool !== 'pen' && selectedTool !== 'eraser') ||
    typeof width !== 'number' ||
    !Array.isArray(points) ||
    !points.every(isDrawPoint) ||
    typeof begins !== 'boolean' ||
    typeof ends !== 'boolean'
  ) {
    return
  }

  let previous = begins ? null : remoteLastPoints.get(strokeId) ?? null
  for (const point of points) {
    drawPoint(point, previous, selectedTool, width)
    previous = point
  }

  if (ends) {
    remoteLastPoints.delete(strokeId)
  } else if (previous) {
    remoteLastPoints.set(strokeId, previous)
  }
}

function isDrawPoint(value: unknown): value is DrawPoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= 0 &&
    value[0] <= 1 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= 0 &&
    value[1] <= 1
  )
}
</script>

<template>
  <div class="draw-board">
    <div class="draw-toolbar">
      <div class="draw-tools" role="group" aria-label="繪圖工具">
        <button
          class="draw-tool-button"
          :class="{ 'is-selected': tool === 'pen' }"
          type="button"
          :disabled="!canDraw"
          :aria-pressed="tool === 'pen'"
          @click="tool = 'pen'"
        >
          ✎ 畫筆
        </button>
        <button
          class="draw-tool-button"
          :class="{ 'is-selected': tool === 'eraser' }"
          type="button"
          :disabled="!canDraw"
          :aria-pressed="tool === 'eraser'"
          @click="tool = 'eraser'"
        >
          ▱ 橡皮擦
        </button>
      </div>
      <span class="draw-board-hint">{{ canDraw ? '在畫布上繪圖' : '等待繪圖者' }}</span>
    </div>
    <div class="draw-canvas-frame">
      <canvas
        ref="canvas"
        class="draw-canvas"
        aria-label="你畫我猜繪圖畫布"
        @pointerdown="startStroke"
        @pointermove="moveStroke"
        @pointerup="finishStroke"
        @pointercancel="finishStroke"
      ></canvas>
    </div>
  </div>
</template>

<style scoped>
.draw-board {
  margin-top: 12px;
}

.draw-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.draw-tools {
  display: flex;
  gap: 6px;
}

.draw-tool-button {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #e7e4f0;
  border-radius: 9px;
  background: #fff;
  color: #77738e;
  font-size: 9px;
  font-weight: 700;
}

.draw-tool-button.is-selected {
  border-color: #a79af1;
  background: #f1efff;
  color: var(--purple-dark);
}

.draw-tool-button:disabled {
  cursor: default;
}

.draw-board-hint {
  color: #9692a7;
  font-size: 9px;
}

.draw-canvas-frame {
  position: relative;
  width: 100%;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  border: 1px solid #e6e3ef;
  border-radius: 13px;
  background: #fff;
  box-shadow: inset 0 1px 3px rgba(48, 45, 66, 0.04);
}

.draw-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}
</style>
