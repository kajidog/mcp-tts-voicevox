import { type MutableRefObject, useEffect, useMemo, useState } from 'react'
import type { EditDraft } from '../../hooks/useMultiAudioPlayer'
import type { AccentPhrase, AudioSegment, SpeakerInfo } from '../../types'

interface MultiAudioSpeakerPanelProps {
  currentSegment?: AudioSegment
  currentPortrait: string | null
  groupedSpeakers: Record<string, SpeakerInfo[]>
  portraits: Record<string, string>
  speakerButtonRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>
  draft: EditDraft | null
  isSaving: boolean
  panelMode: 'closed' | 'detail' | 'edit'
  applyToSameSpeaker: boolean
  onApplyToSameSpeakerChange: (checked: boolean) => void
  bulkSwitchSpeaker: boolean
  onBulkSwitchSpeakerChange: (checked: boolean) => void
  onEnterEdit: () => void
  isTextDirty: boolean
  onChangeDraft: (updates: Partial<EditDraft>) => void
  onConfirm: (applyToSameSpeaker: boolean, bulkSwitchSpeaker: boolean) => void
  onRegenerate: () => void
  onCancelEdit: () => void
}

const fieldLabel = 'flex items-center justify-between text-[11px] font-semibold text-[var(--ui-text-secondary)]'
const inputBox = 'w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1.5 text-sm text-[var(--ui-text)] outline-none focus-visible:border-[var(--ui-accent)]'
const miniBtn =
  'rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1 text-xs text-[var(--ui-text)] transition-colors hover:border-[var(--ui-accent)] hover:bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-button-bg))] disabled:cursor-not-allowed disabled:opacity-60'

function createDefaultAccentPhrases(text: string): AccentPhrase[] {
  const moras = [...text.trim()].filter((ch) => ch !== ' ').map((ch) => ({
    text: ch,
    vowel: 'a',
    vowel_length: 0,
    pitch: 0,
  }))
  if (moras.length === 0) return []
  return [{ moras, accent: 1 }]
}

function normalizeAccentPhrases(phrases: AccentPhrase[] | undefined, text: string): AccentPhrase[] {
  if (!phrases || phrases.length === 0) return createDefaultAccentPhrases(text)
  return phrases
    .filter((phrase) => Array.isArray(phrase.moras) && phrase.moras.length > 0)
    .map((phrase) => ({
      ...phrase,
      accent: Math.max(1, Math.min(phrase.accent, phrase.moras.length)),
    }))
}

function findPhraseAtBoundary(phrases: AccentPhrase[], boundary: number) {
  let cumulative = 0
  for (let i = 0; i < phrases.length; i++) {
    const phraseLength = phrases[i]?.moras.length ?? 0
    const next = cumulative + phraseLength
    if (boundary <= next) {
      return { phraseIndex: i, start: cumulative, end: next }
    }
    cumulative = next
  }
  return null
}

export function MultiAudioSpeakerPanel({
  currentSegment,
  currentPortrait,
  groupedSpeakers,
  portraits,
  speakerButtonRefs,
  draft,
  isSaving,
  panelMode,
  applyToSameSpeaker,
  onApplyToSameSpeakerChange,
  bulkSwitchSpeaker,
  onBulkSwitchSpeakerChange,
  onEnterEdit,
  isTextDirty,
  onChangeDraft,
  onConfirm,
  onRegenerate,
  onCancelEdit,
}: MultiAudioSpeakerPanelProps) {
  const [showSpeakerList, setShowSpeakerList] = useState(false)
  const [showAccentView, setShowAccentView] = useState(false)
  const isEdit = panelMode === 'edit'

  const selectedSpeakerId = isEdit && draft ? draft.speaker : currentSegment?.speaker
  const selectedSpeakerInfo = selectedSpeakerId === undefined
    ? undefined
    : Object.values(groupedSpeakers).flat().find((speaker) => speaker.id === selectedSpeakerId)
  const selectedSpeakerName = selectedSpeakerInfo
    ? `${selectedSpeakerInfo.characterName}（${selectedSpeakerInfo.name}）`
    : (currentSegment?.speakerName ?? '')
  const selectedPortrait = selectedSpeakerInfo?.uuid ? portraits[selectedSpeakerInfo.uuid] : currentPortrait

  const textValue = isEdit && draft ? draft.text : (currentSegment?.text ?? '')
  const speedScale = isEdit && draft ? draft.speedScale : (currentSegment?.speedScale ?? 1.0)
  const intonationScale = isEdit && draft ? draft.intonationScale : (currentSegment?.intonationScale ?? 1.0)
  const volumeScale = isEdit && draft ? draft.volumeScale : (currentSegment?.volumeScale ?? 1.0)
  const prePhonemeLength = isEdit && draft ? draft.prePhonemeLength : (currentSegment?.prePhonemeLength ?? 0.1)
  const postPhonemeLength = isEdit && draft ? draft.postPhonemeLength : (currentSegment?.postPhonemeLength ?? 0.1)
  const pauseLengthScale = isEdit && draft ? draft.pauseLengthScale : (currentSegment?.pauseLengthScale ?? 1.0)
  const kana = currentSegment?.audioQuery?.kana ?? currentSegment?.kana
  const accentPhrases = useMemo(() => {
    if (isEdit && draft) {
      return normalizeAccentPhrases(draft.accentPhrases ?? draft.audioQuery?.accent_phrases, textValue)
    }
    return normalizeAccentPhrases(currentSegment?.audioQuery?.accent_phrases ?? currentSegment?.accentPhrases, textValue)
  }, [isEdit, draft, currentSegment?.audioQuery?.accent_phrases, currentSegment?.accentPhrases, textValue])
  const canEditAccent = isEdit && !isTextDirty && !!draft?.audioQuery && !isSaving
  const flattenedMoras = useMemo(() => accentPhrases.flatMap((phrase) => phrase.moras), [accentPhrases])
  const boundarySet = useMemo(() => {
    const set = new Set<number>()
    let count = 0
    for (let i = 0; i < accentPhrases.length - 1; i++) {
      count += accentPhrases[i]?.moras.length ?? 0
      if (count > 0) set.add(count)
    }
    return set
  }, [accentPhrases])

  useEffect(() => {
    if (!showSpeakerList || selectedSpeakerId === undefined) return
    const timer = setTimeout(() => {
      const button = speakerButtonRefs.current[selectedSpeakerId]
      button?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
    return () => clearTimeout(timer)
  }, [showSpeakerList, selectedSpeakerId, speakerButtonRefs])


  const updateAccentAt = (phraseIndex: number, accent: number) => {
    if (!canEditAccent || !draft) return
    const next = accentPhrases.map((phrase, idx) =>
      idx === phraseIndex ? { ...phrase, accent: Math.max(1, Math.min(accent, phrase.moras.length)) } : phrase
    )
    onChangeDraft({ accentPhrases: next })
  }

  const toggleBoundary = (boundary: number) => {
    if (!canEditAccent || !draft || boundary <= 0 || boundary >= flattenedMoras.length) return
    const boundaryExists = boundarySet.has(boundary)
    const leftInfo = findPhraseAtBoundary(accentPhrases, boundary)
    if (!leftInfo) return

    if (boundaryExists) {
      const rightPhrase = accentPhrases[leftInfo.phraseIndex + 1]
      if (!rightPhrase) return
      const leftPhrase = accentPhrases[leftInfo.phraseIndex]
      const mergedMoras = [...leftPhrase.moras, ...rightPhrase.moras]
      const mergedAccent = Math.max(1, Math.min(leftPhrase.accent, mergedMoras.length))
      const next = accentPhrases.slice()
      next.splice(leftInfo.phraseIndex, 2, { ...leftPhrase, moras: mergedMoras, accent: mergedAccent })
      onChangeDraft({ accentPhrases: next })
      return
    }

    const splitAt = boundary - leftInfo.start
    const target = accentPhrases[leftInfo.phraseIndex]
    if (!target || splitAt <= 0 || splitAt >= target.moras.length) return
    const leftMoras = target.moras.slice(0, splitAt)
    const rightMoras = target.moras.slice(splitAt)
    const next = accentPhrases.slice()
    next.splice(
      leftInfo.phraseIndex,
      1,
      { ...target, moras: leftMoras, accent: Math.max(1, Math.min(target.accent, leftMoras.length)) },
      { ...target, moras: rightMoras, accent: Math.max(1, Math.min(target.accent - splitAt, rightMoras.length)) }
    )
    onChangeDraft({ accentPhrases: next })
  }

  return (
    <div
      className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2"
      onClick={(e) => e.stopPropagation()}
    >
      {currentSegment && (
        <div className="space-y-2">
          {isEdit && (
            <div className="space-y-1">
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${showSpeakerList
                  ? 'border-[var(--ui-accent)] bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-bg))]'
                  : 'border-[var(--ui-border)] bg-[var(--ui-surface)] hover:border-[var(--ui-accent)]'}`}
                onClick={() => setShowSpeakerList((v) => !v)}
                disabled={isSaving}
              >
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-tag-bg)]">
                  {selectedPortrait ? (
                    <img
                      src={`data:image/png;base64,${selectedPortrait}`}
                      alt={selectedSpeakerName}
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-[var(--ui-text-secondary)]">
                      {selectedSpeakerName.charAt(0) || '?'}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{selectedSpeakerName}</span>
                <span className={`${showSpeakerList ? 'rotate-180' : ''} text-[var(--ui-text-secondary)] transition-transform duration-200`}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" fill="currentColor" />
                  </svg>
                </span>
              </button>

              {showSpeakerList && (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--ui-button-bg)] p-2">
                  {Object.entries(groupedSpeakers).map(([charName, styles]) => {
                    const groupUuid = styles[0]?.uuid
                    const groupPortrait = groupUuid ? portraits[groupUuid] : null

                    return (
                      <div key={charName} className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--ui-text-secondary)]">
                          {groupPortrait && (
                            <img
                              src={`data:image/png;base64,${groupPortrait}`}
                              alt={charName}
                              className="h-5 w-5 rounded-full border border-[var(--ui-border)] object-cover object-[center_top]"
                            />
                          )}
                          <span>{charName}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {styles.map((speaker) => (
                            <button
                              type="button"
                              key={speaker.id}
                              ref={(el) => {
                                speakerButtonRefs.current[speaker.id] = el
                              }}
                              className={`${miniBtn} ${speaker.id === selectedSpeakerId
                                ? '!border-[var(--ui-accent)] !text-[var(--ui-accent)] !bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-button-bg))] font-semibold'
                                : ''}`}
                              aria-pressed={speaker.id === selectedSpeakerId}
                              onClick={() => {
                                onChangeDraft({ speaker: speaker.id, audioQuery: undefined, accentPhrases: undefined })
                                setShowSpeakerList(false)
                              }}
                              disabled={isSaving}
                            >
                              {speaker.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ui-text-secondary)]">
                <input
                  type="checkbox"
                  checked={bulkSwitchSpeaker}
                  className="h-3.5 w-3.5 accent-[var(--ui-accent)]"
                  disabled={isSaving}
                  onChange={(e) => onBulkSwitchSpeakerChange(e.target.checked)}
                />
                同じ話者を一括変更（話者ID）
              </label>
            </div>
          )}

          {!isEdit && (
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-[var(--ui-text)]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-tag-bg)]">
                  {currentPortrait ? (
                    <img
                      src={`data:image/png;base64,${currentPortrait}`}
                      alt={currentSegment.speakerName ?? ''}
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-[var(--ui-text-secondary)]">
                      {currentSegment.speakerName?.charAt(0) || '?'}
                    </span>
                  )}
                </span>
                <span className="truncate">{currentSegment.speakerName ?? `Speaker ${currentSegment.speaker}`}</span>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-text-secondary)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                title="再生成"
                onClick={onRegenerate}
                disabled={isSaving}
              >
                {isSaving ? (
                  <span className="vv-spinner-sm" />
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                    <path d="M17.65 6.35A7.95 7.95 0 0012 4V1L7 6l5 5V7a5 5 0 11-5 5H5a7 7 0 107.75-6.95c1.61.16 3.09.86 4.24 1.95l.66-.65z" />
                  </svg>
                )}
              </button>
            </div>
          )}

          <div className="space-y-1">
            <label className={fieldLabel}>テキスト</label>
            {isEdit ? (
              <textarea
                className={`${inputBox} h-[60px] !text-xs leading-relaxed resize-none overflow-y-auto break-all whitespace-pre-wrap`}
                value={textValue}
                readOnly={isSaving}
                onChange={(e) => onChangeDraft({ text: e.target.value, audioQuery: undefined, accentPhrases: undefined })}
              />
            ) : (
              <div className={`${inputBox} h-[60px] !text-xs leading-relaxed cursor-default overflow-y-auto text-[var(--ui-text-secondary)] break-all whitespace-pre-wrap`}>
                {textValue}
              </div>
            )}
          </div>

          {(isEdit || showAccentView) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={fieldLabel}>アクセント</label>
                <div className="flex items-center gap-2 text-[10px]">
                  {isEdit && <span className="text-[var(--ui-text-secondary)]">境界をクリックで分割/結合</span>}
                  {!isEdit && (
                    <button
                      type="button"
                      className="text-[var(--ui-accent)] hover:underline"
                      onClick={() => setShowAccentView(false)}
                    >
                      読みに切り替え
                    </button>
                  )}
                </div>
              </div>
              <div className="relative">
                <div className="overflow-x-auto rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] p-2">
                  <div className="flex items-stretch gap-1">
                    {accentPhrases.map((phrase, phraseIndex) => {
                      const phraseStart = accentPhrases
                        .slice(0, phraseIndex)
                        .reduce((sum, item) => sum + item.moras.length, 0)

                      const hasSplitButton = canEditAccent
                      const moraWidths = phrase.moras.map((mora) => (mora.text.length >= 2 ? 48 : 32))
                      const contentWidth =
                        moraWidths.reduce((sum, width) => sum + width, 0) +
                        Math.max(0, phrase.moras.length - 1) * 4 +
                        (hasSplitButton ? Math.max(0, phrase.moras.length - 1) * 16 : 0)

                      // Ensure minimum width so sliders work properly
                      const rowWidth = Math.max(80, contentWidth + 16)
                      const accentPos = Math.max(1, Math.min(phrase.accent, phrase.moras.length))

                      return (
                        <div key={`phrase-wrap-${phraseIndex}`} className="flex items-stretch gap-1">
                          <div
                            className="flex flex-col rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2"
                            style={{ minWidth: `${rowWidth}px` }}
                          >
                            <div className="mb-2 flex w-full items-center gap-1">
                              {phrase.moras.map((mora, moraIndex) => {
                                const isAccentMora = moraIndex + 1 === accentPos
                                const globalBoundary = phraseStart + moraIndex + 1
                                const moraWidth = moraWidths[moraIndex] ?? 32

                                return (
                                  <div
                                    key={`phrase-${phraseIndex}-mora-${moraIndex}-${mora.text}`}
                                    className="flex shrink-0 items-center justify-center gap-1"
                                  >
                                    <span
                                      className={`inline-flex shrink-0 items-center justify-center rounded-md border px-1 text-xs leading-none py-1.5 transition-colors ${isAccentMora
                                        ? 'border-[var(--ui-accent)] bg-[color-mix(in_oklab,var(--ui-accent)_18%,var(--ui-bg))] text-[var(--ui-accent)] font-semibold'
                                        : `border-[var(--ui-border)] text-[var(--ui-text)] ${isEdit ? 'hover:border-[var(--ui-accent)] hover:bg-[color-mix(in_oklab,var(--ui-accent)_10%,var(--ui-bg))]' : ''}`
                                        } ${canEditAccent ? 'cursor-pointer' : ''}`}
                                      style={{ width: `${moraWidth}px` }}
                                      onClick={() => {
                                        if (canEditAccent) updateAccentAt(phraseIndex, moraIndex + 1)
                                      }}
                                    >
                                      {mora.text}
                                    </span>
                                    {moraIndex < phrase.moras.length - 1 && canEditAccent && (
                                      <button
                                        type="button"
                                        className="group relative flex h-7 w-3 shrink-0 cursor-pointer items-center justify-center rounded outline-none"
                                        onClick={() => toggleBoundary(globalBoundary)}
                                        disabled={isSaving}
                                        title="クリックで分割"
                                      >
                                        {/* Default state: subtle boundary separator */}
                                        <div className="h-4 w-[2px] rounded-full bg-[var(--ui-border)] transition-opacity group-hover:opacity-0" />
                                        {/* Hover state: actual split button */}
                                        <div className="absolute inset-0 flex items-center justify-center rounded border border-transparent bg-[var(--ui-button-bg)] opacity-0 transition-all group-hover:border-[var(--ui-accent)] group-hover:bg-[color-mix(in_oklab,var(--ui-accent)_15%,var(--ui-bg))] group-hover:text-[var(--ui-accent)] group-hover:opacity-100">
                                          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current rotate-90">
                                            <path d="M8 6h8v2H8zm0 10h8v2H8z" />
                                          </svg>
                                        </div>
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="w-full">
                              <input
                                type="range"
                                className="vv-slider w-full"
                                min={1}
                                max={Math.max(1, phrase.moras.length)}
                                step={1}
                                value={accentPos}
                                disabled={!canEditAccent}
                                onChange={(e) => updateAccentAt(phraseIndex, Number(e.target.value))}
                              />
                            </div>
                          </div>

                          {/* COMBINE BUTTON BETWEEN PHRASES */}
                          {phraseIndex < accentPhrases.length - 1 && canEditAccent && (
                            <button
                              type="button"
                              className="group relative z-20 flex w-3 shrink-0 cursor-pointer flex-col items-center justify-center outline-none"
                              onClick={() => toggleBoundary(phraseStart + phrase.moras.length)}
                              disabled={isSaving}
                              title="クリックで結合"
                            >
                              <div className="h-10 w-[2px] rounded-full bg-[var(--ui-border)] opacity-60 transition-all group-hover:opacity-0" />
                              <div className="absolute inset-x-[-6px] inset-y-1 flex items-center justify-center rounded-md bg-[var(--ui-accent)] opacity-0 shadow-md transition-all group-hover:opacity-100">
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-white">
                                  <path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8z" />
                                </svg>
                              </div>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {isEdit && (isTextDirty || !draft?.audioQuery) && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-md bg-[var(--ui-bg)]/60 backdrop-blur-[1.5px]">
                      <div className="rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ui-text)] shadow-sm">
                        {isTextDirty ? 'テキスト変更後はプレビュー再生でクエリを更新してください' : 'プレビュー再生後に操作可能になります'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isEdit && !showAccentView && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={fieldLabel}>読み（カタカナ）</label>
                <button
                  type="button"
                  className="text-[10px] text-[var(--ui-accent)] hover:underline"
                  onClick={() => setShowAccentView(true)}
                >
                  アクセントに切り替え
                </button>
              </div>
              <div
                className="h-[60px] overflow-y-auto rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2 text-xs leading-relaxed text-[var(--ui-text-secondary)] whitespace-pre-wrap break-all"
                title={kana?.trim() || '未取得（再生成後に表示）'}
              >
                {kana?.trim() || '未取得（再生成後に表示）'}
              </div>
            </div>
          )}

          {isEdit && (
            <div className="space-y-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ui-text-secondary)]">
                <input
                  type="checkbox"
                  checked={applyToSameSpeaker}
                  className="h-3.5 w-3.5 accent-[var(--ui-accent)]"
                  disabled={isSaving}
                  onChange={(e) => onApplyToSameSpeakerChange(e.target.checked)}
                />
                同じ話者にも適用（速度・音量・抑揚・間・前後の無音）
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div className="space-y-1">
              <label className={fieldLabel}>
                速度 <span>{speedScale.toFixed(2)}</span>
              </label>
              <input
                type="range"
                className="vv-slider"
                min={0.5}
                max={2.0}
                step={0.05}
                value={speedScale}
                disabled={!isEdit || isSaving}
                onChange={(e) => onChangeDraft({ speedScale: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-1">
              <label className={fieldLabel}>
                音量 <span>{volumeScale.toFixed(2)}</span>
              </label>
              <input
                type="range"
                className="vv-slider"
                min={0}
                max={2.0}
                step={0.05}
                value={volumeScale}
                disabled={!isEdit || isSaving}
                onChange={(e) => onChangeDraft({ volumeScale: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-1">
              <label className={fieldLabel}>
                抑揚 <span>{intonationScale.toFixed(2)}</span>
              </label>
              <input
                type="range"
                className="vv-slider"
                min={0}
                max={2.0}
                step={0.05}
                value={intonationScale}
                disabled={!isEdit || isSaving}
                onChange={(e) => onChangeDraft({ intonationScale: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-1">
              <label className={fieldLabel}>
                間の長さ <span>{pauseLengthScale.toFixed(2)}</span>
              </label>
              <input
                type="range"
                className="vv-slider"
                min={0}
                max={2.0}
                step={0.05}
                value={pauseLengthScale}
                disabled={!isEdit || isSaving}
                onChange={(e) => onChangeDraft({ pauseLengthScale: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-1">
              <label className={fieldLabel}>
                前の無音 <span>{prePhonemeLength.toFixed(2)}s</span>
              </label>
              <input
                type="range"
                className="vv-slider"
                min={0}
                max={2.0}
                step={0.05}
                value={prePhonemeLength}
                disabled={!isEdit || isSaving}
                onChange={(e) => onChangeDraft({ prePhonemeLength: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-1">
              <label className={fieldLabel}>
                後の無音 <span>{postPhonemeLength.toFixed(2)}s</span>
              </label>
              <input
                type="range"
                className="vv-slider"
                min={0}
                max={2.0}
                step={0.05}
                value={postPhonemeLength}
                disabled={!isEdit || isSaving}
                onChange={(e) => onChangeDraft({ postPhonemeLength: Number(e.target.value) })}
              />
            </div>
          </div>

          {isEdit && draft && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                className="inline-flex min-w-20 items-center justify-center rounded-md bg-[var(--ui-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--ui-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving || !draft.text.trim()}
                onClick={() => onConfirm(applyToSameSpeaker, bulkSwitchSpeaker)}
              >
                {isSaving ? <span className="vv-spinner-sm" /> : '適用'}
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-1.5 text-xs text-[var(--ui-text-secondary)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving}
                onClick={onCancelEdit}
              >
                キャンセル
              </button>
            </div>
          )}

          {!isEdit && (
            <div className="space-y-2 pt-1">
              <button
                type="button"
                className="rounded-md bg-[var(--ui-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--ui-accent-hover)]"
                onClick={onEnterEdit}
              >
                編集
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
