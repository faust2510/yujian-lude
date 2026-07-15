import { useCallback, useEffect, useRef, useState } from 'react'
import { profile, auth, pastorLetters } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

function messageClass(text) {
  return /失败|错误|不一致|只能|重试|请确认/.test(text || '') ? 'error-msg' : 'success-msg'
}

export default function Profile() {
  const { user, refreshMe } = useAuth()
  const [form, setForm] = useState({
    nickname:'', city:'', birth_date:'', education:'',
    goal:'', preference:'', intro:'', privacy_ok: false
  })
  const [faith, setFaith] = useState({
    church_name:'', presbytery:'', region:'', denomination:'',
    coworker:'', baptism_date:'', faith_years:'', testimony:''
  })
  const [pastorLetter, setPastorLetter] = useState({
    pastor_name:'', pastor_contact:'', family_note:'', faith_note:'',
    spiritual_note:'', church_life_note:'', is_verified: false
  })
  const pastorLetterEdited = useRef(false)
  const [pastorLetterLoadState, setPastorLetterLoadState] = useState('loading')
  const [pastorLetterExists, setPastorLetterExists] = useState(false)
  const [exposure, setExposure] = useState(null)
  const [badges, setBadges] = useState([])
  const [msg, setMsg] = useState('')
  const [faithMsg, setFaithMsg] = useState('')
  const [pastorLetterMsg, setPastorLetterMsg] = useState('')
  const [pastorLetterMsgType, setPastorLetterMsgType] = useState('')
  const [endorsements, setEndorsements] = useState([])
  const [endorsement, setEndorsement] = useState({ kind:'pastor', name:'', contact:'', church:'', note:'' })
  const [endorsementMsg, setEndorsementMsg] = useState('')
  const [pwd, setPwd] = useState({ current_password:'', new_password:'', confirm:'' })
  const [pwdMsg, setPwdMsg] = useState('')
  const [verifyMsg, setVerifyMsg] = useState('')
  const [verifyLink, setVerifyLink] = useState('')
  const [profileLoadState, setProfileLoadState] = useState('loading')
  const profileLoadRequest = useRef(0)
  const [busy, setBusy] = useState({ initial: true, profile: false, faith: false, pastorLetter: false, endorsement: false, password: false, verify: false })

  const loadProfile = useCallback(async () => {
    const requestId = ++profileLoadRequest.current
    setProfileLoadState('loading')
    setBusy(p => ({...p, initial: true}))
    setMsg('')
    try {
      const r = await profile.get()
      if (requestId !== profileLoadRequest.current) return
      if (r.data.profile) setForm(p => ({...p, ...r.data.profile}))
      if (r.data.faith) setFaith(p => ({...p, ...r.data.faith}))
      setEndorsements(r.data.endorsements || [])
      setBadges(r.data.badges || [])
      setExposure(r.data.exposure ?? null)
      setProfileLoadState('ready')
    } catch {
      if (requestId !== profileLoadRequest.current) return
      setMsg('资料加载失败，请刷新重试')
      setProfileLoadState('error')
    } finally {
      if (requestId === profileLoadRequest.current) {
        setBusy(p => ({...p, initial: false}))
      }
    }
  }, [])

  useEffect(() => {
    loadProfile()
    return () => { profileLoadRequest.current += 1 }
  }, [loadProfile])

  useEffect(() => {
    pastorLetters.mine().then(r => {
      const letter = r.data.letter || null
      setPastorLetterExists(Boolean(letter))
      if (letter && !pastorLetterEdited.current) {
        setPastorLetter(p => ({...p, ...letter}))
      }
      setPastorLetterLoadState('ready')
    }).catch(err => {
      setPastorLetterMsg(err.response?.data?.error || '牧者介绍信加载失败')
      setPastorLetterMsgType('error')
      setPastorLetterLoadState('error')
    })
  }, [])

  const set = key => e => setForm(p => ({...p, [key]: e.target.value}))
  const setF = key => e => setFaith(p => ({...p, [key]: e.target.value}))
  const setPastorLetterField = key => e => {
    pastorLetterEdited.current = true
    setPastorLetter(p => ({...p, [key]: e.target.value}))
  }

  const changePwd = async (e) => {
    e.preventDefault()
    if (pwd.new_password !== pwd.confirm) return setPwdMsg('两次密码不一致')
    setBusy(p => ({...p, password: true}))
    setPwdMsg('')
    try {
      await auth.changePassword({ current_password: pwd.current_password, new_password: pwd.new_password })
      setPwdMsg('密码已修改')
      setPwd({ current_password:'', new_password:'', confirm:'' })
    } catch { setPwdMsg('修改失败，请确认当前密码是否正确') }
    finally { setBusy(p => ({...p, password: false})) }
  }

  const sendVerify = async () => {
    setBusy(p => ({...p, verify: true}))
    setVerifyMsg('')
    setVerifyLink('')
    try {
      const r = await auth.sendVerify()
      if (r.data.already) {
        await refreshMe?.()
        setVerifyMsg('邮箱已验证')
      } else {
        setVerifyMsg('验证邮件已发送')
        if (r.data.devToken) setVerifyLink(`/app/verify-email?token=${r.data.devToken}`)
      }
    } catch (err) {
      setVerifyMsg(err.response?.data?.error || '发送验证邮件失败')
    } finally {
      setBusy(p => ({...p, verify: false}))
    }
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    if (profileLoadState !== 'ready') return
    setBusy(p => ({...p, profile: true}))
    setMsg('')
    try {
      const r = await profile.save(form)
      const completion = Number(r.data?.completion)
      setExposure(r.data?.exposure ?? null)
      setMsg(Number.isFinite(completion) ? `资料已保存，完整度 ${completion}%` : '资料已保存，曝光分已更新')
    }
    catch (err) { setMsg(err.response?.data?.error || '保存失败，请检查资料后重试') }
    finally { setBusy(p => ({...p, profile: false})) }
  }
  const saveFaith = async (e) => {
    e.preventDefault()
    if (profileLoadState !== 'ready') return
    setBusy(p => ({...p, faith: true}))
    setFaithMsg('')
    try {
      const r = await profile.saveFaith(faith)
      setExposure(r.data?.exposure ?? null)
      setFaithMsg('信仰档案已保存')
    }
    catch (err) { setFaithMsg(err.response?.data?.error || '保存失败，请检查信仰档案后重试') }
    finally { setBusy(p => ({...p, faith: false})) }
  }

  const savePastorLetter = async (e) => {
    e.preventDefault()
    if (pastorLetterLoadState !== 'ready') return
    setBusy(p => ({...p, pastorLetter: true}))
    setPastorLetterMsg('')
    setPastorLetterMsgType('')
    try {
      const r = await pastorLetters.save(pastorLetter)
      const nextLetter = r.data?.letter || {}
      setPastorLetter(p => ({...p, ...nextLetter, is_verified: nextLetter.is_verified ?? false}))
      setPastorLetterExists(true)
      pastorLetterEdited.current = false
      setPastorLetterMsg(nextLetter.is_verified ? '牧者介绍信已保存，核验状态保持不变' : '牧者介绍信已保存，等待核验')
      setPastorLetterMsgType('success')
    } catch (err) {
      setPastorLetterMsg(err.response?.data?.error || '牧者介绍信保存失败')
      setPastorLetterMsgType('error')
    } finally {
      setBusy(p => ({...p, pastorLetter: false}))
    }
  }

  const addEndorsement = async (e) => {
    e.preventDefault()
    setBusy(p => ({...p, endorsement: true}))
    setEndorsementMsg('')
    try {
      const r = await profile.addEndorsement(endorsement)
      setEndorsements(items => [...items, r.data.endorsement])
      setEndorsement({ kind:'pastor', name:'', contact:'', church:'', note:'' })
      setEndorsementMsg('背书人已提交，等待审核确认')
    } catch (err) {
      setEndorsementMsg(err.response?.data?.error || '提交失败')
    } finally {
      setBusy(p => ({...p, endorsement: false}))
    }
  }

  const removeEndorsement = async (id) => {
    try {
      await profile.removeEndorsement(id)
      setEndorsements(items => items.filter(item => item.id !== id))
    } catch {
      setEndorsementMsg('只能删除待审核的背书人')
    }
  }

  return (
    <>
      <h1 className="page-title">完善资料</h1>
      <p className="page-sub">资料越完整，曝光分越高，越容易被匹配到</p>
      {exposure !== null && (
        <p style={{fontSize:13,color:'var(--legacy-muted)',marginTop:-12,marginBottom:16}}>
          当前曝光分：<strong style={{color:'var(--brand)'}}>{exposure}</strong>
        </p>
      )}
      {badges.length > 0 && (
        <section className="card" aria-labelledby="course-badges-title">
          <h3 id="course-badges-title" style={{fontSize:15,marginBottom:12}}>我的课程徽章</h3>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {badges.map(badge => (
              <div key={`${badge.title}-${badge.completed_at}`} className="badge badge-green" style={{padding:'8px 12px'}}>
                <strong>{badge.title}</strong>
                <span style={{marginLeft:6,fontWeight:400}}>
                  {new Date(badge.completed_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {busy.initial && <div className="card" style={{fontSize:14,color:'var(--legacy-muted)',marginBottom:16}}>正在加载你的资料…</div>}
      {profileLoadState === 'error' && (
        <div className="card" style={{marginBottom:16}}>
          <div className="error-msg">{msg || '资料加载失败，请刷新重试'}</div>
          <button type="button" className="btn btn-outline" onClick={loadProfile}>重新加载</button>
        </div>
      )}

      <div className="card" style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div>
          <h3 style={{fontSize:15,marginBottom:6}}>账户安全</h3>
          <div style={{fontSize:13,color:'var(--legacy-muted)'}}>{user?.email} · {user?.email_verified ? '邮箱已验证' : '邮箱未验证'}</div>
          {verifyMsg && <div className={messageClass(verifyMsg)}>{verifyMsg}</div>}
          {verifyLink && <div className="success-msg"><a href={verifyLink}>调试验证链接</a></div>}
        </div>
        {!user?.email_verified && <button className="btn btn-outline" onClick={sendVerify} disabled={busy.verify}>{busy.verify ? '发送中…' : '发送验证邮件'}</button>}
      </div>

      <form className="card" onSubmit={saveProfile}>
        <h3 style={{fontSize:15,marginBottom:16}}>个人资料</h3>
        <fieldset disabled={profileLoadState !== 'ready' || busy.profile} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className="grid-2">
          <div className="field"><label>昵称</label><input value={form.nickname||''} onChange={set('nickname')} /></div>
          <div className="field"><label>所在城市</label><input value={form.city||''} onChange={set('city')} /></div>
          <div className="field"><label>出生日期</label><input type="date" value={form.birth_date||''} onChange={set('birth_date')} /></div>
          <div className="field"><small>请填写完整出生日期，仅年满 18 周岁可参与匹配。</small></div>
          <div className="field"><label>学历</label><input value={form.education||''} onChange={set('education')} /></div>
          <div className="field"><label>婚恋目标</label>
            <select value={form.goal||''} onChange={set('goal')}>
              <option value="">请选择</option>
              <option value="serious">认真寻找婚姻对象</option>
              <option value="explore">先了解，慢慢来</option>
            </select>
          </div>
        </div>
        <div className="field"><label>择偶期待</label>
          <textarea rows={3} value={form.preference||''} onChange={set('preference')} placeholder="你希望遇见怎样的另一半" />
        </div>
        <div className="field"><label>自我介绍</label>
          <textarea rows={4} value={form.intro||''} onChange={set('intro')} placeholder="介绍一下你自己" />
        </div>
        <label className="check-row">
          <input type="checkbox" checked={!!form.privacy_ok} onChange={e => setForm(p => ({...p, privacy_ok: e.target.checked}))} />
          <span>我同意将资料用于平台内的匿名匹配，敏感信息仅顾问与匹配对象可见</span>
        </label>
        <button className="btn btn-primary" disabled={busy.profile || profileLoadState !== 'ready'}>{busy.profile ? '保存中…' : '保存资料'}</button>
        </fieldset>
        {msg && <div className={messageClass(msg)}>{msg}</div>}
      </form>

      <form className="card" onSubmit={saveFaith}>
        <h3 style={{fontSize:15,marginBottom:8}}>信仰档案</h3>
        <p style={{fontSize:13,color:'var(--legacy-muted)',marginBottom:16}}>这是信任网络的根基，牧者背书会基于此。</p>
        <fieldset disabled={profileLoadState !== 'ready' || busy.faith} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className="grid-2">
          <div className="field"><label>所属教会 / 堂会</label><input value={faith.church_name||''} onChange={setF('church_name')} /></div>
          <div className="field"><label>所在区会</label><input value={faith.presbytery||''} onChange={setF('presbytery')} placeholder="例如 北美中华联合区会" /></div>
          <div className="field"><label>所在地区</label><input value={faith.region||''} onChange={setF('region')} placeholder="例如 加州湾区" /></div>
          <div className="field"><label>宗派</label><input value={faith.denomination||''} onChange={setF('denomination')} placeholder="例如 长老会" /></div>
          <div className="field"><label>牧者 / 同工姓名</label><input value={faith.coworker||''} onChange={setF('coworker')} /></div>
          <div className="field"><label>受洗时间</label><input value={faith.baptism_date||''} onChange={setF('baptism_date')} placeholder="例如 2018-05" /></div>
          <div className="field"><label>信主年数</label><input value={faith.faith_years||''} onChange={setF('faith_years')} /></div>
        </div>
        <div className="field"><label>简短见证</label>
          <textarea rows={3} value={faith.testimony||''} onChange={setF('testimony')} />
        </div>
        <button className="btn btn-primary" disabled={busy.faith || profileLoadState !== 'ready'}>{busy.faith ? '保存中…' : '保存信仰档案'}</button>
        </fieldset>
        {faithMsg && <div className={messageClass(faithMsg)}>{faithMsg}</div>}
      </form>

      <form className="card" onSubmit={savePastorLetter}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:8,flexWrap:'wrap'}}>
          <h3 style={{fontSize:15}}>牧者介绍信（可选）</h3>
          <span className={`badge ${pastorLetter.is_verified ? 'badge-green' : pastorLetterLoadState === 'error' ? 'badge-gray' : 'badge-yellow'}`}>
            {pastorLetterLoadState === 'loading'
              ? '加载中'
              : pastorLetterLoadState === 'error'
                ? '加载失败'
                : pastorLetterExists
                  ? pastorLetter.is_verified ? '已核验' : '待核验'
                  : '未提交'}
          </span>
        </div>
        <p style={{fontSize:13,color:'var(--legacy-muted)',marginBottom:16}}>提交后由平台核验；更新内容会重新进入待核验状态。</p>
        <div className="grid-2">
          <div className="field"><label>牧者姓名</label><input required maxLength={120} disabled={busy.pastorLetter || pastorLetterLoadState !== 'ready'} value={pastorLetter.pastor_name} onChange={setPastorLetterField('pastor_name')} /></div>
          <div className="field"><label>牧者联系方式</label><input required maxLength={320} disabled={busy.pastorLetter || pastorLetterLoadState !== 'ready'} value={pastorLetter.pastor_contact} onChange={setPastorLetterField('pastor_contact')} /></div>
        </div>
        <div className="field"><label>家庭情况</label><textarea rows={3} maxLength={2000} disabled={busy.pastorLetter || pastorLetterLoadState !== 'ready'} value={pastorLetter.family_note} onChange={setPastorLetterField('family_note')} /></div>
        <div className="field"><label>信仰情况</label><textarea rows={3} maxLength={2000} disabled={busy.pastorLetter || pastorLetterLoadState !== 'ready'} value={pastorLetter.faith_note} onChange={setPastorLetterField('faith_note')} /></div>
        <div className="field"><label>属灵生命</label><textarea rows={3} maxLength={2000} disabled={busy.pastorLetter || pastorLetterLoadState !== 'ready'} value={pastorLetter.spiritual_note} onChange={setPastorLetterField('spiritual_note')} /></div>
        <div className="field"><label>教会生活</label><textarea rows={3} maxLength={2000} disabled={busy.pastorLetter || pastorLetterLoadState !== 'ready'} value={pastorLetter.church_life_note} onChange={setPastorLetterField('church_life_note')} /></div>
        <button className="btn btn-primary" disabled={busy.pastorLetter || pastorLetterLoadState !== 'ready'}>{busy.pastorLetter ? '保存中…' : '保存介绍信'}</button>
        {pastorLetterMsg && <div className={pastorLetterMsgType === 'error' ? 'error-msg' : 'success-msg'}>{pastorLetterMsg}</div>}
      </form>

      <form className="card" onSubmit={addEndorsement}>
        <h3 style={{fontSize:15,marginBottom:8}}>牧者 / 引荐人背书</h3>
        <p style={{fontSize:13,color:'var(--legacy-muted)',marginBottom:16}}>任选其一完成审核后，即满足入池背书要求。</p>
        {endorsements.length > 0 && (
          <div style={{display:'grid',gap:10,marginBottom:16}}>
            {endorsements.map(item => (
              <div key={item.id} style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',border:'1px solid var(--border)',borderRadius:12,padding:12}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600}}>{item.name} · {item.kind === 'pastor' ? '牧者' : '引荐人'}</div>
                  <div style={{fontSize:12,color:'var(--legacy-muted)'}}>{item.church || '未填写教会/关系说明'}</div>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span className={`badge ${item.state === 'verified' ? 'badge-green' : item.state === 'rejected' ? 'badge-gray' : 'badge-yellow'}`}>
                    {item.state === 'verified' ? '已确认' : item.state === 'rejected' ? '未通过' : '待审核'}
                  </span>
                  {item.state === 'pending' && <button type="button" className="btn btn-outline" onClick={() => removeEndorsement(item.id)}>删除</button>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid-2">
          <div className="field"><label>类型</label>
            <select value={endorsement.kind} onChange={e=>setEndorsement(p=>({...p,kind:e.target.value}))}>
              <option value="pastor">牧者</option>
              <option value="referrer">引荐人</option>
            </select>
          </div>
          <div className="field"><label>姓名</label><input value={endorsement.name} onChange={e=>setEndorsement(p=>({...p,name:e.target.value}))} /></div>
          <div className="field"><label>联系方式</label><input value={endorsement.contact} onChange={e=>setEndorsement(p=>({...p,contact:e.target.value}))} /></div>
          <div className="field"><label>教会 / 关系说明</label><input value={endorsement.church} onChange={e=>setEndorsement(p=>({...p,church:e.target.value}))} /></div>
        </div>
        <div className="field"><label>备注</label><textarea rows={3} value={endorsement.note} onChange={e=>setEndorsement(p=>({...p,note:e.target.value}))} placeholder="例如：小组长、团契负责人、属灵长辈或已认证会员" /></div>
        <button className="btn btn-primary" disabled={busy.endorsement}>{busy.endorsement ? '提交中…' : '提交背书人'}</button>
        {endorsementMsg && <div className={messageClass(endorsementMsg)}>{endorsementMsg}</div>}
      </form>

      <form className="card" onSubmit={changePwd}>
        <h3 style={{fontSize:15,marginBottom:16}}>修改密码</h3>
        <div className="field"><label>当前密码</label>
          <input type="password" value={pwd.current_password} onChange={e=>setPwd(p=>({...p,current_password:e.target.value}))} />
        </div>
        <div className="grid-2">
          <div className="field"><label>新密码</label>
            <input type="password" value={pwd.new_password} onChange={e=>setPwd(p=>({...p,new_password:e.target.value}))} placeholder="至少 8 位" />
          </div>
          <div className="field"><label>确认新密码</label>
            <input type="password" value={pwd.confirm} onChange={e=>setPwd(p=>({...p,confirm:e.target.value}))} />
          </div>
        </div>
        <button className="btn btn-primary" disabled={busy.password}>{busy.password ? '修改中…' : '修改密码'}</button>
        {pwdMsg && <div className={messageClass(pwdMsg)}>{pwdMsg}</div>}
      </form>
    </>
  )
}
