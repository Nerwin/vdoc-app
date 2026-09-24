import { Circle, Folder, type LucideProps } from 'lucide-react'

/**
 * The one SVG icon set (R5 §7): Lucide, stroke 1.8 via styles.css. Text glyphs are only
 * the state alphabet and keycaps - everything else drawn in the app comes from here.
 */
export {
  ChevronDown as ChevronDownIcon,
  ChevronLeft as BackIcon,
  ChevronRight as ForwardIcon,
  ChevronRight as ChevronRightIcon,
  Ellipsis as MoreIcon,
  ExternalLink as ExternalIcon,
  House as HomeIcon,
  Info as InfoIcon,
  Pin as PinIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  ArrowRight as ArrowRightIcon,
  Check as CheckIcon,
  RotateCw as ReloadIcon,
  TriangleAlert as AlertIcon,
  X as CloseIcon,
} from 'lucide-react'

export const FolderIcon = (props: LucideProps) => <Folder fill="currentColor" stroke="none" {...props} />

export const DotIcon = (props: LucideProps) => <Circle fill="currentColor" stroke="none" {...props} />
