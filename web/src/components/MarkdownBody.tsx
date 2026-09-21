import { Children, createContext, isValidElement, useContext, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { addToChat } from '@/lib/chatQuote'

interface Props {
  children: string
  className?: string
}

const InPreContext = createContext(false)

function languageFromClassName(className?: string): string | undefined {
  const match = /(?:^|\s)language-([\w+-]+)/.exec(className ?? '')
  return match?.[1]
}

function joinClass(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function heading(tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
  return function Heading({
    children,
    node: _node,
    ...props
  }: ComponentProps<typeof tag> & { node?: unknown }) {
    const Tag = tag
    return (
      <Tag className={`md-h md-h-${tag.slice(1)}`} {...props}>
        {children}
      </Tag>
    )
  }
}

function Code({
  className,
  children,
  node: _node,
  ...props
}: ComponentProps<'code'> & { node?: unknown }) {
  const inPre = useContext(InPreContext)
  if (!inPre) {
    return (
      <code className="md-inline-code" {...props}>
        {children}
      </code>
    )
  }
  return (
    <code className={joinClass(className?.includes('hljs') ? undefined : 'hljs', className)} {...props}>
      {children}
    </code>
  )
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children)
  return ''
}

function Pre({
  children,
  node: _node,
  ...props
}: ComponentProps<'pre'> & { node?: unknown }) {
  const [selected, setSelected] = useState(false)
  const selectedRef = useRef(false)
  selectedRef.current = selected
  let language: string | undefined
  Children.forEach(children, (child) => {
    if (isValidElement<{ className?: string }>(child)) {
      language = languageFromClassName(child.props.className) ?? language
    }
  })
  const code = nodeText(children).replace(/\n$/, '')

  const toggle = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    const selection = window.getSelection()?.toString() ?? ''
    if (selection.trim()) return
    setSelected(!selectedRef.current)
  }

  return (
    <div
      className={`md-code${selected ? ' md-code-selected' : ''}`}
      onClick={toggle}
    >
      {language || selected ? (
        <div className="md-code-lang">
          <span>{language}</span>
          {selected ? (
            <button
              type="button"
              className="md-code-add"
              onClick={(event) => {
                event.stopPropagation()
                addToChat({ language, code })
                setSelected(false)
              }}
            >
              Add to chat
            </button>
          ) : null}
        </div>
      ) : null}
      <pre className="md-pre" {...props}>
        <InPreContext.Provider value={true}>{children}</InPreContext.Provider>
      </pre>
    </div>
  )
}

function Table({ children }: { children?: ReactNode }) {
  return (
    <div className="md-table-wrap">
      <table className="md-table">{children}</table>
    </div>
  )
}

export function MarkdownBody({ children, className }: Props) {
  if (!children.trim()) return null
  return (
    <div className={`md-body ${className ?? ''}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          h1: heading('h1'),
          h2: heading('h2'),
          h3: heading('h3'),
          h4: heading('h4'),
          h5: heading('h5'),
          h6: heading('h6'),
          p: ({ children }) => <p className="md-p">{children}</p>,
          a: ({ href, children }) => (
            <a className="md-a" href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          ul: ({ children, className }) => (
            <ul className={joinClass('md-ul', className)}>{children}</ul>
          ),
          ol: ({ children, className }) => (
            <ol className={joinClass('md-ol', className)}>{children}</ol>
          ),
          li: ({ children, className }) => (
            <li className={joinClass('md-li', className)}>{children}</li>
          ),
          blockquote: ({ children }) => <blockquote className="md-quote">{children}</blockquote>,
          hr: () => <hr className="md-hr" />,
          strong: ({ children }) => <strong className="md-strong">{children}</strong>,
          em: ({ children }) => <em className="md-em">{children}</em>,
          del: ({ children }) => <del className="md-del">{children}</del>,
          img: ({ src, alt }) => (
            <img className="md-img" src={src} alt={alt ?? ''} />
          ),
          table: Table,
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th className="md-th">{children}</th>,
          td: ({ children }) => <td className="md-td">{children}</td>,
          pre: Pre,
          code: Code,
          input: ({ type, checked, disabled, ...props }) =>
            type === 'checkbox' ? (
              <input
                type="checkbox"
                className="md-task"
                checked={Boolean(checked)}
                disabled
                readOnly
                {...props}
              />
            ) : (
              <input type={type} checked={checked} disabled={disabled} {...props} />
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
