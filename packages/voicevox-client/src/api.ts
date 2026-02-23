import { VoicevoxError, VoicevoxErrorCode, handleError } from './error.js'
import type { AccentPhrase, AudioQuery, Speaker, UserDictionaryWord } from './types.js'

export class VoicevoxApi {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = this.normalizeUrl(baseUrl)
  }

  /**
   * テキストから音声合成用クエリを生成
   */
  public async generateQuery(text: string, speaker = 1): Promise<AudioQuery> {
    try {
      const endpoint = `/audio_query?text=${encodeURIComponent(text)}&speaker=${encodeURIComponent(speaker.toString())}`
      const query = await this.makeRequest<AudioQuery>('post', endpoint, null, {
        'Content-Type': 'application/json',
      })

      return query
    } catch (error) {
      throw handleError('音声クエリ生成中にエラーが発生しました', error)
    }
  }

  /**
   * 音声合成用クエリから音声ファイルを生成
   */
  public async synthesize(query: AudioQuery, speaker = 1): Promise<ArrayBuffer> {
    try {
      return await this.makeRequest<ArrayBuffer>(
        'post',
        `/synthesis?speaker=${encodeURIComponent(speaker.toString())}`,
        query,
        {
          'Content-Type': 'application/json',
          Accept: 'audio/wav',
        },
        'arraybuffer'
      )
    } catch (error) {
      throw handleError('音声合成中にエラーが発生しました', error)
    }
  }

  /**
   * プリセットを使用してテキストから音声合成用クエリを生成
   */
  public async generateQueryFromPreset(text: string, presetId: number, coreVersion?: string): Promise<AudioQuery> {
    try {
      let endpoint = `/audio_query_from_preset?text=${encodeURIComponent(
        text
      )}&preset_id=${encodeURIComponent(presetId.toString())}`

      if (coreVersion) {
        endpoint += `&core_version=${encodeURIComponent(coreVersion)}`
      }

      const query = await this.makeRequest<AudioQuery>('post', endpoint, null, {
        'Content-Type': 'application/json',
      })

      return query
    } catch (error) {
      throw handleError('プリセットを使用した音声クエリ生成中にエラーが発生しました', error)
    }
  }

  /**
   * スピーカーの一覧を取得
   */
  public async getSpeakers(): Promise<Speaker[]> {
    try {
      const endpoint = '/speakers'
      const response = await this.makeRequest<Speaker[]>('get', endpoint, null, {
        'Content-Type': 'application/json',
      })

      return response
    } catch (error) {
      throw handleError('スピーカー一覧取得中にエラーが発生しました', error)
    }
  }

  /**
   * スピーカーの情報を取得
   */
  public async getSpeakerInfo(uuid: string): Promise<Speaker> {
    try {
      const endpoint = `/speaker_info?speaker_uuid=${encodeURIComponent(uuid)}`
      const response = await this.makeRequest<Speaker>('get', endpoint, null, {
        'Content-Type': 'application/json',
      })

      return response
    } catch (error) {
      throw handleError('スピーカー情報取得中にエラーが発生しました', error)
    }
  }

  /**
   * VOICEVOX Engine の接続状態をチェック
   * @returns 接続情報（connected, version, url）
   */
  public async checkHealth(): Promise<{ connected: boolean; version?: string; url: string }> {
    try {
      // /version エンドポイントを使用（軽量）
      const version = await this.makeRequest<string>('get', '/version')
      return {
        connected: true,
        version,
        url: this.baseUrl,
      }
    } catch {
      return {
        connected: false,
        url: this.baseUrl,
      }
    }
  }

  /**
   * アクセント句のモーラデータ（音素長・ピッチ）を再計算
   * UIでアクセント位置（accent整数）を変更した後、mora.pitch値を更新するために使用
   */
  public async updateMoraData(accentPhrases: AccentPhrase[], speaker: number): Promise<AccentPhrase[]> {
    try {
      return await this.makeRequest<AccentPhrase[]>(
        'post',
        `/mora_data?speaker=${encodeURIComponent(speaker.toString())}`,
        accentPhrases,
        { 'Content-Type': 'application/json' }
      )
    } catch (error) {
      throw handleError('モーラデータ更新中にエラーが発生しました', error)
    }
  }

  /**
   * ユーザー辞書一覧を取得
   */
  public async getUserDictionary(): Promise<Record<string, UserDictionaryWord>> {
    try {
      return await this.makeRequest<Record<string, UserDictionaryWord>>('get', '/user_dict')
    } catch (error) {
      throw handleError('ユーザー辞書取得中にエラーが発生しました', error)
    }
  }

  /**
   * ユーザー辞書単語を追加
   */
  public async addUserDictionaryWord(input: {
    surface: string
    pronunciation: string
    accentType: number
    priority: number
    wordType?: string
  }): Promise<void> {
    try {
      const params = new URLSearchParams({
        surface: input.surface,
        pronunciation: input.pronunciation,
        accent_type: input.accentType.toString(),
        word_type: input.wordType ?? 'PROPER_NOUN',
        priority: input.priority.toString(),
      })
      await this.makeRequest<string>('post', `/user_dict_word?${params.toString()}`, null, {}, 'text')
    } catch (error) {
      throw handleError('ユーザー辞書追加中にエラーが発生しました', error)
    }
  }

  /**
   * ユーザー辞書単語を更新
   */
  public async updateUserDictionaryWord(input: {
    wordUuid: string
    surface: string
    pronunciation: string
    accentType: number
    priority: number
    wordType?: string
  }): Promise<void> {
    try {
      const params = new URLSearchParams({
        surface: input.surface,
        pronunciation: input.pronunciation,
        accent_type: input.accentType.toString(),
        word_type: input.wordType ?? 'PROPER_NOUN',
        priority: input.priority.toString(),
      })
      await this.makeRequest<string>(
        'put',
        `/user_dict_word/${encodeURIComponent(input.wordUuid)}?${params.toString()}`,
        null,
        {},
        'text'
      )
    } catch (error) {
      throw handleError('ユーザー辞書更新中にエラーが発生しました', error)
    }
  }

  /**
   * ユーザー辞書単語を削除
   */
  public async deleteUserDictionaryWord(wordUuid: string): Promise<void> {
    try {
      await this.makeRequest<string>('delete', `/user_dict_word/${encodeURIComponent(wordUuid)}`, null, {}, 'text')
    } catch (error) {
      throw handleError('ユーザー辞書削除中にエラーが発生しました', error)
    }
  }

  /**
   * APIリクエストを実行
   * @private
   */
  private async makeRequest<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    endpoint: string,
    data: any = null,
    headers: Record<string, string> = {},
    responseType: 'json' | 'arraybuffer' | 'text' = 'json'
  ): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`
      const init: RequestInit = {
        method: method.toUpperCase(),
        headers,
        signal: AbortSignal.timeout(30000),
      }

      if (data !== null) {
        init.body = JSON.stringify(data)
      }

      const response = await fetch(url, init)

      if (!response.ok) {
        throw new VoicevoxError(
          `APIリクエストに失敗しました: ${response.status}`,
          VoicevoxErrorCode.API_CONNECTION_ERROR
        )
      }

      if (responseType === 'arraybuffer') {
        return (await response.arrayBuffer()) as T
      }
      if (responseType === 'text') {
        return (await response.text()) as T
      }
      if (response.status === 204) {
        return null as T
      }
      return (await response.json()) as T
    } catch (error) {
      if (error instanceof VoicevoxError) {
        throw error
      }
      throw new VoicevoxError(
        `APIリクエストに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        VoicevoxErrorCode.API_CONNECTION_ERROR
      )
    }
  }

  /**
   * URLの正規化
   * @private
   */
  private normalizeUrl(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url
  }
}
