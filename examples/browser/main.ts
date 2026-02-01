/**
 * VOICEVOX Client - ブラウザExample
 *
 * ブラウザ上でvoicevox-clientを使用して音声を再生するデモ
 * - 再生モード切替 (即時/キュー)
 * - 待機オプション
 * - キュー管理
 */
import { VoicevoxClient } from '@kajidog/voicevox-client'

// DOM要素
const voicevoxUrlInput = document.getElementById('voicevox-url') as HTMLInputElement
const speakerSelect = document.getElementById('speaker') as HTMLSelectElement
const speedInput = document.getElementById('speed') as HTMLInputElement
const speedValue = document.getElementById('speed-value') as HTMLSpanElement
const textArea = document.getElementById('text') as HTMLTextAreaElement
const speakButton = document.getElementById('speak-btn') as HTMLButtonElement
const stopButton = document.getElementById('stop-btn') as HTMLButtonElement
const clearQueueButton = document.getElementById('clear-queue-btn') as HTMLButtonElement
const addSampleButton = document.getElementById('add-sample-btn') as HTMLButtonElement
const statusDiv = document.getElementById('status') as HTMLDivElement
const modeImmediateBtn = document.getElementById('mode-immediate') as HTMLButtonElement
const modeQueueBtn = document.getElementById('mode-queue') as HTMLButtonElement
const waitStartCheckbox = document.getElementById('wait-start') as HTMLInputElement
const waitEndCheckbox = document.getElementById('wait-end') as HTMLInputElement
const queueCountSpan = document.getElementById('queue-count') as HTMLSpanElement
const queueItemsDiv = document.getElementById('queue-items') as HTMLDivElement

// 状態
let client: VoicevoxClient | null = null
let isImmediateMode = true

// サンプルテキスト
const sampleTexts = [
  'おはようございます。今日も一日頑張りましょう。',
  'これはキュー機能のテストです。複数のテキストを順番に再生できます。',
  'VOICEVOXは無料で使える音声合成エンジンです。',
  '天気予報によると、明日は晴れるそうです。',
  'プログラミングは楽しいですね。',
]

/**
 * ステータス表示を更新
 */
function showStatus(message: string, type: 'info' | 'success' | 'error') {
  statusDiv.textContent = message
  statusDiv.className = `status visible ${type}`
}

/**
 * ステータスをクリア
 */
function clearStatus() {
  statusDiv.className = 'status'
}

/**
 * ローディング状態を表示
 */
function showLoading(message: string) {
  statusDiv.innerHTML = `<span class="loading"></span>${message}`
  statusDiv.className = 'status visible info'
}

/**
 * クライアントを初期化
 */
async function initClient(): Promise<VoicevoxClient | null> {
  const url = voicevoxUrlInput.value.trim()
  if (!url) {
    showStatus('VOICEVOX Engine URLを入力してください', 'error')
    return null
  }

  try {
    client = new VoicevoxClient({
      url,
      defaultSpeaker: 1,
      defaultSpeedScale: 1.0,
    })
    return client
  } catch (error) {
    showStatus(`クライアントの初期化に失敗しました: ${error}`, 'error')
    return null
  }
}

/**
 * 話者リストを読み込み
 */
async function loadSpeakers() {
  showLoading('話者リストを読み込み中...')

  const c = await initClient()
  if (!c) return

  try {
    const speakers = await c.getSpeakers()

    // ドロップダウンをクリア
    speakerSelect.innerHTML = ''

    // 話者をドロップダウンに追加
    for (const speaker of speakers) {
      for (const style of speaker.styles) {
        const option = document.createElement('option')
        option.value = String(style.id)
        option.textContent = `${speaker.name} (${style.name})`
        speakerSelect.appendChild(option)
      }
    }

    clearStatus()
    showStatus(`${speakers.length}人の話者を読み込みました`, 'success')

    // 3秒後にステータスをクリア
    setTimeout(clearStatus, 3000)

    // キュー状態の更新を開始
    startQueueMonitor()
  } catch (error) {
    showStatus(`話者リストの読み込みに失敗しました: ${error}`, 'error')
    speakerSelect.innerHTML = '<option value="">エラー</option>'
  }
}

/**
 * 音声を再生
 */
async function speak() {
  const text = textArea.value.trim()
  if (!text) {
    showStatus('テキストを入力してください', 'error')
    return
  }

  const speaker = Number(speakerSelect.value)
  const speed = Number(speedInput.value)
  const waitForStart = waitStartCheckbox.checked
  const waitForEnd = waitEndCheckbox.checked

  // ボタンを無効化
  speakButton.disabled = true
  showLoading('音声を生成中...')

  try {
    // クライアントがない場合のみ初期化
    if (!client) {
      const c = await initClient()
      if (!c) {
        speakButton.disabled = false
        return
      }
    }

    showLoading(isImmediateMode ? '再生中...' : 'キューに追加中...')

    const result = await client!.speak(text, {
      speaker,
      speedScale: speed,
      immediate: isImmediateMode,
      waitForStart,
      waitForEnd,
    })

    if (result.status === 'error') {
      showStatus(`エラー: ${result.errorMessage}`, 'error')
    } else {
      const modeText = isImmediateMode ? '即時再生' : 'キュー追加'
      showStatus(`${modeText}完了 (${result.mode})`, 'success')
      setTimeout(clearStatus, 3000)
    }
  } catch (error) {
    showStatus(`再生エラー: ${error}`, 'error')
  } finally {
    speakButton.disabled = false
    updateQueueDisplay()
  }
}

/**
 * 再生を停止
 */
async function stopPlayback() {
  if (!client) {
    showStatus('クライアントが初期化されていません', 'error')
    return
  }

  try {
    await client.clearQueue()
    showStatus('再生を停止しました', 'info')
    setTimeout(clearStatus, 3000)
    updateQueueDisplay()
  } catch (error) {
    showStatus(`停止エラー: ${error}`, 'error')
  }
}

/**
 * キューをクリア
 */
async function clearQueue() {
  if (!client) {
    showStatus('クライアントが初期化されていません', 'error')
    return
  }

  try {
    await client.clearQueue()
    showStatus('キューをクリアしました', 'info')
    setTimeout(clearStatus, 3000)
    updateQueueDisplay()
  } catch (error) {
    showStatus(`クリアエラー: ${error}`, 'error')
  }
}

/**
 * サンプルテキストを追加
 */
async function addSampleText() {
  // ランダムなサンプルテキストを選択
  const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)]
  const speaker = Number(speakerSelect.value)
  const speed = Number(speedInput.value)

  if (!client) {
    const c = await initClient()
    if (!c) return
  }

  try {
    showLoading('サンプルをキューに追加中...')

    await client!.speak(randomText, {
      speaker,
      speedScale: speed,
      immediate: false, // キューモードで追加
      waitForStart: false,
      waitForEnd: false,
    })

    showStatus('サンプルをキューに追加しました', 'success')
    setTimeout(clearStatus, 2000)
    updateQueueDisplay()
  } catch (error) {
    showStatus(`追加エラー: ${error}`, 'error')
  }
}

/**
 * キュー表示を更新
 */
function updateQueueDisplay() {
  if (!client) {
    queueCountSpan.textContent = '0'
    queueItemsDiv.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">キューは空です</div>'
    return
  }

  const queueLength = client.getQueueLength()
  queueCountSpan.textContent = String(queueLength)

  if (queueLength === 0) {
    queueItemsDiv.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">キューは空です</div>'
  } else {
    const queue = client.getQueueService().getQueue()
    queueItemsDiv.innerHTML = queue
      .slice(0, 10) // 最大10件表示
      .map((item) => {
        const statusClass = item.status.toLowerCase()
        const statusText = getStatusText(item.status)
        const text = item.text.length > 30 ? `${item.text.substring(0, 30)}...` : item.text
        return `
        <div class="queue-item">
          <span class="queue-item-text">${escapeHtml(text)}</span>
          <span class="queue-item-status ${statusClass}">${statusText}</span>
        </div>
      `
      })
      .join('')

    if (queueLength > 10) {
      queueItemsDiv.innerHTML += `<div style="color: var(--text-muted); font-size: 0.75rem; text-align: center; margin-top: 4px;">...他 ${queueLength - 10} 件</div>`
    }
  }
}

/**
 * ステータステキストを取得
 */
function getStatusText(status: string): string {
  switch (status) {
    case 'PENDING':
      return '待機中'
    case 'GENERATING':
      return '生成中'
    case 'READY':
      return '準備完了'
    case 'PLAYING':
      return '再生中'
    case 'COMPLETED':
      return '完了'
    case 'ERROR':
      return 'エラー'
    default:
      return status
  }
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * モード切替
 */
function setMode(immediate: boolean) {
  isImmediateMode = immediate
  modeImmediateBtn.classList.toggle('active', immediate)
  modeQueueBtn.classList.toggle('active', !immediate)
}

/**
 * 速度スライダーの値を更新
 */
function updateSpeedValue() {
  speedValue.textContent = `${speedInput.value}x`
}

/**
 * キュー監視を開始
 */
let queueMonitorInterval: number | null = null

function startQueueMonitor() {
  if (queueMonitorInterval) {
    clearInterval(queueMonitorInterval)
  }
  queueMonitorInterval = window.setInterval(updateQueueDisplay, 500)
}

// イベントリスナーを設定
speakButton.addEventListener('click', speak)
stopButton.addEventListener('click', stopPlayback)
clearQueueButton.addEventListener('click', clearQueue)
addSampleButton.addEventListener('click', addSampleText)
speedInput.addEventListener('input', updateSpeedValue)
modeImmediateBtn.addEventListener('click', () => setMode(true))
modeQueueBtn.addEventListener('click', () => setMode(false))

// URL変更時に話者リストを再読み込み
voicevoxUrlInput.addEventListener('change', loadSpeakers)

// エンターキーで再生
textArea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault()
    speak()
  }
})

// 初期化
loadSpeakers()
