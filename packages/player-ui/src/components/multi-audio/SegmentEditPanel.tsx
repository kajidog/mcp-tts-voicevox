import { useEffect, useState } from 'react'
import type { EditDraft } from '../../hooks/useMultiAudioPlayer'
import type { AudioSegment } from '../../types'

interface SegmentEditPanelProps {
  segment: AudioSegment
  draft: EditDraft | null
  isSaving: boolean
  mode: 'detail' | 'edit'
  onEnterEdit: () => void
  onChangeDraft: (updates: Partial<EditDraft>) => void
  onConfirm: (applyToSameSpeaker: boolean) => void
  onCancelEdit: () => void
}

const fieldLabel = 'flex items-center justify-between text-[11px] font-semibold text-[var(--ui-text-secondary)]'
const inputBox = 'w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] px-2 py-1.5 text-sm text-[var(--ui-text)] outline-none focus-visible:border-[var(--ui-accent)]'

export function SegmentEditPanel({
  segment,
  draft,
  isSaving,
  mode,
  onEnterEdit,
  onChangeDraft,
  onConfirm,
  onCancelEdit,
}: SegmentEditPanelProps) {
  const [applyToSameSpeaker, setApplyToSameSpeaker] = useState(false)

  useEffect(() => {
    if (mode === 'edit') setApplyToSameSpeaker(false)
  }, [mode])

  const isDetail = mode === 'detail'
  const isEdit = mode === 'edit'

  const textValue = isEdit && draft ? draft.text : segment.text
  const speedScale = isEdit && draft ? draft.speedScale : (segment.speedScale ?? 1.0)
  const intonationScale = isEdit && draft ? draft.intonationScale : (segment.intonationScale ?? 1.0)
  const volumeScale = isEdit && draft ? draft.volumeScale : (segment.volumeScale ?? 1.0)
  const prePhonemeLength = isEdit && draft ? draft.prePhonemeLength : (segment.prePhonemeLength ?? 0.1)
  const postPhonemeLength = isEdit && draft ? draft.postPhonemeLength : (segment.postPhonemeLength ?? 0.1)
  const pauseLengthScale = isEdit && draft ? draft.pauseLengthScale : (segment.pauseLengthScale ?? 1.0)

  return (
    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-2">
        <div className="space-y-1">
          <label className={fieldLabel}>テキスト</label>
          <textarea
            className={`${inputBox} min-h-16 resize-y ${isDetail ? 'cursor-default text-[var(--ui-text-secondary)]' : ''}`}
            value={textValue}
            rows={2}
            readOnly={isDetail}
            disabled={isSaving}
            onChange={(e) => isEdit && onChangeDraft({ text: e.target.value })}
          />
        </div>

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
              disabled={isDetail || isSaving}
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
              disabled={isDetail || isSaving}
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
              disabled={isDetail || isSaving}
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
              disabled={isDetail || isSaving}
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
              disabled={isDetail || isSaving}
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
              disabled={isDetail || isSaving}
              onChange={(e) => onChangeDraft({ postPhonemeLength: Number(e.target.value) })}
            />
          </div>
        </div>

        {isEdit && draft && (
          <>
            <div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ui-text-secondary)]">
                <input
                  type="checkbox"
                  checked={applyToSameSpeaker}
                  className="h-3.5 w-3.5 accent-[var(--ui-accent)]"
                  disabled={isSaving}
                  onChange={(e) => setApplyToSameSpeaker(e.target.checked)}
                />
                同じ話者にも適用（速度・音量・抑揚・間・前後の無音）
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex min-w-20 items-center justify-center rounded-md bg-[var(--ui-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--ui-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving || !draft.text.trim()}
                onClick={() => onConfirm(applyToSameSpeaker)}
              >
                {isSaving ? <span className="vv-spinner-sm" /> : '適用'}
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-1.5 text-xs text-[var(--ui-text-secondary)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving}
                onClick={onCancelEdit}
              >
                キャンセル
              </button>
            </div>
          </>
        )}

        {isDetail && (
          <div>
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
    </div>
  )
}
