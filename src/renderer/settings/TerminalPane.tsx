// 设置 · 终端 (Figma 66C / 66G): everything the CLI sessions' terminal reads — colors, font, screen reader.
import { useMemo } from 'react'
import { isOpaqueMaterial, LIMITS, type AppearancePatch, type AppearanceSettings } from '@shared/settings'
import { defineMessages, withLang } from '@shared/i18n'
import { Segmented } from '../ui/Segmented'
import { useLang, useMessages } from '../ui/i18n'
import { hasCustomBackground } from '../appearance/map'
import { buildCustomTheme } from '../terminal/appearance'
import { HexField, PreviewPage, Row, Section, Select, Slider, Toggle, type SelectOption } from './controls'
import {
  BACKGROUND_OPTIONS,
  cjkOptions,
  fontSizeOptions,
  formatLineHeight,
  formatPercent,
  isPageDefault,
  latinOption,
  pageDefaults,
  previewCaption
} from './appearance-form'
import { withCurrent } from './fonts'
import { useFontCatalog } from './local-fonts'
import { PreviewTerminal } from './PreviewTerminal'
import { useThemeBackground } from './useThemeBackground'
import styles from './AppearancePane.module.css'

const M = defineMessages({
  zh: {
    title: '终端',
    colors: '配色',
    background: '终端底色',
    backgroundColor: '底色值',
    opacity: '终端不透明度',
    importTheme: '导入主题…',
    fonts: '字体',
    latinFont: '英文字体',
    cjkFont: '中文字体',
    searchFont: '搜索或输入字体名',
    size: '字号',
    lineHeight: '行高',
    ligatures: '连字',
    noFontList: '无法读取已安装的字体列表。可以直接在字体菜单中输入字体名称。',
    accessibility: '辅助功能',
    screenReader: '读屏模式',
    screenReaderHint: '让 VoiceOver 朗读终端输出。会稍微增加渲染开销。'
  },
  en: {
    title: 'Terminal',
    colors: 'Colors',
    background: 'Terminal background',
    backgroundColor: 'Background color',
    opacity: 'Terminal opacity',
    importTheme: 'Import theme…',
    fonts: 'Fonts',
    latinFont: 'English font',
    cjkFont: 'Chinese font',
    searchFont: 'Search or type a font name',
    size: 'Size',
    lineHeight: 'Line height',
    ligatures: 'Ligatures',
    noFontList: 'Can’t read the list of installed fonts. You can type a font name in the font menu.',
    accessibility: 'Accessibility',
    screenReader: 'Screen reader mode',
    screenReaderHint: 'Lets VoiceOver read terminal output. Adds a little rendering cost.'
  }
})

export function TerminalPane({ appearance, update }: { appearance: AppearanceSettings; update: (patch: AppearancePatch) => void }) {
  const { catalog, access } = useFontCatalog()
  const m = useMessages(M)
  // The Chinese menu's group headings are in the interface language.
  const lang = useLang()
  const latinOptions = useMemo(() => withCurrent(catalog.latin, appearance.latinFont).map(latinOption), [catalog.latin, appearance.latinFont])
  const cjk = useMemo(() => withLang(lang, () => cjkOptions(catalog.cjk, appearance.cjkFont)), [catalog.cjk, appearance.cjkFont, lang])
  const sizeOptions = useMemo<SelectOption[]>(
    () => fontSizeOptions(appearance.fontSize).map((size) => ({ value: String(size), label: String(size) })),
    [appearance.fontSize]
  )
  const themeBackground = useThemeBackground()
  const background = appearance.terminalBackground
  const custom = hasCustomBackground(appearance)
  // The preview terminal gets the colors the session terminals get.
  const customTheme = useMemo(
    () => (custom ? buildCustomTheme(background.color, appearance.terminalColors) : undefined),
    [custom, background.color, appearance.terminalColors]
  )

  return (
    <PreviewPage
      title={m.title}
      preview={
        <div className={styles.previewField}>
          <PreviewTerminal appearance={{ ...appearance, customTheme }} />
        </div>
      }
      caption={previewCaption(appearance)}
      isDefault={isPageDefault(appearance, 'terminal')}
      onReset={() => update(pageDefaults('terminal'))}
    >
      <Section title={m.colors}>
        <Row label={m.background} id="terminalBackground">
          <Segmented
            label={m.background}
            value={background.mode}
            options={BACKGROUND_OPTIONS}
            onChange={(mode) => update({ terminalBackground: { ...background, mode } })}
          />
        </Row>
        <Row label={m.backgroundColor} id="terminalBackgroundColor">
          <HexField
            label={m.backgroundColor}
            value={custom ? background.color : themeBackground}
            disabled={!custom}
            onCommit={(color) => update({ terminalBackground: { mode: 'custom', color } })}
          />
        </Row>
        {/* 实色 makes every card opaque (Figma 66B), so the opacity has nothing to change there. */}
        {!isOpaqueMaterial(appearance.windowMaterial) && (
          <Row label={m.opacity} id="terminalOpacity">
            <Slider
              label={m.opacity}
              value={appearance.terminalOpacity}
              min={LIMITS.terminalOpacity.min}
              max={LIMITS.terminalOpacity.max}
              step={0.01}
              format={formatPercent}
              onCommit={(terminalOpacity) => update({ terminalOpacity })}
            />
          </Row>
        )}
        <button type="button" className={styles.importButton} onClick={() => void window.tr.settings.importTheme()}>
          {m.importTheme}
        </button>
      </Section>

      <Section title={m.fonts}>
        <Row label={m.latinFont} id="latinFont">
          <Select
            label={m.latinFont}
            value={appearance.latinFont}
            options={latinOptions}
            allowCustom
            placeholder={m.searchFont}
            onChange={(latinFont) => update({ latinFont })}
          />
        </Row>
        <Row label={m.cjkFont} id="cjkFont">
          <Select
            label={m.cjkFont}
            value={appearance.cjkFont}
            options={cjk}
            allowCustom
            placeholder={m.searchFont}
            onChange={(cjkFont) => update({ cjkFont })}
          />
        </Row>
        <Row label={m.size} id="fontSize">
          <Select label={m.size} value={String(appearance.fontSize)} options={sizeOptions} onChange={(size) => update({ fontSize: Number(size) })} />
        </Row>
        <Row label={m.lineHeight} id="lineHeight">
          <Slider
            label={m.lineHeight}
            value={appearance.lineHeight}
            min={LIMITS.lineHeight.min}
            max={LIMITS.lineHeight.max}
            step={0.05}
            format={formatLineHeight}
            onCommit={(lineHeight) => update({ lineHeight })}
          />
        </Row>
        <Row label={m.ligatures} id="ligatures">
          <Toggle label={m.ligatures} checked={appearance.ligatures} onChange={(ligatures) => update({ ligatures })} />
        </Row>
        {(access === 'denied' || access === 'unsupported') && <p className={styles.hint}>{m.noFontList}</p>}
      </Section>

      <Section title={m.accessibility}>
        <Row label={m.screenReader} id="screenReader">
          <Toggle label={m.screenReader} checked={appearance.screenReader} onChange={(screenReader) => update({ screenReader })} />
        </Row>
        <p className={styles.hint}>{m.screenReaderHint}</p>
      </Section>
    </PreviewPage>
  )
}
