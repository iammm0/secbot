import { Children, useState, type ReactNode } from 'react'
import { Icon } from '@/components/Icon'

interface Props {
  kind: string
  label?: string
  detail?: string
  status?: 'running' | 'done'
  success?: boolean
  defaultOpen?: boolean
  children?: ReactNode
}

/** One left-aligned step, in the same rhythm as an agent trace. */
export function TraceBlock({
  kind,
  label,
  detail,
  status = 'done',
  success = true,
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const running = status === 'running'
  const failed = !running && success === false
  const hasBody = Children.toArray(children).length > 0
  // The collapsed line is a preview of the body. Once open, that preview is the same text again.
  const aside = running ? '进行中' : open && hasBody ? undefined : detail

  return (
    <div className="animate-fade-in-up">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors duration-150 hover:bg-hover"
        aria-expanded={open}
      >
        <Icon
          name="arrow-right-02"
          size={12}
          className={`relative top-px shrink-0 text-text-dim/50 transition-transform duration-200 ease-out group-hover:text-text-dim ${open ? 'rotate-90' : ''}`}
        />
        <span className="shrink-0 font-mono text-[11px] tracking-wide text-text-dim">{kind}</span>
        {label ? <span className="shrink-0 font-mono text-[12px] text-text/90">{label}</span> : null}
        {aside ? (
          <span className={`min-w-0 flex-1 truncate font-mono text-[12px] ${failed ? 'text-error' : 'text-text-dim/80'}`}>
            {aside}
          </span>
        ) : null}
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open && hasBody ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          {hasBody ? (
            <div className="mb-1 ml-[1.15rem] border-l border-border/80 py-1 pl-3">{children}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
