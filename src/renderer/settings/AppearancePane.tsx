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
  zh: { language: '语言', interfaceLanguage: '界面语言', system: '跟随系统', chinese: '中文', english: 'English' },
  en: { language: 'Language', interfaceLanguage: 'Interface language', system: 'System', chinese: '中文', english: 'English' }
})

const THEME_SWATCHES = THEME_OPTIONS.map((option) => ({ ...option, kind: option.value }))

/** 全屏背景 (Figma 38): the author's 配图底托, named for what they look like; 自动 is 晴空 in light mode, 夜火 in dark. */
const BACKDROP_NAMES: Record<(typeof FULLSCREEN_BACKDROPS)[number], string> = {
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
}
const field = (id: string) => <span className={styles.backdropField} style={{ background: `var(--fsb-${id})` }} />
const BACKDROP_OPTIONS: ReadonlyArray<{ value: FullscreenBackdrop; label: string; preview: ReactNode }> = [
  {
    value: 'auto',
    label: '自动',
    preview: (
      <>
        {field('sky')}
        <span className={styles.backdropHalf}>{field('ember')}</span>
      </>
    )
  },
  ...FULLSCREEN_BACKDROPS.map((id) => ({ value: id, label: BACKDROP_NAMES[id], preview: field(id) }))
]

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
  // Each language's own name, whatever the interface shows (Figma 89).
  const languageOptions: ReadonlyArray<{ value: LanguagePreference; label: string }> = [
    { value: 'system', label: m.system },
    { value: 'zh', label: m.chinese },
    { value: 'en', label: m.english }
  ]
  return (
    <PreviewPage
      title="外观"
      preview={<WindowPreview />}
      isDefault={isPageDefault(appearance, 'appearance')}
      onReset={() => update(pageDefaults('appearance'))}
    >
      <Section title={m.language}>
        <Row label={m.interfaceLanguage} id="language">
          <Segmented label={m.interfaceLanguage} value={appearance.language} options={languageOptions} onChange={(language) => update({ language })} />
        </Row>
      </Section>

      <Section title="主题">
        <ThemeSwatches label="主题" value={appearance.theme} options={THEME_SWATCHES} onChange={(theme) => update({ theme })} />
      </Section>

      <Section title="窗口">
        <Row label="材质" id="windowMaterial">
          <Segmented label="材质" value={appearance.windowMaterial} options={MATERIAL_OPTIONS} onChange={(windowMaterial) => update({ windowMaterial })} />
        </Row>
      </Section>

      {/* 背景图片 (Figma 86A / 86B): drawn under the base layer on 玻璃 only; 实色 is opaque. */}
      {!solid && (
        <Section title="背景图片">
          <Row label="图片" id="backgroundImage">
            <div className={styles.avatarControl}>
              {image && <img className={styles.backgroundThumb} src={backgroundImageUrl(image)} alt="背景图片" />}
              <Button onClick={() => picker.current?.click()}>{image ? '更换…' : '选择图片…'}</Button>
              {image && <Button onClick={() => update({ backgroundImage: '' })}>移除</Button>}
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
            <Row label="模糊" id="backgroundBlur">
              <Slider
                label="模糊"
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
        <Section title="全屏背景">
          <ThemeSwatches
            label="全屏背景"
            value={appearance.fullscreenBackdrop}
            options={BACKDROP_OPTIONS}
            onChange={(fullscreenBackdrop) => update({ fullscreenBackdrop })}
          />
        </Section>
      )}
    </PreviewPage>
  )
}
