import { VoicevoxClient, AudioQuery } from "@kajidog/voicevox-client";
import { join } from "path";
import { tmpdir } from "os";
import * as fs from "fs/promises";

const soundPlay = require("sound-play");

// ----- ユーティリティ関数 -----

/**
 * 音声ファイルを再生するユーティリティ関数
 * @param filePath 再生する音声ファイルのパス
 * @param description 再生内容の説明
 */
async function playAudioFile(
  filePath: string,
  description: string = ""
): Promise<void> {
  try {
    const displayText = description ? `${description} (${filePath})` : filePath;
    console.log(`🔊 音声ファイル「${displayText}」の再生を開始します...`);
    await soundPlay.play(filePath);
    console.log(`✅ 音声ファイル「${displayText}」の再生が完了しました`);
  } catch (error) {
    console.error(`❌ 音声再生中にエラーが発生しました: ${error}`);
    throw error;
  }
}

/**
 * ヘッダーを出力する関数
 * @param title セクションタイトル
 */
function printHeader(title: string): void {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📌 ${title}`);
  console.log(`${"=".repeat(80)}`);
}

/**
 * サブセクションのヘッダーを出力する関数
 * @param title セクションタイトル
 */
function printSubHeader(title: string): void {
  console.log(`\n${"- ".repeat(40)}`);
  console.log(`🔹 ${title}`);
  console.log(`${"- ".repeat(40)}`);
}

// ----- クライアントテスト関数 -----

/**
 * VoicevoxClientの基本機能をテストする
 */
async function testTextToSpeech(
  client: VoicevoxClient,
  speaker: number
): Promise<AudioQuery> {
  printSubHeader("テキストから音声再生のテスト");
  const testText = "これはテストです。VOICEVOXの機能を検証します。";

  // 1. speak テスト - テキストからの音声再生
  console.log("➡️ テキストから直接音声再生");
  const speakResult = await client.speak(testText, speaker);
  console.log("✅ 結果:", speakResult);

  // 2. generateQuery テスト - テキストから音声合成用クエリを生成
  console.log("\n➡️ テキストから音声合成用クエリ生成");
  const query = await client.generateQuery(testText, speaker);
  console.log(
    "✅ クエリ生成結果 (一部):",
    JSON.stringify(query).substring(0, 100) + "..."
  );

  return query;
}

/**
 * 音声ファイル生成機能をテストする
 */
async function testAudioFileGeneration(
  client: VoicevoxClient,
  query: AudioQuery,
  speaker: number
): Promise<void> {
  printSubHeader("音声ファイル生成のテスト");

  // 1. クエリから音声ファイルを生成
  console.log("➡️ クエリから音声ファイル生成");
  const outputPath = join(tmpdir(), `voicevox-${Date.now()}.wav`);
  const filePath = await client.generateAudioFile(query, outputPath, speaker);
  console.log(`✅ 音声ファイル生成: ${filePath}`);

  // ファイルが存在するか確認
  const fileExists = await fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
  console.log(
    `📂 ファイルの存在確認: ${fileExists ? "✅ 存在します" : "❌ 存在しません"}`
  );

  // 生成した音声ファイルを再生
  if (fileExists) {
    await playAudioFile(filePath, "クエリから生成した音声");
  }

  // 2. テキストから直接音声ファイルを生成
  console.log("\n➡️ テキストから直接音声ファイル生成");
  const directFilePath = await client.generateAudioFile(
    "直接ファイルに変換するテスト。",
    undefined,
    speaker
  );
  console.log(`✅ 直接音声ファイル生成: ${directFilePath}`);
  await playAudioFile(directFilePath, "テキストから直接生成した音声");
}

/**
 * 再生速度変更機能をテストする
 */
async function testSpeedScale(
  client: VoicevoxClient,
  speaker: number
): Promise<void> {
  printSubHeader("再生速度の変更テスト");

  // 1. 速い再生速度のテスト
  console.log("➡️ 再生速度を1.5倍に設定したテスト");
  const speedTestFilePath = await client.generateAudioFile(
    "これは再生速度を1.5倍に設定したテストです。",
    join(tmpdir(), `voicevox-speed-${Date.now()}.wav`),
    speaker,
    1.5 // 速度を1.5倍に設定
  );
  console.log(`✅ 再生速度1.5倍: ${speedTestFilePath}`);
  await playAudioFile(speedTestFilePath, "速度を1.5倍に設定した音声");

  // 遅い再生速度のテストはタイムアウトを起こしやすいため、条件付きでスキップ
  const doSlowTest = process.env.TEST_SLOW_SPEED === "true";
  if (doSlowTest) {
    // 2. 遅い再生速度のテスト
    console.log("\n➡️ 再生速度を0.8倍に設定したテスト");
    try {
      const slowSpeedTestFilePath = await client.generateAudioFile(
        "これは再生速度を0.8倍に設定したテストです。ゆっくり話します。",
        join(tmpdir(), `voicevox-slow-${Date.now()}.wav`),
        speaker,
        0.8 // 速度を0.8倍に設定
      );
      console.log(`✅ 再生速度0.8倍: ${slowSpeedTestFilePath}`);
      await playAudioFile(slowSpeedTestFilePath, "速度を0.8倍に設定した音声");
    } catch (error) {
      console.warn(`⚠️ 遅い再生速度のテストはスキップされました: ${error}`);
    }
  } else {
    console.log(
      "\n⏭️ 再生速度0.8倍のテストはスキップします (タイムアウト防止のため)"
    );
  }
}

/**
 * 音声生成キュー機能をテストする
 */
async function testAudioQueue(
  client: VoicevoxClient,
  query: AudioQuery,
  speaker: number
): Promise<void> {
  printSubHeader("音声生成キューテスト");

  // クエリを使って音声生成キューに追加
  console.log("➡️ クエリを使って音声生成キューへの追加");
  const enqueueResult = await client.enqueueAudioGeneration(query, speaker);
  console.log(`✅ キュー追加結果:`, enqueueResult);
}

/**
 * VoicevoxClientの基本機能をテストする統合関数
 */
async function testClient(): Promise<AudioQuery> {
  try {
    printHeader("VoicevoxClient直接テスト");

    const client = new VoicevoxClient({
      url: "http://localhost:50021",
      defaultSpeaker: 1,
      defaultSpeedScale: 1.0,
    });

    // テスト用の話者
    const speaker = 5; // 四国めたん (ノーマル)

    // 1. 基本的なテキスト読み上げとクエリ生成
    const query = await testTextToSpeech(client, speaker);

    // 2. 音声ファイル生成
    await testAudioFileGeneration(client, query, speaker);

    // 3. 再生速度変更
    await testSpeedScale(client, speaker);

    // 4. 音声生成キュー
    await testAudioQueue(client, query, speaker);

    return query; // 後のテストで使用するためにクエリを返す
  } catch (error) {
    console.error("❌ クライアントテスト中にエラーが発生しました:", error);
    throw error;
  }
}

// ----- MCPツール関数 -----

/**
 * speak MCPツールをテストする
 */
async function testSpeakTool(client: VoicevoxClient): Promise<void> {
  printSubHeader("speak ツールのテスト");

  // speak ツールハンドラ
  const speakHandler = async (args: {
    text: string;
    speaker?: number;
    speedScale?: number;
  }) => {
    try {
      const { text, speaker, speedScale } = args;
      console.log(
        `➡️ テキスト「${text}」を話者${speaker}、速度${speedScale || 1.0}で発話`
      );
      const result = await client.speak(text, speaker, speedScale);
      console.log("✅ speak 結果:", result);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ エラーが発生しました:", error);
      return {
        content: [{ type: "text", text: `エラー: ${errorMessage}` }],
      };
    }
  };

  // 通常のテスト
  await speakHandler({ text: "MCPツールからのテスト発話です。", speaker: 1 });

  // 速度を変更したテスト
  await speakHandler({
    text: "MCPツールから速度を1.3倍に設定したテスト発話です。",
    speaker: 1,
    speedScale: 1.3,
  });
}

/**
 * generate_query MCPツールをテストする
 */
async function testGenerateQueryTool(
  client: VoicevoxClient
): Promise<AudioQuery> {
  printSubHeader("generate_query ツールのテスト");

  // generate_query ツールハンドラ
  const generateQueryHandler = async (args: {
    text: string;
    speaker?: number;
    speedScale?: number;
  }) => {
    try {
      const { text, speaker, speedScale } = args;
      console.log(
        `➡️ テキスト「${text}」を話者${speaker}、速度${
          speedScale || 1.0
        }でクエリ生成`
      );
      const generatedQuery = await client.generateQuery(
        text,
        speaker,
        speedScale
      );
      const queryJson = JSON.stringify(generatedQuery);
      console.log(
        "✅ クエリ生成結果 (一部):",
        queryJson.substring(0, 100) + "..."
      );
      return {
        content: [{ type: "text", text: queryJson }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ エラーが発生しました:", error);
      return {
        content: [{ type: "text", text: `エラー: ${errorMessage}` }],
      };
    }
  };

  // 実行
  const queryResponse = await generateQueryHandler({
    text: "MCPツールからのクエリ生成テスト。",
    speaker: 1,
    speedScale: 1.2,
  });

  // テキストからJSONに変換
  return JSON.parse(queryResponse.content[0].text);
}

/**
 * synthesize_file MCPツールをテストする
 */
async function testSynthesizeFileTool(
  client: VoicevoxClient,
  query: AudioQuery
): Promise<string> {
  printSubHeader("synthesize_file ツールのテスト");

  // synthesize_file ツールハンドラ
  const synthesizeFileHandler = async (args: {
    query: AudioQuery;
    output: string;
    speaker?: number;
    speedScale?: number;
  }) => {
    try {
      const { query: testQuery, output, speaker, speedScale } = args;
      console.log(`➡️ クエリから音声ファイルを生成: 出力パス=${output}`);
      const filePath = await client.generateAudioFile(
        testQuery,
        output,
        speaker,
        speedScale
      );
      console.log("✅ ファイル生成結果:", filePath);
      return {
        content: [{ type: "text", text: filePath }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ エラーが発生しました:", error);
      return {
        content: [{ type: "text", text: `エラー: ${errorMessage}` }],
      };
    }
  };

  // 実行
  const testOutputPath = "";
  const fileResponse = await synthesizeFileHandler({
    query: query,
    output: testOutputPath,
    speaker: 1,
    speedScale: 0.9,
  });

  return fileResponse.content[0].text;
}

/**
 * MCPツールをテストする統合関数
 */
async function testMcpTools(query: AudioQuery): Promise<void> {
  try {
    printHeader("MCPツールテスト");

    // VoicevoxClientを初期化
    const client = new VoicevoxClient({
      url: process.env.VOICEVOX_URL ?? "http://localhost:50021",
      defaultSpeaker: 1,
      defaultSpeedScale: Number(
        process.env.VOICEVOX_DEFAULT_SPEED_SCALE || "1.0"
      ),
    });

    // 1. speak ツールのテスト
    await testSpeakTool(client);

    // 2. generate_query ツールのテスト
    const generatedQuery = await testGenerateQueryTool(client);

    // 3. synthesize_file ツールのテスト
    const filePath = await testSynthesizeFileTool(client, generatedQuery);

    // 生成したファイルを再生
    printSubHeader("生成したファイルの再生テスト");
    console.log(`➡️ ファイル ${filePath} を再生します...`);
    await playAudioFile(filePath, "MCPツールで生成した音声ファイル");
    console.log("✅ ファイルの再生が完了しました");

    // 待機してキューの処理が完了するのを待つ
    console.log("\n⏳ MCP音声再生を待機しています...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    console.error("❌ MCPツールテスト中にエラーが発生しました:", error);
    throw error;
  }
}

// ----- メイン実行関数 -----

/**
 * メイン実行関数
 */
async function main(): Promise<void> {
  try {
    console.log("🚀 VOICEVOXテストを開始します...");

    // クライアントテスト実行
    const query = await testClient();

    // MCPツールテスト実行
    await testMcpTools(query);

    console.log("\n🎉 すべてのテストが完了しました！");
  } catch (error) {
    console.error("❌ テスト中にエラーが発生しました:", error);
    process.exit(1);
  } finally {
    // 強制的にプロセスを終了
    console.log("👋 プロセスを終了します...");
    setTimeout(() => process.exit(0), 1000);
  }
}

// プログラム実行
main();
