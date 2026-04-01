import { useState, useEffect, useRef } from 'react'

interface Props { onSignIn: () => void; onSignUp: () => void }

function genMap() {
  return Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) =>
      Math.min(99, Math.max(10, 20 + r * 10 + c * 8 + Math.floor(Math.random() * 8)))
    )
  )
}
function heatColor(v: number, mn: number, mx: number) {
  const t = (v - mn) / (mx - mn || 1)
  if (t < .25) { const p = t/.25; return `rgb(13,${Math.round(59+p*116)},122)` }
  if (t < .5)  { const p = (t-.25)/.25; return `rgb(${Math.round(13+p*120)},${Math.round(175+p*24)},${Math.round(130-p*60)})` }
  if (t < .75) { const p = (t-.5)/.25;  return `rgb(${Math.round(133+p*110)},${Math.round(199-p*60)},${Math.round(70-p*50)})` }
  const p = (t-.75)/.25; return `rgb(${Math.round(243-p*20)},${Math.round(139-p*120)},20)`
}

export default function WebLanding({ onSignIn, onSignUp }: Props) {
  const [heat, setHeat] = useState(genMap)
  const [counts, setCounts] = useState({ files: 0, drt: 0 })
  const [yearly, setYearly] = useState(false)
  const [activePage, setActivePage] = useState<'home' | 'docs'>('home')
  const ran = useRef(false)

  useEffect(() => {
    const iv = setInterval(() => setHeat(p => p.map(r => r.map(v =>
      Math.min(99, Math.max(10, v + (Math.random() > .6 ? Math.round((Math.random()-.5)*12) : 0)))
    ))), 850)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (ran.current) return; ran.current = true
    const s = Date.now(), d = 2200
    const tick = () => {
      const p = Math.min(1, (Date.now()-s)/d), e = 1-Math.pow(1-p, 3)
      setCounts({ files: Math.round(e*38977), drt: Math.round(e*16000) })
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [])

  const flat = heat.flat(), mn = Math.min(...flat), mx = Math.max(...flat)

  return (
    <div style={{ minHeight:'100vh', background:'#f4f4f6', fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif", color:'#0a0a0a' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

        @keyframes fadeUp   {from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
        @keyframes floatY   {0%,100%{transform:translateY(0)}50%{transform:translateY(-11px)}}
        @keyframes blink    {0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes scan     {0%{top:-3px;opacity:.5}100%{top:100%;opacity:0}}
        @keyframes ticker   {0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes shimmer  {0%{background-position:200% center}100%{background-position:-200% center}}
        @keyframes glowBtn  {0%,100%{box-shadow:0 0 20px rgba(0,174,200,.45),0 4px 24px rgba(0,174,200,.2)}50%{box-shadow:0 0 36px rgba(0,174,200,.7),0 4px 36px rgba(0,174,200,.35)}}
        @keyframes orbFloat {0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-30px) scale(1.04)}}

        .heat-cell{transition:background .8s ease}

        /* NAV */
        .nav-link{color:rgba(0,0,0,.5);text-decoration:none;font-weight:600;font-size:14px;transition:color .15s}
        .nav-link:hover{color:#000}

        /* BTN PRIMARY */
        .btn-cta{
          background:linear-gradient(135deg,#00cce0 0%,#008fab 100%);
          color:#000;border:none;font-family:inherit;font-weight:700;
          cursor:pointer;transition:all .18s;
          box-shadow:0 0 0 0 rgba(0,174,200,0);
        }
        .btn-cta:hover{filter:brightness(1.08);transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,174,200,.5)}
        .btn-cta:active{transform:translateY(0)}

        /* BTN OUTLINE — light bg use */
        .btn-out{
          background:transparent;border:1.5px solid rgba(0,0,0,.2);
          color:rgba(0,0,0,.65);font-family:inherit;font-weight:600;
          cursor:pointer;transition:all .18s;
        }
        .btn-out:hover{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.35);color:#000;transform:translateY(-1px)}

        /* BTN OUTLINE — dark bg (hero) */
        .btn-out-dark{
          background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);
          color:rgba(255,255,255,.85);font-family:inherit;font-weight:600;
          cursor:pointer;transition:all .18s;
        }
        .btn-out-dark:hover{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.45);color:#fff;transform:translateY(-1px)}

        /* CHARCOAL CARD */
        .gc{
          background:#161619;
          border:1px solid rgba(255,255,255,.09);
          border-radius:16px;
          box-shadow:0 4px 28px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.07);
          position:relative;overflow:hidden;
          transition:border-color .22s,transform .25s,box-shadow .25s;
        }
        .gc:hover{
          border-color:rgba(0,174,200,.5);
          transform:translateY(-4px);
          box-shadow:0 16px 48px rgba(0,0,0,.32),0 0 0 1px rgba(0,174,200,.15);
        }

        /* PLAN CARD */
        .pc{
          background:#161619;
          border:1px solid rgba(255,255,255,.09);
          border-radius:20px;
          box-shadow:0 4px 28px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.07);
          position:relative;overflow:hidden;
          transition:border-color .22s,transform .25s,box-shadow .25s;
          display:flex;flex-direction:column;
        }
        .pc:hover{border-color:rgba(255,255,255,.2);transform:translateY(-5px);box-shadow:0 20px 60px rgba(0,0,0,.3)}
        .pc.star{background:#161619;border-color:rgba(0,174,200,.5);box-shadow:0 4px 32px rgba(0,0,0,.28),0 0 40px rgba(0,174,200,.08),inset 0 1px 0 rgba(0,174,200,.1)}
        .pc.star:hover{border-color:rgba(0,174,200,.75);box-shadow:0 20px 60px rgba(0,0,0,.3),0 0 60px rgba(0,174,200,.12)}

        /* PLAN BTN */
        .pb{width:100%;font-family:inherit;font-weight:700;cursor:pointer;border-radius:12px;padding:14px;font-size:15px;transition:all .18s}
        .pb:hover{filter:brightness(1.1);transform:translateY(-1px)}

        /* FEATURE ROW */
        .fr{display:flex;align-items:flex-start;gap:14px;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,.06);transition:background .15s;cursor:default}
        .fr:last-child{border-bottom:none}
        .fr:hover{background:rgba(255,255,255,.03)}

        /* TICKER */
        .tick{display:flex;animation:ticker 34s linear infinite;white-space:nowrap}

        /* TAG */
        .tag{display:inline-flex;align-items:center;padding:3px 10px;border-radius:5px;font-size:11px;font-weight:700;letter-spacing:.2px;background:rgba(0,174,200,.12);color:#008fab;border:1px solid rgba(0,174,200,.25)}

        /* ── RESPONSIVE LAYOUT CLASSES ─────────────────── */
        .hero-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:72px;align-items:center;}
        .feat-2col{display:grid;grid-template-columns:1.25fr 1fr;gap:16px;margin-bottom:16px;}
        .stats-4{display:grid;grid-template-columns:repeat(4,1fr);}
        .price-3col{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;align-items:stretch;}
        .nav-links-d{display:flex;gap:32px;}
        .nav-signin{}

        @media(max-width:768px){
          .nav-links-d{display:none}
          .nav-signin{display:none}
          .hero-grid{grid-template-columns:1fr;gap:0;padding-top:40px!important}
          .hero-heatmap{display:none}
          .hero-btns{flex-direction:column!important}
          .hero-btns button{width:100%}
          .stats-4{grid-template-columns:repeat(2,1fr)}
          .stats-4 > *{padding:16px 12px!important}
          .feat-2col{grid-template-columns:1fr}
          .price-3col{grid-template-columns:1fr;gap:14px}
          .price-3col > *{margin-top:0!important}
          .site-footer{flex-direction:column;gap:12px;text-align:center;padding:20px 24px!important}
        }
      `}</style>

      {/* ── BACKGROUND ──────────────────────────────────── */}
      {/* Grain */}
      <svg style={{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0,opacity:.12}} xmlns="http://www.w3.org/2000/svg">
        <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
        <rect width="100%" height="100%" filter="url(#noise)"/>
      </svg>

      {/* ── NAV ───────────────────────────────────────── */}
      <nav style={{position:'sticky',top:0,zIndex:200,height:62,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 max(24px,calc(50% - 660px))',background:'rgba(244,244,246,.92)',backdropFilter:'blur(28px) saturate(180%)',borderBottom:'1px solid rgba(0,0,0,.08)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:48,height:48,borderRadius:'50%',overflow:'hidden',border:'2px solid rgba(0,174,200,.35)',boxShadow:'0 0 22px rgba(0,174,200,.25), 0 2px 10px rgba(0,0,0,.7)',flexShrink:0,background:'#000'}}>
            <img src="/logo.jpg" alt="DCTuning" style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',display:'block'}}/>
          </div>
          <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(0,174,200,.12)',color:'#00aec8',border:'1px solid rgba(0,174,200,.25)',letterSpacing:'1px',textTransform:'uppercase'}}>PRO</span>
        </div>
        <div className="nav-links-d">
          {(['Features','Pricing','Docs'] as const).map(l => {
            const isActive = l === 'Docs' && activePage === 'docs'
            return (
              <a
                key={l}
                href="#"
                className="nav-link"
                style={isActive ? {color:'#00aec8'} : undefined}
                onClick={e => {
                  e.preventDefault()
                  if (l === 'Docs') {
                    setActivePage('docs')
                    window.scrollTo({ top: 0 })
                  } else {
                    setActivePage('home')
                    setTimeout(() => {
                      document.getElementById(l.toLowerCase())?.scrollIntoView({ behavior: 'smooth' })
                    }, 50)
                  }
                }}
              >{l}</a>
            )
          })}
        </div>
        <div style={{display:'flex',gap:10}}>
          <button className="nav-signin" onClick={onSignIn} style={{padding:'9px 20px',borderRadius:9,fontSize:13,fontFamily:'inherit',fontWeight:600,background:'transparent',border:'1.5px solid rgba(0,0,0,.18)',color:'rgba(0,0,0,.6)',cursor:'pointer',transition:'all .18s'}}>Sign In</button>
          <button className="btn-cta" onClick={onSignUp} style={{padding:'9px 20px',borderRadius:9,fontSize:13,animation:'glowBtn 3s ease infinite'}}>Try Free — Limited Time</button>
        </div>
      </nav>

      {activePage === 'home' && <>

      {/* ── HERO ──────────────────────────────────────── */}
      <section style={{position:'relative',zIndex:1,overflow:'hidden'}}>
        {/* Full-bleed car background */}
        <div style={{position:'absolute',inset:0,backgroundImage:'url(/hero-big.jpg)',backgroundSize:'cover',backgroundPosition:'center 55%',zIndex:0}}/>
        {/* Subtle dark base so text stays readable */}
        <div style={{position:'absolute',inset:0,background:'rgba(8,9,14,.22)',zIndex:1}}/>
        {/* Left-to-right gradient — darkens left side for heading legibility only */}
        <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(8,9,14,.78) 0%,rgba(8,9,14,.4) 38%,rgba(8,9,14,.1) 65%,transparent 100%)',zIndex:2}}/>
        {/* Top fade — blends dark nav into hero, hides ceiling gap */}
        <div style={{position:'absolute',top:0,left:0,right:0,height:'22%',background:'linear-gradient(rgba(8,9,14,.75) 0%,transparent 100%)',zIndex:3}}/>
        {/* Bottom fade into page */}
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:'25%',background:'linear-gradient(transparent,#f4f4f6)',zIndex:3}}/>
      <div className="hero-grid" style={{position:'relative',zIndex:10,maxWidth:1280,margin:'0 auto',padding:'80px max(24px,calc(50% - 640px)) 0'}}>

        <div style={{animation:'fadeUp .6s ease both',paddingBottom:32}}>
          {/* Live pill */}
          <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 16px 6px 10px',borderRadius:100,background:'rgba(0,174,200,.09)',border:'1px solid rgba(0,174,200,.24)',fontSize:12,fontWeight:600,color:'#00aec8',marginBottom:28,backdropFilter:'blur(8px)'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:'#00aec8',display:'inline-block',animation:'blink 2s ease infinite'}}/>
            A2L + ECM Titanium DRT — now live
          </div>

          <h1 style={{fontSize:'clamp(48px,5.8vw,76px)',fontWeight:800,lineHeight:.95,letterSpacing:'-2.5px',marginBottom:24}}>
            <span style={{display:'block',color:'#ffffff',textShadow:'0 2px 24px rgba(0,0,0,.9)'}}>Professional ECU</span>
            <span style={{display:'block',color:'#ffffff',textShadow:'0 2px 24px rgba(0,0,0,.9)'}}>remapping,</span>
            <span style={{display:'block',color:'#00aec8',textShadow:'0 0 40px rgba(0,174,200,.4)'}}>in your browser.</span>
          </h1>

          <p style={{fontSize:17,lineHeight:1.72,color:'rgba(255,255,255,.72)',marginBottom:36,maxWidth:460,textShadow:'0 1px 8px rgba(0,0,0,.8)'}}>
            Stage 1/2/3 remap builder for professional tuners. Drop in your BIN and a definition file — A2L or DRT — configure your stage and export with checksum correction.
          </p>

          <div className="hero-btns" style={{display:'flex',gap:12,marginBottom:48}}>
            <button className="btn-cta" onClick={onSignUp} style={{padding:'15px 34px',borderRadius:12,fontSize:15,animation:'glowBtn 3s ease infinite'}}>Try For Free — Limited Time →</button>
            <button className="btn-out-dark" onClick={onSignIn} style={{padding:'15px 26px',borderRadius:12,fontSize:15}}>Sign In</button>
          </div>

          {/* Stats bar */}
          <div className="stats-4" style={{background:'rgba(0,0,0,.45)',border:'1px solid rgba(255,255,255,.14)',borderRadius:14,overflow:'hidden',backdropFilter:'blur(20px)',boxShadow:'0 8px 32px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.09)'}}>
            {[
              {n:`${Math.round(counts.files/1000)}k+`,l:'Tuning Files'},
              {n:`${Math.round(counts.drt/1000)}k+`,  l:'DRT Drivers'},
              {n:'20+',  l:'ECU Families'},
              {n:'Free',l:'Limited Trial'},
            ].map((s,i)=>(
              <div key={s.l} style={{padding:'18px 14px',textAlign:'center',borderLeft:i>0?'1px solid rgba(255,255,255,.08)':'none'}}>
                <div style={{fontSize:28,fontWeight:800,letterSpacing:'-1px',lineHeight:1,color:'#00aec8'}}>{s.n}</div>
                <div style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.38)',textTransform:'uppercase',letterSpacing:'.7px',marginTop:5}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Heatmap visual */}
        <div className="hero-heatmap" style={{position:'relative',animation:'fadeUp .6s ease .18s both, floatY 8s ease infinite'}}>
          <div style={{position:'absolute',inset:-70,background:'radial-gradient(circle at 55% 50%,rgba(0,174,200,.11) 0%,transparent 65%)',pointerEvents:'none'}}/>

          {/* Floating tooltip chips */}
          <div style={{position:'absolute',top:-18,right:-8,zIndex:20,padding:'9px 14px',borderRadius:10,background:'rgba(8,10,16,.97)',border:'1px solid rgba(255,255,255,.14)',boxShadow:'0 16px 56px rgba(0,0,0,.9)',fontSize:12,fontWeight:600,whiteSpace:'nowrap',backdropFilter:'blur(16px)'}}>
            <span style={{color:'#22c55e'}}>●</span>
            <span style={{color:'rgba(255,255,255,.4)',marginLeft:7}}>A2L loaded — </span>
            <span style={{color:'#00aec8'}}>847 maps</span>
          </div>
          <div style={{position:'absolute',bottom:78,left:-18,zIndex:20,padding:'9px 14px',borderRadius:10,background:'rgba(8,10,16,.97)',border:'1px solid rgba(255,255,255,.14)',boxShadow:'0 16px 56px rgba(0,0,0,.9)',fontSize:12,fontWeight:600,whiteSpace:'nowrap',backdropFilter:'blur(16px)'}}>
            <span style={{color:'#60a5fa'}}>●</span>
            <span style={{color:'rgba(255,255,255,.4)',marginLeft:7}}>DRT · </span>
            <span style={{color:'#fff'}}>MEDV1751.drt</span>
          </div>

          {/* Browser chrome */}
          <div style={{borderRadius:18,border:'1px solid rgba(255,255,255,.14)',background:'#0c0e16',overflow:'hidden',position:'relative',boxShadow:'0 60px 150px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.06),inset 0 1px 0 rgba(255,255,255,.06)'}}>
            {/* Scan line */}
            <div style={{position:'absolute',left:0,right:0,height:2,background:'linear-gradient(transparent,rgba(0,174,200,.35),transparent)',pointerEvents:'none',zIndex:5,animation:'scan 3.8s linear infinite'}}/>
            {/* Title bar */}
            <div style={{height:42,background:'rgba(255,255,255,.035)',borderBottom:'1px solid rgba(255,255,255,.08)',display:'flex',alignItems:'center',padding:'0 14px',gap:6}}>
              {['#ff5f57','#febc2e','#28c840'].map(c=><div key={c} style={{width:10,height:10,borderRadius:'50%',background:c}}/>)}
              <span style={{marginLeft:10,fontSize:11,color:'rgba(255,255,255,.3)',fontWeight:600,letterSpacing:'.1px'}}>DCTuning — Remap Builder</span>
            </div>
            {/* Steps */}
            <div style={{background:'rgba(255,255,255,.02)',borderBottom:'1px solid rgba(255,255,255,.06)',padding:'9px 14px',display:'flex',alignItems:'center',gap:5}}>
              {['Upload BIN','Load A2L/DRT','Configure','Preview','Export'].map((s,i)=>(
                <div key={s} style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{padding:'3px 9px',borderRadius:5,fontSize:9.5,fontWeight:700,background:i<=2?'#00aec8':'rgba(255,255,255,.05)',color:i<=2?'#000':'rgba(255,255,255,.22)',letterSpacing:'.1px'}}>
                    {i<=2?'✓ ':''}{s}
                  </div>
                  {i<4&&<span style={{color:'rgba(255,255,255,.12)',fontSize:9}}>›</span>}
                </div>
              ))}
            </div>
            {/* Heatmap body */}
            <div style={{padding:'16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div>
                  <div style={{fontSize:9.5,fontWeight:700,color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'1px'}}>BOOST MAP — RPM × LOAD</div>
                  <div style={{fontSize:8.5,color:'rgba(255,255,255,.16)',marginTop:2}}>MED17.5.25 · Stage 2 Active · CRC OK</div>
                </div>
                <div style={{display:'flex',gap:4}}>
                  {['S1','S2','S3'].map((s,i)=>(
                    <div key={s} style={{padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:700,background:i===1?'#00aec8':'rgba(255,255,255,.06)',color:i===1?'#000':'rgba(255,255,255,.22)'}}>{s}</div>
                  ))}
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:3}}>
                {heat.map((row,r)=>(
                  <div key={r} style={{display:'flex',gap:3}}>
                    {row.map((v,c)=>(
                      <div key={c} className="heat-cell" style={{flex:1,height:28,borderRadius:4,background:heatColor(v,mn,mx),display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:'rgba(255,255,255,.8)'}}>{v}</div>
                    ))}
                  </div>
                ))}
                <div style={{display:'flex',gap:3,marginTop:2}}>
                  {['800','1.5k','2k','3k','4k','5k','6k','7k'].map(r=>(
                    <div key={r} style={{flex:1,fontSize:6.5,color:'rgba(255,255,255,.2)',textAlign:'center'}}>{r}</div>
                  ))}
                </div>
              </div>
              <div style={{marginTop:11,padding:'7px 11px',borderRadius:8,background:'rgba(0,174,200,.08)',border:'1px solid rgba(0,174,200,.2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:10,color:'#00aec8',fontWeight:700}}>✓ CRC corrected</span>
                <span style={{fontSize:9.5,color:'rgba(255,255,255,.22)'}}>Avg Δ +28.4% · Max Δ +35%</span>
                <div style={{padding:'3px 10px',borderRadius:5,background:'#00aec8',fontSize:9.5,fontWeight:800,color:'#000',cursor:'pointer'}}>↓ Export</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </section>

      {/* ── TICKER ────────────────────────────────────── */}
      <div style={{background:'#1a1a1e',borderTop:'1px solid rgba(255,255,255,.06)',borderBottom:'1px solid rgba(255,255,255,.06)',padding:'11px 0',overflow:'hidden',position:'relative',zIndex:1}}>
        <div className="tick">
          {[...Array(2)].map((_,i)=>(
            <div key={i} style={{display:'flex',gap:56,paddingRight:56}}>
              {['Bosch MED17','EDC17','SIMOS18','Bosch ME7','Siemens PPD1.2','EDC16','Denso SH7059','Marelli MJ8','Delphi DCM3.5','SID305','EDC15','MED9'].map(e=>(
                <span key={e} style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.3)',letterSpacing:'.6px',textTransform:'uppercase'}}>
                  <span style={{color:'#00aec8',marginRight:10}}>◆</span>{e}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ──────────────────────────────────── */}
      <section id="features" style={{position:'relative',zIndex:1,maxWidth:1280,margin:'0 auto',padding:'80px max(24px,calc(50% - 640px)) 60px'}}>
        <div style={{textAlign:'center',marginBottom:64}}>
          <div style={{fontSize:11,fontWeight:700,color:'#00aec8',letterSpacing:'2.5px',textTransform:'uppercase',marginBottom:12}}>What's included</div>
          <h2 style={{fontSize:'clamp(30px,3.8vw,50px)',fontWeight:800,letterSpacing:'-1.5px',lineHeight:1.05,color:'#0a0a0a'}}>Built for professional tuners</h2>
          <p style={{fontSize:16,color:'rgba(0,0,0,.58)',marginTop:14,maxWidth:480,margin:'14px auto 0',lineHeight:1.65}}>Everything you need to build, manage and deliver professional remaps.</p>
        </div>

        {/* Row 1: big card + list card */}
        <div className="feat-2col">

          {/* Remap Builder */}
          <div className="gc" style={{padding:'44px'}}>
            <div style={{width:50,height:50,borderRadius:14,background:'rgba(0,174,200,.12)',border:'1px solid rgba(0,174,200,.22)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,marginBottom:20}}>⚡</div>
            <h3 style={{fontSize:24,fontWeight:800,letterSpacing:'-.6px',marginBottom:12,color:'#fff'}}>Remap Builder</h3>
            <p style={{fontSize:15,color:'rgba(255,255,255,.52)',lineHeight:1.72,marginBottom:22,maxWidth:440}}>
              Upload any ECU binary, drop in your A2L or DRT definition file, select your stage with add-ons — Pop &amp; Bang, DPF Off, EGR Delete, Launch Control — and export with checksum corrected automatically.
            </p>
            <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
              {['A2L / ASAP2','ECM Titanium DRT','MED17','EDC17','SIMOS18','ME7','DPF Off','Pop & Bang'].map(t=>(
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          </div>

          {/* Feature list */}
          <div className="gc" style={{padding:0}}>
            {[
              {icon:'📚',title:'39k+ File Library',     sub:'PRO',  desc:'Original + tuned BIN pairs. Smart Match finds the closest calibration in seconds.'},
              {icon:'🔍',title:'VIN Decoder',            sub:null,   desc:'Full vehicle spec from any VIN — make, model, engine, ECU type.'},
              {icon:'📄',title:'16k DRT Drivers',        sub:null,   desc:'Every ECM Titanium .drt driver parsed — exact map addresses and axis scaling.'},
              {icon:'📐',title:'A2L / ASAP2 Support',    sub:null,   desc:'OEM A2L files from Bosch, Continental and Siemens — precise map addresses.'},
              {icon:'🔌',title:'Device Library',         sub:null,   desc:'PCMFlash, KT200, KESS3, K-TAG — compatibility ratings for every tool.'},
            ].map(f=>(
              <div key={f.title} className="fr">
                <div style={{width:42,height:42,borderRadius:11,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.09)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{f.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontSize:14.5,fontWeight:700,color:'#fff'}}>{f.title}</span>
                    {f.sub&&<span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(0,174,200,.12)',color:'#00aec8',border:'1px solid rgba(0,174,200,.22)',letterSpacing:'.5px'}}>{f.sub}</span>}
                  </div>
                  <p style={{fontSize:13,color:'rgba(255,255,255,.44)',lineHeight:1.55}}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <div className="gc stats-4" style={{padding:'28px 36px',textAlign:'center',gap:0}}>
          {[
            {n:`${Math.round(counts.files/1000)}k+`,l:'Tuning files in library'},
            {n:`${Math.round(counts.drt/1000)}k+`,  l:'ECM Titanium DRT drivers'},
            {n:'4,400+',l:'A2L / ASAP2 definitions'},
            {n:'20+',   l:'ECU families supported'},
          ].map((s,i)=>(
            <div key={s.l} style={{position:'relative',padding:'8px 24px',borderLeft:i>0?'1px solid rgba(255,255,255,.08)':'none'}}>
              <div style={{fontSize:34,fontWeight:800,color:'#00aec8',lineHeight:1,letterSpacing:'-1.2px'}}>{s.n}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:7,fontWeight:500}}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────── */}
      <section id="pricing" style={{position:'relative',zIndex:1,maxWidth:1100,margin:'0 auto',padding:'60px max(24px,calc(50% - 550px)) 80px'}}>
        <div style={{textAlign:'center',marginBottom:52}}>
          <div style={{fontSize:11,fontWeight:700,color:'#00aec8',letterSpacing:'2.5px',textTransform:'uppercase',marginBottom:12}}>Pricing</div>
          <h2 style={{fontSize:'clamp(28px,3.5vw,48px)',fontWeight:800,letterSpacing:'-1.5px',lineHeight:1.05,color:'#0a0a0a',marginBottom:28}}>Simple, transparent pricing</h2>

          {/* Billing toggle */}
          <div style={{display:'inline-flex',alignItems:'center',gap:0,borderRadius:100,background:'#161619',padding:4,boxShadow:'0 4px 16px rgba(0,0,0,.18)'}}>
            <div onClick={()=>setYearly(false)} style={{padding:'10px 24px',borderRadius:100,fontSize:14,fontWeight:700,cursor:'pointer',transition:'all .2s',background:!yearly?'#fff':'transparent',color:!yearly?'#0a0a0a':'rgba(255,255,255,.4)',boxShadow:!yearly?'0 2px 10px rgba(0,0,0,.2)':'none',userSelect:'none'}}>Monthly</div>
            <div onClick={()=>setYearly(true)} style={{padding:'10px 24px',borderRadius:100,fontSize:14,fontWeight:700,cursor:'pointer',transition:'all .2s',background:yearly?'#fff':'transparent',color:yearly?'#0a0a0a':'rgba(255,255,255,.4)',boxShadow:yearly?'0 2px 10px rgba(0,0,0,.2)':'none',userSelect:'none',display:'flex',alignItems:'center',gap:8}}>
              Yearly
              <span style={{fontSize:10,fontWeight:800,padding:'2px 9px',borderRadius:20,background:yearly?'#00aec8':'rgba(255,255,255,.1)',color:yearly?'#fff':'rgba(255,255,255,.35)',letterSpacing:'.3px',transition:'all .2s'}}>-20%</span>
            </div>
          </div>
        </div>

        <div className="price-3col">
          {[
            {name:'Starter',mo:49,yr:39,hot:false,
             features:['Remap Builder (A2L + DRT)','VIN Decoder','Device Library','5 remaps / month','Email support'],
             cta:'Get Started →',
             btn:{background:'rgba(255,255,255,.07)',color:'rgba(255,255,255,.8)',border:'1px solid rgba(255,255,255,.18)'},
            },
            {name:'Pro',mo:99,yr:79,hot:true,
             features:['Everything in Starter','Unlimited remaps','80,000+ file library','50,000 DRT definitions','Smart Match engine','Priority support'],
             cta:'Try For Free →',
             btn:{background:'linear-gradient(135deg,#00cce0,#008fab)',color:'#000',border:'none',boxShadow:'0 4px 20px rgba(0,174,200,.45)',animation:'glowBtn 3s ease infinite'},
            },
            {name:'Agency',mo:199,yr:159,hot:false,
             features:['Everything in Pro','5 team seats','White-label option','API access','Dedicated account manager'],
             cta:'Get Started →',
             btn:{background:'rgba(255,255,255,.07)',color:'rgba(255,255,255,.8)',border:'1px solid rgba(255,255,255,.18)'},
            },
          ].map(plan=>(
            <div key={plan.name} className={`pc${plan.hot?' star':''}`} style={{padding:'30px 26px 26px',marginTop:plan.hot?0:14}}>

              {plan.hot&&(
                <div style={{textAlign:'center',marginBottom:18}}>
                  <span style={{display:'inline-block',padding:'5px 18px',borderRadius:20,background:'linear-gradient(135deg,#00cce0,#008fab)',fontSize:10,fontWeight:700,color:'#000',letterSpacing:'.5px',textTransform:'uppercase',boxShadow:'0 4px 16px rgba(0,174,200,.45)'}}>⭐ Most Popular</span>
                </div>
              )}

              <div style={{fontSize:11,fontWeight:700,color:plan.hot?'#00aec8':'rgba(255,255,255,.4)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10}}>{plan.name}</div>

              <div style={{display:'flex',alignItems:'flex-end',gap:3,marginBottom:yearly?4:22}}>
                <span style={{fontSize:20,fontWeight:700,color:'rgba(255,255,255,.38)',marginBottom:7}}>€</span>
                <span style={{fontSize:56,fontWeight:800,letterSpacing:'-2.5px',lineHeight:1,color:'#fff'}}>{yearly?plan.yr:plan.mo}</span>
                <span style={{fontSize:14,color:'rgba(255,255,255,.3)',marginBottom:9,fontWeight:500}}>/mo</span>
              </div>
              {yearly&&<div style={{fontSize:12.5,color:'rgba(255,255,255,.28)',marginBottom:22,fontWeight:500}}>Billed €{(yearly?plan.yr:plan.mo)*12} per year</div>}

              <div style={{height:1,background:'rgba(255,255,255,.1)',margin:'0 0 20px'}}/>

              <div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:26,flex:1}}>
                {plan.features.map(f=>(
                  <div key={f} style={{display:'flex',alignItems:'flex-start',gap:10,fontSize:14,color:'rgba(255,255,255,.7)',fontWeight:500}}>
                    <span style={{color:plan.hot?'#00aec8':'rgba(255,255,255,.38)',fontWeight:700,flexShrink:0,marginTop:1}}>✓</span>{f}
                  </div>
                ))}
              </div>

              <button className="pb" onClick={onSignUp} style={plan.btn as React.CSSProperties}>{plan.cta}</button>
            </div>
          ))}
        </div>

        <p style={{textAlign:'center',marginTop:26,fontSize:13,color:'rgba(0,0,0,.45)',fontWeight:500}}>
          Limited time free trial · No credit card required · Cancel anytime
        </p>
      </section>

      </>}{/* end home — docs page below */}

      {/* ── DOCS PAGE ─────────────────────────────────── */}
      {activePage === 'docs' && (
      <section style={{position:'relative',zIndex:1,maxWidth:1100,margin:'0 auto',padding:'40px max(24px,calc(50% - 550px)) 80px'}}>

        {/* Back button */}
        <button
          onClick={() => { setActivePage('home'); window.scrollTo({ top: 0 }) }}
          style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',color:'rgba(0,0,0,.45)',fontSize:13,fontWeight:600,fontFamily:'inherit',marginBottom:32,padding:0,transition:'color .15s'}}
          onMouseEnter={e=>(e.currentTarget.style.color='#000')}
          onMouseLeave={e=>(e.currentTarget.style.color='rgba(0,0,0,.45)')}
        >← Back to Home</button>

        <div style={{textAlign:'center',marginBottom:52}}>
          <div style={{fontSize:11,fontWeight:700,color:'#00aec8',letterSpacing:'2.5px',textTransform:'uppercase',marginBottom:12}}>Documentation</div>
          <h2 style={{fontSize:'clamp(28px,3.5vw,48px)',fontWeight:800,letterSpacing:'-1.5px',lineHeight:1.05,color:'#0a0a0a',marginBottom:16}}>Get up and running fast</h2>
          <p style={{fontSize:16,color:'rgba(0,0,0,.5)',maxWidth:520,margin:'0 auto',lineHeight:1.7,fontWeight:500}}>Everything you need to install, connect your device and start remapping in minutes.</p>
        </div>

        {/* Quick start steps */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:20,marginBottom:48}}>
          {[
            { step:'01', title:'Download & Install', desc:'Download the DCTuning Desktop installer. Run as Administrator — it sets up everything automatically including the app, database and J2534 helper.' },
            { step:'02', title:'Install Device Driver', desc:'Open Driver Setup in the sidebar. Click Install next to your device (KessV2, Scanmatik/PCMTuner, KT200 Plus). One click — driver is bundled.' },
            { step:'03', title:'Connect Your Device', desc:'Plug in your J2534 adapter or OBD2 interface. The app auto-detects it via the J2534 PassThru scanner. No manual config needed.' },
            { step:'04', title:'Start Remapping', desc:'Open Tune Manager to browse 21,000+ files or use Remap Builder to build a custom map from scratch using DRT definitions.' },
          ].map(s=>(
            <div key={s.step} className="gc" style={{padding:'24px 22px'}}>
              <div style={{fontSize:11,fontWeight:800,color:'#00aec8',letterSpacing:'2px',marginBottom:10}}>{s.step}</div>
              <div style={{fontSize:15,fontWeight:700,color:'#fff',marginBottom:8}}>{s.title}</div>
              <div style={{fontSize:13,color:'rgba(255,255,255,.45)',lineHeight:1.65,fontWeight:500}}>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Two column: Supported devices + Quick reference */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>

          {/* Supported devices */}
          <div className="gc" style={{padding:'28px 26px'}}>
            <div style={{fontSize:12,fontWeight:700,color:'#00aec8',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:18}}>Supported Devices</div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {[
                { name:'KessV2 (genuine + clone)', type:'Files only', color:'rgba(255,255,255,.35)' },
                { name:'Scanmatik SM2 Pro / SM3 Pro', type:'J2534 direct', color:'#00aec8' },
                { name:'PCMTuner (clone)', type:'J2534 direct', color:'#00aec8' },
                { name:'KT200 Plus / KTflash', type:'J2534 direct', color:'#00aec8' },
                { name:'KT200 / KT200 II', type:'Files only', color:'rgba(255,255,255,.35)' },
                { name:'ELM327 (WiFi/BT/USB)', type:'Diagnostics only', color:'rgba(255,200,80,.7)' },
                { name:'Any J2534 PassThru device', type:'J2534 direct', color:'#00aec8' },
              ].map(d=>(
                <div key={d.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{fontSize:13,color:'rgba(255,255,255,.7)',fontWeight:500}}>{d.name}</span>
                  <span style={{fontSize:11,fontWeight:700,color:d.color,whiteSpace:'nowrap',marginLeft:8}}>{d.type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick reference */}
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {[
              { q:'What is J2534 direct?', a:'Your device connects directly to the DCTuning app via the J2534 PassThru standard. Enables live OBD2 diagnostics (DTC, live PIDs, voltage) inside the app without any extra software.' },
              { q:'What is files only?', a:'Use the manufacturer\'s own software to read the ECU binary from the car. Upload the .bin file into DCTuning Tune Manager for editing and remapping, then write back with the original tool.' },
              { q:'Driver Setup not finding my device?', a:'Unplug and re-plug your device after installing the driver. If it still shows Unknown, try a different USB port. Some clone devices need the exact driver version — use the bundled installer in Driver Setup.' },
              { q:'Which remap type should I choose?', a:'Stage 1 — OBD tune only, no hardware mods. Stage 2 — requires intake/exhaust/intercooler upgrades. DPF/EGR Off — emissions hardware removed. Check vehicle specs before ordering.' },
            ].map(item=>(
              <div key={item.q} className="gc" style={{padding:'18px 20px'}}>
                <div style={{fontSize:13,fontWeight:700,color:'#fff',marginBottom:6}}>{item.q}</div>
                <div style={{fontSize:12.5,color:'rgba(255,255,255,.42)',lineHeight:1.65,fontWeight:500}}>{item.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* System requirements */}
        <div className="gc" style={{padding:'24px 26px',marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:'#00aec8',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:16}}>System Requirements</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:16}}>
            {[
              { label:'OS', value:'Windows 10 / 11 (64-bit)' },
              { label:'RAM', value:'4 GB minimum, 8 GB recommended' },
              { label:'Disk', value:'2 GB free space' },
              { label:'Permissions', value:'Administrator required' },
              { label:'Internet', value:'Required for library & updates' },
              { label:'.NET / VC++', value:'Bundled in installer' },
            ].map(r=>(
              <div key={r.label} style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.28)',textTransform:'uppercase',letterSpacing:'1px'}}>{r.label}</span>
                <span style={{fontSize:13,color:'rgba(255,255,255,.65)',fontWeight:500}}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── FEATURE GUIDE ── */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:'rgba(0,0,0,.35)',letterSpacing:'2px',textTransform:'uppercase',marginBottom:20,marginTop:48}}>Feature Guide</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:16}}>
            {[
              {
                icon:'📁', title:'Tune Manager',
                body:'Browse, search and download from 21,000+ professionally tuned ECU files. Filter by make, model, fuel type, ECU family and remap type (Stage 1/2/3, DPF Off, EGR Off). Use Smart Match to instantly find files that match your connected vehicle. Download any file directly to your machine for writing back to the ECU.'
              },
              {
                icon:'🔧', title:'Remap Builder',
                body:'Build custom ECU maps from scratch using DRT (map definition) files and A2L calibration data. Load a base binary, select maps from the definition list (fuelling, boost, ignition, torque limiters etc.), adjust values in the built-in map editor with colour heat mapping, then export the modified binary ready to flash.'
              },
              {
                icon:'📡', title:'J2534 PassThru',
                body:'The app auto-detects any registered J2534 PassThru adapter (Scanmatik, PCMTuner, KT200 Plus, ELM327 and more). Read and clear DTCs, monitor live PIDs (RPM, boost, coolant temp, lambda, fuelling), check battery voltage and run a full OBD2 diagnostic without leaving the app.'
              },
              {
                icon:'⚡', title:'ECU Flash',
                body:'Read and write ECU binaries directly via your J2534 adapter over OBD2. Supports full read, full write and checksum correction for compatible ECU families. Use this alongside Tune Manager or Remap Builder — read the original, edit the map, write back the modified file.'
              },
              {
                icon:'♻️', title:'ECU Cloning',
                body:'Clone an ECU binary from a donor unit to a replacement module. Useful when replacing a faulty ECU with a second-hand unit — clone the original data across to retain vehicle-specific calibration, IMMO data and odometer. Requires bench access to both ECUs.'
              },
              {
                icon:'🚫', title:'Emissions Delete',
                body:'DPF Off — removes the diesel particulate filter regen cycles and warning lights from the ECU map. Requires the DPF to be physically removed or gutted first. EGR Off — disables exhaust gas recirculation in the map. Requires the EGR valve to be blanked or removed. Both are for off-road/track use only.'
              },
              {
                icon:'🔍', title:'ECU Scanner',
                body:'Full OBD2 diagnostic scanner. Read all fault codes across engine, gearbox, ABS, airbag and body modules. Live data stream for all PIDs the ECU broadcasts. Freeze frame data. Clear codes after repair. Supports ISO 15765 (CAN), ISO 14230 (KWP2000), ISO 9141 and J1850 protocols.'
              },
              {
                icon:'🔌', title:'VIN Decoder',
                body:'Decode any 17-digit VIN to get full vehicle spec — make, model, year, engine code, gearbox type, factory options and ECU family. Useful for identifying the correct remap file before ordering or confirming ECU type before bench work.'
              },
              {
                icon:'🗺️', title:'Wiring Diagrams',
                body:'Access OBD2 pinout and ECU connector diagrams for common vehicles. Useful for bench flashing setup — find the correct power, ground, CAN H/L and K-Line pins without hunting through factory manuals.'
              },
              {
                icon:'🏎️', title:'Performance',
                body:'Log and compare performance data before and after a remap. Track 0–100 km/h, 0–60 mph, quarter mile times and rolling road style torque/power curves using live OBD2 data. Give customers visual proof of the gains.'
              },
              {
                icon:'🔓', title:'ECU Unlock',
                body:'Check and manage ECU protection status. Identify TPROT (Tricore protection), boot mode availability and read protection flags for supported ECU families before attempting a flash. Prevents bricking a protected ECU by warning you upfront.'
              },
              {
                icon:'🛠️', title:'Driver Setup',
                body:'One-click driver installation for supported devices. KessV2 USB driver and Scanmatik v2.21.22 (covers PCMTuner clones and KT200 Plus) are bundled directly in the app installer. No hunting for drivers online — plug in, click Install, done.'
              },
            ].map(f=>(
              <div key={f.title} className="gc" style={{padding:'22px 22px'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                  <span style={{fontSize:20}}>{f.icon}</span>
                  <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>{f.title}</span>
                </div>
                <div style={{fontSize:13,color:'rgba(255,255,255,.42)',lineHeight:1.7,fontWeight:500}}>{f.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── A2L & DRT EXPLAINED ── */}
        <div style={{marginTop:48,marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:'rgba(0,0,0,.35)',letterSpacing:'2px',textTransform:'uppercase',marginBottom:20}}>Map Formats Explained</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            <div className="gc" style={{padding:'26px 24px'}}>
              <div style={{fontSize:13,fontWeight:800,color:'#00aec8',marginBottom:4,letterSpacing:'.3px'}}>A2L — ASAP2 Calibration Description</div>
              <div style={{fontSize:11,color:'rgba(255,255,255,.25)',fontWeight:600,marginBottom:14,letterSpacing:'.5px'}}>AUTOSAR STANDARD FORMAT</div>
              <div style={{fontSize:13,color:'rgba(255,255,255,.5)',lineHeight:1.75,fontWeight:500}}>
                A2L is the industry-standard format used by OEM calibration engineers to describe ECU maps. It defines every measurement and calibration object inside an ECU binary — map names, memory addresses, axis descriptions, units, data types and scaling factors.
                <br/><br/>
                In DCTuning Remap Builder, A2L files are used to locate maps precisely inside the binary. When you load an A2L alongside a binary, the app knows exactly where the boost map starts, how many rows and columns it has, and what unit each cell is in (mg/stroke, bar, °C etc.).
                <br/><br/>
                <span style={{color:'rgba(255,255,255,.3)'}}>Supported ECUs: Bosch EDC17, MED17, MD1/MG1, Continental SIMOS, Delphi DCM6/DCM7 and more.</span>
              </div>
            </div>
            <div className="gc" style={{padding:'26px 24px'}}>
              <div style={{fontSize:13,fontWeight:800,color:'#00aec8',marginBottom:4,letterSpacing:'.3px'}}>DRT — ECM Titanium Map Definitions</div>
              <div style={{fontSize:11,color:'rgba(255,255,255,.25)',fontWeight:600,marginBottom:14,letterSpacing:'.5px'}}>16,000+ DEFINITIONS IN DATABASE</div>
              <div style={{fontSize:13,color:'rgba(255,255,255,.5)',lineHeight:1.75,fontWeight:500}}>
                DRT files are the map definition format used by ECM Titanium. Each DRT contains the byte offset, row/column count, data type and scaling for every map in a specific ECU variant. DCTuning has parsed 16,000+ DRT files into its database, covering virtually every common European ECU.
                <br/><br/>
                In the Remap Builder, DRT definitions load automatically when you open a binary — the app matches the file to the correct DRT by ECU signature and immediately shows all available maps: fuelling, boost, ignition timing, torque limiters, rev limiters, speed limiters and more.
                <br/><br/>
                <span style={{color:'rgba(255,255,255,.3)'}}>No ECM Titanium software required — DCTuning reads DRT files natively with its own built-in parser.</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── FILE SERVICE WORKFLOW ── */}
        <div style={{marginTop:48,marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:'rgba(0,0,0,.35)',letterSpacing:'2px',textTransform:'uppercase',marginBottom:20}}>File Service Workflow</div>
          <div className="gc" style={{padding:'28px 26px'}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:0}}>
              {[
                { n:'1', t:'Read the ECU', d:'Use your tool (KessV2, KT200, Scanmatik etc.) to read the original ECU binary from the car. Save the file.' },
                { n:'2', t:'Submit the File', d:'Upload the .bin via the File Service page. Select vehicle details, remap type (Stage 1/2/3, DPF Off etc.) and any notes.' },
                { n:'3', t:'We Process It', d:'A tuner reviews and modifies the file. Turnaround is typically same-day. You get a notification when ready.' },
                { n:'4', t:'Download & Write', d:'Download the modified file. Write it back to the ECU using your tool. Supported formats: .bin, .hex, .kp (KessV2).' },
              ].map((s,i,arr)=>(
                <div key={s.n} style={{display:'flex',alignItems:'flex-start',gap:16,padding:'0 24px 0 0',borderRight:i<arr.length-1?'1px solid rgba(255,255,255,.07)':'none',paddingLeft:i>0?24:0}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(0,174,200,.15)',border:'1px solid rgba(0,174,200,.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:13,fontWeight:800,color:'#00aec8'}}>{s.n}</div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:6}}>{s.t}</div>
                    <div style={{fontSize:13,color:'rgba(255,255,255,.4)',lineHeight:1.65,fontWeight:500}}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── WATCH FOLDER — TOOL INTEGRATION ── */}
        <div style={{marginTop:48,marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:'rgba(0,0,0,.35)',letterSpacing:'2px',textTransform:'uppercase',marginBottom:20}}>Watch Folder — Auto Import from Any Tool</div>
          <div className="gc" style={{padding:'26px 26px',marginBottom:20}}>
            <div style={{fontSize:13,color:'rgba(255,255,255,.5)',lineHeight:1.8,fontWeight:500,marginBottom:18}}>
              The <strong style={{color:'#00aec8'}}>Watch Folder</strong> feature in Tune Manager automatically picks up ECU binary files the moment your tuning tool saves them to disk — no manual browsing needed. It scans every 3 seconds and highlights files saved in the last minute as <span style={{color:'#00aec8',fontWeight:700}}>NEW</span>. Files can then be opened in the editor or written back to the ECU with one click.
            </div>
            <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.25)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>Supported file types</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:22}}>
              {['.bin','.hex','.ori','.sgo','.damos','.kp','.frf','.mot','.srec'].map(ext=>(
                <span key={ext} style={{fontFamily:'monospace',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.55)'}}>{ext}</span>
              ))}
            </div>
            <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.25)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>Default output folder paths by tool</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:0}}>
              {[
                { tool:'Autotuner Tool',          path:'C:\\Autotuner\\Files',                        notes:'Reads/backups saved here automatically' },
                { tool:'KESS3 / KSuite 3',         path:'C:\\MyFiles\\Kess3',                          notes:'Configurable in KSuite 3 settings' },
                { tool:'K-TAG / KSuite 2',         path:'C:\\MyFiles\\Ktag',                           notes:'Configurable in KSuite 2 settings' },
                { tool:'Flex (Magic Motorsport)',   path:'%AppData%\\MagicMM\\FlexSuite',               notes:'Usually inside AppData\\Roaming' },
                { tool:'CMDFlash',                 path:'C:\\CMDFlash\\Backup',                        notes:'Default backup location' },
                { tool:'BFlash',                   path:'C:\\BFlash\\Files',                           notes:'Set in BFlash preferences' },
                { tool:'PCMTuner / Scanmatik',     path:'C:\\PCMTuner\\Files',                         notes:'Via KTflash or PCMTuner software' },
                { tool:'KT200 / KT200 Plus',       path:'C:\\KT200\\USER',                             notes:'KTflash also saves here' },
                { tool:'Autoflasher',              path:'C:\\Autoflasher\\Files',                      notes:'Default save location' },
                { tool:'KessV2 (KESS v2)',         path:'C:\\MyFiles\\Kess',                           notes:'Files-only workflow — no live J2534' },
              ].map(({tool,path,notes},i,arr)=>(
                <div key={tool} style={{padding:'12px 16px',borderBottom:i<arr.length-1?'1px solid rgba(255,255,255,.05)':'none'}}>
                  <div style={{fontWeight:700,fontSize:13,color:'#fff',marginBottom:3}}>{tool}</div>
                  <div style={{fontFamily:'monospace',fontSize:11,color:'#00aec8',marginBottom:3}}>{path}</div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>{notes}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="gc" style={{padding:'20px 24px'}}>
            <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.25)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:14}}>How to set up Watch Folder</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:0}}>
              {[
                { n:'1', t:'Open Tune Manager', d:'Launch DCTuning Desktop and click Tune Manager in the left sidebar.' },
                { n:'2', t:'Go to Watch Tab', d:'Click the Watch Folder tab at the top of Tune Manager.' },
                { n:'3', t:'Set Folder', d:'Click Set Watch Folder and browse to your tool\'s output folder (see paths above). Click Select Folder.' },
                { n:'4', t:'Use Your Tool', d:'Read or save an ECU with your tuning tool. The file appears in Watch Folder automatically within 3 seconds. Click Open in Local to work with it.' },
              ].map((s,i,arr)=>(
                <div key={s.n} style={{display:'flex',alignItems:'flex-start',gap:14,padding:'0 20px 0 0',borderRight:i<arr.length-1?'1px solid rgba(255,255,255,.07)':'none',paddingLeft:i>0?20:0}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:'rgba(0,174,200,.15)',border:'1px solid rgba(0,174,200,.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:12,fontWeight:800,color:'#00aec8'}}>{s.n}</div>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:'#fff',marginBottom:5}}>{s.t}</div>
                    <div style={{fontSize:12,color:'rgba(255,255,255,.4)',lineHeight:1.65,fontWeight:500}}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── TROUBLESHOOTING ── */}
        <div style={{marginTop:48,marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:'rgba(0,0,0,.35)',letterSpacing:'2px',textTransform:'uppercase',marginBottom:20}}>Troubleshooting</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:14}}>
            {[
              { prob:'App won\'t launch / crashes on startup', fix:'Right-click the installer and select Run as Administrator. Windows requires admin rights for the J2534 helper and driver access. Check Windows Event Viewer if the crash persists.' },
              { prob:'Device shows as Unknown in Device Manager', fix:'Go to Driver Setup in the sidebar and click Install for your device. After installing, unplug and re-plug the device. If still unknown, try a different USB port or USB hub.' },
              { prob:'J2534 PassThru shows no devices found', fix:'Make sure your device driver is installed (Driver Setup page). Unplug and replug the device. The J2534 DLL must be registered in the Windows registry under PassThruSupport.04.04 — reinstalling the Scanmatik or PCMTuner driver usually fixes this.' },
              { prob:'Remap Builder shows no maps for my binary', fix:'The ECU may not have a DRT definition in the database yet. Try loading an A2L file manually if you have one. Contact support with the ECU type and we can add the definition.' },
              { prob:'.bin file won\'t import into Tune Manager', fix:'Check the file is at least 128KB. Files smaller than 128KB are pre-OBD ECUs and are not supported. Make sure the file extension is .bin, .hex or .ori. Rename if needed.' },
              { prob:'Live data / OBD scanner shows no PIDs', fix:'Confirm your J2534 device is connected and detected. Turn the ignition ON (engine running for full PID list). Some PIDs are only available with engine running. Try a different protocol in the scanner settings (CAN / KWP2000 / ISO9141).' },
              { prob:'KessV2 not detected after driver install', fix:'The KessV2 uses VID_0BF8. After installing the bundled driver, check Device Manager for the device. If it shows with a yellow exclamation, right-click → Update Driver → Use driver installed from app. Restart Windows if prompted.' },
              { prob:'PCMTuner clone not working after Scanmatik install', fix:'Make sure you have Scanmatik v2.21.22 installed (not v2.21.32). The PCMTuner clone uses the same VID_20A2&PID_0001 hardware as Scanmatik SM2. The bundled driver in this app is already v2.21.22 — uninstall any newer Scanmatik version first.' },
            ].map(t=>(
              <div key={t.prob} className="gc" style={{padding:'18px 20px'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:8}}>
                  <span style={{color:'#ef4444',fontWeight:800,fontSize:15,flexShrink:0,marginTop:1}}>!</span>
                  <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>{t.prob}</span>
                </div>
                <div style={{fontSize:12.5,color:'rgba(255,255,255,.4)',lineHeight:1.7,fontWeight:500,paddingLeft:24}}>{t.fix}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── GLOSSARY ── */}
        <div style={{marginTop:48}}>
          <div style={{fontSize:12,fontWeight:700,color:'rgba(0,0,0,.35)',letterSpacing:'2px',textTransform:'uppercase',marginBottom:20}}>Glossary</div>
          <div className="gc" style={{padding:'26px 26px'}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:0}}>
              {[
                { term:'ECU', def:'Engine Control Unit. The computer that controls fuelling, ignition, boost and other engine parameters. Remapping modifies the data tables (maps) inside the ECU.' },
                { term:'OBD2', def:'On-Board Diagnostics version 2. The standardised diagnostic port fitted to all cars since 1996. Used for reading fault codes, live data and flashing ECUs.' },
                { term:'J2534', def:'SAE standard that defines how a PC communicates with a vehicle ECU via a hardware interface. Any J2534-certified adapter works with any J2534-compatible software.' },
                { term:'DPF', def:'Diesel Particulate Filter. A filter in the exhaust that captures soot. DPF Off removes the regen cycles and warning lights from the ECU map after the DPF is physically removed.' },
                { term:'EGR', def:'Exhaust Gas Recirculation. Routes exhaust gases back into the intake to reduce NOx emissions. EGR Off disables this in the ECU map after the valve is blanked or removed.' },
                { term:'A2L', def:'ASAP2 file format (standardised by AUTOSAR). Describes every calibration and measurement object in an ECU binary — addresses, scaling, units, axis labels. Used by OEM calibration tools.' },
                { term:'DRT', def:'Map definition file format from ECM Titanium. Contains byte offsets, row/column counts and scaling for all maps in a specific ECU variant. DCTuning has 16,000+ DRT definitions built in.' },
                { term:'BDM', def:'Background Debug Mode. A hardware debug interface on older Motorola/Freescale ECUs (MPC5xx, SPC5xx). Requires a physical BDM probe soldered to the ECU board to read/write locked ECUs.' },
                { term:'Tricore / BSL', def:'Infineon Tricore is the processor family used in modern Bosch ECUs (EDC17, MED17, MD1/MG1). BSL (Boot System Loader) is a hardware boot mode that allows reading protected ECUs via bench connection.' },
                { term:'Stage 1', def:'OBD remap only — no hardware modifications required. Optimises fuelling, boost and ignition timing within the limits of the factory hardware. Typical gains: 15–30% power.' },
                { term:'Stage 2', def:'Remap that requires supporting hardware upgrades — usually a performance air intake, uprated intercooler and sports exhaust. Pushes beyond Stage 1 limits safely.' },
                { term:'Stage 3', def:'Full performance build — uprated turbo, injectors, fuelling system and engine internals. ECU map is built around the specific hardware fitted. Not a bolt-on tune.' },
                { term:'Smart Match', def:'DCTuning\'s AI-powered file matching engine. Reads your ECU signature and instantly finds the closest matching tuned file in the 21,000+ file library.' },
                { term:'PassThru', def:'Another name for J2534. A PassThru device acts as the bridge between the PC software and the vehicle CAN/K-Line bus. "PassThru support" in the Windows registry means the device is J2534 registered.' },
                { term:'VIN', def:'Vehicle Identification Number. A 17-character code unique to every vehicle. Encodes manufacturer, model, year, engine and production sequence. Used to verify vehicle spec before remapping.' },
              ].map((g,i,arr)=>(
                <div key={g.term} style={{padding:'14px 20px 14px 0',borderBottom:i<arr.length-1?'1px solid rgba(255,255,255,.05)':'none',display:'flex',gap:16}}>
                  <div style={{minWidth:110,fontSize:13,fontWeight:800,color:'#00aec8',flexShrink:0,paddingTop:1}}>{g.term}</div>
                  <div style={{fontSize:13,color:'rgba(255,255,255,.42)',lineHeight:1.65,fontWeight:500}}>{g.def}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </section>
      )}{/* end docs page */}

      {/* ── CTA SECTION ───────────────────────────────── */}
      {activePage === 'home' && <>
      <section style={{position:'relative',zIndex:1,maxWidth:1100,margin:'0 auto',padding:'0 max(24px,calc(50% - 550px)) 64px'}}>
        <div className="gc" style={{padding:'60px 28px',textAlign:'center'}}>
          <h2 style={{fontSize:'clamp(30px,4.2vw,58px)',fontWeight:800,letterSpacing:'-2px',lineHeight:.98,marginBottom:18,position:'relative',color:'#fff'}}>Ready to remap?</h2>
          <p style={{fontSize:17,color:'rgba(255,255,255,.48)',margin:'0 auto 38px',maxWidth:420,lineHeight:1.68,fontWeight:500,position:'relative'}}>
            Join professional tuners building better remaps, faster — no installs, no dongles, no hassle.
          </p>
          <button className="btn-cta" onClick={onSignUp} style={{padding:'15px 32px',borderRadius:13,fontSize:15,animation:'glowBtn 3s ease infinite',position:'relative',fontWeight:700,maxWidth:'100%'}}>
            Try For Free — No Card Required →
          </button>
        </div>
      </section>

      </>}{/* end home CTA */}

      {/* ── FOOTER ────────────────────────────────────── */}
      <footer className="site-footer" style={{borderTop:'1px solid rgba(0,0,0,.1)',padding:'22px max(24px,calc(50% - 660px))',display:'flex',justifyContent:'space-between',alignItems:'center',position:'relative',zIndex:1}}>
        <div style={{display:'flex',alignItems:'center',gap:9}}>
          <div style={{width:32,height:32,borderRadius:'50%',overflow:'hidden',border:'1.5px solid rgba(0,0,0,.12)',background:'#000',flexShrink:0}}>
            <img src="/logo.jpg" alt="DCTuning" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
          </div>
          <span style={{fontSize:13,color:'rgba(0,0,0,.4)',fontWeight:600}}>DCTuning Ireland</span>
        </div>
        <div style={{fontSize:11,color:'rgba(0,0,0,.25)',fontWeight:500}}>© 2026 DCTuning Ireland. All rights reserved.</div>
        <div style={{display:'flex',gap:24}}>
          {['Privacy','Terms','Support'].map(l=>(
            <a key={l} href="#" style={{fontSize:13,color:'rgba(0,0,0,.38)',textDecoration:'none',fontWeight:600,transition:'color .15s'}}
              onMouseEnter={e=>(e.currentTarget.style.color='#000')}
              onMouseLeave={e=>(e.currentTarget.style.color='rgba(0,0,0,.38)')}
            >{l}</a>
          ))}
        </div>
      </footer>
    </div>
  )
}
