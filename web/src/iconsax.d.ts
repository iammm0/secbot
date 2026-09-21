import type { CSSProperties } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'iconsax-icon': {
        name?: string
        type?: string
        size?: string | number
        color?: string
        className?: string
        style?: CSSProperties
      }
    }
  }
}
