import { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import type { BrowserSite } from '../shared/browserBridge'
import { getVijiaDataDir } from './vijiaStorage'
import { getMainWindow } from './windowManager'
import { getOverlayWebContents } from './overlayManager'

export type SessionLogNoteSource = 'browser-extension'

export type SessionLogNote = {
  id: string
  createdAt: string
  source: SessionLogNoteSource
  site: BrowserSite
  title: string
  url: string
  user: string
  assistant: string
  dedupeKey: string
  bridgeCaptureId: string
}

const sessionLogEvents = new EventEmitter()

let appendChain: Promise<void> = Promise.resolve()

function getSessionLogPath(): string {
  return path.join(getVijiaDataDir(), 'session-log.jsonl')
}

/** Serialized writers so concurrent appends don’t interleave. */
function enqueueAppend(fn: () => Promise<void>): Promise<void> {
  appendChain = appendChain.then(fn, fn)
  return appendChain
}

function broadcastNoteAppended(note: SessionLogNote): void {
  sessionLogEvents.emit('note-appended', note)

  const payload = { note }
  const mw = getMainWindow()
  if (mw && !mw.isDestroyed()) {
    mw.webContents.send(IPC_CHANNELS.VIJIA_NOTE_APPENDED, payload)
  }
  const ow = getOverlayWebContents()
  if (ow && !ow.isDestroyed()) {
    ow.send(IPC_CHANNELS.VIJIA_NOTE_APPENDED, payload)
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    if (mw && win.id === mw.id) continue
    if (ow && win.webContents.id === ow.id) continue
    win.webContents.send(IPC_CHANNELS.VIJIA_NOTE_APPENDED, payload)
  }
}

/**
 * Append one JSON line to session-log.jsonl. Uses a write queue; each line is a full JSON object.
 * For durability across crashes, optional atomic replace via temp+rename can be added for whole-file rewrites;
 * JSONL line append is serialized to avoid torn writes.
 */
export async function appendSessionLogNote(input: Omit<SessionLogNote, 'id' | 'createdAt'>): Promise<SessionLogNote> {
  const note: SessionLogNote = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString()
  }

  const line = `${JSON.stringify(note)}\n`
  const target = getSessionLogPath()

  await mkdir(path.dirname(target), { recursive: true })

  await enqueueAppend(async () => {
    await appendFile(target, line, 'utf8')
  })

  broadcastNoteAppended(note)
  return note
}

export function onSessionNoteAppended(listener: (note: SessionLogNote) => void): () => void {
  sessionLogEvents.on('note-appended', listener)
  return () => {
    sessionLogEvents.off('note-appended', listener)
  }
}

/**
 * Read last N notes from JSONL (tail-parse; sufficient for M3 small files).
 */
export async function readLastSessionNotes(n: number): Promise<SessionLogNote[]> {
  if (n <= 0) {
    return []
  }

  const target = getSessionLogPath()
  let raw = ''
  try {
    raw = await readFile(target, 'utf8')
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as NodeJS.ErrnoException).code
        : undefined
    if (code === 'ENOENT') {
      return []
    }
    throw error
  }

  const lines = raw.split(/\r?\n/u).filter((l) => l.trim().length > 0)
  const slice = lines.slice(-n)
  const out: SessionLogNote[] = []
  for (const line of slice) {
    try {
      const parsed = JSON.parse(line) as SessionLogNote
      if (parsed && typeof parsed.id === 'string') {
        out.push(parsed)
      }
    } catch {
      // skip corrupt line
    }
  }
  return out
}
