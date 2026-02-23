import { type MutableRefObject, useRef, useState, useCallback } from 'react'
import { DragHandleIcon, DeleteIcon, EqualizerIcon, PlayIcon } from '../../icons'
import type { AudioSegment } from '../../types'

interface MultiAudioTrackListProps {
  currentIndex: number
  isPlaying: boolean
  isEditMode: boolean
  resynthesizingSet: Set<number>
  segmentRefs: MutableRefObject<(HTMLDivElement | null)[]>
  segments: AudioSegment[]
  onPlaySegment: (index: number) => void
  onSelectSegment: (index: number) => void
  onDeleteSegment: (index: number) => void
  onReorderSegments: (fromIndex: number, toIndex: number) => void
  onAddSegment: (text: string, speaker: number) => void
  canExport: boolean
  canChooseDirectory: boolean
  isExporting: boolean
  onExportDefault: () => void
  onExportWithDialog: () => void
  exportError?: string | null
  getPortrait: (speakerId: number) => string | null
}

export function MultiAudioTrackList({
  currentIndex,
  isPlaying,
  isEditMode,
  resynthesizingSet,
  segmentRefs,
  segments,
  onPlaySegment,
  onSelectSegment,
  onDeleteSegment,
  onReorderSegments,
  onAddSegment,
  canExport,
  canChooseDirectory,
  isExporting,
  onExportDefault,
  onExportWithDialog,
  exportError,
  getPortrait,
}: MultiAudioTrackListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverRawIndex, setDragOverRawIndex] = useState<number | null>(null)
  const [addText, setAddText] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index)
    dragNodeRef.current = e.currentTarget
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    requestAnimationFrame(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.4'
      }
    })
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIndex === null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const isBottomHalf = e.clientY >= rect.top + rect.height / 2
    setDragOverRawIndex(isBottomHalf ? index + 1 : index)
  }

  const handleDragLeave = () => {
    setDragOverRawIndex(null)
  }

  const commitReorder = (rawIndex: number) => {
    if (dragIndex === null) return
    let toIndex = rawIndex
    if (dragIndex < rawIndex) {
      toIndex = rawIndex - 1
    }
    if (toIndex !== dragIndex) {
      onReorderSegments(dragIndex, toIndex)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const isBottomHalf = e.clientY >= rect.top + rect.height / 2
    const rawIndex = isBottomHalf ? index + 1 : index
    commitReorder(rawIndex)
    setDragIndex(null)
    setDragOverRawIndex(null)
  }

  const handleDropAtEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    commitReorder(segments.length)
    setDragIndex(null)
    setDragOverRawIndex(null)
  }

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1'
    }
    setDragIndex(null)
    setDragOverRawIndex(null)
    dragNodeRef.current = null
  }

  return (
    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2">
      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {segments.map((segment, index) => {
          const portrait = getPortrait(segment.speaker)
          const isSaving = resynthesizingSet.has(index)
          const isActive = index === currentIndex
          const showInsertTop = dragIndex !== null && dragOverRawIndex === index
          const showInsertBottom = dragIndex !== null && dragOverRawIndex === index + 1

          return (
            <div
              key={`seg-${segment.speaker}-${index}`}
              className="relative rounded-lg"
              ref={(el) => {
                segmentRefs.current[index] = el
              }}
              draggable={!isEditMode}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              {showInsertTop && <div className="absolute left-2 right-2 top-0 h-0.5 rounded-full bg-[var(--ui-accent)]" />}
              <div
                className={`group/track flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${isActive
                  ? 'border-[var(--ui-accent)] bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-bg))]'
                  : 'border-[var(--ui-border)] bg-[var(--ui-surface)] hover:border-[var(--ui-accent)]'} ${dragIndex === index ? 'opacity-40' : ''}`}
                onClick={() => onSelectSegment(index)}
              >
                <span className="cursor-grab text-[var(--ui-text-secondary)] active:cursor-grabbing" onMouseDown={(e) => e.stopPropagation()}>
                  <DragHandleIcon />
                </span>
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-tag-bg)]">
                  {portrait ? (
                    <img
                      src={`data:image/png;base64,${portrait}`}
                      alt={segment.speakerName}
                      className="h-full w-full object-cover object-[center_top]"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-[var(--ui-text-secondary)]">{segment.speakerName?.charAt(0) || '?'}</span>
                  )}
                </span>
                <span className="max-w-28 shrink-0 truncate text-xs font-medium text-[var(--ui-text)]">{segment.speakerName}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--ui-text-secondary)]">{segment.text}</span>
                <span className="flex h-6 w-6 items-center justify-center text-[var(--ui-text-secondary)]">
                  {isSaving ? (
                    <div className="vv-spinner-sm" />
                  ) : isActive && isPlaying ? (
                    <EqualizerIcon />
                  ) : (
                    <button
                      type="button"
                      className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-button-bg)] p-1 text-[var(--ui-text-secondary)] opacity-0 transition-colors transition-opacity hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] group-hover/track:opacity-100 group-focus-within/track:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPlaySegment(index)
                      }}
                      title="再生"
                    >
                      <PlayIcon />
                    </button>
                  )}
                </span>
                {segments.length > 1 && (
                  <button
                    type="button"
                    className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-button-bg)] p-1 text-[var(--ui-text-secondary)] opacity-0 transition-colors transition-opacity hover:border-[var(--ui-danger)] hover:text-[var(--ui-danger)] group-hover/track:opacity-100 group-focus-within/track:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSegment(index)
                    }}
                    title="削除"
                  >
                    <DeleteIcon />
                  </button>
                )}
              </div>
              {showInsertBottom && <div className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-[var(--ui-accent)]" />}
            </div>
          )
        })}
        <div
          className={`h-2 rounded ${dragIndex !== null && dragOverRawIndex === segments.length ? 'bg-[color-mix(in_oklab,var(--ui-accent)_20%,transparent)]' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (dragIndex !== null) setDragOverRawIndex(segments.length)
          }}
          onDrop={handleDropAtEnd}
        />
      </div>

      <div className="mt-2 space-y-1.5">
        {canExport && (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <button
                type="button"
                className="flex-1 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-1.5 text-xs text-[var(--ui-text-secondary)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onExportDefault}
                disabled={isExporting || segments.length === 0}
                title="WAVを保存してフォルダを開く"
              >
                {isExporting ? '保存中...' : '保存して開く'}
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-1.5 text-xs text-[var(--ui-text-secondary)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onExportWithDialog}
                disabled={!canChooseDirectory || isExporting || segments.length === 0}
                title={canChooseDirectory ? '保存先を指定して保存' : 'この環境では保存先の選択に対応していません'}
              >
                保存先を指定
              </button>
            </div>
            {exportError && (
              <div className="rounded-md border border-[var(--ui-danger)] bg-[color-mix(in_oklab,var(--ui-danger)_15%,var(--ui-bg))] px-3 py-2 text-xs text-[var(--ui-danger)] text-left whitespace-pre-wrap">
                {exportError}
              </div>
            )}
          </div>
        )}

        {showAddForm ? (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-2">
            <input
              type="text"
              className="min-w-0 flex-1 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1.5 text-sm text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-text-secondary)] focus-visible:border-[var(--ui-accent)]"
              value={addText}
              placeholder="テキストを入力..."
              onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && addText.trim()) {
                  const speaker = segments[currentIndex]?.speaker ?? 0
                  onAddSegment(addText.trim(), speaker)
                  setAddText('')
                  setShowAddForm(false)
                }
                if (e.key === 'Escape') {
                  setAddText('')
                  setShowAddForm(false)
                }
              }}
              autoFocus
            />
            <button
              type="button"
              className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!addText.trim()}
              onClick={() => {
                if (addText.trim()) {
                  const speaker = segments[currentIndex]?.speaker ?? 0
                  onAddSegment(addText.trim(), speaker)
                  setAddText('')
                  setShowAddForm(false)
                }
              }}
            >
              追加
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-2 text-xs text-[var(--ui-text-secondary)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)]"
            onClick={() => setShowAddForm(true)}
            title="トラックを追加"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor" /></svg>
            トラックを追加
          </button>
        )}
      </div>
    </div>
  )
}
