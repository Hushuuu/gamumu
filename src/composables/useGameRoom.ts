import { ref } from 'vue'
import {
  isServerMessage,
  type ClientMessage,
  type GameEvent,
  type RoomSnapshot,
} from '../../shared/protocol'
import { ApiError, createWebSocketUrl, getBetaSession } from '../services/api'

export type ConnectionStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting'

export function useGameRoom() {
  const snapshot = ref<RoomSnapshot | null>(null)
  const connectionStatus = ref<ConnectionStatus>('offline')
  const errorMessage = ref('')
  const gameEvent = ref<GameEvent | null>(null)
  const playerId = ref('')
  const removedFromRoom = ref(false)
  const betaAccessExpired = ref(false)

  let socket: WebSocket | null = null
  let reconnectTimer: number | undefined
  let reconnectAttempts = 0
  let activeCode = ''
  let activeToken = ''
  let activeBetaToken = ''
  let manuallyDisconnected = false
  let stopReconnecting = false
  let pendingLeave: (() => void) | null = null

  function connect(code: string, token: string, betaToken: string): void {
    disconnect()
    activeCode = code
    activeToken = token
    activeBetaToken = betaToken
    betaAccessExpired.value = false
    manuallyDisconnected = false
    stopReconnecting = false
    reconnectAttempts = 0
    errorMessage.value = ''
    void openSocket(false)
  }

  function disconnect(): void {
    manuallyDisconnected = true
    stopReconnecting = true
    clearReconnectTimer()
    const current = socket
    socket = null
    current?.close(1000, 'Client disconnected')
    snapshot.value = null
    gameEvent.value = null
    playerId.value = ''
    connectionStatus.value = 'offline'
    removedFromRoom.value = false
    activeCode = ''
    activeToken = ''
    activeBetaToken = ''
  }

  function send(message: ClientMessage): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN || connectionStatus.value !== 'connected') {
      errorMessage.value = '目前尚未連線，請稍候再試。'
      return false
    }

    socket.send(JSON.stringify(message))
    errorMessage.value = ''
    return true
  }

  async function leaveRoom(): Promise<void> {
    const current = socket
    if (!current || current.readyState !== WebSocket.OPEN || connectionStatus.value !== 'connected') {
      disconnect()
      return
    }

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        pendingLeave = null
        resolve()
      }, 1_000)
      pendingLeave = () => {
        window.clearTimeout(timeout)
        pendingLeave = null
        resolve()
      }
      current.send(JSON.stringify({ type: 'leave_room' } satisfies ClientMessage))
    })
    disconnect()
  }

  async function openSocket(isReconnect: boolean): Promise<void> {
    if (!activeCode || !activeToken || !activeBetaToken || manuallyDisconnected || stopReconnecting) {
      return
    }

    connectionStatus.value = isReconnect ? 'reconnecting' : 'connecting'
    try {
      await getBetaSession(activeBetaToken)
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'BETA_ACCESS_REQUIRED' || error.code === 'BETA_NOT_CONFIGURED')
      ) {
        betaAccessExpired.value = true
        stopReconnecting = true
        connectionStatus.value = 'offline'
        errorMessage.value = error.message
        return
      }

      errorMessage.value = '無法確認資格，正在重新嘗試。'
      connectionStatus.value = 'reconnecting'
      scheduleReconnect()
      return
    }

    if (!activeCode || !activeToken || !activeBetaToken || manuallyDisconnected || stopReconnecting) {
      return
    }

    try {
      const current = new WebSocket(
        createWebSocketUrl(activeCode),
        ['gamumu-beta', `gamumu-beta.${activeBetaToken}`],
      )
      socket = current

      current.addEventListener('open', () => {
        current.send(JSON.stringify({ type: 'authenticate', token: activeToken }))
      })

      current.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'string') {
          errorMessage.value = '收到無法辨識的房間訊息。'
          return
        }

        let payload: unknown
        try {
          payload = JSON.parse(event.data)
        } catch {
          errorMessage.value = '收到無法辨識的房間訊息。'
          return
        }

        if (!isServerMessage(payload)) {
          errorMessage.value = '收到不支援的房間訊息。'
          return
        }

        switch (payload.type) {
          case 'auth_required':
            return
          case 'authenticated':
            playerId.value = payload.playerId
            connectionStatus.value = 'connected'
            reconnectAttempts = 0
            errorMessage.value = ''
            return
          case 'auth_error':
            errorMessage.value = payload.message
            if (payload.code === 'BETA_ACCESS_REQUIRED') {
              betaAccessExpired.value = true
            }
            stopReconnecting = true
            current.close(4401, 'Authentication failed')
            return
          case 'state': {
            snapshot.value = payload.state
            if (payload.state.status !== 'playing') {
              gameEvent.value = null
            }
            return
          }
          case 'game_event':
            if (
              snapshot.value?.status === 'playing' &&
              payload.gameId === snapshot.value.selectedGameId
            ) {
              gameEvent.value = payload
            }
            return
          case 'guess_result':
            return
          case 'action_error':
            errorMessage.value = payload.message
            return
          case 'kicked':
            errorMessage.value = payload.message
            removedFromRoom.value = true
            snapshot.value = null
            stopReconnecting = true
            current.close(4403, 'Removed by host')
            return
          case 'left_room':
            pendingLeave?.()
            return
          case 'room_expired':
            errorMessage.value = '房間已超過閒置期限，請重新建立房間。'
            stopReconnecting = true
            current.close(4404, 'Room expired')
        }
      })

      current.addEventListener('close', (event) => {
        if (socket !== current) {
          return
        }
        socket = null

        if (manuallyDisconnected || stopReconnecting) {
          connectionStatus.value = 'offline'
          return
        }

        if (event.code === 4401 || event.code === 4404) {
          stopReconnecting = true
          connectionStatus.value = 'offline'
          if (!errorMessage.value) {
            errorMessage.value = event.code === 4404
              ? '找不到這個房間，房間可能已經結束。'
              : '房間連線憑證無效，請重新加入。'
          }
          return
        }

        if (event.code === 4403) {
          stopReconnecting = true
          removedFromRoom.value = true
          snapshot.value = null
          connectionStatus.value = 'offline'
          if (!errorMessage.value) {
            errorMessage.value = '房主已將你移出房間。'
          }
          return
        }

        connectionStatus.value = 'reconnecting'
        scheduleReconnect()
      })

      current.addEventListener('error', () => {
        if (socket === current && connectionStatus.value === 'connecting') {
          errorMessage.value = '暫時無法連線，正在重新嘗試。'
        }
      })
    } catch {
      connectionStatus.value = 'offline'
      stopReconnecting = true
      errorMessage.value = '無法建立 WebSocket 連線，請檢查 API 網址設定。'
    }
  }

  function scheduleReconnect(): void {
    clearReconnectTimer()
    reconnectAttempts += 1
    const delay = Math.min(1_000 * 2 ** Math.min(reconnectAttempts - 1, 4), 15_000)
    reconnectTimer = window.setTimeout(() => openSocket(true), delay)
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
  }

  return {
    snapshot,
    connectionStatus,
    errorMessage,
    gameEvent,
    playerId,
    removedFromRoom,
    betaAccessExpired,
    connect,
    disconnect,
    send,
    leaveRoom,
  }
}
