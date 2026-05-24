import type { StreamTimelineItem } from '@/lib/types'
import { ThoughtBlock } from './ThoughtBlock'
import { ActionBlock } from './ActionBlock'
import { PlanningBlock } from './PlanningBlock'
import { BrowserTimelineBlock } from './BrowserTimelineBlock'
import { ResponseBlock } from './ResponseBlock'
import { ReportBlock } from './ReportBlock'
import { ErrorBlock } from './ErrorBlock'

interface Props {
  item: StreamTimelineItem
}

export function BlockRouter({ item }: Props) {
  switch (item.type) {
    case 'thought':
      return <ThoughtBlock item={item} />
    case 'action':
      return <ActionBlock item={item} />
    case 'planning':
      return <PlanningBlock item={item} />
    case 'browser_event':
      return <BrowserTimelineBlock item={item} />
    case 'final':
    case 'observation':
      return <ResponseBlock item={item} />
    default:
      return null
  }
}

export { ErrorBlock, ReportBlock }
