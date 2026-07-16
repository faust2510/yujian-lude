import { Badge } from '../ui/badge'

const STATUS_PRESENTATION = {
  draft: { label: '草稿', variant: 'secondary' },
  pending_review: { label: '待审核', variant: 'outline' },
  changes_requested: { label: '需修改', variant: 'destructive' },
  published: { label: '已发布', variant: 'default' },
  archived: { label: '已归档', variant: 'secondary' },
}

export default function CourseSubmissionStatusBadge({ status }) {
  const presentation = STATUS_PRESENTATION[status] ?? {
    label: status || '未知状态',
    variant: 'outline',
  }

  return (
    <Badge data-status={status} variant={presentation.variant} className="max-w-full">
      {presentation.label}
    </Badge>
  )
}
