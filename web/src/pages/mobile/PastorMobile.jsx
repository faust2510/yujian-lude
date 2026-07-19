import { Link } from 'react-router-dom'
import { XMobileFormRow } from '../../components/x-mobile/XMobileFormRow'

const fields = [
  ['church_name', '所牧养的教会 / 堂会'],
  ['presbytery', '所属区会 / 宗派'],
  ['ordination_info', '按立 / 教牧身份说明'],
  ['contact', '联系方式'],
]

export default function PastorMobile({ form = {}, message = '', isPastor = false, certState, onFieldChange, onSubmit }) {
  if (isPastor) return <section className="x-mobile-settings-page"><div className="x-mobile-success-row">已认证牧者</div><div className="x-mobile-action-stack"><Link className="x-mobile-button-primary x-mobile-touch-target" to="/course-authoring">进入课程工作台</Link></div></section>
  if (certState === 'pending') return <section className="x-mobile-settings-page"><div className="x-mobile-status-panel"><h2>认证审核中</h2><p>申请正在等待管理员审核。</p></div></section>
  return (
    <section className="x-mobile-settings-page">
      <div className="x-mobile-section-header"><h2>申请牧者认证</h2><p>管理员审核通过后账号升级为牧者。</p></div>
      {fields.map(([key, label]) => <XMobileFormRow label={label} htmlFor={`pastor-${key}`} key={key}><input id={`pastor-${key}`} value={form[key] || ''} onChange={(event) => onFieldChange?.(key, event.target.value)} /></XMobileFormRow>)}
      <XMobileFormRow label="简要见证 / 事奉说明" htmlFor="pastor-statement"><textarea id="pastor-statement" rows="4" value={form.statement || ''} onChange={(event) => onFieldChange?.('statement', event.target.value)} /></XMobileFormRow>
      {message ? <div className="x-mobile-status-row">{message}</div> : null}
      <div className="x-mobile-action-stack"><button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={onSubmit}>提交认证申请</button></div>
    </section>
  )
}
