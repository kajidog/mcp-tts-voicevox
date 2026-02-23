import type { App } from '@modelcontextprotocol/ext-apps'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDictionaryWord,
  deleteDictionaryWord,
  fetchDictionaryWords,
  previewDictionaryWord,
  updateDictionaryWord,
} from '../../hooks/playerToolClient'
import type { DictionaryData, DictionaryWord } from '../../types'

interface DictionaryManagerProps {
  app: App
  initialData: DictionaryData
}

interface DictionaryFormState {
  surface: string
  pronunciation: string
  priority: number
}

const inputBox =
  'w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)] outline-none transition-colors focus-visible:border-[var(--ui-accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--ui-accent)_20%,transparent)]'

const PRIORITY_LABELS = ['最低', '低', '標準', '高', '最高'] as const

function isKatakana(input: string): boolean {
  return /^[ァ-ヶー]+$/.test(input)
}

function sortWords(words: DictionaryWord[]): DictionaryWord[] {
  return [...words].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    return a.surface.localeCompare(b.surface, 'ja')
  })
}

function createEmptyForm(): DictionaryFormState {
  return { surface: '', pronunciation: '', priority: 5 }
}

function priorityLabel(priority: number): string {
  if (priority <= 2) return '最低'
  if (priority <= 4) return '低'
  if (priority <= 6) return '標準'
  if (priority <= 8) return '高'
  return '最高'
}

export function DictionaryManager({ app, initialData }: DictionaryManagerProps) {
  const [words, setWords] = useState<DictionaryWord[]>(sortWords(initialData.words))
  const [notice] = useState(initialData.notice)
  const [filter, setFilter] = useState('')
  const [selectedWordUuid, setSelectedWordUuid] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<DictionaryFormState>(createEmptyForm())
  const [isBusy, setIsBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [previewInfo, setPreviewInfo] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const filteredWords = useMemo(() => {
    const keyword = filter.trim().toLowerCase()
    if (!keyword) return words
    return words.filter(
      (word) => word.surface.toLowerCase().includes(keyword) || word.pronunciation.toLowerCase().includes(keyword),
    )
  }, [filter, words])

  const selectedWord = useMemo(
    () => words.find((word) => word.wordUuid === selectedWordUuid) ?? null,
    [words, selectedWordUuid],
  )

  const runAction = async (action: () => Promise<void>) => {
    setIsBusy(true)
    setErrorMsg(null)
    try {
      await action()
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error))
    } finally {
      setIsBusy(false)
    }
  }

  const syncWords = (nextWords: DictionaryWord[]) => {
    const sorted = sortWords(nextWords)
    setWords(sorted)

    if (!selectedWordUuid) return
    const selected = sorted.find((word) => word.wordUuid === selectedWordUuid)
    if (!selected) {
      setSelectedWordUuid(null)
      setForm(createEmptyForm())
      setIsFormOpen(false)
      return
    }
    setForm({ surface: selected.surface, pronunciation: selected.pronunciation, priority: selected.priority })
  }

  const refreshWords = async () => {
    await runAction(async () => {
      const nextWords = await fetchDictionaryWords(app)
      syncWords(nextWords)
    })
  }

  useEffect(() => {
    void refreshWords()
  }, [])

  const closeForm = () => {
    setIsFormOpen(false)
    setSelectedWordUuid(null)
    setForm(createEmptyForm())
    setPreviewInfo(null)
    setErrorMsg(null)
  }

  const selectWord = (word: DictionaryWord) => {
    setSelectedWordUuid(word.wordUuid)
    setForm({ surface: word.surface, pronunciation: word.pronunciation, priority: word.priority })
    setPreviewInfo(null)
    setErrorMsg(null)
    setIsFormOpen(true)
  }

  const setNewMode = () => {
    setSelectedWordUuid(null)
    setForm(createEmptyForm())
    setPreviewInfo(null)
    setErrorMsg(null)
    setIsFormOpen(true)
  }

  const validateForm = (): boolean => {
    const normalizedSurface = form.surface.trim()
    const normalizedPronunciation = form.pronunciation.trim()

    if (!normalizedSurface) {
      setErrorMsg('単語を入力してください。')
      return false
    }
    if (!normalizedPronunciation) {
      setErrorMsg('読みを入力してください。')
      return false
    }
    if (!isKatakana(normalizedPronunciation)) {
      setErrorMsg('読みはカタカナで入力してください。')
      return false
    }
    return true
  }

  const saveForm = async () => {
    if (!validateForm()) return

    await runAction(async () => {
      const payload = {
        surface: form.surface.trim(),
        pronunciation: form.pronunciation.trim(),
        priority: form.priority,
      }

      if (selectedWordUuid) {
        const nextWords = await updateDictionaryWord(app, { wordUuid: selectedWordUuid, ...payload })
        syncWords(nextWords)
        return
      }

      const nextWords = await addDictionaryWord(app, payload)
      syncWords(nextWords)
      const created = sortWords(nextWords).find(
        (word) => word.surface === payload.surface && word.pronunciation === payload.pronunciation,
      )
      if (created) setSelectedWordUuid(created.wordUuid)
    })
  }

  const removeSelectedWord = async () => {
    if (!selectedWordUuid) return
    await runAction(async () => {
      const nextWords = await deleteDictionaryWord(app, { wordUuid: selectedWordUuid })
      setSelectedWordUuid(null)
      setForm(createEmptyForm())
      setPreviewInfo(null)
      setIsFormOpen(false)
      syncWords(nextWords)
    })
  }

  const previewCurrent = async () => {
    // 登録前の読みを確認できるよう、プレビュー時は入力中の「読み（カタカナ）」を優先して音声を合成する
    const text = form.pronunciation.trim() || form.surface.trim()
    if (!text) {
      setErrorMsg('視聴するテキストがありません。')
      return
    }

    await runAction(async () => {
      const result = await previewDictionaryWord(app, { text })
      if (!result?.audioBase64) {
        setErrorMsg('視聴音声を生成できませんでした。')
        return
      }
      const audio = previewAudioRef.current ?? new Audio()
      previewAudioRef.current = audio
      audio.src = `data:audio/wav;base64,${result.audioBase64}`
      await audio.play()

      const speaker = result.speakerName ? `話者: ${result.speakerName}` : '話者: ランダム'
      const kana = result.kana ? ` / 読み: ${result.kana}` : ''
      setPreviewInfo(`${speaker}${kana}`)
    })
  }

  const currentLabel = priorityLabel(form.priority)

  return (
    <div className="mx-4 my-3 flex flex-col overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] text-[var(--ui-text)]">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2.5">
        <h2 className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-[var(--ui-accent)]">
            <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
          </svg>
          辞書
          <span className="text-[11px] font-normal text-[var(--ui-text-secondary)]">
            {filter ? `(${filteredWords.length}/${words.length}件)` : `(${words.length}件)`}
          </span>
        </h2>

        {/* 検索バー（ヘッダー埋め込み） */}
        <div className="relative min-w-[120px] max-w-[200px] flex-1 sm:max-w-xs">
          <input
            type="text"
            className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] py-1.5 pl-8 pr-3 text-xs text-[var(--ui-text)] outline-none transition-colors focus-visible:border-[var(--ui-accent)] focus-visible:ring-1 focus-visible:ring-[color-mix(in_oklab,var(--ui-accent)_20%,transparent)]"
            placeholder="単語や読みで検索..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={isBusy}
          />
          <svg
            className="absolute left-2.5 top-2 h-3.5 w-3.5 fill-current text-[var(--ui-text-secondary)]"
            viewBox="0 0 24 24"
          >
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isFormOpen && selectedWordUuid === null
              ? 'border-[var(--ui-accent)] bg-[color-mix(in_oklab,var(--ui-accent)_10%,var(--ui-bg))] font-medium text-[var(--ui-accent)]'
              : 'border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-text-secondary)] hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)]'
              }`}
            onClick={setNewMode}
            disabled={isBusy}
            title="新しい単語を登録"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            <span className="hidden sm:inline">追加</span>
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2.5 py-1.5 text-xs text-[var(--ui-text-secondary)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={refreshWords}
            disabled={isBusy}
            title="VOICEVOXエンジンの辞書データを再取得します"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
              <path d="M17.65 6.35A7.95 7.95 0 0012 4V1L7 6l5 5V7a5 5 0 11-5 5H5a7 7 0 107.75-6.95c1.61.16 3.09.86 4.24 1.95l.66-.65z" />
            </svg>
            <span className="hidden sm:inline">同期</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-3">
        {/* 辞書一覧 */}
        <div className="flex flex-col">
          <div className="space-y-2">
            <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
              {filteredWords.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--ui-border)] px-3 py-5 text-center text-xs text-[var(--ui-text-secondary)]">
                  {words.length === 0 ? '辞書はまだ登録されていません。' : '検索条件に一致する辞書がありません。'}
                </div>
              ) : (
                filteredWords.map((word) => {
                  const isSelected = word.wordUuid === selectedWordUuid
                  return (
                    <button
                      key={word.wordUuid}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${isSelected
                        ? 'border-[var(--ui-accent)] bg-[color-mix(in_oklab,var(--ui-accent)_15%,var(--ui-bg))]'
                        : 'border-[var(--ui-border)] bg-[var(--ui-surface)] hover:border-[var(--ui-accent)] hover:bg-[color-mix(in_oklab,var(--ui-accent)_5%,var(--ui-bg))]'
                        }`}
                      onClick={() => selectWord(word)}
                      disabled={isBusy}
                    >
                      <span className="min-w-0 flex-1 font-medium text-[var(--ui-text)]">
                        {word.surface}
                        <span className="mx-1.5 text-[var(--ui-text-secondary)]">/</span>
                        <span className="text-[var(--ui-text-secondary)]">{word.pronunciation}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${isSelected
                          ? 'bg-[var(--ui-accent)] text-white'
                          : 'bg-[var(--ui-border)] text-[var(--ui-text-secondary)]'
                          }`}
                      >
                        {priorityLabel(word.priority)}
                      </span>
                      {isSelected && (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--ui-accent)]">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                        </svg>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* 編集・追加フォーム — isFormOpen のときのみ表示 */}
        {isFormOpen && (
          <div className="overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)]">
            {/* フォームモードラベル + 閉じるボタン */}
            <div className="flex items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2">
              {selectedWord ? (
                <div className="flex items-center gap-1.5 text-xs text-[var(--ui-text-secondary)]">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--ui-accent)]">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                  </svg>
                  <span className="font-medium text-[var(--ui-text)]">{selectedWord.surface}</span>
                  <span>を編集中</span>
                </div>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ui-text-secondary)]">
                  新規追加
                </span>
              )}
              <button
                type="button"
                className="text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)]"
                onClick={closeForm}
                title="閉じる"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 p-3">
              {/* 単語・読みフィールド */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[var(--ui-text)]">
                    単語
                    <span className="ml-0.5 text-[var(--ui-danger)]">*</span>
                  </label>
                  <input
                    type="text"
                    className={inputBox}
                    placeholder="例: Apps"
                    value={form.surface}
                    onChange={(e) => setForm((prev) => ({ ...prev, surface: e.target.value }))}
                    disabled={isBusy}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[var(--ui-text)]">
                    読み
                    <span className="ml-1 font-normal text-[var(--ui-text-secondary)]">（カタカナ）</span>
                    <span className="text-[var(--ui-danger)]">*</span>
                  </label>
                  <input
                    type="text"
                    className={inputBox}
                    placeholder="例: アップス"
                    value={form.pronunciation}
                    onChange={(e) => setForm((prev) => ({ ...prev, pronunciation: e.target.value }))}
                    disabled={isBusy}
                  />
                </div>
              </div>

              {/* 優先度スライダー */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--ui-text)]">優先度</label>
                  <span className="rounded-full bg-[var(--ui-accent)] px-2.5 py-0.5 text-[10px] font-semibold text-white">
                    {currentLabel} ({form.priority})
                  </span>
                </div>
                <input
                  type="range"
                  className="vv-slider"
                  min={1}
                  max={10}
                  step={1}
                  value={form.priority}
                  onChange={(e) => setForm((prev) => ({ ...prev, priority: Number(e.target.value) }))}
                  disabled={isBusy}
                />
                {/* px-[7px]: スライダーのつまみ端位置に合わせた補正 */}
                <div className="flex justify-between px-[7px]">
                  {PRIORITY_LABELS.map((label) => (
                    <span
                      key={label}
                      className={`text-[10px] transition-colors ${currentLabel === label ? 'font-semibold text-[var(--ui-accent)]' : 'text-[var(--ui-text-secondary)]'
                        }`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* 注意書き — 枠なし控えめテキストのみ */}
              {notice && (
                <p className="text-[11px] leading-relaxed text-[var(--ui-text-secondary)]">{notice}</p>
              )}

              {/* アクションボタン */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  className="rounded-md bg-[var(--ui-accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--ui-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={saveForm}
                  disabled={isBusy}
                >
                  {selectedWord ? '更新する' : '追加する'}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-xs font-medium text-[var(--ui-text-secondary)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={previewCurrent}
                  disabled={isBusy}
                >
                  視聴確認
                </button>
                {/* 削除ボタン — 常時赤系で危険操作と明示 */}
                {selectedWord && (
                  <button
                    type="button"
                    className="ml-auto rounded-md border border-[var(--ui-danger)]/50 bg-[color-mix(in_oklab,var(--ui-danger)_8%,var(--ui-bg))] px-4 py-2 text-xs font-medium text-[var(--ui-danger)] transition-colors hover:bg-[color-mix(in_oklab,var(--ui-danger)_15%,var(--ui-bg))] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={removeSelectedWord}
                    disabled={isBusy}
                  >
                    削除
                  </button>
                )}
              </div>

              {/* 視聴情報 */}
              {previewInfo && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--ui-text-secondary)]">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--ui-accent)]">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                  {previewInfo}
                </div>
              )}
            </div>
          </div>
        )}

        {/* エラーメッセージ */}
        {errorMsg && (
          <div className="flex items-start gap-2 rounded-md border border-[var(--ui-danger)] bg-[color-mix(in_oklab,var(--ui-danger)_12%,var(--ui-bg))] px-3 py-2 text-xs text-[var(--ui-danger)]">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-current">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  )
}
