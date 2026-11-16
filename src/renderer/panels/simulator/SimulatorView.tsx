// iOS 模拟器 view (PRD F17, Figma 76C / 76D): one simulator, drawn and driven through main (serve-sim). Global, not per
// worktree. States: 需要 Xcode · 选择设备 (simulators by runtime) · 正在启动 · the screen, with the Device Hub row when
// Xcode 27 holds the device's input. Frames flow only while this view is shown and the window is visible.
import { ChevronDown, Circle, CircleAlert, RotateCw, Smartphone } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { findDevice, initialDevice, type SimRuntimeGroup, type SimulatorScreen as Screen } from '@shared/simulator'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../../ui/i18n'
import { IconButton } from '../../ui/IconButton'
import { popupMenu, type MenuEntry } from '../../ui/menu'
import { ClosePanelButton } from '../PaneHeader'
import { SimulatorScreen } from './SimulatorScreen'
import panel from '../RightPanel.module.css'
import styles from './SimulatorView.module.css'

const M = defineMessages({
  zh: {
    title: 'iOS 模拟器',
    chooseDevice: '选择设备',
    home: '主屏幕',
    rotate: '旋转',
    inputBlocked: 'Device Hub 占用了点按和键盘',
    repairInput: '修复输入',
    needsXcode: '需要 Xcode',
    openAppStore: '在 App Store 中打开',
    screen: (name: string) => `${name} 屏幕`,
    reconnect: '重新连接',
    booting: '正在启动',
    noSimulators: '没有可用的 iOS 模拟器',
    open: '打开',
    boot: '启动'
  },
  en: {
    title: 'iOS Simulator',
    chooseDevice: 'Choose device',
    home: 'Home',
    rotate: 'Rotate',
    inputBlocked: 'Device Hub is holding taps and the keyboard',
    repairInput: 'Fix input',
    needsXcode: 'Xcode required',
    openAppStore: 'Open in App Store',
    screen: (name: string) => `${name} screen`,
    reconnect: 'Reconnect',
    booting: 'Booting',
    noSimulators: 'No iOS simulators available',
    open: 'Open',
    boot: 'Boot'
  }
})

const ICON = { size: 16, strokeWidth: 1.75 } as const

type Listing = { kind: 'loading' } | { kind: 'no-xcode' } | { kind: 'devices'; runtimes: SimRuntimeGroup[] }

function useVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

export function SimulatorView() {
  const m = useMessages(M)
  const [listing, setListing] = useState<Listing>({ kind: 'loading' })
  const [chosen, setChosen] = useState<string | null>(null)
  /** Bumped by 重新连接: shows the device again. */
  const [attempt, setAttempt] = useState(0)
  const [screen, setScreen] = useState<Screen | null>(null)
  const [repairing, setRepairing] = useState(false)
  const visible = useVisible()

  useEffect(() => {
    let cancelled = false
    void window.tr.simulator
      .list()
      .then((result) => {
        if (cancelled) return
        if (result.kind === 'no-xcode') return setListing({ kind: 'no-xcode' })
        setListing({ kind: 'devices', runtimes: result.runtimes })
        setChosen(initialDevice(result.runtimes, result.lastUdid)?.udid ?? null)
      })
      // simctl failed (main logged why): an empty list, and the picker reads it again when opened.
      .catch(() => !cancelled && setListing({ kind: 'devices', runtimes: [] }))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => window.tr.simulator.onScreen(setScreen), [])

  useEffect(() => {
    if (!chosen || !visible) return
    window.tr.simulator.show(chosen)
    return () => window.tr.simulator.hide()
  }, [chosen, visible, attempt])

  /** Re-reads the list (a device may have booted or been added since) before the picker opens. */
  const refresh = async (): Promise<SimRuntimeGroup[]> => {
    const result = await window.tr.simulator.list().catch(() => null)
    if (!result) return listing.kind === 'devices' ? listing.runtimes : []
    if (result.kind === 'no-xcode') {
      setListing({ kind: 'no-xcode' })
      return []
    }
    setListing({ kind: 'devices', runtimes: result.runtimes })
    return result.runtimes
  }

  const choose = (udid: string) => {
    setScreen(null)
    setChosen(udid)
    setAttempt((n) => n + 1)
  }

  const openPicker = async (event: MouseEvent<HTMLButtonElement>) => {
    const anchor = event.currentTarget
    const runtimes = await refresh()
    const entries: MenuEntry[] = runtimes.flatMap((group): MenuEntry[] => [
      { type: 'header', label: group.runtime },
      ...group.devices.map((d): MenuEntry => ({ type: 'item', id: d.udid, label: d.name, checked: d.udid === chosen }))
    ])
    if (entries.length === 0) return
    const id = await popupMenu(entries, anchor)
    if (id && id !== chosen) choose(id)
  }

  const runtimes = listing.kind === 'devices' ? listing.runtimes : []
  const device = findDevice(runtimes, chosen)
  const current = screen && screen.udid === chosen ? screen : null
  const live = current?.phase === 'live'

  const repair = async () => {
    setRepairing(true)
    try {
      await window.tr.simulator.repairInput()
    } finally {
      setRepairing(false)
    }
  }

  return (
    <>
      <div className={panel.header}>
        <h2 className={panel.title}>{m.title}</h2>
        <span className={styles.context}>
          {listing.kind === 'devices' && (
            <button
              type="button"
              className={styles.picker}
              data-empty={!device}
              aria-haspopup="menu"
              onClick={(e) => void openPicker(e)}
              data-testid="simulator-picker"
            >
              <span className={styles.pickerLabel}>{device ? `${device.name} · ${device.runtime}` : m.chooseDevice}</span>
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </span>
        <span className={panel.actions}>
          {device && (
            <>
              <IconButton label={m.home} disabled={!live} onClick={() => window.tr.simulator.home()}>
                <Circle {...ICON} />
              </IconButton>
              <IconButton label={m.rotate} disabled={!live} onClick={() => window.tr.simulator.rotate()}>
                <RotateCw {...ICON} />
              </IconButton>
            </>
          )}
          <ClosePanelButton />
        </span>
      </div>
      {current?.inputBlocked && (
        <div className={styles.notice} role="alert">
          <CircleAlert {...ICON} aria-hidden />
          <span className={styles.noticeText}>{m.inputBlocked}</span>
          <button type="button" className={styles.secondary} disabled={repairing} onClick={() => void repair()}>
            {m.repairInput}
          </button>
        </div>
      )}
      {listing.kind === 'no-xcode' ? (
        <div className={styles.center} data-testid="simulator-no-xcode">
          <p className={styles.centerTitle}>{m.needsXcode}</p>
          <button type="button" className={styles.secondary} onClick={() => window.tr.simulator.openXcodeInAppStore()}>
            {m.openAppStore}
          </button>
        </div>
      ) : listing.kind === 'loading' ? null : !device ? (
        <DeviceList runtimes={runtimes} onChoose={choose} />
      ) : (
        <SimulatorScreen
          key={device.udid}
          orientation={current?.orientation ?? 'portrait'}
          live={live}
          label={m.screen(device.name)}
          placeholder={
            current?.phase === 'failed' ? (
              <>
                <span>{current.error}</span>
                <button type="button" className={styles.secondary} onClick={() => setAttempt((n) => n + 1)}>
                  {m.reconnect}
                </button>
              </>
            ) : current?.phase === 'booting' ? (
              m.booting
            ) : null
          }
        />
      )}
    </>
  )
}

/** 选择设备 (Figma 76D): simulators grouped by runtime, 28-high rows, 启动 on hover. */
function DeviceList({ runtimes, onChoose }: { runtimes: SimRuntimeGroup[]; onChoose: (udid: string) => void }) {
  const m = useMessages(M)
  if (runtimes.length === 0) return <p className={styles.empty}>{m.noSimulators}</p>
  return (
    <div className={styles.list} data-testid="simulator-devices">
      {runtimes.map((group) => (
        <section key={group.runtime} aria-label={group.runtime}>
          <h3 className={styles.runtime}>{group.runtime}</h3>
          {group.devices.map((d) => (
            <div key={d.udid} className={styles.row} onClick={() => onChoose(d.udid)}>
              <Smartphone {...ICON} aria-hidden />
              <span className={styles.name}>{d.name}</span>
              <button
                type="button"
                className={styles.ghost}
                onClick={(e) => {
                  e.stopPropagation()
                  onChoose(d.udid)
                }}
              >
                {d.state === 'booted' ? m.open : m.boot}
              </button>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
