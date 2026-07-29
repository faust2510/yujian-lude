import { useState } from 'react'
import { XMobileDetailHeader } from '../../components/x-mobile/XMobileDetailHeader'
import { XMobileFormRow } from '../../components/x-mobile/XMobileFormRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'
import { XMobileTabs } from '../../components/x-mobile/XMobileTabs'

const sections = [
  { value: 'profile', label: '资料' },
  { value: 'faith', label: '信仰' },
  { value: 'endorsements', label: '背书' },
  { value: 'security', label: '账号' },
]

function Status({ children }) {
  return children ? <div className="x-mobile-status-row" role="status">{children}</div> : null
}

export default function ProfileMobile({ user, form = {}, faith = {}, endorsements = [], endorsement = {}, password = {}, busy = {}, message = '', faithMessage = '', endorsementMessage = '', passwordMessage = '', verifyMessage = '', verifyLink = '', onProfileChange, onAvatarUpload, onAvatarRemove, onFaithChange, onEndorsementChange, onPasswordChange, onSaveProfile, onSaveFaith, onAddEndorsement, onRemoveEndorsement, onChangePassword, onSendVerify }) {
  const [editing, setEditing] = useState(false)
  const [section, setSection] = useState('profile')

  if (busy.initial) return <XMobileSkeleton lines={8} />

  if (!editing) {
    return (
      <section className="x-mobile-profile-home">
        <header className="x-mobile-user-profile">
          <div className="x-mobile-large-avatar" aria-hidden="true">{form.nickname?.slice(0, 1) || user?.email?.slice(0, 1)?.toUpperCase() || '我'}</div>
          <div className="x-mobile-user-profile-copy">
            <h2>{form.nickname || '我的资料'}</h2>
            <p>{form.intro || user?.email}</p>
            <span>{Number(form.completion) || 0}% 完整 · {user?.email_verified ? '邮箱已验证' : '邮箱待验证'}</span>
          </div>
          <button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => setEditing(true)}>编辑资料</button>
        </header>
        {message ? <Status>{message}</Status> : null}
        <div className="x-mobile-list-row"><span><strong>信仰档案</strong><small>{faith.church_name || '尚未填写教会'}</small></span></div>
        <div className="x-mobile-list-row"><span><strong>背书</strong><small>{endorsements.length} 条记录</small></span></div>
        <div className="x-mobile-list-row"><span><strong>邮箱状态</strong><small>{user?.email_verified ? '已验证' : '未验证'}</small></span></div>
      </section>
    )
  }

  return (
    <section className="x-mobile-profile-editor">
      <XMobileDetailHeader title="编辑资料" onBack={() => setEditing(false)} />
      <div className="x-mobile-scroll-tabs"><XMobileTabs items={sections} value={section} onChange={setSection} ariaLabel="资料编辑" /></div>

      {section === 'profile' ? (
        <form onSubmit={onSaveProfile}>
          <XMobileFormRow label="头像" htmlFor="profile-avatar"><input id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy.avatar} onChange={(event) => onAvatarUpload?.(event.target.files?.[0])} />{form.avatar_key ? <button type="button" className="x-mobile-button-secondary" onClick={onAvatarRemove} disabled={busy.avatar}>移除头像</button> : null}</XMobileFormRow>
          <XMobileFormRow label="昵称" htmlFor="profile-nickname"><input id="profile-nickname" value={form.nickname || ''} onChange={(event) => onProfileChange?.('nickname', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="城市" htmlFor="profile-city"><input id="profile-city" value={form.city || ''} onChange={(event) => onProfileChange?.('city', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="出生年份" htmlFor="profile-birth-year"><input id="profile-birth-year" inputMode="numeric" value={form.birth_year || ''} onChange={(event) => onProfileChange?.('birth_year', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="学历" htmlFor="profile-education"><input id="profile-education" value={form.education || ''} onChange={(event) => onProfileChange?.('education', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="婚恋目标" htmlFor="profile-goal"><select id="profile-goal" value={form.goal || ''} onChange={(event) => onProfileChange?.('goal', event.target.value)}><option value="">请选择</option><option value="serious">认真寻找婚姻对象</option><option value="explore">先了解，慢慢来</option></select></XMobileFormRow>
          <XMobileFormRow label="择偶期待" htmlFor="profile-preference"><textarea id="profile-preference" rows="4" value={form.preference || ''} onChange={(event) => onProfileChange?.('preference', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="自我介绍" htmlFor="profile-intro"><textarea id="profile-intro" rows="5" value={form.intro || ''} onChange={(event) => onProfileChange?.('intro', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="个人签名" htmlFor="profile-signature"><input id="profile-signature" maxLength={80} value={form.signature || ''} onChange={(event) => onProfileChange?.('signature', event.target.value)} /></XMobileFormRow>
          <label className="x-mobile-check-row x-mobile-touch-target"><input type="checkbox" checked={Boolean(form.privacy_ok)} onChange={(event) => onProfileChange?.('privacy_ok', event.target.checked)} /><span>我同意将资料用于平台内的匿名匹配</span></label>
          <Status>{message}</Status>
          <div className="x-mobile-action-stack"><button className="x-mobile-button-primary x-mobile-touch-target" disabled={busy.profile}>{busy.profile ? '保存中…' : '保存资料'}</button></div>
        </form>
      ) : null}

      {section === 'faith' ? (
        <form onSubmit={onSaveFaith}>
          <XMobileFormRow label="所属教会 / 堂会" htmlFor="faith-church"><input id="faith-church" value={faith.church_name || ''} onChange={(event) => onFaithChange?.('church_name', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="所在区会" htmlFor="faith-presbytery"><input id="faith-presbytery" value={faith.presbytery || ''} onChange={(event) => onFaithChange?.('presbytery', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="所在地区" htmlFor="faith-region"><input id="faith-region" value={faith.region || ''} onChange={(event) => onFaithChange?.('region', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="宗派" htmlFor="faith-denomination"><input id="faith-denomination" value={faith.denomination || ''} onChange={(event) => onFaithChange?.('denomination', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="牧者 / 同工姓名" htmlFor="faith-coworker"><input id="faith-coworker" value={faith.coworker || ''} onChange={(event) => onFaithChange?.('coworker', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="受洗时间" htmlFor="faith-baptism-date"><input id="faith-baptism-date" value={faith.baptism_date || ''} onChange={(event) => onFaithChange?.('baptism_date', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="信主年数" htmlFor="faith-years"><input id="faith-years" inputMode="numeric" value={faith.faith_years || ''} onChange={(event) => onFaithChange?.('faith_years', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="简短见证" htmlFor="faith-testimony"><textarea id="faith-testimony" rows="5" value={faith.testimony || ''} onChange={(event) => onFaithChange?.('testimony', event.target.value)} /></XMobileFormRow>
          <Status>{faithMessage}</Status>
          <div className="x-mobile-action-stack"><button className="x-mobile-button-primary x-mobile-touch-target" disabled={busy.faith}>{busy.faith ? '保存中…' : '保存信仰档案'}</button></div>
        </form>
      ) : null}

      {section === 'endorsements' ? (
        <section>
          {endorsements.map((item) => <div className="x-mobile-list-row" key={item.id}><span><strong>{item.name} · {item.kind === 'pastor' ? '牧者' : '引荐人'}</strong><small>{item.church || '未填写说明'} · {item.state === 'verified' ? '已确认' : item.state === 'rejected' ? '未通过' : '待审核'}</small></span>{item.state === 'pending' ? <button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => onRemoveEndorsement?.(item.id)}>删除</button> : null}</div>)}
          <form onSubmit={onAddEndorsement}>
            <XMobileFormRow label="类型" htmlFor="endorsement-kind"><select id="endorsement-kind" value={endorsement.kind || 'pastor'} onChange={(event) => onEndorsementChange?.('kind', event.target.value)}><option value="pastor">牧者</option><option value="referrer">引荐人</option></select></XMobileFormRow>
            <XMobileFormRow label="背书人姓名" htmlFor="endorsement-name"><input id="endorsement-name" value={endorsement.name || ''} onChange={(event) => onEndorsementChange?.('name', event.target.value)} /></XMobileFormRow>
            <XMobileFormRow label="联系方式" htmlFor="endorsement-contact"><input id="endorsement-contact" value={endorsement.contact || ''} onChange={(event) => onEndorsementChange?.('contact', event.target.value)} /></XMobileFormRow>
            <XMobileFormRow label="教会 / 关系说明" htmlFor="endorsement-church"><input id="endorsement-church" value={endorsement.church || ''} onChange={(event) => onEndorsementChange?.('church', event.target.value)} /></XMobileFormRow>
            <XMobileFormRow label="备注" htmlFor="endorsement-note"><textarea id="endorsement-note" rows="4" value={endorsement.note || ''} onChange={(event) => onEndorsementChange?.('note', event.target.value)} /></XMobileFormRow>
            <Status>{endorsementMessage}</Status>
            <div className="x-mobile-action-stack"><button className="x-mobile-button-primary x-mobile-touch-target" disabled={busy.endorsement}>{busy.endorsement ? '提交中…' : '提交背书'}</button></div>
          </form>
        </section>
      ) : null}

      {section === 'security' ? (
        <section>
          <div className="x-mobile-list-row"><span><strong>{user?.email}</strong><small>{user?.email_verified ? '邮箱已验证' : '邮箱未验证'}</small></span>{!user?.email_verified ? <button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={onSendVerify} disabled={busy.verify}>{busy.verify ? '发送中…' : '发送验证'}</button> : null}</div>
          <Status>{verifyMessage}</Status>
          {verifyLink ? <div className="x-mobile-status-row"><a href={verifyLink}>调试验证链接</a></div> : null}
          <form onSubmit={onChangePassword}>
            <XMobileFormRow label="当前密码" htmlFor="current-password"><input id="current-password" type="password" value={password.current_password || ''} onChange={(event) => onPasswordChange?.('current_password', event.target.value)} /></XMobileFormRow>
            <XMobileFormRow label="新密码" htmlFor="new-password"><input id="new-password" type="password" value={password.new_password || ''} onChange={(event) => onPasswordChange?.('new_password', event.target.value)} /></XMobileFormRow>
            <XMobileFormRow label="确认新密码" htmlFor="confirm-password"><input id="confirm-password" type="password" value={password.confirm || ''} onChange={(event) => onPasswordChange?.('confirm', event.target.value)} /></XMobileFormRow>
            <Status>{passwordMessage}</Status>
            <div className="x-mobile-action-stack"><button className="x-mobile-button-primary x-mobile-touch-target" disabled={busy.password}>{busy.password ? '修改中…' : '修改密码'}</button></div>
          </form>
        </section>
      ) : null}
    </section>
  )
}
