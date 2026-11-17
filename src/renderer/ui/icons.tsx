// Wavi's icon set: Hugeicons stroke-rounded (@hugeicons/core-free-icons, MIT), drawn by @hugeicons/react (PRD v1.203,
// Figma 94′). Every icon the renderer draws comes from here, so the set is swapped in one file. The exports keep the
// names the app gave them (the shape they show: Check, ChevronDown, Trash2), each bound to the Hugeicons glyph that reads
// that way; Hugeicons' own lucide-style names are not always the same shape (its ArrowDown is a chevron), so every
// export names its glyph explicitly. Call sites pass `size={16} strokeWidth={1.75}` (CLAUDE.md).
import {
  AlertCircleIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowUp01Icon,
  ArrowUp02Icon,
  AtSignIcon,
  Attachment01Icon,
  BookOpen01Icon,
  Brain02Icon,
  BubbleChatAddIcon,
  BubbleChatIcon,
  Cancel01Icon,
  CancelCircleIcon,
  CaseSensitiveIcon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  CircleArrowUpIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  Clock01Icon,
  CommandLineIcon,
  ComputerIcon,
  Copy01Icon,
  DashboardSpeed02Icon,
  Delete02Icon,
  File01Icon,
  File02Icon,
  FileAddIcon,
  FileCodeIcon,
  FlashIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderOpenIcon,
  FolderSearch01Icon,
  GitBranchIcon,
  GitCommitIcon,
  GitCompareIcon,
  GitForkIcon,
  GitMergeIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  Globe02Icon,
  HelpCircleIcon,
  InboxIcon,
  LayoutListIcon,
  LayoutTwoColumnIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  LinkSquare02Icon,
  ListTreeIcon,
  MagicWand01Icon,
  MinusSignIcon,
  Moon02Icon,
  MoreHorizontalIcon,
  OctagonAlertIcon,
  PaintBoardIcon,
  PencilEdit02Icon,
  PlayIcon,
  PlusSignIcon,
  Refresh01Icon,
  Robot01Icon,
  RotateClockwiseIcon,
  Search01Icon,
  Shield01Icon,
  ShieldCheckIcon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
  SlidersHorizontalIcon,
  SmartPhone01Icon,
  SourceCodeIcon,
  SourceCodeSquareIcon,
  SplitIcon,
  SquareTerminalIcon,
  StopIcon,
  Sun03Icon,
  TaskEdit01Icon,
  TextBoldIcon,
  TextItalicIcon,
  TextQuoteIcon,
  TextStrikethroughIcon,
  Tick02Icon,
  ToggleOnIcon,
  Undo02Icon,
  UnfoldMoreIcon,
  UserGroupIcon,
  WorkflowIcon,
  Wrench01Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { ComponentType, SVGProps } from 'react'

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number; strokeWidth?: number }
/** Any icon from this module (a tool row's, a menu item's, a nav entry's). */
export type IconComponent = ComponentType<IconProps>

function icon(glyph: IconSvgElement, name: string): IconComponent {
  const Icon = (props: IconProps) => <HugeiconsIcon icon={glyph} {...props} />
  Icon.displayName = name
  return Icon
}

export const AlertCircle = icon(AlertCircleIcon, 'AlertCircle')
export const Archive = icon(ArchiveIcon, 'Archive')
export const ArchiveRestore = icon(ArchiveRestoreIcon, 'ArchiveRestore')
export const ArrowDown = icon(ArrowDown02Icon, 'ArrowDown')
export const ArrowLeft = icon(ArrowLeft02Icon, 'ArrowLeft')
export const ArrowRight = icon(ArrowRight02Icon, 'ArrowRight')
export const ArrowUp = icon(ArrowUp02Icon, 'ArrowUp')
export const AtSign = icon(AtSignIcon, 'AtSign')
export const Bold = icon(TextBoldIcon, 'Bold')
export const BookOpen = icon(BookOpen01Icon, 'BookOpen')
export const Bot = icon(Robot01Icon, 'Bot')
export const Brain = icon(Brain02Icon, 'Brain')
export const CaseSensitive = icon(CaseSensitiveIcon, 'CaseSensitive')
export const Check = icon(Tick02Icon, 'Check')
export const ChevronDown = icon(ArrowDown01Icon, 'ChevronDown')
export const ChevronLeft = icon(ArrowLeft01Icon, 'ChevronLeft')
export const ChevronRight = icon(ArrowRight01Icon, 'ChevronRight')
export const ChevronUp = icon(ArrowUp01Icon, 'ChevronUp')
export const ChevronsUpDown = icon(UnfoldMoreIcon, 'ChevronsUpDown')
export const Circle = icon(CircleIcon, 'Circle')
export const CircleAlert = icon(AlertCircleIcon, 'CircleAlert')
export const CircleArrowUp = icon(CircleArrowUpIcon, 'CircleArrowUp')
export const CircleCheck = icon(CheckmarkCircle02Icon, 'CircleCheck')
export const CircleDashed = icon(CircleDashedIcon, 'CircleDashed')
export const CircleDot = icon(CircleDotIcon, 'CircleDot')
export const CircleHelp = icon(HelpCircleIcon, 'CircleHelp')
export const CircleX = icon(CancelCircleIcon, 'CircleX')
export const ClipboardList = icon(TaskEdit01Icon, 'ClipboardList')
export const Clock = icon(Clock01Icon, 'Clock')
export const Code = icon(SourceCodeIcon, 'Code')
export const Columns2 = icon(LayoutTwoColumnIcon, 'Columns2')
export const Copy = icon(Copy01Icon, 'Copy')
export const Ellipsis = icon(MoreHorizontalIcon, 'Ellipsis')
export const ExternalLink = icon(LinkSquare02Icon, 'ExternalLink')
export const File = icon(File01Icon, 'File')
export const FileCode = icon(FileCodeIcon, 'FileCode')
export const FilePlus = icon(FileAddIcon, 'FilePlus')
export const FileText = icon(File02Icon, 'FileText')
export const Folder = icon(Folder01Icon, 'Folder')
export const FolderOpen = icon(FolderOpenIcon, 'FolderOpen')
export const FolderPlus = icon(FolderAddIcon, 'FolderPlus')
export const FolderSearch = icon(FolderSearch01Icon, 'FolderSearch')
export const Gauge = icon(DashboardSpeed02Icon, 'Gauge')
export const GitBranch = icon(GitBranchIcon, 'GitBranch')
export const GitCommitHorizontal = icon(GitCommitIcon, 'GitCommitHorizontal')
export const GitCompareArrows = icon(GitCompareIcon, 'GitCompareArrows')
export const GitFork = icon(GitForkIcon, 'GitFork')
export const GitMerge = icon(GitMergeIcon, 'GitMerge')
export const GitPullRequest = icon(GitPullRequestIcon, 'GitPullRequest')
export const GitPullRequestDraft = icon(GitPullRequestDraftIcon, 'GitPullRequestDraft')
export const Globe = icon(Globe02Icon, 'Globe')
export const Inbox = icon(InboxIcon, 'Inbox')
export const Italic = icon(TextItalicIcon, 'Italic')
export const LayoutList = icon(LayoutListIcon, 'LayoutList')
export const List = icon(LeftToRightListBulletIcon, 'List')
export const ListOrdered = icon(LeftToRightListNumberIcon, 'ListOrdered')
export const ListTodo = icon(CheckListIcon, 'ListTodo')
export const ListTree = icon(ListTreeIcon, 'ListTree')
export const MessageSquare = icon(BubbleChatIcon, 'MessageSquare')
export const MessageSquarePlus = icon(BubbleChatAddIcon, 'MessageSquarePlus')
export const Minus = icon(MinusSignIcon, 'Minus')
export const Monitor = icon(ComputerIcon, 'Monitor')
export const Moon = icon(Moon02Icon, 'Moon')
export const MoveRight = icon(ArrowRight02Icon, 'MoveRight')
export const OctagonAlert = icon(OctagonAlertIcon, 'OctagonAlert')
export const Palette = icon(PaintBoardIcon, 'Palette')
export const PanelLeft = icon(SidebarLeft01Icon, 'PanelLeft')
export const PanelRight = icon(SidebarRight01Icon, 'PanelRight')
export const Paperclip = icon(Attachment01Icon, 'Paperclip')
export const Pencil = icon(PencilEdit02Icon, 'Pencil')
export const Play = icon(PlayIcon, 'Play')
export const Plus = icon(PlusSignIcon, 'Plus')
export const RefreshCw = icon(Refresh01Icon, 'RefreshCw')
export const RotateCw = icon(RotateClockwiseIcon, 'RotateCw')
export const Search = icon(Search01Icon, 'Search')
export const Shield = icon(Shield01Icon, 'Shield')
export const ShieldCheck = icon(ShieldCheckIcon, 'ShieldCheck')
export const SlidersHorizontal = icon(SlidersHorizontalIcon, 'SlidersHorizontal')
export const Smartphone = icon(SmartPhone01Icon, 'Smartphone')
export const Sparkles = icon(MagicWand01Icon, 'Sparkles')
export const Split = icon(SplitIcon, 'Split')
export const Square = icon(StopIcon, 'Square')
export const SquareCode = icon(SourceCodeSquareIcon, 'SquareCode')
export const SquareTerminal = icon(SquareTerminalIcon, 'SquareTerminal')
export const Strikethrough = icon(TextStrikethroughIcon, 'Strikethrough')
export const Sun = icon(Sun03Icon, 'Sun')
export const Terminal = icon(CommandLineIcon, 'Terminal')
export const TextQuote = icon(TextQuoteIcon, 'TextQuote')
export const ToggleLeft = icon(ToggleOnIcon, 'ToggleLeft')
export const Trash2 = icon(Delete02Icon, 'Trash2')
export const Undo2 = icon(Undo02Icon, 'Undo2')
export const Users = icon(UserGroupIcon, 'Users')
export const Workflow = icon(WorkflowIcon, 'Workflow')
export const Wrench = icon(Wrench01Icon, 'Wrench')
export const X = icon(Cancel01Icon, 'X')
export const Zap = icon(FlashIcon, 'Zap')
