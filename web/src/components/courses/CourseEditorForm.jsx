import { Plus, Save, Send } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Separator } from '../ui/separator'
import {
  addCollectionItem,
  createCourseUnit,
  moveCollectionItem,
  removeCollectionItem,
} from './CourseEditorCollections.js'
import CourseExamEditor from './CourseExamEditor.jsx'
import CourseUnitEditor from './CourseUnitEditor.jsx'

function errorAt(errors, path) {
  if (!errors) return undefined
  if (errors[path] !== undefined) return errors[path]
  return path.split('.').reduce((value, key) => value?.[key], errors)
}

function FieldError({ id, error }) {
  if (!error) return null
  const message = Array.isArray(error) ? error.join('；') : error
  return <p id={id} role="alert" className="break-words text-sm text-destructive">{message}</p>
}

function unitErrors(fieldErrors, index) {
  return {
    title: errorAt(fieldErrors, `units.${index}.title`),
    material: errorAt(fieldErrors, `units.${index}.material`),
  }
}

function examErrors(fieldErrors) {
  return {
    pass_threshold: errorAt(fieldErrors, 'exam.pass_threshold') ?? errorAt(fieldErrors, 'pass_threshold'),
    questions: errorAt(fieldErrors, 'exam.questions') ?? errorAt(fieldErrors, 'questions'),
    questions_message: errorAt(fieldErrors, 'exam.questions_message') ?? errorAt(fieldErrors, 'questions_message'),
  }
}

export default function CourseEditorForm({
  value,
  course,
  onChange,
  onSave,
  onSubmit,
  readonly = false,
  fieldErrors = {},
  reviewNote,
  saving = false,
  submitting = false,
}) {
  const formValue = value ?? course ?? {}
  const units = formValue.units ?? []
  const exam = formValue.exam ?? { pass_threshold: 80, questions: [] }
  const visibleReviewNote = reviewNote ?? formValue.review_note
  const formError = errorAt(fieldErrors, '_form') ?? errorAt(fieldErrors, 'form')

  const update = (field, nextValue) => {
    onChange({ ...formValue, [field]: nextValue })
  }

  const handleSave = (event) => {
    event.preventDefault()
    if (!readonly) onSave?.(formValue)
  }

  return (
    <form className="flex min-w-0 flex-col gap-8" noValidate onSubmit={handleSave}>
      {visibleReviewNote && (
        <Alert className="min-w-0">
          <AlertTitle>审核意见</AlertTitle>
          <AlertDescription className="break-words whitespace-pre-wrap">{visibleReviewNote}</AlertDescription>
        </Alert>
      )}

      {formError && (
        <Alert variant="destructive" className="min-w-0">
          <AlertTitle>暂时无法保存</AlertTitle>
          <AlertDescription role="alert" className="break-words">{formError}</AlertDescription>
        </Alert>
      )}

      <section className="flex min-w-0 flex-col gap-5" aria-labelledby="course-basics-heading">
        <div className="min-w-0">
          <h2 id="course-basics-heading" className="break-words text-lg font-semibold">课程信息</h2>
        </div>

        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2 sm:col-span-2">
            <label htmlFor="course-editor-title" className="text-sm font-medium">课程标题</label>
            <Input
              id="course-editor-title"
              value={formValue.title ?? ''}
              disabled={readonly || saving || submitting}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'course-editor-title-error' : undefined}
              onChange={(event) => update('title', event.target.value)}
            />
            <FieldError id="course-editor-title-error" error={fieldErrors.title} />
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:col-span-2">
            <label htmlFor="course-editor-subtitle" className="text-sm font-medium">副标题（选填）</label>
            <Input
              id="course-editor-subtitle"
              value={formValue.subtitle ?? ''}
              disabled={readonly || saving || submitting}
              aria-invalid={Boolean(fieldErrors.subtitle)}
              aria-describedby={fieldErrors.subtitle ? 'course-editor-subtitle-error' : undefined}
              onChange={(event) => update('subtitle', event.target.value)}
            />
            <FieldError id="course-editor-subtitle-error" error={fieldErrors.subtitle} />
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:col-span-2">
            <label htmlFor="course-editor-description" className="text-sm font-medium">课程简介</label>
            <textarea
              id="course-editor-description"
              value={formValue.description ?? ''}
              rows={4}
              disabled={readonly || saving || submitting}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? 'course-editor-description-error' : undefined}
              className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
              onChange={(event) => update('description', event.target.value)}
            />
            <FieldError id="course-editor-description-error" error={fieldErrors.description} />
          </div>
        </div>
      </section>

      <Separator />

      <section className="flex min-w-0 flex-col gap-5" aria-labelledby="course-units-heading">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="course-units-heading" className="break-words text-lg font-semibold">课程单元</h2>
          </div>
          {!readonly && (
            <Button
              type="button"
              variant="outline"
              disabled={saving || submitting}
              onClick={() => update('units', addCollectionItem(units, createCourseUnit(), 'unit_index'))}
            >
              <Plus data-icon="inline-start" />
              添加单元
            </Button>
          )}
        </div>

        {units.length === 0 && (
          <p className="break-words text-sm text-muted-foreground">尚未添加课程单元。</p>
        )}
        <FieldError id="course-units-error" error={errorAt(fieldErrors, 'units_message')} />

        <div className="min-w-0">
          {units.map((unit, index) => (
            <CourseUnitEditor
              key={unit.id ?? unit.unit_index ?? index}
              unit={unit}
              index={index}
              total={units.length}
              readonly={readonly || saving || submitting}
              errors={unitErrors(fieldErrors, index)}
              onChange={(nextUnit) => update('units', units.map((current, itemIndex) => (
                itemIndex === index ? nextUnit : current
              )))}
              onMove={(direction) => update('units', moveCollectionItem(units, index, direction, 'unit_index'))}
              onRemove={() => update('units', removeCollectionItem(units, index, 'unit_index'))}
            />
          ))}
        </div>
      </section>

      <Separator />

      <CourseExamEditor
        exam={exam}
        readonly={readonly || saving || submitting}
        errors={examErrors(fieldErrors)}
        onChange={(nextExam) => update('exam', nextExam)}
      />

      {!readonly && (
        <>
          <Separator />
          <div className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="submit" variant="outline" disabled={saving || submitting}>
              <Save data-icon="inline-start" />
              {saving ? '保存中…' : '保存草稿'}
            </Button>
            <Button
              type="button"
              disabled={saving || submitting}
              onClick={() => onSubmit?.(formValue)}
            >
              <Send data-icon="inline-start" />
              {submitting ? '提交中…' : '提交审核'}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}
