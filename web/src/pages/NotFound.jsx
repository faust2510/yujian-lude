import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section style={{minHeight:'60vh',display:'grid',placeItems:'center',textAlign:'center',padding:'48px 20px'}}>
      <div>
        <div style={{fontSize:13,color:'var(--brand)',fontWeight:700,marginBottom:10}}>404</div>
        <h1 className="page-title" style={{marginBottom:10}}>页面没有找到</h1>
        <p style={{color:'var(--legacy-muted)',fontSize:14,marginBottom:24}}>这个地址可能已经变更，或者暂时不可用。</p>
        <Link className="btn btn-primary" to="/">
          <ArrowLeft size={16} aria-hidden="true" />
          回到首页
        </Link>
      </div>
    </section>
  )
}
