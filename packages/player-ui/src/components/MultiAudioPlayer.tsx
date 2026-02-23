import type { App } from '@modelcontextprotocol/ext-apps'
import type { MultiPlayerData } from '../types'
import { useMultiAudioPlayer } from '../hooks/useMultiAudioPlayer'
import { MultiAudioControls } from './multi-audio/MultiAudioControls'
import { NowPlayingRow } from './multi-audio/NowPlayingRow'
import { MultiAudioSpeakerPanel } from './multi-audio/MultiAudioSpeakerPanel'
import { MultiAudioTrackList } from './multi-audio/MultiAudioTrackList'

interface MultiAudioPlayerProps {
  data: MultiPlayerData
  app: App
  viewUUID?: string
}

export function MultiAudioPlayer({ data, app, viewUUID }: MultiAudioPlayerProps) {
  const {
    audioRef,
    segmentRefs,
    speakerButtonRefs,
    currentIndex,
    currentPortrait,
    currentSegment,
    currentTime,
    duration,
    isPlaying,
    localSegments,
    autoAdvance,
    isAutoAdvanceEnabled,
    groupedSpeakers,
    portraits,
    prevSegment,
    resynthesizingSet,
    exportCapability,
    isExporting,
    showSpeakerPanel,
    showTrackList,
    panelMode,
    editDraft,
    isEditTextDirty,
    applyToSameSpeaker,
    bulkSwitchSpeaker,
    isApplying,
    isPreviewLoading,
    goNext,
    goPrev,
    playSegment,
    rewind,
    selectSegment,
    setAutoAdvance,
    setShowTrackList,
    togglePlay,
    audioSrc,
    getPortrait,
    openEdit,
    toggleSpeakerPanel,
    cancelEdit,
    setEditDraft,
    resynthesizeSegment,
    regenerateCurrentSegment,
    deleteSegment,
    reorderSegments,
    addSegment,
    exportTracks,
    handleApplyToSameSpeakerChange,
    handleBulkSwitchSpeakerChange,
  } = useMultiAudioPlayer({ app, data, viewUUID })
  const totalSegments = localSegments.length
  const readySegments = localSegments.filter((segment) => Boolean(segment.audioBase64)).length
  const isSynthesizing = resynthesizingSet.size > 0
  const isGeneratingList = isSynthesizing && readySegments < totalSegments
  const isInitialSynthesis = isGeneratingList
  const synthProgressPercent = totalSegments > 0 ? (readySegments / totalSegments) * 100 : 0

  return (
    <div className="mx-4 my-3 flex flex-col gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 text-[var(--ui-text)] relative">
      {isInitialSynthesis && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-xl bg-[var(--ui-surface)]/80 backdrop-blur-[2px]">
          <div className="w-[80%] max-w-sm space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-3 shadow-lg">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--ui-text)]">
              <span className="flex items-center gap-2">
                <span className="vv-spinner-sm" />
                音声を生成中...
              </span>
              <span>{`${readySegments} / ${totalSegments}`}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ui-progress-bg)]">
              <div
                className="h-full rounded-full bg-[var(--ui-accent)] transition-[width] duration-300"
                style={{ width: `${synthProgressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* When synthesizing single tracks (not initial), show small progress */}
      {!isInitialSynthesis && isSynthesizing && (
        <div className="space-y-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2">
          <div className="flex items-center justify-between text-xs text-[var(--ui-text-secondary)]">
            <span className="flex items-center gap-2">
              <span className="vv-spinner-sm" />
              音声を生成中...
            </span>
            <span>{`${readySegments} / ${totalSegments}`}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ui-progress-bg)]">
            <div
              className="h-full rounded-full bg-[var(--ui-accent)] transition-[width] duration-150"
              style={{ width: `${synthProgressPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="shrink-0">
        <NowPlayingRow
          currentSegment={currentSegment}
          currentPortrait={currentPortrait}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          isSpeakerPanelOpen={showSpeakerPanel}
          onToggleSpeakerPanel={toggleSpeakerPanel}
          prevSegment={prevSegment}
        />
      </div>

      {showSpeakerPanel && (
        <div className="shrink-0">
          <MultiAudioSpeakerPanel
            currentSegment={currentSegment}
            currentPortrait={currentPortrait}
            groupedSpeakers={groupedSpeakers}
            portraits={portraits}
            speakerButtonRefs={speakerButtonRefs}
            draft={editDraft}
            isSaving={isApplying}
            panelMode={panelMode as 'closed' | 'detail' | 'edit'}
            applyToSameSpeaker={applyToSameSpeaker}
            onApplyToSameSpeakerChange={handleApplyToSameSpeakerChange}
            bulkSwitchSpeaker={bulkSwitchSpeaker}
            onBulkSwitchSpeakerChange={handleBulkSwitchSpeakerChange}
            onEnterEdit={openEdit}
            isTextDirty={isEditTextDirty}
            onChangeDraft={setEditDraft}
            onConfirm={(applyToSame, bulkSwitch) => {
              if (editDraft) resynthesizeSegment(editDraft, applyToSame, bulkSwitch)
            }}
            onRegenerate={regenerateCurrentSegment}
            onCancelEdit={cancelEdit}
          />
        </div>
      )}

      <div className="shrink-0">
        <MultiAudioControls
          autoAdvance={autoAdvance}
          autoAdvanceEnabled={panelMode !== 'edit'}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          isEditMode={panelMode === 'edit'}
          isPreviewLoading={isPreviewLoading}
          segmentCount={localSegments.length}
          showTrackList={showTrackList}
          onNext={goNext}
          onPrev={goPrev}
          onRewind={rewind}
          onToggleAutoAdvance={() => setAutoAdvance((value) => !value)}
          onTogglePlay={togglePlay}
          onToggleTrackList={() => setShowTrackList((value) => !value)}
        />
      </div>

      {showTrackList && (
        <div className="shrink-0">
          <MultiAudioTrackList
            currentIndex={currentIndex}
            isPlaying={isPlaying}
            isEditMode={false}
            resynthesizingSet={resynthesizingSet}
            segmentRefs={segmentRefs}
            segments={localSegments}
            onPlaySegment={playSegment}
            onSelectSegment={selectSegment}
            onDeleteSegment={deleteSegment}
            onReorderSegments={reorderSegments}
            onAddSegment={addSegment}
            canExport={exportCapability.available}
            isExporting={isExporting}
            onExportDefault={() => exportTracks(false)}
            onExportChooseDir={() => exportTracks(true)}
            getPortrait={getPortrait}
          />
        </div>
      )}

      <audio ref={audioRef} src={audioSrc} preload="auto" />
    </div>
  )
}
