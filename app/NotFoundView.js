"use client";
import { useEffect, useRef, useState } from "react";
import { FL, LN, T } from "./lang";

const KEY = "lang";

export default function NotFoundView() {
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
    document.title = "EMAHAIRSHOP | " + t.n1;
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

      <main className="nf">
        <div className="nf-code" aria-hidden="true">404</div>
        <div className="nf-rule"></div>
        <h1>{t.n1}</h1>
        <p className="nf-sub">{t.n2}</p>
        <a className="nf-link" href="/">
          <span className="nf-ico">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>
          </span>
          <span className="nf-t">{t.n3}</span>
          <svg className="nf-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </a>
        <div className="nf-f">{t.ft2}</div>
      </main>
    </>
  );
}
