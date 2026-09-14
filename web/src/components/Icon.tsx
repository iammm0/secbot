interface IconProps {
  name: string
  type?: string
  size?: number
  className?: string
}

const PATHS: Record<string, string> = {
  add: 'M12 5v14M5 12h14',
  'arrow-down-01': 'M6 9l6 6 6-6',
  'arrow-right-02': 'M9 6l6 6-6 6',
  'close-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M15 9l-6 6M9 9l6 6',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4',
  colorfilter: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 3v18M3 12h18',
  cpu: 'M7 7h10v10H7zM12 3v4M12 17v4M3 12h4M17 12h4',
  'document-text': 'M7 3h8l4 4v14H7zM15 3v4h4M9 12h6M9 16h6',
  'folder-2': 'M3 7h6l2 2h10v10H3z',
  global: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  hierarchy: 'M12 5v6M8 19h8M8 15v4M16 15v4M12 11l-4 4h8z',
  'info-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
  menu: 'M4 7h16M4 12h16M4 17h16',
  'message-text': 'M4 5h16v12H7l-3 3zM8 9h8M8 13h5',
  monitor: 'M4 5h16v11H4zM8 21h8M12 16v5',
  'setting-2': 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4.5a7.7 7.7 0 0 0-1.7-1L15 3h-6l-.3 2.5a7.7 7.7 0 0 0-1.7 1L6.6 6l-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-.5a7.7 7.7 0 0 0 1.7 1L9 21h6l.3-2.5a7.7 7.7 0 0 0 1.7-1l2.4.5 2-3.5z',
}

export function Icon({ name, size = 16, className }: IconProps) {
  const d = PATHS[name] ?? PATHS.menu
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}
