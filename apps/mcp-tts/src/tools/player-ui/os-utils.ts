import { spawn, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'

const commandExistsCache = new Map<string, boolean>()

function commandExists(command: string): boolean {
  if (commandExistsCache.has(command)) return commandExistsCache.get(command)!

  if (process.platform === 'win32' && command === 'explorer') {
    commandExistsCache.set(command, true)
    return true
  }

  const checkCmd = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(checkCmd, [command], { stdio: 'ignore' })
  const exists = result.status === 0
  commandExistsCache.set(command, exists)
  return exists
}

export function canOpenExplorer(): boolean {
  if (process.platform === 'win32') return commandExists('explorer')
  if (process.platform === 'darwin') return commandExists('open')
  if (process.platform === 'linux') {
    const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
    return hasDisplay && commandExists('xdg-open')
  }
  return false
}

export function canChooseDirectoryDialog(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin'
}

export function sanitizeFilePart(input: string, fallback: string): string {
  const value = input
    .trim()
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional filename sanitization
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40)
  return value.length > 0 ? value : fallback
}

export function openDirectoryInExplorer(directoryPath: string): boolean {
  try {
    const child =
      process.platform === 'win32'
        ? spawn('explorer', [directoryPath], { detached: true, stdio: 'ignore' })
        : process.platform === 'darwin'
          ? spawn('open', [directoryPath], { detached: true, stdio: 'ignore' })
          : spawn('xdg-open', [directoryPath], { detached: true, stdio: 'ignore' })
    child.unref()
    return true
  } catch {
    return false
  }
}

export function showDirectoryPicker(defaultPath?: string): Promise<string | null> {
  return new Promise((resolvePicker) => {
    if (process.platform === 'win32') {
      const defaultPathB64 = defaultPath ? Buffer.from(defaultPath).toString('base64') : ''
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $form = New-Object System.Windows.Forms.Form
        $form.TopMost = $true
        $form.ShowInTaskbar = $false
        $form.WindowState = 'Minimized'
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "Select Export Folder"
        ${defaultPathB64 ? `$dialog.SelectedPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${defaultPathB64}"))` : ''}
        $dialog.ShowNewFolderButton = $true
        if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
            Write-Output $dialog.SelectedPath
        }
      `
      const child = spawn('powershell', ['-NoProfile', '-Command', psScript], { stdio: ['ignore', 'pipe', 'ignore'] })
      let output = ''
      child.stdout.on('data', (data) => {
        output += data.toString()
      })
      child.on('close', () => {
        const path = output.trim()
        resolvePicker(path || null)
      })
    } else if (process.platform === 'darwin') {
      const script = `on run argv
try
  ${defaultPath ? 'set defaultArg to item 1 of argv' : ''}
  return POSIX path of (choose folder with prompt "Select Export Folder" ${defaultPath ? 'default location POSIX file defaultArg' : ''})
on error
  return ""
end try
end run`
      const args = ['-e', script]
      if (defaultPath) args.push(defaultPath)
      const child = spawn('osascript', args, { stdio: ['ignore', 'pipe', 'ignore'] })
      let output = ''
      child.stdout.on('data', (data) => {
        output += data.toString()
      })
      child.on('close', () => {
        const path = output.trim()
        resolvePicker(path || null)
      })
    } else {
      resolvePicker(null)
    }
  })
}

export function normalizeOutputDirectory(rawPath: string): string {
  return resolve(rawPath)
}

export function resolveParentDirectory(directoryPath: string): string {
  return dirname(resolve(directoryPath))
}
