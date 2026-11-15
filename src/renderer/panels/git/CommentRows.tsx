// Inline comments in Git · 变更 (PRD F5, Figma 03): the ＋ on a diff line, a saved comment of the user's under its line,
// and the editor (⌘↵ 添加评论 · Esc 取消). The text being written lives in the store, so scrolling the editor out of the
// rendered window and back keeps it.
import { MessageSquarePlus, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { clipCode, commentLocation, type ReviewComment } from '@shared/review-comments'
import type { DiffRow } from '@shared/git-graph/diff'
import { defineMessages, pick } from '@shared/i18n'
import { useMessages } from '../../i18n'
import {
  cancelDraft,
  editComment,
  removeComment,
  saveDraft,
  setDraftText,
  startComment,
  useReviewComments
} from '../../state/review-comments'
import { codeBetween, rowAnchor, type ChangeGroup } from './changes-model'
import styles from './GitView.module.css'

const M = defineMessages({
  zh: {
    commentLine: (line: number) => `评论第 ${line} 行`,
    commentLineTitle: '评论这一行（⇧ 点击扩展到多行）',
    comment: (where: string) => `评论 ${where}`,
    edit: '编辑评论',
    remove: '删除评论',
    write: '写评论',
    placeholder: (where: string) => `${where} · 要改什么？`,
    cancel: '取消',
    add: '添加评论',
    save: '保存',
    lines: (from: number, to: number) => `第 ${from}–${to} 行`,
    line: (line: number) => `第 ${line} 行`,
    removed: (lines: string) => `${lines}（删除的行）`
  },
  en: {
    commentLine: (line: number) => `Comment on line ${line}`,
    commentLineTitle: 'Comment on this line (⇧-click to extend to several lines)',
    comment: (where: string) => `Comment ${where}`,
    edit: 'Edit comment',
    remove: 'Delete comment',
    write: 'Write a comment',
    placeholder: (where: string) => `${where} · What should change?`,
    cancel: 'Cancel',
    add: 'Add comment',
    save: 'Save',
    lines: (from: number, to: number) => `Lines ${from}–${to}`,
    line: (line: number) => `Line ${line}`,
    removed: (lines: string) => `${lines} (removed)`
  }
})

const ICON = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const

/** ＋ at the start of a diff line; ⇧-click extends the open editor's range to this line. */
export function CommentAddButton({
  root,
  group,
  path,
  row,
  rows
}: {
  root: string
  group: ChangeGroup
  path: string
  row: DiffRow
  rows: () => readonly DiffRow[]
}) {
  const m = useMessages(M)
  const anchor = rowAnchor(row)
  if (!anchor) return null
  const onClick = (event: MouseEvent) => {
    event.stopPropagation()
    const codeFor = (from: number, to: number) => clipCode(codeBetween(rows(), anchor.side, from, to))
    startComment(root, { group, path, side: anchor.side, line: anchor.line, endLine: anchor.line, code: codeFor(anchor.line, anchor.line) }, event.shiftKey, codeFor)
  }
  return (
    <button type="button" className={styles.commentAdd} aria-label={m.commentLine(anchor.line)} title={m.commentLineTitle} onClick={onClick}>
      <MessageSquarePlus {...ICON} />
    </button>
  )
}

/** `split`: on the new (right) half of a 并排 diff, the left half a filler (Figma 17F "Comment row"). */
export function CommentRow({ root, comment, top, split = false, end = false }: { root: string; comment: ReviewComment; top: number; split?: boolean; end?: boolean }) {
  const m = useMessages(M)
  return (
    <div
      className={styles.comment}
      style={{ top }}
      data-comment-id={comment.id}
      data-split={split || undefined}
      data-end={end || undefined}
      role="note"
      aria-label={m.comment(commentLocation(comment))}
    >
      <div className={styles.commentHead}>
        <span className={styles.commentWhere}>{lineLabel(comment)}</span>
        <span className={styles.spacer} />
        <button type="button" className={styles.commentIcon} aria-label={m.edit} onClick={() => editComment(root, comment.id)}>
          <Pencil {...ICON} />
        </button>
        <button type="button" className={styles.commentIcon} aria-label={m.remove} onClick={() => removeComment(root, comment.id)}>
          <Trash2 {...ICON} />
        </button>
      </div>
      <p className={styles.commentText} title={comment.text} onDoubleClick={() => editComment(root, comment.id)}>
        {comment.text}
      </p>
    </div>
  )
}

export function CommentEditor({ top, split = false, end = false }: { top: number; split?: boolean; end?: boolean }) {
  const m = useMessages(M)
  const draft = useReviewComments((s) => s.draft)
  const ref = useRef<HTMLTextAreaElement>(null)
  // The keyboard comes back here when the editor opens and whenever ⇧-click on a ＋ changes its range.
  const range = draft ? `${draft.id}:${draft.path}:${draft.line}:${draft.endLine}` : ''
  useEffect(() => {
    const area = ref.current
    if (!area) return
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
  }, [range])
  if (!draft) return null

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelDraft()
    } else if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      saveDraft()
    }
  }

  return (
    <div className={styles.editor} style={{ top }} role="group" aria-label={m.write} data-split={split || undefined} data-end={end || undefined}>
      <textarea
        ref={ref}
        className={styles.editorText}
        aria-label={m.comment(lineLabel(draft))}
        placeholder={m.placeholder(lineLabel(draft))}
        value={draft.text}
        spellCheck={false}
        onChange={(event) => setDraftText(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.editorButtons}>
        <span className={styles.commentWhere}>{lineLabel(draft)}</span>
        <span className={styles.spacer} />
        <button type="button" className={styles.ghostButton} onClick={cancelDraft}>
          {m.cancel}
        </button>
        <button type="button" className={styles.commentSave} disabled={draft.id === null && draft.text.trim() === ''} onClick={() => saveDraft()}>
          {draft.id === null ? m.add : m.save}
          <span className={styles.shortcut}>⌘↵</span>
        </button>
      </div>
    </div>
  )
}

function lineLabel(c: Pick<ReviewComment, 'line' | 'endLine' | 'side'>): string {
  const m = pick(M)
  const lines = c.endLine > c.line ? m.lines(c.line, c.endLine) : m.line(c.line)
  return c.side === 'old' ? m.removed(lines) : lines
}
