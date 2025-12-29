/**
 * VOICEVOXクライアントの設定オブジェクト
 */
export interface VoicevoxConfig {
  /** VOICEVOXエンジンのURL */
  url: string
  /** デフォルトの話者ID */
  defaultSpeaker: number
  /** デフォルトの再生速度 */
  defaultSpeedScale?: number
  /** デフォルトの再生オプション */
  defaultPlaybackOptions?: PlaybackOptions
}

/**
 * 音声合成用のクエリ
 */
export interface AudioQuery {
  /** アクセント句のリスト */
  accent_phrases: AccentPhrase[]
  /** 全体の話速 */
  speedScale: number
  /** 全体の音高 */
  pitchScale: number
  /** 全体の抑揚 */
  intonationScale: number
  /** 全体の音量 */
  volumeScale: number
  /** 音声の前の無音時間 */
  prePhonemeLength: number
  /** 音声の後の無音時間 */
  postPhonemeLength: number
  /** 音声データの出力サンプリングレート */
  outputSamplingRate: number
  /** 音声データをステレオ出力するか否か */
  outputStereo: boolean
  /** AquesTalk風記法によるテキスト */
  kana?: string
}

/**
 * 文字列またはAudioQueryのいずれかを受け入れる型
 */
export type StringOrAudioQuery = string | AudioQuery

/**
 * アクセント句ごとの情報
 */
export interface AccentPhrase {
  /** モーラのリスト */
  moras: Mora[]
  /** アクセント箇所 */
  accent: number
  /** 後ろに無音を付けるかどうか */
  pause_mora?: Mora
  /** 疑問形かどうか */
  is_interrogative?: boolean
}

/**
 * モーラ（子音＋母音）ごとの情報
 */
export interface Mora {
  /** 文字 */
  text: string
  /** 子音の音素 */
  consonant?: string
  /** 子音の音長 */
  consonant_length?: number
  /** 母音の音素 */
  vowel: string
  /** 母音の音長 */
  vowel_length: number
  /** 音高 */
  pitch: number
}

/**
 * 歌唱パラメータ
 */
export interface SingingParameters {
  /** 全体の話速 */
  speedScale?: number
  /** 全体の音高 */
  pitchScale?: number
  /** 全体の抑揚 */
  intonationScale?: number
  /** 全体の音量 */
  volumeScale?: number
}

/**
 * 楽譜情報
 */
export interface Score {
  /** 音符のリスト */
  notes: Note[]
}

/**
 * 音符ごとの情報
 */
export interface Note {
  /** ID */
  id?: string | null
  /** 音階 */
  key?: number
  /** 音符のフレーム長 */
  frame_length: number
  /** 音符の歌詞 */
  lyric: string
}

/**
 * フレームごとの音声合成用のクエリ
 */
export interface FrameAudioQuery {
  /** フレームごとの基本周波数 */
  f0: number[]
  /** フレームごとの音量 */
  volume: number[]
  /** 音素のリスト */
  phonemes: FramePhoneme[]
  /** 全体の音量 */
  volumeScale: number
  /** 音声データの出力サンプリングレート */
  outputSamplingRate: number
  /** 音声データをステレオ出力するか否か */
  outputStereo: boolean
}

/**
 * 音素の情報
 */
export interface FramePhoneme {
  /** 音素 */
  phoneme: string
  /** 音素のフレーム長 */
  frame_length: number
  /** 音符のID */
  note_id?: string | null
}

/**
 * スピーカーの情報
 */
export interface Speaker {
  name: string
  speaker_uuid: string
  styles: {
    name: string
    id: number
    type: string
  }[]
  version: string
  supported_features: {
    permitted_synthesis_morphing: string
  }
}

// VoicevoxError は error.ts から再エクスポートされるため削除

// 音声セグメント定義
export interface SpeechSegment {
  text: string
  speaker?: number
}

/**
 * 音声再生のオプション
 */
export interface PlaybackOptions {
  /** 即座に再生を開始するかどうか */
  immediate?: boolean
  /** 再生開始まで待機するかどうか */
  waitForStart?: boolean
  /** 再生終了まで待機するかどうか */
  waitForEnd?: boolean
}

/**
 * speak()メソッドの結果
 */
export interface SpeakResult {
  /** 処理状態 */
  status: 'queued' | 'playing' | 'played' | 'error'
  /** 再生モード */
  mode: 'streaming' | 'file'
  /** テキストプレビュー */
  textPreview: string
  /** セグメント数 */
  segmentCount: number
  /** エラーメッセージ（status='error'の場合） */
  errorMessage?: string
}
