"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

async function api(path, body) {
  const r = await fetch(path, body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Terjadi kesalahan.");
  return j;
}

export default function Admin() {
  const [view, setView] = useState("loading");
  const [needsCode, setNeedsCode] = useState(false);
  const [err, setErr] = useState("");

  async function refresh() {
    try {
      const s = await api("/api/admin/state");
      setNeedsCode(s.needsCode);
      setView(!s.setup ? "setup" : s.loggedIn ? "dash" : "login");
    } catch (e) {
      setErr(e.message);
      setView("error");
    }
  }
  useEffect(() => { refresh(); }, []);

  return (
    <main className={view === "dash" ? undefined : "wrap"}>
      {view === "loading" && <Loader />}
      {view === "error" && <div className="msg bad">{err}</div>}
      {(view === "setup" || view === "login") && (
        <Auth mode={view} needsCode={needsCode} onDone={refresh} />
      )}
      {view === "dash" && (
        <Dash onLogout={async () => { await api("/api/admin/auth", { action: "logout" }); refresh(); }} />
      )}
    </main>
  );
}

function Auth({ mode, needsCode, onDone }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = mode === "setup";

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api("/api/admin/auth", { action: mode, password, code }); await onDone(); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  }

  return (
    <div className="card authcard">
      <span className="logo"><Icon name="bot" size={22} /></span>
      <h1>{setup ? "Buat password admin" : "Masuk admin"}</h1>
      <p className="muted">{setup ? "Ini pertama kali halaman dibuka. Password disimpan dalam bentuk hash." : "Masukkan password untuk membuka panel admin bot."}</p>
      {err && <div className="msg bad">{err}</div>}
      <form onSubmit={submit}>
        {setup && needsCode && (
          <div className="field">
            <label htmlFor="code">Kode setup</label>
            <SecretInput id="code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="pw">Password</label>
          <SecretInput id="pw" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={setup ? "new-password" : "current-password"} autoFocus />
        </div>
        <Btn className="block" busy={busy}>{busy ? "Memproses…" : setup ? "Buat password" : "Masuk"}</Btn>
      </form>
    </div>
  );
}

const LOG_ST = { ok: "Dibalas", error: "Gagal", limited: "Kena batas" };

function fmtDur(sec) {
  if (sec < 90) return `${Math.max(1, Math.round(sec))} detik`;
  if (sec < 5400) return `${Math.round(sec / 60)} menit`;
  return `${Math.round(sec / 3600)} jam`;
}

function ago(ts) {
  if (!ts) return "belum pernah";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "baru saja";
  return fmtDur(s) + " lalu";
}

function fmtTime(ts) {
  return new Date(ts).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function keyLabel(k) {
  if (k.state === "rate") return `Kena batas, siap lagi ±${fmtDur(k.coolSec || 60)}`;
  if (k.state === "bad") return `Ditolak Google, dicoba lagi ±${fmtDur(k.coolSec || 3600)}`;
  return "Siap";
}


function Btn({ busy, children, className = "", disabled, ...rest }) {
  return (
    <button className={"btn " + className + (busy ? " loading" : "")} disabled={disabled || busy} {...rest}>
      {busy && <span className="spin" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

function Loader({ text = "Memuat…" }) {
  return (
    <div className="loader" role="status">
      <span className="spin big" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

const ICONS = {
  key: <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3m-4 4 3 3m-6-1 2 2" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  keys: <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  sliders: <><path d="M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  flask: <><path d="M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" /><path d="M7.5 15h9" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>,
  edit: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4m-2-1h4M9 14h.01M15 14h.01M2 14h2m16 0h2" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="M10.7 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.5-3.5L4 9m0-5v5h5" /><path d="M4 13a8 8 0 0 0 14.5 3.5L20 15m0 5v-5h-5" /></>,
  trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  photo: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5L8 20" /></>,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  play: <path d="M8 5l11 7-11 7z" />,
  back: <path d="M15 5l-7 7 7 7" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
};

function Icon({ name, size = 18 }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
  );
}


// Kolom rahasia (password, token, API key) dengan tombol ikon mata untuk tampil/sembunyikan.
function SecretInput({ id, value, onChange, placeholder, autoComplete = "off", autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input id={id} type={show ? "text" : "password"} value={value} onChange={onChange}
        placeholder={placeholder} autoComplete={autoComplete} autoFocus={autoFocus}
        spellCheck={false} autoCapitalize="off" autoCorrect="off" />
      <button type="button" className="eye" onClick={() => setShow((v) => !v)}
        aria-label={show ? "Sembunyikan" : "Tampilkan"} aria-pressed={show} title={show ? "Sembunyikan" : "Tampilkan"}>
        <Icon name={show ? "eyeoff" : "eye"} size={18} />
      </button>
    </div>
  );
}

/* ---------- Percakapan WhatsApp: daftar di kiri, isi di kanan ---------- */
function Convs({ note }) {
  const [chats, setChats] = useState(null);
  const [usage, setUsage] = useState(null);
  const [sel, setSel] = useState(null);
  const [conv, setConv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const endRef = useRef(null);

  async function loadList() {
    try { const r = await api("/api/admin/chats"); setChats(r.chats); setUsage(r.usage || null); } catch (e) { note(e.message, true); setChats([]); }
  }
  async function open(id) {
    setSel(id); setLoading(true);
    try { setConv(await api("/api/admin/chats?id=" + encodeURIComponent(id))); } catch (e) { note(e.message, true); }
    setLoading(false);
  }
  useEffect(() => { loadList(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [conv]);

  async function remove(id) {
    if (!confirm("Hapus percakapan ini dari admin? Riwayat yang dipakai AI tidak ikut terhapus.")) return;
    try { await api("/api/admin/chats", { action: "delete", id }); setSel(null); setConv(null); await loadList(); note("Percakapan dihapus."); }
    catch (e) { note(e.message, true); }
  }
  async function removeAll() {
    if (!confirm("Hapus semua percakapan yang tersimpan di admin?")) return;
    try { await api("/api/admin/chats", { action: "clear" }); setSel(null); setConv(null); await loadList(); note("Semua percakapan dihapus."); }
    catch (e) { note(e.message, true); }
  }

  if (!chats) return <Loader />;
  const shown = chats.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <section className="card">
      <h2>Percakapan WhatsApp</h2>
      <p className="muted lead">
        Semua chat dan balasan bot. Maks. 500 percakapan, 200 pesan tiap percakapan, hilang otomatis 30 hari setelah pesan terakhir.
      </p>
      {usage && (() => {
        const pct = Math.min(100, Math.round((usage.used / usage.free) * 100));
        const over = usage.used > usage.free;
        const [ry, rm, rd] = usage.reset.split("-").map(Number);
        const resetTxt = `${rd} ${["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"][rm - 1]} ${ry}`;
        return (
          <div className="usage" role="group" aria-label="Pemakaian pesan bulan ini">
            <div className="usagehead">
              <b>Pesan layanan bulan ini</b>
              <span className={over ? "bad" : ""}>{usage.used.toLocaleString("id-ID")} / {usage.free.toLocaleString("id-ID")}</span>
            </div>
            <div className="usagebar" role="progressbar" aria-valuemin={0} aria-valuemax={usage.free} aria-valuenow={Math.min(usage.used, usage.free)}>
              <span className={pct >= 90 ? "hot" : pct >= 70 ? "warm" : ""} style={{ width: pct + "%" }} />
            </div>
            <p className="muted small">
              {over
                ? `Jatah gratis habis, ${(usage.used - usage.free).toLocaleString("id-ID")} balasan terakhir ditagih Meta.`
                : `Sisa ${(usage.free - usage.used).toLocaleString("id-ID")} balasan gratis.`}{" "}
              Reset {resetTxt}. Hitungan dari balasan bot yang terkirim lewat server ini; angka resmi ada di WhatsApp Manager.
            </p>
          </div>
        );
      })()}
      <div className="toolbar">
        <button className="btn ghost" onClick={() => { loadList(); if (sel) open(sel); }}><Icon name="refresh" size={16} /><span>Segarkan</span></button>
        <button className="btn ghost danger" disabled={!chats.length} onClick={removeAll}><Icon name="trash" size={16} /><span>Hapus semua</span></button>
        <input className="convsearch" type="search" placeholder="Cari nama…" aria-label="Cari percakapan"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!chats.length ? <p className="muted">Belum ada percakapan.</p> : (
        <div className={"convs" + (sel ? " has-sel" : "")}>
          <ul className="plain convlist" aria-label="Daftar percakapan">
            {!shown.length && <li className="muted small">Tidak ada yang cocok.</li>}
            {shown.map((c) => (
              <li key={c.id}>
                <button className={"convitem" + (sel === c.id ? " active" : "")} onClick={() => open(c.id)}>
                  <b>{c.title}</b>
                  {c.title !== "+" + c.id && <span className="muted small">+{c.id}</span>}
                  <span className="muted small">{c.count} pesan · {ago(c.last)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="thread">
            {!sel ? <p className="muted">Pilih percakapan di sebelah kiri.</p> : (
              <>
                <div className="threadhead">
                  <button className="btn ghost back" onClick={() => { setSel(null); setConv(null); }}><Icon name="back" size={16} /><span>Kembali</span></button>
                  <b>{conv?.title || "…"}{conv && conv.title !== "+" + sel && <span className="muted small" style={{ display: "block", fontWeight: 400 }}>+{sel}</span>}</b>
                  <button className="btn ghost danger" onClick={() => remove(sel)}><Icon name="trash" size={16} /><span>Hapus</span></button>
                </div>
                <div className="msgs" role="log" aria-label="Isi percakapan">
                  {loading && !conv ? <Loader /> : conv?.messages?.length ? conv.messages.map((m, i) => (
                    <div key={m.t + "-" + i} className={"bubble " + m.r}>
                      <div className="small muted">{m.r === "bot" ? "Bot" : String(m.n || "").replace(/\s*\(\+\d+\)\s*$/, "")} · {fmtTime(m.t)}</div>
                      <div className="logtext">{m.x}</div>
                    </div>
                  )) : <p className="muted">Percakapan ini sudah kedaluwarsa.</p>}
                  <div ref={endRef} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Pertanyaan yang belum terjawab baik ---------- */
function Unans({ note }) {
  const [items, setItems] = useState(null);
  async function load() {
    try { setItems((await api("/api/admin/unans")).items); } catch (e) { note(e.message, true); setItems([]); }
  }
  useEffect(() => { load(); }, []);
  async function clearAll() {
    if (!confirm("Hapus semua daftar ini?")) return;
    try { await api("/api/admin/unans", { action: "clear" }); await load(); note("Daftar dihapus."); } catch (e) { note(e.message, true); }
  }
  if (!items) return <Loader />;
  return (
    <section className="card">
      <h2>Belum terjawab</h2>
      <p className="muted lead">
        Pertanyaan yang gagal dijawab AI atau dijawab "tidak tahu / akan dikonfirmasi tim". Tambahkan infonya ke prompt agar lain kali terjawab.
        Maks. 200, hilang otomatis 30 hari. Penandaan "AI ragu" hanya tebakan dari kata-kata jawabannya.
      </p>
      <div className="toolbar">
        <button className="btn ghost" onClick={load}><Icon name="refresh" size={16} /><span>Segarkan</span></button>
        <button className="btn ghost danger" disabled={!items.length} onClick={clearAll}><Icon name="trash" size={16} /><span>Hapus semua</span></button>
      </div>
      {!items.length ? <p className="muted">Belum ada.</p> : (
        <ul className="plain">
          {items.map((l, i) => (
            <li key={l.t + "-" + i} className="logitem">
              <div className="row small muted">
                <span>{fmtTime(l.t)}</span>
                <span>{l.name}</span>
                <span className="badge bad">{l.why === "error" ? "Error" : "AI ragu"}</span>
              </div>
              <div className="logtext"><b>Tanya:</b> {l.q}</div>
              <div className="logtext muted"><b>{l.why === "error" ? "Keterangan" : "Jawab"}:</b> {l.a}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Galeri foto & video: bot mengirimnya sebagai album saat pengunjung minta foto ---------- */
const MAX_PHOTO = 10 * 1024 * 1024;
const MAX_VIDEO = 20 * 1024 * 1024;
const fmtSize = (b) => (b / 1048576).toFixed(1).replace(".", ",") + " MB";

function albumSpans(n) {
  if (n <= 1) return [6];
  if (n === 2) return [3, 3];
  if (n === 3) return [6, 3, 3];
  if (n === 4) return [3, 3, 3, 3];
  if (n === 5) return [3, 3, 2, 2, 2];
  return Array(n).fill(2);
}

function Gallery({ note }) {
  const [list, setList] = useState(null);
  const [products, setProducts] = useState([]);
  const [max, setMax] = useState({ maxGalleries: 20, maxItems: 10 });
  const [blob, setBlob] = useState(true);
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [up, setUp] = useState(null); // { name, pct } selama mengunggah
  const [upMsg, setUpMsg] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api("/api/admin/gallery")
      .then((j) => {
        setList(j.galleries || []); setProducts(j.products || []); setBlob(!!j.blob);
        setMax({ maxGalleries: j.maxGalleries, maxItems: j.maxItems });
      })
      .catch((e) => { note(e.message, true); setList([]); });
  }, []);

  if (!list) return <Loader />;
  const g = list[sel];
  const nameOf = (id) => products.find((p) => p.id === id)?.name || id;
  const used = list.map((x) => x.id);
  const freeProduct = products.find((p) => !used.includes(p.id));

  const upd = (patch) => { setList(list.map((x, i) => (i === sel ? { ...x, ...patch } : x))); setDirty(true); };
  const setItems = (items) => upd({ items });
  const updItem = (i, patch) => setItems(g.items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const moveItem = (i, d) => {
    const a = [...g.items]; const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setItems(a);
  };

  function pickProduct(id) {
    const p = products.find((x) => x.id === id);
    upd({ id, name: p.name, keywords: p.keywords });
  }
  function addGallery() {
    if (!freeProduct) return;
    setList([...list, { id: freeProduct.id, name: freeProduct.name, keywords: freeProduct.keywords, caption: "", pageUrl: "", buttonLabel: "", items: [] }]);
    setSel(list.length); setDirty(true); setUpMsg(null);
  }
  function delGallery() {
    if (!confirm(`Hapus galeri ${nameOf(g.id)}?`)) return;
    setList(list.filter((_, i) => i !== sel));
    setSel(Math.max(0, sel - 1)); setDirty(true);
  }
  async function save() {
    setSaving(true);
    try {
      const r = await api("/api/admin/gallery", { galleries: list });
      setList(r.galleries); setDirty(false); setSel((v) => Math.min(v, Math.max(0, r.galleries.length - 1)));
      note("Galeri disimpan.");
    } catch (e) { note(e.message, true); }
    setSaving(false);
  }

  async function onFiles(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (!files.length || up) return;
    let items = [...g.items];
    let lastMsg = null;
    for (const f of files) {
      const video = f.type === "video/mp4";
      const photo = ["image/jpeg", "image/png", "image/webp"].includes(f.type);
      if (items.length >= max.maxItems) { lastMsg = { text: `Sudah ${max.maxItems} file, hapus salah satu dulu.`, bad: true }; break; }
      if (!video && !photo) { lastMsg = { text: `${f.name} ditolak: hanya JPG, PNG, WebP, atau MP4.`, bad: true }; continue; }
      if (f.size > (video ? MAX_VIDEO : MAX_PHOTO)) {
        lastMsg = { text: `${f.name} ditolak: ${fmtSize(f.size)}, batas ${video ? "video 20 MB" : "foto 10 MB"}. Kecilkan dulu atau pakai link.`, bad: true };
        continue;
      }
      setUp({ name: f.name, pct: 0 });
      try {
        const b = await upload(`galeri/${g.id}/${f.name}`, f, {
          access: "public",
          handleUploadUrl: "/api/admin/gallery/upload",
          onUploadProgress: (p) => setUp({ name: f.name, pct: Math.round(p.percentage || 0) }),
        });
        items = [...items, { type: video ? "video" : "photo", url: b.url, name: f.name, size: f.size }];
        lastMsg = { text: `${f.name} selesai diunggah.` };
      } catch (e) {
        lastMsg = { text: `${f.name} gagal diunggah: ${e.message}`, bad: true };
        break;
      }
    }
    setUp(null);
    if (items.length !== g.items.length) setList((cur) => cur.map((x, i) => (i === sel ? { ...x, items } : x)));
    if (items.length !== g.items.length) setDirty(true);
    setUpMsg(lastMsg);
  }

  const shown = (g?.items || []).filter((it) => it.url.trim());
  const spans = albumSpans(shown.length);
  const gname = g ? nameOf(g.id) : "";

  return (
    <section className="card">
      <div className="cardhead tight">
        <div className="cardtitle"><h2>Galeri foto dan video</h2></div>
        <Btn busy={saving} disabled={!dirty || saving || !!up} onClick={save}>{saving ? "Menyimpan…" : "Simpan galeri"}</Btn>
      </div>
      <p className="muted lead">
        Kalau pengunjung minta foto atau video sebuah produk, bot mengirim album dari galerinya, lalu tombol ke halaman galeri dan WhatsApp.
        Unggah file langsung (foto maksimal 10 MB, video MP4 maksimal 20 MB) atau tempel link https. Bot hanya memakai galeri yang punya minimal satu file.
      </p>

      <div className="galtabs">
        {list.map((x, i) => (
          <button key={x.id} type="button" className={"galtab" + (i === sel ? " on" : "")} onClick={() => { setSel(i); setUpMsg(null); }}>
            {nameOf(x.id)}
          </button>
        ))}
        {freeProduct && list.length < max.maxGalleries && (
          <button type="button" className="galtab add" onClick={addGallery}><Icon name="plus" size={14} />Tambah</button>
        )}
      </div>

      {!g ? (
        <p className="muted">Belum ada galeri. Tekan Tambah untuk membuat yang pertama, misalnya Hair Bulk.</p>
      ) : (
        <div className="galgrid">
          <div>
            <div className="field">
              <label htmlFor="gn">Produk</label>
              <select id="gn" value={g.id} onChange={(e) => pickProduct(e.target.value)} style={{ width: "100%" }}>
                {products.map((p) => (
                  <option key={p.id} value={p.id} disabled={used.includes(p.id) && p.id !== g.id}>
                    {p.name}{used.includes(p.id) && p.id !== g.id ? " (sudah ada galerinya)" : ""}
                  </option>
                ))}
              </select>
              <div className="muted small" style={{ marginTop: 4 }}>Kode untuk bot: {g.id} (otomatis)</div>
            </div>
            <div className="field">
              <label htmlFor="gk">Kata lain untuk produk ini</label>
              <input id="gk" value={g.keywords} maxLength={200} onChange={(e) => upd({ keywords: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="gc">Keterangan di bawah foto</label>
              <textarea id="gc" value={g.caption} maxLength={900} style={{ minHeight: 80 }}
                placeholder="Contoh hair bulk Super Double Drawn. Foto stok terbaru bisa diminta ke tim lewat WhatsApp."
                onChange={(e) => upd({ caption: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="gp">Link halaman galeri lengkap (opsional)</label>
              <input id="gp" value={g.pageUrl} maxLength={500} placeholder="https://shop.emahairshop.com/gallery/hair-bulk" onChange={(e) => upd({ pageUrl: e.target.value })} />
            </div>

            <div className="itemhead"><b>Foto dan video ({g.items.length}/{max.maxItems})</b></div>
            {g.items.map((it, i) => (
              <div key={i} className={"itemrow th" + (it.name ? " up" : "")}>
                <span className="itemthumb" aria-hidden="true">
                  {it.type === "video" ? (
                    <Icon name="play" size={18} />
                  ) : it.url ? (
                    <img src={it.url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  ) : null}
                </span>
                {it.name ? (
                  <div className="itemname">
                    <span className="muted">{it.type === "video" ? "Video" : "Foto"}</span> · {it.name}{it.size ? ` (${fmtSize(it.size)})` : ""}
                  </div>
                ) : (
                  <>
                    <select value={it.type} onChange={(e) => updItem(i, { type: e.target.value })} aria-label="Jenis">
                      <option value="photo">Foto</option>
                      <option value="video">Video</option>
                    </select>
                    <input value={it.url} placeholder="https://…" spellCheck={false} onChange={(e) => updItem(i, { url: e.target.value })} aria-label="Link file" />
                  </>
                )}
                <button type="button" className="iconbtn" aria-label="Naikkan" disabled={i === 0} onClick={() => moveItem(i, -1)}><Icon name="up" size={16} /></button>
                <button type="button" className="iconbtn" aria-label="Turunkan" disabled={i === g.items.length - 1} onClick={() => moveItem(i, 1)}><Icon name="down" size={16} /></button>
                <button type="button" className="iconbtn" aria-label="Hapus" onClick={() => setItems(g.items.filter((_, k) => k !== i))}><Icon name="trash" size={16} /></button>
              </div>
            ))}
            {!g.items.length && <p className="muted small">Belum ada file.</p>}

            {up && (
              <div className="upbar" role="status">
                <div className="muted small">Mengunggah {up.name}… {up.pct}%</div>
                <div className="upbar-track"><div className="upbar-fill" style={{ width: up.pct + "%" }} /></div>
              </div>
            )}
            {upMsg && <div className={"msg " + (upMsg.bad ? "bad" : "ok")} role="status" style={{ marginTop: 8 }}>{upMsg.text}</div>}
            {!blob && (
              <div className="muted small" style={{ marginTop: 8 }}>
                Unggah file belum aktif: hubungkan Vercel Blob di tab Storage project ini, lalu Redeploy. Tempel link tetap bisa dipakai.
              </div>
            )}

            <input ref={fileRef} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,video/mp4" onChange={onFiles} />
            <div className="row" style={{ marginTop: 8 }}>
              <Btn disabled={!blob || !!up || g.items.length >= max.maxItems} onClick={() => fileRef.current?.click()}>
                <Icon name="plus" size={16} />Unggah file
              </Btn>
              <Btn className="ghost" disabled={!!up || g.items.length >= max.maxItems} onClick={() => setItems([...g.items, { type: "photo", url: "" }])}>
                <Icon name="plus" size={16} />Tempel link
              </Btn>
              <Btn className="ghost" disabled={!!up} onClick={delGallery}><Icon name="trash" size={16} />Hapus galeri</Btn>
            </div>
          </div>

          <div>
            <div className="muted small" style={{ marginBottom: 8 }}>Pratinjau di WhatsApp</div>
            <div className="tgprev">
              <div className="tgq">Ada fotonya {gname}?</div>
              <div className="tgbub">
                {shown.length ? (
                  <div className="tgalbum">
                    {shown.map((it, i) => (
                      <div key={i} className="tgtile" style={{ gridColumn: `span ${spans[i]}`, aspectRatio: spans[i] === 6 ? "16/9" : "1/1" }}>
                        {it.type === "video" ? (
                          <span className="tgvid"><Icon name="play" size={22} /></span>
                        ) : (
                          <img src={it.url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted small" style={{ padding: 12 }}>Tambahkan foto atau video untuk melihat pratinjau.</div>
                )}
                {g.caption && <p className="tgcap">{g.caption}</p>}
              </div>
              <div className="tgbtns">
                {g.pageUrl && <div><Icon name="photo" size={15} />Galeri {gname}</div>}
                <div className="wa">Tanya via WhatsApp</div>
              </div>
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>
              Foto dimuat langsung dari linknya. Kotak kosong berarti link belum bisa dibuka. Video ditampilkan sebagai ikon putar.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

const MENU = [
  { group: "Chat", items: [
    { id: "convs", label: "Percakapan", icon: "chat" },
  ] },
  { group: "Konten", items: [
    { id: "gallery", label: "Galeri foto & video", icon: "photo" },
  ] },
  { group: "Bot", items: [
    { id: "token", label: "Akun WhatsApp", icon: "key" },
    { id: "webhook", label: "Webhook", icon: "link" },
  ] },
  { group: "AI", items: [
    { id: "keys", label: "Kunci API Gemini", icon: "keys" },
    { id: "ai", label: "Perilaku AI", icon: "sliders" },
    { id: "test", label: "Tes balasan", icon: "flask" },
  ] },
  { group: "Pengguna", items: [
    { id: "welcome", label: "Pesan sambutan", icon: "chat" },
    { id: "limit", label: "Batas pesan", icon: "clock" },
    { id: "logs", label: "Log pesan", icon: "list" },
    { id: "unans", label: "Belum terjawab", icon: "list" },
  ] },
];
const ALL = MENU.flatMap((g) => g.items);

function Dash({ onLogout }) {
  const [cfg, setCfg] = useState(null);
  const [keys, setKeys] = useState(null);
  const [wh, setWh] = useState(null);
  const [token, setToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [reply, setReply] = useState("");
  const [ai, setAi] = useState({ model: "", systemPrompt: "", promptOn: true, fallbackText: "", historyLimit: 10 });
  const [lim, setLim] = useState({ limitCount: 20, limitMinutes: 60, limitText: "" });
  const [logs, setLogs] = useState(null);
  const [newKey, setNewKey] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [editToken, setEditToken] = useState(false);
  const [editSlot, setEditSlot] = useState(null);
  const [editName, setEditName] = useState("");
  const [testMsg, setTestMsg] = useState("Halo, kamu siapa?");
  const [testOut, setTestOut] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null); // id aksi yang sedang berjalan
  const [page, setPage] = useState("convs");
  const [navOpen, setNavOpen] = useState(false);
  const note = (text, bad) => setMsg({ text, bad });

  // ingat halaman terakhir lewat hash URL (#keys, #logs, ...)
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (ALL.some((m) => m.id === h)) setPage(h);
  }, []);
  function go(id) {
    setPage(id); setNavOpen(false); setMsg(null);
    history.replaceState(null, "", "#" + id);
    window.scrollTo({ top: 0 });
  }

  // pesan sukses hilang sendiri setelah beberapa detik
  useEffect(() => {
    if (!msg || msg.bad) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  async function load() {
    const c = await api("/api/admin/settings");
    setCfg(c); setReply(c.replyText); setPhoneId(c.phoneId || ""); setWabaId(c.wabaId || "");
    setAi({ model: c.model, systemPrompt: c.systemPrompt, promptOn: c.promptOn, fallbackText: c.fallbackText, historyLimit: c.historyLimit });
    setLim({ limitCount: c.limitCount, limitMinutes: c.limitMinutes, limitText: c.limitText });
    setKeys(await api("/api/admin/keys"));
    setLogs((await api("/api/admin/logs").catch(() => ({ logs: [] }))).logs);
    if (c.hasToken && c.phoneId) setWh(await api("/api/admin/webhook", { action: "status" }).catch(() => null));
    else setWh(null);
  }
  useEffect(() => { load().catch((e) => note(e.message, true)); }, []);

  // Jalankan aksi dengan animasi loading di tombol yang ditekan (id).
  async function run(id, fn, okText) {
    if (busy) return;
    setMsg(null); setBusy(id);
    try { await fn(); await load(); note(okText); } catch (e) { note(e.message, true); }
    setBusy(null);
  }

  async function runTest() {
    if (busy) return;
    setBusy("test"); setTestOut(null);
    try {
      const r = await api("/api/admin/test", { message: testMsg });
      setTestOut({ text: r.text });
    } catch (e) {
      setTestOut({ text: e.message, bad: true });
    }
    setBusy(null);
    api("/api/admin/keys").then(setKeys).catch(() => {});
  }

  const cur = ALL.find((m) => m.id === page) || ALL[0];
  const anyBusy = !!busy;

  const body = (() => {
    if (!cfg || !keys) return <Loader />;
    switch (page) {
      case "token": return (
        <section className="card">
          <div className="cardhead tight">
            <div className="cardtitle">
              <h2>Akun WhatsApp</h2>
              {cfg.hasToken && <span className="badge ok">Terhubung</span>}
            </div>
            {cfg.hasToken && !editToken && (
              <Btn className="ghost" disabled={anyBusy} onClick={() => setEditToken(true)}>
                <Icon name="edit" size={16} />Edit
              </Btn>
            )}
          </div>
          {cfg.hasToken ? (
            <dl className="kv">
              <dt>Nomor</dt><dd>{cfg.username || "-"}{cfg.verifiedName ? ` (${cfg.verifiedName})` : ""}</dd>
              <dt>Access token</dt><dd><code>{cfg.tokenMasked}</code></dd>
              <dt>Phone Number ID</dt><dd><code>{cfg.phoneId}</code></dd>
              <dt>WABA ID</dt><dd><code>{cfg.wabaId}</code></dd>
              <dt>App Secret</dt><dd>{cfg.hasAppSecret ? <span className="badge ok">Tersimpan</span> : <span className="badge bad">Belum diisi</span>}</dd>
            </dl>
          ) : (
            <p className="muted">Belum ada akun. Ambil data dari Meta Developer (WhatsApp &gt; API Setup) lalu isi di sini. Token hanya ditempel di halaman ini, jangan dikirim lewat chat.</p>
          )}
          {cfg.hasToken && !editToken && cfg.hasAppSecret ? null : (
            <>
              <div className="field">
                <label htmlFor="tk">{cfg.hasToken ? "Ganti access token (kosongkan kalau tidak diganti)" : "Access token"}</label>
                <SecretInput id="tk" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAA…" autoFocus={editToken} />
              </div>
              <div className="field">
                <label htmlFor="pid">Phone Number ID</label>
                <input id="pid" value={phoneId} inputMode="numeric" spellCheck={false} onChange={(e) => setPhoneId(e.target.value)} placeholder="1314012881806173" />
              </div>
              <div className="field">
                <label htmlFor="wid">WhatsApp Business Account ID</label>
                <input id="wid" value={wabaId} inputMode="numeric" spellCheck={false} onChange={(e) => setWabaId(e.target.value)} placeholder="1134785518927479" />
              </div>
              <div className="field">
                <label htmlFor="as">App Secret {cfg.hasAppSecret && "(kosongkan kalau tidak diganti)"}</label>
                <SecretInput id="as" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="32 karakter dari App settings > Basic" />
                <p className="muted small">Dipakai untuk memastikan webhook benar-benar dari Meta. Tanpa ini bot menolak semua pesan masuk.</p>
              </div>
              <div className="row">
                <Btn busy={busy === "token"} disabled={anyBusy || (!cfg.hasToken && !token.trim()) || (!appSecret.trim() && !token.trim() && phoneId === (cfg.phoneId || "") && wabaId === (cfg.wabaId || ""))}
                  onClick={() => run("token", async () => { await api("/api/admin/settings", { token, phoneId, wabaId, appSecret }); setToken(""); setAppSecret(""); setEditToken(false); }, "Akun WhatsApp disimpan.")}>
                  {busy === "token" ? "Memeriksa…" : "Simpan"}
                </Btn>
                {cfg.hasToken && (
                  <Btn className="ghost" disabled={anyBusy} onClick={() => { setEditToken(false); setToken(""); setAppSecret(""); setPhoneId(cfg.phoneId || ""); setWabaId(cfg.wabaId || ""); }}>Batal</Btn>
                )}
              </div>
            </>
          )}
        </section>
      );

      case "webhook": return (
        <section className="card">
          <div className="cardhead tight">
            <div className="cardtitle">
              <h2>Webhook</h2>
              {cfg.hasToken && wh && (wh.active ? <span className="badge ok">Terdaftar</span> : <span className="badge bad">Belum terdaftar</span>)}
            </div>
            {cfg.hasToken && (
              <Btn className="ghost" busy={busy === "wh-ref"} disabled={anyBusy} onClick={() => run("wh-ref", async () => {}, "Status disegarkan.")}>
                {busy === "wh-ref" ? "Memuat…" : "Segarkan status"}
              </Btn>
            )}
          </div>
          {!cfg.hasToken ? <p className="muted">Simpan akun WhatsApp dulu di menu Akun WhatsApp.</p> : (
            <>
              {wh && (
                <dl className="kv">
                  <dt>Callback URL</dt><dd><code>{wh.url}</code></dd>
                  <dt>Verify token</dt><dd><code>{wh.verifyToken}</code></dd>
                  {wh.error && (<><dt>Error dari Meta</dt><dd>{wh.error}</dd></>)}
                </dl>
              )}
              <ol className="muted lead">
                <li>Buka admin lewat domain utama (bukan alamat sementara xxx.vercel.app), supaya Callback URL di atas benar.</li>
                <li>Di Meta Developer: WhatsApp &gt; Configuration &gt; Webhook, klik Edit, tempel Callback URL dan Verify token di atas, lalu Verify and save.</li>
                <li>Di bagian Webhook fields, klik Subscribe pada <b>messages</b>.</li>
                <li>Kembali ke sini, klik Daftarkan app ke akun WhatsApp.</li>
              </ol>
              <div className="row">
                <Btn busy={busy === "wh-set"} disabled={anyBusy} onClick={() => run("wh-set", () => api("/api/admin/webhook", { action: "set" }), "App terdaftar ke akun WhatsApp.")}>
                  {busy === "wh-set" ? "Mendaftarkan…" : "Daftarkan app ke akun WhatsApp"}
                </Btn>
                <Btn className="ghost danger" busy={busy === "wh-del"} disabled={anyBusy} onClick={() => run("wh-del", () => api("/api/admin/webhook", { action: "delete" }), "Pendaftaran dilepas.")}>
                  {busy === "wh-del" ? "Melepas…" : "Lepas pendaftaran"}
                </Btn>
              </div>
            </>
          )}
        </section>
      );

      case "keys": {
        const hasBad = keys.keys.some((k) => k.state);
        const resetBtn = hasBad && (
          <Btn className="ghost" busy={busy === "key-reset"} disabled={anyBusy}
            onClick={() => run("key-reset", () => api("/api/admin/keys", { action: "reset" }), "Status key direset.")}>
            {busy === "key-reset" ? "Mereset…" : "Reset status key"}
          </Btn>
        );
        return (
          <section className="card">
            <h2>Kunci API Gemini</h2>
            <p className="muted lead">
              Maksimal {keys.max} key. Bot memakai key bergantian, dan kalau satu key kena batas atau ditolak, otomatis pindah ke key berikutnya.
              Batas pemakaian dihitung per proyek Google, jadi buat tiap key di proyek yang berbeda di Google AI Studio supaya kuotanya terpisah.
            </p>
            {keys.keys.length === 0 ? (
              <p className="muted">Belum ada key.</p>
            ) : (
              <ul className="plain keylist">
                {keys.keys.map((k) => (
                  <li key={k.slot} className="keyitem">
                    {editSlot === k.slot ? (
                      <div className="row">
                        <input aria-label="Nama key" style={{ flex: 1, minWidth: 160 }} value={editName} maxLength={40} autoFocus
                          placeholder={"Key #" + k.slot} onChange={(e) => setEditName(e.target.value)} />
                        <Btn busy={busy === "ren-" + k.slot} disabled={anyBusy}
                          onClick={() => run("ren-" + k.slot, async () => { await api("/api/admin/keys", { action: "rename", slot: k.slot, name: editName }); setEditSlot(null); }, "Nama key disimpan.")}>
                          {busy === "ren-" + k.slot ? "Menyimpan…" : "Simpan"}
                        </Btn>
                        <Btn className="ghost" disabled={anyBusy} onClick={() => setEditSlot(null)}>Batal</Btn>
                      </div>
                    ) : (
                      <div className="keyrow">
                        <div className="keyinfo">
                          <b>{k.name || "Key #" + k.slot}</b>
                          <code>{k.mask}</code>
                          <span className={"badge " + (k.state ? "bad" : "ok")}>{keyLabel(k)}</span>
                        </div>
                        <div className="row">
                          <Btn className="ghost" disabled={anyBusy} onClick={() => { setEditSlot(k.slot); setEditName(k.name || ""); }}>
                            <Icon name="edit" size={16} />Edit
                          </Btn>
                          <Btn className="ghost danger" busy={busy === "del-" + k.slot} disabled={anyBusy}
                            onClick={() => run("del-" + k.slot, () => api("/api/admin/keys", { action: "remove", slot: k.slot }), "Key dihapus.")}>
                            {busy === "del-" + k.slot ? "Menghapus…" : "Hapus"}
                          </Btn>
                        </div>
                      </div>
                    )}
                    <p className="muted small">
                      Berhasil {k.ok} · Gagal {k.fail} · Hari ini {k.today} permintaan (WIB) · Terakhir dipakai {ago(k.last)}
                    </p>
                    {k.err && <p className="muted small">Error terakhir ({ago(k.errAt)}): {k.err}</p>}
                  </li>
                ))}
              </ul>
            )}
            {keys.keys.length < keys.max && (
              <>
                <div className="field">
                  <label htmlFor="gn">Nama key (opsional)</label>
                  <input id="gn" value={newKeyName} maxLength={40} onChange={(e) => setNewKeyName(e.target.value)} autoComplete="off" placeholder="Misal: Proyek utama" />
                </div>
                <div className="field">
                  <label htmlFor="gk">API key</label>
                  <SecretInput id="gk" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="AIza…" />
                </div>
                <div className="row">
                  <Btn busy={busy === "key-add"} disabled={!newKey.trim() || anyBusy}
                    onClick={() => run("key-add", async () => { await api("/api/admin/keys", { action: "add", key: newKey, name: newKeyName }); setNewKey(""); setNewKeyName(""); }, "Key ditambahkan.")}>
                    {busy === "key-add" ? "Menambahkan…" : "Tambah key"}
                  </Btn>
                  {resetBtn}
                </div>
              </>
            )}
            {keys.keys.length >= keys.max && resetBtn}
          </section>
        );
      }

      case "ai": {
        const dirty = ai.systemPrompt !== cfg.systemPrompt || ai.promptOn !== cfg.promptOn;
        const isDefault = cfg.systemPrompt === cfg.defaultPrompt;
        return (
          <>
            <section className="card">
              <div className="cardhead">
                <h2>Otak asisten</h2>
                <span className={"pill " + (cfg.promptOn ? "ok" : "off")}>{cfg.promptOn ? "Aktif" : "Mati"}</span>
              </div>
              <p className="muted lead">
                Instruksi tetap untuk AI: peran, info bisnis, gaya bahasa, dan batasan topik. Teks ini dikirim ke Gemini di setiap balasan.
              </p>
              <label className="check">
                <input type="checkbox" checked={ai.promptOn} onChange={(e) => setAi({ ...ai, promptOn: e.target.checked })} />
                <span>Pakai otak ini (kalau mati, bot memakai instruksi bawaan)</span>
              </label>
              <div className="field">
                <label htmlFor="sp">
                  Teks otak · {dirty ? "belum disimpan" : "tersimpan"} · {ai.systemPrompt.length} / {cfg.promptMax} karakter
                </label>
                <textarea id="sp" className="brain" value={ai.systemPrompt} maxLength={cfg.promptMax}
                  onChange={(e) => setAi({ ...ai, systemPrompt: e.target.value })} spellCheck={false} />
              </div>
              <div className="row">
                <Btn busy={busy === "brain"} disabled={!dirty || anyBusy}
                  onClick={() => run("brain", () => api("/api/admin/settings", { systemPrompt: ai.systemPrompt, promptOn: ai.promptOn }), "Otak asisten disimpan.")}>
                  {busy === "brain" ? "Menyimpan…" : "Simpan"}
                </Btn>
                <Btn className="ghost" busy={busy === "undo"} disabled={!cfg.hasPrev || anyBusy}
                  onClick={() => run("undo", () => api("/api/admin/settings", { promptAction: "undo" }), "Perubahan terakhir dibatalkan.")}>
                  {busy === "undo" ? "Membatalkan…" : "Batalkan perubahan terakhir"}
                </Btn>
                <Btn className="ghost" busy={busy === "reset"} disabled={isDefault || anyBusy}
                  onClick={() => { if (confirm("Kembalikan teks otak ke bawaan? Teks sekarang masih bisa dikembalikan lewat Batalkan perubahan terakhir.")) run("reset", () => api("/api/admin/settings", { promptAction: "reset" }), "Otak dikembalikan ke bawaan."); }}>
                  {busy === "reset" ? "Mengembalikan…" : "Kembalikan ke bawaan"}
                </Btn>
              </div>
            </section>

            <section className="card">
              <h2>Model dan balasan</h2>
              <div className="field">
                <label htmlFor="md">Model Gemini</label>
                <input id="md" list="models" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} autoComplete="off" />
                <datalist id="models">
                  <option value="gemini-3.5-flash-lite" />
                </datalist>
                <p className="muted hint">Kalau tes bilang model tidak ditemukan, cek nama model terbaru di ai.google.dev.</p>
              </div>
              <div className="field">
                <label htmlFor="hl">Riwayat chat (jumlah tanya-jawab yang diingat, 0 sampai 20)</label>
                <input id="hl" type="number" min={0} max={20} value={ai.historyLimit}
                  onChange={(e) => setAi({ ...ai, historyLimit: e.target.value })} />
                <p className="muted hint">Pengguna bisa menghapus riwayatnya sendiri dengan mengetik /reset. Riwayat hilang otomatis setelah 7 hari tanpa percakapan.</p>
              </div>
              <div className="field">
                <label htmlFor="fb">Pesan cadangan</label>
                <textarea id="fb" style={{ minHeight: 70 }} value={ai.fallbackText} onChange={(e) => setAi({ ...ai, fallbackText: e.target.value })} maxLength={500} />
                <p className="muted hint">Dikirim ke pengguna kalau Gemini gagal menjawab (semua key kena batas, error, atau tidak ada key).</p>
              </div>
              <Btn busy={busy === "ai"} disabled={anyBusy}
                onClick={() => run("ai", () => api("/api/admin/settings", {
                  model: ai.model, fallbackText: ai.fallbackText, historyLimit: Number(ai.historyLimit),
                }), "Pengaturan AI disimpan.")}>
                {busy === "ai" ? "Menyimpan…" : "Simpan pengaturan AI"}
              </Btn>
            </section>
          </>
        );
      }

      case "limit": return (
        <section className="card">
          <h2>Batas pesan per pengguna</h2>
          <p className="muted lead">
            Membatasi berapa pesan yang boleh dikirim satu pengguna dalam rentang waktu tertentu, supaya kuota key tidak habis oleh satu orang.
            Perintah /start dan /reset tidak dihitung. Isi 0 pada jumlah pesan untuk mematikan batas.
          </p>
          <div className="grid2">
            <div className="field">
              <label htmlFor="lc">Jumlah pesan</label>
              <input id="lc" type="number" min={0} max={1000} value={lim.limitCount}
                onChange={(e) => setLim({ ...lim, limitCount: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="lm">Per berapa menit</label>
              <input id="lm" type="number" min={1} max={1440} value={lim.limitMinutes}
                onChange={(e) => setLim({ ...lim, limitMinutes: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="lt">Pesan saat batas tercapai</label>
            <textarea id="lt" style={{ minHeight: 70 }} value={lim.limitText} maxLength={500}
              onChange={(e) => setLim({ ...lim, limitText: e.target.value })} />
            <p className="muted hint"><code>{"{sisa}"}</code> diganti sisa waktu tunggu dalam menit. Pesan ini dikirim sekali per rentang waktu, pesan berikutnya dari orang yang sama diabaikan tanpa balasan.</p>
          </div>
          <Btn busy={busy === "limit"} disabled={anyBusy}
            onClick={() => run("limit", () => api("/api/admin/settings", {
              limitCount: Number(lim.limitCount), limitMinutes: Number(lim.limitMinutes), limitText: lim.limitText,
            }), "Batas pesan disimpan.")}>
            {busy === "limit" ? "Menyimpan…" : "Simpan batas pesan"}
          </Btn>
        </section>
      );

      case "convs": return <Convs note={note} />;
      case "gallery": return <Gallery note={note} />;
      case "unans": return <Unans note={note} />;

      case "logs": return (
        <section className="card">
          <h2>Log pesan</h2>
          <p className="muted lead">
            50 pesan terakhir (maksimal 200 tersimpan, tiap pesan dipotong 300 karakter, hilang otomatis 30 hari setelah pesan terakhir).
            Log berisi isi percakapan pengguna, jadi hapus kalau tidak diperlukan.
          </p>
          <div className="toolbar">
            <Btn className="ghost" busy={busy === "log-ref"} disabled={anyBusy} onClick={() => run("log-ref", async () => {}, "Log disegarkan.")}>
              {busy === "log-ref" ? "Memuat…" : "Segarkan"}
            </Btn>
            <Btn className="ghost danger" busy={busy === "log-clear"} disabled={!logs?.length || anyBusy}
              onClick={() => { if (confirm("Hapus semua log pesan?")) run("log-clear", () => api("/api/admin/logs", { action: "clear" }), "Log dihapus."); }}>
              {busy === "log-clear" ? "Menghapus…" : "Hapus semua log"}
            </Btn>
          </div>
          {!logs?.length ? <p className="muted">Belum ada pesan.</p> : (
            <ul className="plain">
              {logs.map((l, i) => (
                <li key={l.t + "-" + i} className="logitem">
                  <div className="row small muted">
                    <span>{fmtTime(l.t)}</span>
                    <span>{l.name}</span>
                    <span className={"badge " + (l.st === "ok" ? "ok" : "bad")}>{LOG_ST[l.st] || l.st}</span>
                    {l.slot && <span>key #{l.slot}</span>}
                    {l.ms != null && <span>{(l.ms / 1000).toFixed(1)} dtk</span>}
                  </div>
                  <div className="logtext"><b>Tanya:</b> {l.q}</div>
                  <div className="logtext muted"><b>{l.st === "ok" ? "Jawab" : "Keterangan"}:</b> {l.a}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      );

      case "test": return (
        <section className="card">
          <h2>Tes balasan</h2>
          <p className="muted lead">Mencoba Gemini langsung dari sini, tanpa lewat WhatsApp. Tes tidak memakai riwayat chat.</p>
          <div className="field">
            <label htmlFor="tm">Pesan uji coba</label>
            <input id="tm" value={testMsg} onChange={(e) => setTestMsg(e.target.value)} maxLength={2000} />
          </div>
          <Btn busy={busy === "test"} disabled={!testMsg.trim() || anyBusy} onClick={runTest}>
            {busy === "test" ? "Menunggu jawaban…" : "Kirim tes"}
          </Btn>
          {testOut && (
            <div className={"msg testout " + (testOut.bad ? "bad" : "ok")}>{testOut.text}</div>
          )}
        </section>
      );

      case "welcome": return (
        <section className="card">
          <h2>Pesan sambutan (/start)</h2>
          <p className="muted">Dikirim saat pengguna menekan Start. <code>{"{nama}"}</code> diganti nama depan pengirim.</p>
          <div className="field">
            <label htmlFor="rp">Teks sambutan</label>
            <textarea id="rp" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} />
          </div>
          <Btn busy={busy === "welcome"} disabled={anyBusy} onClick={() => run("welcome", () => api("/api/admin/settings", { replyText: reply }), "Pesan sambutan disimpan.")}>
            {busy === "welcome" ? "Menyimpan…" : "Simpan sambutan"}
          </Btn>
        </section>
      );
      default: return null;
    }
  })();

  return (
    <div className="shell">
      {busy && <div className="progress" aria-hidden="true" />}
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <aside className={"side" + (navOpen ? " open" : "")}>
        <div className="brand">
          <span className="logo"><Icon name="bot" size={22} /></span>
          <div>
            <b>Admin bot</b>
            {cfg?.username && <div className="muted small">{cfg.username}</div>}
          </div>
        </div>
        <nav aria-label="Menu admin">
          {MENU.map((g) => (
            <div key={g.group} className="navgroup">
              <div className="navtitle">{g.group}</div>
              {g.items.map((m) => (
                <button key={m.id} className={"navitem" + (page === m.id ? " active" : "")}
                  aria-current={page === m.id ? "page" : undefined} onClick={() => go(m.id)}>
                  <Icon name={m.icon} />{m.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button className="navitem logout" onClick={onLogout}><Icon name="logout" />Keluar</button>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="burger" aria-label="Buka menu" onClick={() => setNavOpen(true)}>
            <span /><span /><span />
          </button>
          <h1>{cur.label}</h1>
        </header>
        {msg && <div className={"msg " + (msg.bad ? "bad" : "ok")} role="status">{msg.text}</div>}
        <div key={page} className="page">{body}</div>
      </div>
    </div>
  );
}
