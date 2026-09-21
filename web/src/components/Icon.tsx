import icons from '@/lib/iconsaxIcons.json'

interface IconProps {
  name: string
  type?: 'bold' | 'broken' | 'bulk' | 'linear' | 'outline' | 'twotone'
  size?: number
  className?: string
}

/** Legacy aliases → Iconsax free catalog names */
const ALIASES: Record<string, string> = {
  'arrow-left': 'arrow-left-01',
}

type IconMap = Record<string, Partial<Record<string, string>>>
const ICONS = icons as IconMap

function applySvgProps(svg: string, size: number): string {
  return svg
    .replace(/<svg([^>]*)>/, (_match, attrs: string) => {
      const next = String(attrs)
        .replace(/\swidth="[^"]*"/g, '')
        .replace(/\sheight="[^"]*"/g, '')
        .replace(/\sstyle="[^"]*"/g, '')
      return `<svg${next} width="${size}" height="${size}" style="display:block;color:currentColor">`
    })
    .replace(/(fill|stroke)="(?!none)[^"]*"/g, '$1="currentColor"')
}

export function Icon({ name, type = 'linear', size = 16, className }: IconProps) {
  const resolved = ALIASES[name] ?? name
  const variants = ICONS[resolved]
  const raw = variants?.[type] ?? variants?.linear ?? variants?.bold
  if (!raw) return null

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
        color: 'inherit',
      }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: applySvgProps(raw, size) }}
    />
  )
}
