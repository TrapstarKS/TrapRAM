import { useEffect, useState } from 'react'
import { Gauge, Cpu, LayoutGrid, Skull, Wand2, Trash, MemoryStick, Check, ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import { api, duration, getSettings } from '../lib/api'
import { Button, Label, Empty, Section, Segmented, Modal, Switch } from './ui'

interface Proc {
  pid: number
  memoryMb: number
  cpu: number
  uptimeSec: number
  priority: string
  background: boolean
  userId?: number
}

interface FlagPreset {
  label: string
  hint: string
  flags: Record<string, string | number | boolean>
}

const LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'below', label: 'Below' },
  { value: 'normal', label: 'Normal' },
  { value: 'above', label: 'Above' },
  { value: 'high', label: 'High' }
] as const

type FlagValue = string | number | boolean

function AppliedFlags({
  flags,
  active,
  presets,
  custom
}: {
  flags: Record<string, FlagValue>
  active: string[]
  presets: Record<string, FlagPreset>
  custom: Record<string, FlagValue>
}) {
  const [open, setOpen] = useState(false)
  const keys = Object.keys(flags).sort()

  if (!keys.length) {
    return (
      <p className="mt-3 text-[11.5px] text-[var(--color-faint)]">
        No flags written — Roblox is running on its own defaults.
      </p>
    )
  }

  const trace = (key: string) => {
    const from = active.filter((p) => presets[p] && key in presets[p].flags).map((p) => presets[p].label)
    if (key in custom) return { source: 'Custom', shadowed: from }
    return { source: from.at(-1) ?? 'On disk', shadowed: from.slice(0, -1) }
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-dim)] transition-colors duration-150 hover:text-[var(--color-text)]"
      >
        <ChevronRight
          size={13}
          strokeWidth={2}
          className="transition-transform duration-150 ease-[var(--ease-out)]"
          style={{ rotate: open ? '90deg' : '0deg' }}
        />
        <span className="num">
          {keys.length} flags written
          {active.length ? ` from ${active.map((p) => presets[p]?.label ?? p).join(' + ')}` : ''}
          {Object.keys(custom).length ? ` · ${Object.keys(custom).length} custom` : ''}
        </span>
      </button>

      {open && (
        <div className="mt-2 overflow-x-auto rounded-[10px] bg-[var(--color-bg-deep)] p-1">
          <table className="w-full text-[11.5px]">
            <tbody>
              {keys.map((key) => {
                const { source, shadowed } = trace(key)
                return (
                  <tr key={key} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="py-1.5 pe-3 ps-2 font-mono text-[11px] whitespace-nowrap">{key}</td>
                    <td className="num py-1.5 pe-3 font-mono text-[11px] font-semibold whitespace-nowrap">
                      {String(flags[key])}
                    </td>
                    <td className="w-full py-1.5 pe-2 text-end">
                      <span
                        className="chip"
                        style={{
                          background: source === 'Custom' ? 'oklch(0.79 0.152 78 / 0.16)' : 'var(--color-raised)',
                          color: source === 'Custom' ? 'var(--color-warn)' : 'var(--color-dim)'
                        }}
                      >
                        {source}
                      </span>
                      {shadowed.length > 0 && (
                        <span className="ms-1.5 text-[10.5px] text-[var(--color-faint)]">
                          overrides {shadowed.join(', ')}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PerformancePanel() {
  const { run, toast, settings, patchSettings, accounts } = useStore()
  const [procs, setProcs] = useState<Proc[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [win, setWin] = useState(false)
  const [presets, setPresets] = useState<Record<string, FlagPreset>>({})
  const [flags, setFlags] = useState<Record<string, string | number | boolean>>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorText, setEditorText] = useState('')
  const [needsAccess, setNeedsAccess] = useState(false)
  const [level, setLevel] = useState('normal')

  useEffect(() => {
    void api.call<{ platform: string }>('app:info').then((i) => setWin(i.platform === 'win32'))
    void api.call<Record<string, FlagPreset>>('flags:presets').then(setPresets).catch(() => undefined)
    void api
      .call<Record<string, FlagValue>>('flags:read')
      .then(async (onDisk) => {
        setFlags(onDisk)

        useStore.setState({ settings: await getSettings() })
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      const list = await api.call<Proc[]>('system:processes').catch(() => [])
      if (alive) setProcs(list)
    }
    void tick()
    const id = setInterval(tick, 3000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const targets = picked.length ? picked : procs.map((p) => p.pid)
  const totalMem = procs.reduce((n, p) => n + p.memoryMb, 0)
  const background = procs.filter((p) => p.background).length

  const nameOf = (userId?: number) => {
    if (!userId) return null
    const a = accounts.find((x) => x.userId === userId)
    if (!a) return null
    return settings?.anonymize ? `#${String(a.userId).slice(-4)}` : a.alias || a.username
  }

  async function tile() {
    const res = await run('Arranging windows', () =>
      api.call<{ tiled: number; needsPermission?: boolean }>('system:tile')
    )
    if (!res) return
    if (res.needsPermission) return setNeedsAccess(true)
    toast(res.tiled ? 'ok' : 'info', res.tiled ? `Arranged ${res.tiled} windows` : 'No Roblox windows to arrange')
  }

  async function grantAccess() {
    setNeedsAccess(false)
    const granted = await api.call<boolean>('system:requestAccessibility')
    if (granted) void tile()
    else toast('info', 'Enable TrapRAM under Privacy & Security → Accessibility, then arrange again')
  }

  const active = settings?.flagPresets ?? []

  async function apply(next: string[], custom?: Record<string, string | number | boolean>) {
    const res = await run('Writing client settings', () =>
      api.call<{ installs: number; flags: Record<string, string | number | boolean> }>('flags:apply', next, custom)
    )
    if (!res) return
    setFlags(res.flags)
    await patchSettings({ flagPresets: next, ...(custom ? { flagCustom: custom } : {}) })
    const count = Object.keys(res.flags).length
    toast(
      'ok',
      count
        ? `${count} flags written to ${res.installs} Roblox install${res.installs === 1 ? '' : 's'} — restart Roblox`
        : 'Back to stock settings — restart Roblox'
    )
  }

  const togglePreset = (key: string) =>
    apply(key === 'clean' ? [] : active.includes(key) ? active.filter((k) => k !== key) : [...active, key])

  return (
    <div className="p-5">
      <Section
        title="Running clients"
        hint={
          procs.length
            ? `${procs.length - background} in game${background ? `, ${background} in the tray` : ''} · ${totalMem.toLocaleString()} MB total`
            : 'Nothing running'
        }
        actions={
          <div className="flex gap-2">
            <Button
              className="!h-[28px] !text-[12px]"
              disabled={!background}
              title="Close the Roblox instances that sit in the tray with no game running"
              onClick={() =>
                void run('Closing background clients', () => api.call<number>('system:killBackground')).then(
                  (n) => n !== undefined && toast('ok', n ? `Closed ${n} background client${n === 1 ? '' : 's'}` : 'None left')
                )
              }
            >
              <Trash size={13} strokeWidth={1.75} />
              Tray
            </Button>
            <Button className="!h-[28px] !text-[12px]" onClick={() => void tile()} disabled={!procs.length}>
              <LayoutGrid size={13} strokeWidth={1.75} />
              Arrange
            </Button>
            <Button
              variant="danger"
              className="!h-[28px] !text-[12px]"
              disabled={!procs.length}
              onClick={() =>
                void run('Closing clients', () => api.call<number>('system:killAll')).then(
                  (n) => n !== undefined && toast('ok', `Closed ${n} client${n === 1 ? '' : 's'}`)
                )
              }
            >
              <Skull size={13} strokeWidth={1.75} />
              Close all
            </Button>
          </div>
        }
      >
        {procs.length === 0 ? (
          <Empty
            icon={<Gauge size={18} strokeWidth={1.75} />}
            title="No Roblox clients running"
            hint="Launch an account and its process shows up here with live memory, CPU and priority controls."
          />
        ) : (
          <>
            <div className="grid gap-1">
              {procs.map((p) => {
                const on = picked.includes(p.pid)
                return (
                  <button
                    key={p.pid}
                    onClick={() => setPicked(on ? picked.filter((x) => x !== p.pid) : [...picked, p.pid])}
                    className="row !py-2"
                    data-selected={on}
                  >
                    <span
                      className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px]"
                      style={{
                        background: on ? 'var(--color-accent)' : 'var(--color-bg-deep)',
                        boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--color-line-strong)'
                      }}
                    >
                      {on ? <Check size={12} strokeWidth={3} color="white" /> : null}
                    </span>
                    <span className="num w-[62px] shrink-0 font-mono text-[11.5px] text-[var(--color-dim)]">
                      {p.pid}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 block truncate text-[12px] font-semibold">
                        {nameOf(p.userId) ?? <span className="text-[var(--color-faint)]">Unknown account</span>}
                      </span>
                      <span className="mb-1 block h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-[var(--color-bg-deep)]">
                        <span
                          className="block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]"
                          style={{
                            width: `${Math.min(100, (p.memoryMb / 4096) * 100)}%`,
                            background:
                              p.memoryMb > 3000 ? 'var(--color-bad)' : p.memoryMb > 1800 ? 'var(--color-warn)' : 'var(--color-ok)'
                          }}
                        />
                      </span>
                      <span className="num text-[11px] text-[var(--color-faint)]">
                        {p.memoryMb.toLocaleString()} MB · {p.cpu}% CPU · up {duration(p.uptimeSec)}
                        {p.background ? ' · background' : ''}
                      </span>
                    </span>
                    <span className="chip shrink-0 bg-[var(--color-raised)] text-[var(--color-dim)]">{p.priority}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-4 rounded-[10px] bg-[var(--color-raised)] p-3">
              <Label hint={picked.length ? `Applies to ${picked.length} selected` : 'Applies to every running client'}>
                Process tuning
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  value={level}
                  options={LEVELS as unknown as { value: string; label: string }[]}
                  onChange={(next) => {
                    setLevel(next)
                    void run(
                      'Setting priority',
                      () => api.call('system:priority', targets, next),
                      `Priority set to ${next}`
                    )
                  }}
                />
                {win && (
                  <>
                    <Button
                      className="!h-[28px] !text-[12px]"
                      onClick={() =>
                        void run('Trimming memory', () => api.call<number>('system:trim', targets)).then(
                          (n) => n !== undefined && toast('ok', `Released working set on ${n} client${n === 1 ? '' : 's'}`)
                        )
                      }
                    >
                      <MemoryStick size={13} strokeWidth={1.75} />
                      Trim memory
                    </Button>
                    <Button
                      className="!h-[28px] !text-[12px]"
                      onClick={() =>
                        void run('Setting affinity', () =>
                          api.call('system:affinity', targets, Math.max(2, Math.floor(navigator.hardwareConcurrency / 2)))
                        , 'Limited to half the CPU cores')
                      }
                    >
                      <Cpu size={13} strokeWidth={1.75} />
                      Half the cores
                    </Button>
                  </>
                )}
                {picked.length > 0 && (
                  <Button
                    variant="danger"
                    className="!h-[28px] !text-[12px]"
                    onClick={() =>
                      void run('Closing', () => api.call('system:kill', picked), 'Closed').then(() => setPicked([]))
                    }
                  >
                    <Trash size={13} strokeWidth={1.75} />
                    Close selected
                  </Button>
                )}
              </div>
              {!win && (
                <p className="mt-2 text-[11.5px] leading-snug text-[var(--color-faint)]">
                  Raising priority above normal needs root on macOS, so TrapRAM caps it at normal instead of asking for
                  your password.
                </p>
              )}
            </div>
          </>
        )}
      </Section>

      <Section
        title="Client tuning"
        hint="Writes ClientAppSettings.json in every Roblox install TrapRAM can see"
        actions={
          <Button
            className="!h-[28px] !text-[12px]"
            onClick={() => {
              setEditorText(JSON.stringify(settings?.flagCustom ?? {}, null, 2))
              setEditorOpen(true)
            }}
          >
            <Wand2 size={13} strokeWidth={1.75} />
            Custom flags
          </Button>
        }
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
          {Object.entries(presets).map(([key, p]) => {
            const on = key === 'clean' ? active.length === 0 : active.includes(key)
            return (
              <button
                key={key}
                onClick={() => void togglePreset(key)}
                aria-pressed={on}
                className="relative rounded-[10px] p-3 text-start transition-[background-color,box-shadow,scale] duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
                style={{
                  background: on ? 'var(--color-accent-soft)' : 'var(--color-raised)',
                  boxShadow: on ? 'inset 0 0 0 1px oklch(0.658 0.196 288 / 0.4)' : 'inset 0 0 0 1px transparent'
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold">{p.label}</span>
                  {on && key !== 'clean' && (
                    <Check size={12} strokeWidth={3} style={{ color: 'var(--color-accent-text)' }} />
                  )}
                </div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-[var(--color-dim)]">{p.hint}</div>
              </button>
            )
          })}
        </div>
        <AppliedFlags flags={flags} active={active} presets={presets} custom={settings?.flagCustom ?? {}} />
      </Section>

      <Section title="After every bulk launch" hint="Runs automatically once the clients have had time to open">
        <Switch
          checked={settings?.autoTile ?? false}
          onChange={(v) => void patchSettings({ autoTile: v })}
          label="Arrange windows in a grid"
          hint={win ? undefined : 'macOS asks for Accessibility permission the first time — once, not every launch'}
        />
      </Section>

      <Modal
        open={needsAccess}
        title="macOS needs one permission"
        description="Moving other apps' windows requires Accessibility access. TrapRAM asks once and never again."
        onClose={() => setNeedsAccess(false)}
        footer={
          <>
            <Button onClick={() => setNeedsAccess(false)}>Not now</Button>
            <Button variant="primary" onClick={() => void grantAccess()}>
              Open the prompt
            </Button>
          </>
        }
      />

      <Modal
        open={editorOpen}
        title="Custom flags"
        description="Layered on top of the presets above and kept when you toggle them. Unknown flags are ignored by Roblox."
        onClose={() => setEditorOpen(false)}
        wide
        footer={
          <>
            <Button onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                let parsed: Record<string, string | number | boolean>
                try {
                  parsed = JSON.parse(editorText || '{}')
                } catch {
                  return toast('err', 'That is not valid JSON')
                }
                void apply(active, parsed).then(() => setEditorOpen(false))
              }}
            >
              Save and write
            </Button>
          </>
        }
      >
        <textarea
          aria-label="Custom flags JSON"
          className="field h-[300px] resize-none py-2 font-mono text-[11.5px] leading-relaxed"
          value={editorText}
          onChange={(e) => setEditorText(e.target.value)}
          spellCheck={false}
        />
      </Modal>
    </div>
  )
}
