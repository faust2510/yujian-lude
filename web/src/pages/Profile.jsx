import { useEffect, useState } from 'react'
import { profile, auth } from '../api/client'

export default function Profile() {
  const [form, setForm] = useState({
    nickname:'', city:'', birth_year:'', education:'',
    goal:'', preference:'', intro:'', privacy_ok: false
  })
  const [faith, setFaith] = useState({
    church_name:'', presbytery:'', region:'', denomination:'',
    coworker:'', baptism_date:'', faith_years:'', testimony:''
  })
  const [msg, setMsg] = useState('')
  const [faithMsg, setFaithMsg] = useState('')
  const [endorsements, setEndorsements] = useState([])
  const [endorsement, setEndorsement] = useState({ kind:'pastor', name:'', contact:'', church:'', note:'' })
  const [endorsementMsg, setEndorsementMsg] = useState('')
  const [pwd, setPwd] = useState({ current_password:'', new_password:'', confirm:'' })
  const [pwdMsg, setPwdMsg] = useState('')

  useEffect(() => {
    profile.get().then(r => {
      if (r.data.profile) setForm(p => ({...p, ...r.data.profile}))
      if (r.data.faith) setFaith(p => ({...p, ...r.data.faith}))
      setEndorsements(r.data.endorsements || [])
    }).catch(()=>{})
  }, [])

  const set = key => e => setForm(p => ({...p, [key]: e.target.value}))
  const setF = key => e => setFaith(p => ({...p, [key]: e.target.value}))

  const changePwd = async (e) => {
    e.preventDefault()
    if (pwd.new_password !== pwd.confirm) return setPwdMsg('两次密码不一致')
    try {
      await auth.changePassword({ current_password: pwd.current_password, new_password: pwd.new_password })
      setPwdMsg('密码已修改')
      setPwd({ current_password:'', new_password:'', confirm:'' })
    } catch { setPwdMsg('修改失败，请确认当前密码是否正确') }
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    try { await profile.save(form); setMsg('资料已保存，曝光分已更新') }
    catch { setMsg('保存失败') }
  }
  const saveFaith = async (e) => {
    e.preventDefault()
    try { await profile.saveFaith(faith); setFaithMsg('信仰档案已保存') }
    catch { setFaithMsg('保存失败') }
  }

  const addEndorsement = async (e) => {
    e.preventDefault()
    try {
      const r = await profile.addEndorsement(endorsement)
      setEndorsements(items => [...items, r.data.endorsement])
      setEndorsement({ kind:'pastor', name:'', contact:'', church:'', note:'' })
      setEndorsementMsg('背书人已提交，等待审核确认')
    } catch (err) {
      setEndorsementMsg(err.response?.data?.error || '提交失败')
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

      <form className="card" onSubmit={saveProfile}>
        <h3 style={{fontSize:15,marginBottom:16}}>个人资料</h3>
        <div className="grid-2">
          <div className="field"><label>昵称</label><input value={form.nickname||''} onChange={set('nickname')} /></div>
          <div className="field"><label>所在城市</label><input value={form.city||''} onChange={set('city')} /></div>
          <div className="field"><label>出生年份</label><input value={form.birth_year||''} onChange={set('birth_year')} placeholder="例如 1995" /></div>
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
        <button className="btn btn-primary">保存资料</button>
        {msg && <div className="success-msg">{msg}</div>}
      </form>

      <form className="card" onSubmit={saveFaith}>
        <h3 style={{fontSize:15,marginBottom:8}}>信仰档案</h3>
        <p style={{fontSize:13,color:'var(--muted)',marginBottom:16}}>这是信任网络的根基，牧者背书会基于此。</p>
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
        <button className="btn btn-primary">保存信仰档案</button>
        {faithMsg && <div className="success-msg">{faithMsg}</div>}
      </form>

      <form className="card" onSubmit={addEndorsement}>
        <h3 style={{fontSize:15,marginBottom:8}}>牧者 / 成熟引荐人背书</h3>
        <p style={{fontSize:13,color:'var(--muted)',marginBottom:16}}>任选其一完成审核后，即满足入池背书要求。</p>
        {endorsements.length > 0 && (
          <div style={{display:'grid',gap:10,marginBottom:16}}>
            {endorsements.map(item => (
              <div key={item.id} style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',border:'1px solid var(--border)',borderRadius:12,padding:12}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600}}>{item.name} · {item.kind === 'pastor' ? '牧者' : '成熟引荐人'}</div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>{item.church || '未填写教会/关系说明'}</div>
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
              <option value="referrer">成熟引荐人</option>
            </select>
          </div>
          <div className="field"><label>姓名</label><input value={endorsement.name} onChange={e=>setEndorsement(p=>({...p,name:e.target.value}))} /></div>
          <div className="field"><label>联系方式</label><input value={endorsement.contact} onChange={e=>setEndorsement(p=>({...p,contact:e.target.value}))} /></div>
          <div className="field"><label>教会 / 关系说明</label><input value={endorsement.church} onChange={e=>setEndorsement(p=>({...p,church:e.target.value}))} /></div>
        </div>
        <div className="field"><label>备注</label><textarea rows={3} value={endorsement.note} onChange={e=>setEndorsement(p=>({...p,note:e.target.value}))} placeholder="例如：小组长、团契负责人、属灵长辈或已认证会员" /></div>
        <button className="btn btn-primary">提交背书人</button>
        {endorsementMsg && <div className="success-msg">{endorsementMsg}</div>}
      </form>

      <form className="card" onSubmit={changePwd}>
        <h3 style={{fontSize:15,marginBottom:16}}>修改密码</h3>
        <div className="field"><label>当前密码</label>
          <input type="password" value={pwd.current_password} onChange={e=>setPwd(p=>({...p,current_password:e.target.value}))} />
        </div>
        <div className="grid-2">
          <div className="field"><label>新密码</label>
            <input type="password" value={pwd.new_password} onChange={e=>setPwd(p=>({...p,new_password:e.target.value}))} placeholder="至少 6 位" />
          </div>
          <div className="field"><label>确认新密码</label>
            <input type="password" value={pwd.confirm} onChange={e=>setPwd(p=>({...p,confirm:e.target.value}))} />
          </div>
        </div>
        <button className="btn btn-primary">修改密码</button>
        {pwdMsg && <div className="success-msg">{pwdMsg}</div>}
      </form>
    </>
  )
}
