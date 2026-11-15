// 设置 · 外观 (Figma 66A / 66B, 86, 89): what the whole window looks like — language, theme, material, 背景图片, 全屏背景. The
// terminal's and the chat's own settings are on 终端 and 对话.
import { useRef, type ReactNode } from 'react'
import { backgroundImageUrl } from '@shared/background-image'
import { defineMessages, type LanguagePreference } from '@shared/i18n'
import { FULLSCREEN_BACKDROPS, LIMITS, type AppearancePatch, type AppearanceSettings, type FullscreenBackdrop } from '@shared/settings'
import { Segmented } from '../ui/Segmented'
import { GlassBase } from '../ui/GlassBase'
import { Button, PreviewPage, Row, Section, Slider, ThemeSwatches } from './controls'
import { MATERIAL_OPTIONS, THEME_OPTIONS, formatPercent, isPageDefault, pageDefaults } from './appearance-form'
import { backgroundFromFile } from './background-image'
import { useMessages } from '../i18n'
import styles from './AppearancePane.module.css'

const M = defineMessages({
  zh: {
    language: '语言',
    interfaceLanguage: '界面语言',
    system: '跟随系统',
    chinese: '中文',
    english: 'English',
    title: '外观',
    theme: '主题',
    window: '窗口',
    material: '材质',
    backgroundImage: '背景图片',
    image: '图片',
    replace: '更换…',
    chooseImage: '选择图片…',
    remove: '移除',
    blur: '模糊',
    fullscreenBackdrop: '全屏背景',
    auto: '自动'
  },
  en: {
    language: 'Language',
    interfaceLanguage: 'Interface language',
    system: 'System',
    chinese: '中文',
    english: 'English',
    title: 'Appearance',
    theme: 'Theme',
    window: 'Window',
    material: 'Material',
    backgroundImage: 'Background image',
    image: 'Image',
    replace: 'Replace…',
    chooseImage: 'Choose image…',
    remove: 'Remove',
    blur: 'Blur',
    fullscreenBackdrop: 'Full-screen backdrop',
    auto: 'Auto'
  }
})

/** 全屏背景 (Figma 38): the author's 配图底托, named for what they look like; 自动 is 晴空 in light mode, 夜火 in dark. */
const BACKDROP_NAMES = defineMessages<Record<(typeof FULLSCREEN_BACKDROPS)[number], string>>({
  zh: {
    sky: '晴空',
    meadow: '青原',
    lake: '湖岸',
    dune: '沙丘',
    pine: '松林',
    dusk: '暮紫',
    coral: '珊瑚',
    sunset: '晚霞',
    ember: '夜火',
    plum: '霞紫'
  },
  en: {
    sky: 'Clear sky',
    meadow: 'Meadow',
    lake: 'Lakeshore',
    dune: 'Dunes',
    pine: 'Pines',
    dusk: 'Dusk',
    coral: 'Coral',
    sunset: 'Sunset',
    ember: 'Bonfire',
    plum: 'Afterglow'
  }
})
const field = (id: string) => <span className={styles.backdropField} style={{ background: `var(--fsb-${id})` }} />
function backdropOptions(auto: string, names: Record<(typeof FULLSCREEN_BACKDROPS)[number], string>): ReadonlyArray<{ value: FullscreenBackdrop; label: string; preview: ReactNode }> {
  return [
    {
      value: 'auto',
      label: auto,
      preview: (
        <>
          {field('sky')}
          <span className={styles.backdropHalf}>{field('ember')}</span>
        </>
      )
    },
    ...FULLSCREEN_BACKDROPS.map((id) => ({ value: id, label: names[id], preview: field(id) }))
  ]
}

/**
 * A small window over a desktop field, drawn with the variables the app applies (appearance/map.ts, AppShell): the
 * cards are the terminal and the chat at their opacities on the base layer, one step more opaque than the shown session's.
 */
function WindowPreview() {
  return (
    <div className={styles.windowPreview} data-testid="window-preview" aria-hidden>
      <div className={styles.miniWindow}>
        <GlassBase />
        <div className={styles.miniSidebar}>
          <span />
          <span />
          <span />
        </div>
        <div className={`${styles.miniCard} ${styles.miniTerminal}`} data-glass-card="">
          <span />
          <span />
        </div>
        <div className={`${styles.miniCard} ${styles.miniChat}`} data-glass-card="">
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}

export function AppearancePane({ appearance, update }: { appearance: AppearanceSettings; update: (patch: AppearancePatch) => void }) {
  const solid = appearance.windowMaterial === 'solid'
  const image = appearance.backgroundImage
  const picker = useRef<HTMLInputElement>(null)
  const m = useMessages(M)
  const backdropNames = useMessages(BACKDROP_NAMES)
  // Each language's own name, whatever the interface shows (Figma 89).
  const languageOptions: ReadonlyArray<{ value: LanguagePreference; label: string }> = [
    { value: 'system', label: m.system },
    { value: 'zh', label: m.chinese },
    { value: 'en', label: m.english }
  ]
  return (
    <PreviewPage
      title={m.title}
      preview={<WindowPreview />}
      isDefault={isPageDefault(appearance, 'appearance')}
      onReset={() => update(pageDefaults('appearance'))}
    >
      <Section title={m.language}>
        <Row label={m.interfaceLanguage} id="language">
          <Segmented label={m.interfaceLanguage} value={appearance.language} options={languageOptions} onChange={(language) => update({ language })} />
        </Row>
      </Section>

      <Section title={m.theme}>
        <ThemeSwatches label={m.theme} value={appearance.theme} options={THEME_OPTIONS.map((option) => ({ ...option, kind: option.value }))} onChange={(theme) => update({ theme })} />
      </Section>

      <Section title={m.window}>
        <Row label={m.material} id="windowMaterial">
          <Segmented label={m.material} value={appearance.windowMaterial} options={MATERIAL_OPTIONS} onChange={(windowMaterial) => update({ windowMaterial })} />
        </Row>
      </Section>

      {/* 背景图片 (Figma 86A / 86B): drawn under the base layer on 玻璃 only; 实色 is opaque. */}
      {!solid && (
        <Section title={m.backgroundImage}>
          <Row label={m.image} id="backgroundImage">
            <div className={styles.avatarControl}>
              {image && <img className={styles.backgroundThumb} src={backgroundImageUrl(image)} alt={m.backgroundImage} />}
              <Button onClick={() => picker.current?.click()}>{image ? m.replace : m.chooseImage}</Button>
              {image && <Button onClick={() => update({ backgroundImage: '' })}>{m.remove}</Button>}
            </div>
            <input
              ref={picker}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              hidden
              data-testid="background-file"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0]
                e.currentTarget.value = ''
                if (!file) return
                void backgroundFromFile(file)
                  .then((jpeg) => window.tr.settings.setBackgroundImage(jpeg))
                  .then(
                    (stored) => {
                      if (!stored) console.warn('[settings] main refused the background picture')
                    },
                    (error: unknown) => console.warn('[settings] could not read the background picture:', error)
                  )
              }}
            />
          </Row>
          {image && (
            <Row label={m.blur} id="backgroundBlur">
              <Slider
                label={m.blur}
                value={appearance.backgroundBlur}
                min={LIMITS.backgroundBlur.min}
                max={LIMITS.backgroundBlur.max}
                step={0.01}
                format={formatPercent}
                onCommit={(backgroundBlur) => update({ backgroundBlur })}
              />
            </Row>
          )}
        </Section>
      )}

      {/* 实色 (Figma 57C) draws no field in full screen, and a 背景图片 takes its place (Figma 86B): nothing to choose. */}
      {!solid && !image && (
        <Section title={m.fullscreenBackdrop}>
          <ThemeSwatches
            label={m.fullscreenBackdrop}
            value={appearance.fullscreenBackdrop}
            options={backdropOptions(m.auto, backdropNames)}
            onChange={(fullscreenBackdrop) => update({ fullscreenBackdrop })}
          />
        </Section>
      )}
    </PreviewPage>
  )
}
