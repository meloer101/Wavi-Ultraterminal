// 设置 · 对话 (Figma 66D / 66H): what GUI sessions read — my picture, the chat font, its column and card opacity.
import { useMemo, useRef } from 'react'
import { isOpaqueMaterial, LIMITS, type AppearancePatch, type AppearanceSettings, type ChatAppearance, type ChatWeight } from '@shared/settings'
import { defineMessages, withLang } from '@shared/i18n'
import { Segmented } from '../ui/Segmented'
import { useLang, useMessages } from '../ui/i18n'
import { Button, PreviewPage, Row, Section, Select, Slider } from './controls'
import {
  CHAT_SIZE_OPTIONS,
  CHAT_WEIGHT_OPTIONS,
  CHAT_WIDTH_OPTIONS,
  chatPreviewCaption,
  cjkOptions,
  formatPercent,
  isPageDefault,
  pageDefaults,
  uiOption
} from './appearance-form'
import { avatarFromFile } from './avatar'
import { ChatPreview } from './ChatPreview'
import { withCurrent } from './fonts'
import { useFontCatalog } from './local-fonts'
import styles from './AppearancePane.module.css'

const M = defineMessages({
  zh: {
    title: '对话',
    avatar: '头像',
    myAvatar: '我的头像',
    replace: '更换…',
    chooseImage: '选择图片…',
    remove: '移除',
    fonts: '字体',
    latinFont: '英文字体',
    chatLatinFont: '对话英文字体',
    cjkFont: '中文字体',
    chatCjkFont: '对话中文字体',
    searchFont: '搜索或输入字体名',
    weight: '字重',
    size: '字号',
    chatSize: '对话字号',
    layout: '版面',
    width: '对话宽度',
    opacity: '对话不透明度'
  },
  en: {
    title: 'Chat',
    avatar: 'Avatar',
    myAvatar: 'My avatar',
    replace: 'Replace…',
    chooseImage: 'Choose image…',
    remove: 'Remove',
    fonts: 'Fonts',
    latinFont: 'English font',
    chatLatinFont: 'Chat English font',
    cjkFont: 'Chinese font',
    chatCjkFont: 'Chat Chinese font',
    searchFont: 'Search or type a font name',
    weight: 'Weight',
    size: 'Size',
    chatSize: 'Chat font size',
    layout: 'Layout',
    width: 'Chat width',
    opacity: 'Chat opacity'
  }
})

export function ChatPane({ appearance, update }: { appearance: AppearanceSettings; update: (patch: AppearancePatch) => void }) {
  const { catalog } = useFontCatalog()
  const m = useMessages(M)
  // The system font's name and the Chinese menu's group headings are in the interface language.
  const lang = useLang()
  const chat = appearance.chat
  const updateChat = (patch: Partial<ChatAppearance>): void => update({ chat: patch })
  const uiOptions = useMemo(
    () => withLang(lang, () => ['', ...withCurrent(catalog.ui, chat.latinFont).filter((f) => f !== '')].map(uiOption)),
    [catalog.ui, chat.latinFont, lang]
  )
  const cjk = useMemo(() => withLang(lang, () => cjkOptions(catalog.cjk, chat.cjkFont)), [catalog.cjk, chat.cjkFont, lang])
  const picker = useRef<HTMLInputElement>(null)

  return (
    <PreviewPage
      title={m.title}
      preview={
        <div className={styles.previewField}>
          <ChatPreview />
        </div>
      }
      caption={chatPreviewCaption(chat)}
      isDefault={isPageDefault(appearance, 'chat')}
      onReset={() => update(pageDefaults('chat'))}
    >
      <Section title={m.avatar}>
        <Row label={m.myAvatar} id="chatAvatar">
          <div className={styles.avatarControl}>
            {chat.avatar && <img className={styles.avatar} src={chat.avatar} alt={m.myAvatar} />}
            <Button onClick={() => picker.current?.click()}>{chat.avatar ? m.replace : m.chooseImage}</Button>
            {chat.avatar && <Button onClick={() => updateChat({ avatar: '' })}>{m.remove}</Button>}
          </div>
          <input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            data-testid="avatar-file"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = ''
              if (file) void avatarFromFile(file).then((avatar) => updateChat({ avatar }), (error: unknown) => console.warn('[settings] could not read the picture:', error))
            }}
          />
        </Row>
      </Section>

      <Section title={m.fonts}>
        <Row label={m.latinFont} id="chatLatinFont">
          <Select
            label={m.chatLatinFont}
            value={chat.latinFont}
            options={uiOptions}
            allowCustom
            placeholder={m.searchFont}
            onChange={(latinFont) => updateChat({ latinFont })}
          />
        </Row>
        <Row label={m.cjkFont} id="chatCjkFont">
          <Select
            label={m.chatCjkFont}
            value={chat.cjkFont}
            options={cjk}
            allowCustom
            placeholder={m.searchFont}
            onChange={(cjkFont) => updateChat({ cjkFont })}
          />
        </Row>
        <Row label={m.weight} id="chatWeight">
          <Segmented label={m.weight} value={`${chat.fontWeight}`} options={CHAT_WEIGHT_OPTIONS} onChange={(weight) => updateChat({ fontWeight: Number(weight) as ChatWeight })} />
        </Row>
        <Row label={m.size} id="chatFontSize">
          <Select label={m.chatSize} value={String(chat.fontSize)} options={CHAT_SIZE_OPTIONS} onChange={(size) => updateChat({ fontSize: Number(size) })} />
        </Row>
      </Section>

      <Section title={m.layout}>
        <Row label={m.width} id="chatWidth">
          <Segmented label={m.width} value={chat.width} options={CHAT_WIDTH_OPTIONS} onChange={(width) => updateChat({ width })} />
        </Row>
        {/* 实色 makes every card opaque (Figma 66B), so the opacity has nothing to change there. */}
        {!isOpaqueMaterial(appearance.windowMaterial) && (
          <Row label={m.opacity} id="chatOpacity">
            <Slider
              label={m.opacity}
              value={chat.opacity}
              min={LIMITS.chatOpacity.min}
              max={LIMITS.chatOpacity.max}
              step={0.01}
              format={formatPercent}
              onCommit={(opacity) => updateChat({ opacity })}
            />
          </Row>
        )}
      </Section>
    </PreviewPage>
  )
}
