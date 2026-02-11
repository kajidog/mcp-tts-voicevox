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
}

export function MultiAudioPlayer({ data, app }: MultiAudioPlayerProps) {
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
    isSingleTrack,
    localSegments,
    autoAdvance,
    groupedSpeakers,
    portraits,
    prevSegment,
    resynthesizingSet,
    showSpeakerPanel,
    showTrackList,
    changeCurrentSpeaker,
    goNext,
    goPrev,
    playSegment,
    rewind,
    selectSegment,
    setAutoAdvance,
    setShowSpeakerPanel,
    setShowTrackList,
    togglePlay,
    audioSrc,
    getPortrait,
  } = useMultiAudioPlayer({ app, data })

  return (
    <div className="player">
      <NowPlayingRow
        currentSegment={currentSegment}
        currentPortrait={currentPortrait}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        onToggleSpeakerPanel={() => setShowSpeakerPanel((visible) => !visible)}
        prevSegment={prevSegment}
      />

      {showSpeakerPanel && (
        <MultiAudioSpeakerPanel
          currentSpeaker={currentSegment?.speaker}
          groupedSpeakers={groupedSpeakers}
          portraits={portraits}
          speakerButtonRefs={speakerButtonRefs}
          onChangeSpeaker={changeCurrentSpeaker}
        />
      )}

      <MultiAudioControls
        autoAdvance={autoAdvance}
        currentIndex={currentIndex}
        isPlaying={isPlaying}
        isSingleTrack={isSingleTrack}
        segmentCount={localSegments.length}
        showTrackList={showTrackList}
        onNext={goNext}
        onPrev={goPrev}
        onRewind={rewind}
        onToggleAutoAdvance={() => setAutoAdvance((value) => !value)}
        onTogglePlay={togglePlay}
        onToggleTrackList={() => setShowTrackList((value) => !value)}
      />

      {!isSingleTrack && showTrackList && (
        <MultiAudioTrackList
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          resynthesizingSet={resynthesizingSet}
          segmentRefs={segmentRefs}
          segments={localSegments}
          onPlaySegment={playSegment}
          onSelectSegment={selectSegment}
          getPortrait={getPortrait}
        />
      )}

      <audio ref={audioRef} src={audioSrc} preload="auto" />
    </div>
  )
}
