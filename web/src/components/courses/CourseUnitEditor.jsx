import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'

function FieldError({ id, error }) {
  if (!error) return null
  const message = Array.isArray(error) ? error.join('；') : error
  return <p id={id} role="alert" className="break-words text-sm text-destructive">{message}</p>
}

export default function CourseUnitEditor({
  unit,
  index,
  total,
  onChange,
  onMove,
  onRemove,
  readonly = false,
  errors = {},
}) {
  const prefix = `course-unit-${index}`
  const titleErrorId = `${prefix}-title-error`
  const materialErrorId = `${prefix}-material-error`

  const update = (field, nextValue) => {
    onChange({ ...unit, [field]: nextValue })
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 border-b border-border py-5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold">第 {index + 1} 单元</h3>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="上移单元"
            title="上移单元"
            disabled={readonly || index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp data-icon="inline-start" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="下移单元"
            title="下移单元"
            disabled={readonly || index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown data-icon="inline-start" />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            aria-label="删除单元"
            title="删除单元"
            disabled={readonly}
            onClick={onRemove}
          >
            <Trash2 data-icon="inline-start" />
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`${prefix}-title`} className="text-sm font-medium">单元标题</label>
        <Input
          id={`${prefix}-title`}
          value={unit.title ?? ''}
          disabled={readonly}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? titleErrorId : undefined}
          onChange={(event) => update('title', event.target.value)}
        />
        <FieldError id={titleErrorId} error={errors.title} />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`${prefix}-material`} className="text-sm font-medium">单元正文</label>
        <textarea
          id={`${prefix}-material`}
          value={unit.material ?? ''}
          rows={8}
          disabled={readonly}
          aria-invalid={Boolean(errors.material)}
          aria-describedby={errors.material ? materialErrorId : undefined}
          className="min-h-40 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
          onChange={(event) => update('material', event.target.value)}
        />
        <FieldError id={materialErrorId} error={errors.material} />
      </div>

      <label className="flex min-w-0 items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(unit.is_pastor_node)}
          disabled={readonly}
          className="mt-0.5 size-4 shrink-0 accent-primary"
          onChange={(event) => update('is_pastor_node', event.target.checked)}
        />
        <span className="min-w-0 break-words">本单元需要牧者确认</span>
      </label>
    </section>
  )
}
