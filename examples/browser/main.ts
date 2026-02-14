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
const prefetchSizeInput = document.getElementById('prefetch-size') as HTMLInputElement
const textArea = document.getElementById('text') as HTMLTextAreaElement
const speakButton = document.getElementById('speak-btn') as HTMLButtonElement
const stopButton = document.getElementById('stop-btn') as HTMLButtonElement
const addSampleButton = document.getElementById('add-sample-btn') as HTMLButtonElement
const statusDiv = document.getElementById('status') as HTMLDivElement
const modeImmediateBtn = document.getElementById('mode-immediate') as HTMLButtonElement
const modeQueueBtn = document.getElementById('mode-queue') as HTMLButtonElement
const waitStartCheckbox = document.getElementById('wait-start') as HTMLInputElement
const waitEndCheckbox = document.getElementById('wait-end') as HTMLInputElement
const queueCountSpan = document.getElementById('queue-count') as HTMLSpanElement
const queueItemsDiv = document.getElementById('queue-items') as HTMLDivElement
const reloadBtn = document.getElementById('reload-btn') as HTMLButtonElement
const queueOnlyElements = document.querySelectorAll('.queue-only') as NodeListOf<HTMLElement>

// 新規パラメータDOM要素
const pitchInput = document.getElementById('pitch') as HTMLInputElement
const pitchValue = document.getElementById('pitch-value') as HTMLSpanElement
const intonationInput = document.getElementById('intonation') as HTMLInputElement
const intonationValue = document.getElementById('intonation-value') as HTMLSpanElement
const volumeInput = document.getElementById('volume') as HTMLInputElement
const volumeValue = document.getElementById('volume-value') as HTMLSpanElement
const prePhonemeInput = document.getElementById('pre-phoneme') as HTMLInputElement
const prePhonemeValue = document.getElementById('pre-phoneme-value') as HTMLSpanElement
const postPhonemeInput = document.getElementById('post-phoneme') as HTMLInputElement
const postPhonemeValue = document.getElementById('post-phoneme-value') as HTMLSpanElement

// 新規DOM要素（接続状態・キャラクタープレビュー）
const statusIndicator = document.getElementById('status-indicator') as HTMLSpanElement
const connectionText = document.getElementById('connection-text') as HTMLSpanElement
const settingsLink = document.getElementById('settings-link') as HTMLAnchorElement
const corsInstructions = document.getElementById('cors-instructions') as HTMLDetailsElement
const currentOriginCode = document.getElementById('current-origin') as HTMLElement
const copyOriginBtn = document.getElementById('copy-origin-btn') as HTMLButtonElement
const characterImage = document.getElementById('character-image') as HTMLImageElement
const corsSettingsLink = document.getElementById('cors-settings-link') as HTMLAnchorElement

// 状態
let client: VoicevoxClient | null = null
let isImmediateMode = true
let speakersData: any[] = [] // 話者情報をキャッシュ
const speakerIconCache: Map<number, string> = new Map() // スピーカーアイコンキャッシュ

// 現在のオリジンを表示
if (currentOriginCode) {
  currentOriginCode.textContent = window.location.origin
}

// サンプルテキスト
const sampleTexts = [
  'おはようございます。今日も一日頑張りましょう。',
  'これはキュー機能のテストです。複数のテキストを順番に再生できます。',
  'VOICEVOXは無料で使える音声合成エンジンです。',
  '天気予報によると、明日は晴れるそうです。',
  'プログラミングは楽しいですね。',
]

/**
 * スピーカーIDから話者名を取得
 */
function getSpeakerName(speakerId: number): string {
  for (const speaker of speakersData) {
    for (const style of speaker.styles) {
      if (style.id === speakerId) {
        return `${speaker.name} (${style.name})`
      }
    }
  }
  return `話者 ${speakerId}`
}

/**
 * スピーカーIDからスピーカーUUIDを取得
 */
function getSpeakerUuid(speakerId: number): string | null {
  for (const speaker of speakersData) {
    for (const style of speaker.styles) {
      if (style.id === speakerId) {
        return speaker.speaker_uuid
      }
    }
  }
  return null
}

/**
 * スピーカーIDからアイコン（Base64画像URL）を取得
 */
async function getSpeakerIcon(speakerId: number): Promise<string | null> {
  // キャッシュにあればそれを返す
  if (speakerIconCache.has(speakerId)) {
    return speakerIconCache.get(speakerId)!
  }

  if (!client) return null

  const speakerUuid = getSpeakerUuid(speakerId)
  if (!speakerUuid) return null

  try {
    const speakerInfo = await client.getSpeakerInfo(speakerUuid)
    if (speakerInfo && (speakerInfo as any).portrait) {
      const portrait = (speakerInfo as any).portrait as string
      const iconUrl = `data:image/png;base64,${portrait}`
      speakerIconCache.set(speakerId, iconUrl)
      return iconUrl
    }
  } catch {
    // エラー時はnullを返す
  }

  return null
}

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
  const prefetchSize = Number(prefetchSizeInput.value)
  if (!url) {
    showStatus('VOICEVOX Engine URLを入力してください', 'error')
    return null
  }
  if (!Number.isInteger(prefetchSize) || prefetchSize <= 0) {
    showStatus('プリフェッチ件数は1以上の整数で入力してください', 'error')
    return null
  }

  try {
    client = new VoicevoxClient({
      url,
      defaultSpeaker: 1,
      defaultSpeedScale: 1.0,
      prefetchSize,
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
  if (!c) {
    updateConnectionStatus(false)
    return
  }

  try {
    const speakers = await c.getSpeakers()
    speakersData = speakers // キャッシュ
    updateConnectionStatus(true)

    // ドロップダウンをクリア
    speakerSelect.innerHTML = ''

    // 話者をドロップダウンに追加
    for (const speaker of speakers) {
      for (const style of speaker.styles) {
        const option = document.createElement('option')
        option.value = String(style.id)
        option.textContent = `${speaker.name} (${style.name})`
        // speaker_uuidをdata属性として保存
        option.dataset.speakerUuid = speaker.speaker_uuid
        speakerSelect.appendChild(option)
      }
    }

    clearStatus()
    showStatus(`${speakers.length}人の話者を読み込みました`, 'success')

    // 3秒後にステータスをクリア
    setTimeout(clearStatus, 3000)

    // キュー状態の更新を開始
    startQueueMonitor()

    // 最初のキャラクターのプレビューを表示
    await updateCharacterPreview()
  } catch (error) {
    updateConnectionStatus(false)
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
  const pitch = Number(pitchInput.value)
  const intonation = Number(intonationInput.value)
  const volume = Number(volumeInput.value)
  const prePhoneme = Number(prePhonemeInput.value)
  const postPhoneme = Number(postPhonemeInput.value)
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
      pitchScale: pitch,
      intonationScale: intonation,
      volumeScale: volume,
      prePhonemeLength: prePhoneme,
      postPhonemeLength: postPhoneme,
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
  const pitch = Number(pitchInput.value)
  const intonation = Number(intonationInput.value)
  const volume = Number(volumeInput.value)
  const prePhoneme = Number(prePhonemeInput.value)
  const postPhoneme = Number(postPhonemeInput.value)

  if (!client) {
    const c = await initClient()
    if (!c) return
  }

  try {
    showLoading('サンプルをキューに追加中...')

    await client!.speak(randomText, {
      speaker,
      speedScale: speed,
      pitchScale: pitch,
      intonationScale: intonation,
      volumeScale: volume,
      prePhonemeLength: prePhoneme,
      postPhonemeLength: postPhoneme,
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
async function updateQueueDisplay() {
  if (!client) {
    queueCountSpan.textContent = '0'
    queueItemsDiv.innerHTML = '<div class="queue-empty">🔇 キューは空です</div>'
    return
  }

  const queueLength = client.getQueueLength()
  queueCountSpan.textContent = String(queueLength)

  if (queueLength === 0) {
    queueItemsDiv.innerHTML = '<div class="queue-empty">🔇 キューは空です</div>'
  } else {
    const queue = client.getQueueService().getQueue()
    const itemsHtml = await Promise.all(
      queue.slice(0, 10).map(async (item) => {
        const statusClass = item.status.toLowerCase()
        const statusText = getStatusText(item.status)
        const speakerName = getSpeakerName(item.speaker)
        const speakerIcon = await getSpeakerIcon(item.speaker)

        return `
        <div class="queue-item ${statusClass}">
          <div class="queue-item-avatar">
            ${
              speakerIcon
                ? `<img src="${speakerIcon}" alt="${speakerName}" />`
                : '<span class="queue-item-avatar-placeholder">👤</span>'
            }
          </div>
          <div class="queue-item-content">
            <div class="queue-item-header">
              <span class="queue-item-speaker">${escapeHtml(speakerName)}</span>
              <span class="queue-item-status ${statusClass}">${statusText}</span>
              <div class="playing-indicator">
                <div class="playing-indicator-bar"></div>
                <div class="playing-indicator-bar"></div>
                <div class="playing-indicator-bar"></div>
                <div class="playing-indicator-bar"></div>
              </div>
            </div>
            <div class="queue-item-text">${escapeHtml(item.text)}</div>
          </div>
        </div>
      `
      })
    )

    queueItemsDiv.innerHTML = itemsHtml.join('')

    if (queueLength > 10) {
      queueItemsDiv.innerHTML += `<div class="queue-more">...他 ${queueLength - 10} 件</div>`
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
  const showQueueOnly = !immediate
  for (const element of queueOnlyElements) {
    element.style.display = showQueueOnly ? '' : 'none'
  }
}

/**
 * 速度スライダーの値を更新
 */
function updateSpeedValue() {
  speedValue.textContent = `${speedInput.value}x`
}

// パラメータ値の更新
pitchInput.addEventListener('input', () => {
  pitchValue.textContent = Number(pitchInput.value).toFixed(2)
})
intonationInput.addEventListener('input', () => {
  intonationValue.textContent = Number(intonationInput.value).toFixed(1)
})
volumeInput.addEventListener('input', () => {
  volumeValue.textContent = Number(volumeInput.value).toFixed(1)
})
prePhonemeInput.addEventListener('input', () => {
  prePhonemeValue.textContent = Number(prePhonemeInput.value).toFixed(1)
})
postPhonemeInput.addEventListener('input', () => {
  postPhonemeValue.textContent = Number(postPhonemeInput.value).toFixed(1)
})

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
addSampleButton.addEventListener('click', addSampleText)
speedInput.addEventListener('input', updateSpeedValue)
modeImmediateBtn.addEventListener('click', () => setMode(true))
modeQueueBtn.addEventListener('click', () => setMode(false))

// リロードボタンで話者リストを再読み込み
reloadBtn.addEventListener('click', async () => {
  client = null // クライアントをリセットして新しいURLで再接続
  await loadSpeakers()
})

// 話者選択時にキャラクタープレビューを更新
speakerSelect.addEventListener('change', updateCharacterPreview)
prefetchSizeInput.addEventListener('change', async () => {
  client = null
  await loadSpeakers()
})

// オリジンコピー
if (copyOriginBtn) {
  copyOriginBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.origin)
    copyOriginBtn.textContent = 'コピーしました!'
    setTimeout(() => {
      copyOriginBtn.textContent = 'コピー'
    }, 2000)
  })
}

// エンターキーで再生
textArea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault()
    speak()
  }
})

/**
 * 接続状態を更新
 */
function updateConnectionStatus(isOnline: boolean) {
  statusIndicator.classList.remove('checking', 'online', 'offline')

  // 設定URLを動的に生成
  const baseUrl = voicevoxUrlInput.value.replace(/\/$/, '') // 末尾のスラッシュを削除
  const settingUrl = `${baseUrl}/setting`

  // リンクのhrefを更新
  settingsLink.href = settingUrl
  if (corsSettingsLink) {
    corsSettingsLink.href = settingUrl
    corsSettingsLink.textContent = settingUrl
  }

  if (isOnline) {
    statusIndicator.classList.add('online')
    connectionText.textContent = 'オンライン'
    settingsLink.style.display = 'inline'
    corsInstructions.style.display = 'none'
  } else {
    statusIndicator.classList.add('offline')
    connectionText.textContent = 'オフライン - VOICEVOXが起動しているか確認してください'
    settingsLink.style.display = 'inline'
    corsInstructions.style.display = 'block'
    corsInstructions.open = true // CORS設定を開く
  }
}

/**
 * キャラクタープレビューを更新
 */
async function updateCharacterPreview() {
  if (!client) return

  const selectedOption = speakerSelect.selectedOptions[0]
  if (!selectedOption) return

  const speakerUuid = selectedOption.dataset.speakerUuid
  if (!speakerUuid) return

  try {
    // speaker_info APIを呼び出してキャラクター情報を取得
    const speakerInfo = await client.getSpeakerInfo(speakerUuid)

    // ポートレート画像を表示 (base64エンコード)
    if (speakerInfo && (speakerInfo as any).portrait) {
      const portrait = (speakerInfo as any).portrait as string
      characterImage.src = `data:image/png;base64,${portrait}`
      characterImage.classList.add('loaded')
    } else {
      characterImage.classList.remove('loaded')
    }
  } catch (error) {
    // エラー時は画像を非表示
    characterImage.classList.remove('loaded')
  }
}

// 初期化
setMode(isImmediateMode)
loadSpeakers()
