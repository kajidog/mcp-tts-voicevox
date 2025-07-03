import { AudioQuery } from "@kajidog/voicevox-client";

/**
 * MCPレスポンス作成ユーティリティ
 */
export const createErrorResponse = (error: unknown, context?: string) => {
  let errorMessage = "不明なエラーが発生しました";
  let details = "";
  
  if (error instanceof Error) {
    errorMessage = error.message;
    if (context) {
      details = `\n詳細: ${context}`;
    }
  } else {
    errorMessage = String(error);
  }
  
  return {
    content: [
      {
        type: "text" as const,
        text: `エラー: ${errorMessage}${details}`,
      },
    ],
  };
};

export const createSuccessResponse = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

/**
 * オーディオクエリ解析
 */
export const parseAudioQuery = (query: string, speedScale?: number): AudioQuery => {
  const audioQuery = JSON.parse(query) as AudioQuery;
  if (speedScale !== undefined) {
    audioQuery.speedScale = speedScale;
  }
  return audioQuery;
};

/**
 * テキスト入力解析（スピーカー指定対応）
 */
export const parseStringInput = (
  input: string
): Array<{ text: string; speaker?: string | number }> => {
  // \n と \\n の両方に対応するため、まず \\n を \n に変換してから分割
  const normalizedInput = input.replace(/\\n/g, "\n");
  const lines = normalizedInput.split("\n").filter((line) => line.trim());
  return lines.map((line) => {
    // name-{id}:text 形式をチェック
    const nameIdMatch = line.match(/^([a-zA-Z0-9_-]+-\d+):(.*)$/);
    if (nameIdMatch) {
      return { text: nameIdMatch[2].trim(), speaker: nameIdMatch[1] };
    }
    
    // 数値:text 形式をチェック（後方互換性）
    const numericMatch = line.match(/^(\d+):(.*)$/);
    if (numericMatch) {
      return { text: numericMatch[2].trim(), speaker: parseInt(numericMatch[1], 10) };
    }
    
    return { text: line };
  });
};