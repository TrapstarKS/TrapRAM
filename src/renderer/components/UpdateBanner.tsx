import { useState } from 'react'
import { Download, Sparkles, RefreshCw, X } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../lib/api'
import { Button, Modal } from './ui'

export default function UpdateBanner() {
  const update = useStore((s) => s.update)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)

  const relevant =
    update.status === 'available' ||
    update.status === 'downloading' ||
    update.status === 'ready' ||
    update.status === 'error'
  if (!relevant || dismissed === update.version) return null

  const downloading = update.status === 'downloading'
  const ready = update.status === 'ready'
  const failed = update.status === 'error'

  return (
    <>
      <div className="rise mx-2 mb-2 flex items-center gap-3 rounded-[12px] px-3.5 py-2.5"
        style={{
          background: 'var(--color-accent-soft)',
          boxShadow: 'inset 0 0 0 1px oklch(0.658 0.196 288 / 0.3)'
        }}
      >
        <Sparkles size={16} strokeWidth={1.75} style={{ color: 'var(--color-accent-text)' }} className="shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold">
            {failed
              ? 'The update could not be installed'
              : ready
                ? `Version ${update.version} is ready to install`
                : `Version ${update.version} is available`}
          </div>
          {failed ? (
            <div className="mt-0.5 text-[11.5px] leading-snug text-[var(--color-dim)]">
              {update.error} — download it by hand from the releases page.
            </div>
          ) : downloading ? (
            <div className="mt-1.5 h-1 w-full max-w-[240px] overflow-hidden rounded-full bg-[var(--color-bg-deep)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300 ease-[var(--ease-out)]"
                style={{ width: `${update.percent ?? 0}%` }}
              />
            </div>
          ) : update.notes ? (
            <button
              className="text-[11.5px] text-[var(--color-dim)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-text)]"
              onClick={() => setNotesOpen(true)}
            >
              See what changed
            </button>
          ) : null}
        </div>

        {failed ? null : downloading ? (
          <span className="num text-[12px] text-[var(--color-dim)]">{update.percent ?? 0}%</span>
        ) : ready ? (
          <Button variant="primary" onClick={() => void api.call('update:install')}>
            <RefreshCw size={13} strokeWidth={2} />
            Restart now
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void api.call('update:download')}>
            <Download size={13} strokeWidth={2} />
            Download
          </Button>
        )}

        <button
          onClick={() => setDismissed(update.version ?? null)}
          aria-label="Dismiss update notice"
          className="rounded p-1 text-[var(--color-faint)] transition-colors hover:text-[var(--color-text)]"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <Modal
        open={notesOpen}
        title={`What's new in ${update.version}`}
        onClose={() => setNotesOpen(false)}
        footer={<Button onClick={() => setNotesOpen(false)}>Close</Button>}
        wide
      >
        <div className="max-h-[50vh] overflow-y-auto text-[12.5px] leading-relaxed whitespace-pre-wrap text-[var(--color-dim)]">
          {update.notes?.replace(/<[^>]+>/g, '') || 'No release notes provided.'}
        </div>
      </Modal>
    </>
  )
}
