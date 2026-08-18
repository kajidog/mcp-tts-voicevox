/**
 * Windows (PowerShell) 再生コマンドの組み立て
 *
 * ファイルパスを PowerShell スクリプト内に直接埋め込むと、パスに含まれる
 * 引用符などでスクリプトを脱出され任意コマンドを実行されうる。
 * そのためパスは base64 にエンコードして渡し、PowerShell 側でデコードする。
 * base64 の文字集合（A-Z a-z 0-9 + / =）は PowerShell の文字列内で特別な
 * 意味を持たないため、どんなパスでも安全に埋め込める。
 *
 * このモジュールは副作用を持たない純粋関数のみを公開する（テスト容易性のため）。
 */

/**
 * ファイルパスを PowerShell に安全に渡すための base64 文字列に変換する
 */
export function encodePathForPowerShell(filePath: string): string {
  return Buffer.from(filePath, 'utf8').toString('base64')
}

/**
 * Windows で音声ファイルを再生する PowerShell スクリプトを生成する
 */
export function buildWindowsPlaybackScript(filePath: string): string {
  const encodedPath = encodePathForPowerShell(filePath)
  return [
    'Add-Type -AssemblyName presentationCore;',
    `$path = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${encodedPath}"));`,
    '$player = New-Object System.Windows.Media.MediaPlayer;',
    '$player.Open($path);',
    '$player.Volume = 0.5;',
    // Open() は非同期のため、再生開始前に少し待つ
    'Start-Sleep -Milliseconds 300;',
    '$player.Play();',
    'if ($player.NaturalDuration.HasTimeSpan) { $ms = [int]($player.NaturalDuration.TimeSpan.TotalMilliseconds) + 500; Start-Sleep -Milliseconds $ms } else { Start-Sleep -Seconds 5 };',
    '$player.Close()',
  ].join(' ')
}

/**
 * Windows 再生用の powershell 引数配列を生成する
 */
export function buildWindowsPlaybackArgs(filePath: string): string[] {
  return ['-NoProfile', '-Command', buildWindowsPlaybackScript(filePath)]
}
