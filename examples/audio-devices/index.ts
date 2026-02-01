/**
 * オーディオデバイスのE2Eテスト
 *
 * 使い方: npx ts-node audio-devices.ts
 *
 * テスト内容:
 * 1. オーディオデバイス一覧の取得
 * 2. 指定したデバイスでの再生テスト
 */
import { VoicevoxClient, listAudioDevices } from '@kajidog/voicevox-client'
import { exit, printHeader, printSubHeader } from '../common/utils'

async function main() {
    printHeader('オーディオデバイス E2Eテスト')

    // =====================================
    // テスト1: オーディオデバイス一覧の取得
    // =====================================
    printSubHeader('1. オーディオデバイス一覧の取得')

    const result = await listAudioDevices()

    console.log(`\nプラットフォーム: ${result.platform}`)
    console.log(`対応状況: ${result.supported ? '対応' : '非対応'}`)

    if (result.error) {
        console.log(`エラー: ${result.error}`)
    }

    if (result.devices.length === 0) {
        console.log('\n利用可能なデバイスが見つかりませんでした。')
        console.log('ffplayがインストールされているか確認してください。')
        exit(0)
        return
    }

    console.log(`\n検出されたデバイス (${result.devices.length}件):`)
    result.devices.forEach((device, index) => {
        console.log(`  ${index + 1}. [${device.id}] ${device.name}${device.type ? ` (${device.type})` : ''}`)
    })

    // =====================================
    // テスト2: 指定したデバイスでの再生テスト
    // =====================================
    printSubHeader('2. 指定したデバイスでの再生テスト')

    // 環境変数またはコマンドライン引数からデバイスIDを取得
    const targetDeviceId = process.env.AUDIO_DEVICE || process.argv[2]

    if (!targetDeviceId) {
        console.log('\n再生テストをスキップします。')
        console.log('特定のデバイスで再生をテストするには:')
        console.log('  - 環境変数 AUDIO_DEVICE を設定')
        console.log('  - または引数でデバイスIDを指定: npx ts-node audio-devices.ts "デバイスID"')
        console.log(`\n例: AUDIO_DEVICE="${result.devices[0]?.id || 'device_id'}" npm run audio-devices`)
        exit(0)
        return
    }

    // 指定されたデバイスが一覧にあるか確認
    const targetDevice = result.devices.find(d => d.id === targetDeviceId)
    if (!targetDevice) {
        console.log(`\n警告: 指定されたデバイス "${targetDeviceId}" は一覧にありません。`)
        console.log('利用可能なデバイスID:')
        result.devices.forEach(device => {
            console.log(`  - ${device.id}`)
        })
    }

    console.log(`\n使用するデバイス: ${targetDeviceId}`)

    try {
        // 指定デバイスでクライアントを作成
        const client = new VoicevoxClient({
            url: process.env.VOICEVOX_URL ?? 'http://localhost:50021',
            defaultSpeaker: Number(process.env.VOICEVOX_DEFAULT_SPEAKER ?? 1),
            audioDevice: targetDeviceId,
        })

        console.log('\nデバイスを指定して音声を再生しています...')
        await client.speak('指定したオーディオデバイスで再生しています。', {
            waitForEnd: true,
        })

        console.log('✓ 再生完了!')

        // デフォルトデバイスでも再生してみる
        printSubHeader('3. デフォルトデバイスでの再生（比較用）')

        const defaultClient = new VoicevoxClient({
            url: process.env.VOICEVOX_URL ?? 'http://localhost:50021',
            defaultSpeaker: Number(process.env.VOICEVOX_DEFAULT_SPEAKER ?? 1),
        })

        console.log('\nデフォルトデバイスで音声を再生しています...')
        await defaultClient.speak('こちらはデフォルトデバイスでの再生です。', {
            waitForEnd: true,
        })

        console.log('✓ 再生完了!')
    } catch (error) {
        console.error('\n再生エラー:', error)
        exit(1)
        return
    }

    console.log('\n===================================')
    console.log('  オーディオデバイス E2Eテスト完了!')
    console.log('===================================\n')
    exit(0)
}

main()
