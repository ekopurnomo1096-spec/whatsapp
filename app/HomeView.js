"use client";
import { useEffect, useRef, useState } from "react";
import { FL, LN, T } from "./lang";

const KEY = "lang";

export default function HomeView({ link }) {
  const [lg, setLg] = useState("id");
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const t = T[lg];

  // Bahasa awal: pilihan tersimpan (sama dengan portal), kalau belum ada ikut bahasa browser.
  useEffect(() => {
    let l = null;
    try { l = localStorage.getItem(KEY); } catch {}
    if (!l) l = (navigator.language || "id").slice(0, 2);
    if (T[l]) setLg(l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lg;
    document.documentElement.dir = lg === "ar" ? "rtl" : "ltr";
    document.title = t.title;
  }, [lg, t]);

  useEffect(() => {
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, []);

  function pick(l) {
    setLg(l);
    setOpen(false);
    try { localStorage.setItem(KEY, l); } catch {}
  }

  return (
    <>
      <header className="topnav">
        <a href="/" aria-label="EMAHAIRSHOP">
          <div className="logo-nav-container">
            <div className="logo-top"><span className="line-top"></span><span className="text-ext">EXTENSION</span></div>
            <div className="logo-main">EMAHAIRSHOP</div>
            <div className="line-bottom"></div>
            <div className="logo-year">2019</div>
          </div>
        </a>

        <div className="navr">
          <a className="web" href="https://emahairshop.com/" target="_blank" rel="noopener noreferrer" aria-label="emahairshop.com" title="emahairshop.com">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
          </a>
        <div className={`lw${open ? " o" : ""}`} ref={wrap}>
          <button
            className="lb" type="button" aria-label={t.lang} aria-haspopup="true" aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="fl" dangerouslySetInnerHTML={{ __html: FL[lg] }} />
            <span className="lc">{lg.toUpperCase()}</span>
            <svg className="c" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <div className="lm" role="menu">
            {Object.keys(LN).map((k) => (
              <button key={k} type="button" role="menuitem" className={k === lg ? "a" : ""} onClick={() => pick(k)} tabIndex={open ? 0 : -1}>
                <span className="fl" dangerouslySetInnerHTML={{ __html: FL[k] }} />
                {LN[k]}
              </button>
            ))}
          </div>
        </div>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <h1>{t.h1}</h1>
          <div className="row">
            {link ? (
              <a className="btn" href={link} target="_blank" rel="noopener noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                {t.chat}
              </a>
            ) : (
              <span className="btn off">{t.off}</span>
            )}
            <a className="btn ghost" href="https://shop.emahairshop.com/" target="_blank" rel="noopener noreferrer">{t.shop}</a>
          </div>
        </section>

        <section>
          <h2>{t.how}</h2>
          <ol className="steps">
            <li>{t.s1}</li>
            <li>{t.s2}</li>
            <li>{t.s3}</li>
          </ol>
        </section>

        <section className="feat">
          <div className="card"><h2>{t.f1t}</h2><p className="muted">{t.f1d}</p></div>
          <div className="card"><h2>{t.f2t}</h2><p className="muted">{t.f2d}</p></div>
          <div className="card"><h2>{t.f3t}</h2><p className="muted">{t.f3d}</p></div>
        </section>

      </main>

      <footer className="foot">
        <div className="foot-in">
          <p className="foot-tag">{t.ft1}</p>
          <p className="foot-copy">{t.ft2}</p>
        </div>
      </footer>
    </>
  );
}
