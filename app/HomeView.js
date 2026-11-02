"use client";
import { useEffect, useRef, useState } from "react";
import { FL, LN, T } from "./lang";

const KEY = "lang";

const LOC = { id: "id-ID", en: "en-GB", it: "it-IT", es: "es-ES", fr: "fr-FR", ar: "ar-u-ca-gregory-nu-latn", de: "de-DE", ru: "ru-RU" };
// reset = "YYYY-MM-DD" (tanggal 1 bulan berikutnya) → "1 Desember" sesuai bahasa halaman.
function fmtReset(reset, lg) {
  try { return new Intl.DateTimeFormat(LOC[lg] || "id-ID", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(reset + "T00:00:00Z")); }
  catch { return ""; }
}

export default function HomeView({ link, full = false, reset = "" }) {
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
    <div className="wa-home">
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
          {link && (
            <span className={"online-status" + (full ? " offline" : "")}>
              <span className="dot" aria-hidden="true"></span>
              {full ? t.offline.replace("{date}", fmtReset(reset, lg)) : t.online}
            </span>
          )}
          <div className="row">
            {link && full ? (
              <span className="btn off" aria-disabled="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                {t.chat}
              </span>
            ) : link ? (
              <a className="btn" href={link} target="_blank" rel="noopener noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                {t.chat}
              </a>
            ) : (
              <span className="btn off">{t.off}</span>
            )}
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
    </div>
  );
}
