// ==UserScript==
// @name         CS Inbox Helper + Sapaan + Auto Reply (LiveChat & Text)
// @namespace    botmega-cs
// @version      2.4.0
// @description  Tandai chat belum dibalas (biru/merah), jumlah Waiting, urut chat transfer, tutup chat Archived. + (LiveChat) sapaan otomatis pagi/siang/sore/malam ke chat baru & chat transfer ("Transferred - by ..."). + Cek withdraw ke panel + auto balas #dc/#wal + tombol Cek WD di header chat (jalur Bridge / 1 Profil, semua di belakang layar). + Tombol Update tanpa refresh.
// @match        https://my.livechatinc.com/*
// @match        https://*.text.com/app/*
// @match        https://text.com/app/*
// @match        https://*/transaction*
// @match        http://127.0.0.1:8765/worker*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      gist.githubusercontent.com
// @connect      127.0.0.1
// @connect      *
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/stevenkwok07/cs-helper/main/cs-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/stevenkwok07/cs-helper/main/cs-helper.user.js
// ==/UserScript==

// =====================================================================
// CARA REVISI: edit file ini di GitHub, NAIKIN @version di atas (mis. 1.7.0 -> 1.7.1), commit.
// Semua komputer tinggal klik tombol Update (panel 🤖 / menu ikon slider daftar chat). Ga perlu refresh.
// =====================================================================

(function () {
  'use strict';
  // Link RAW file ini di GitHub (samain dengan @updateURL di atas)
  const UPDATE_URL = 'https://raw.githubusercontent.com/stevenkwok07/cs-helper/main/cs-helper.user.js';
  const CEK_MENIT = 10;        // cek diam-diam tiap X menit; kalau ada versi baru, tombol Update nyala ungu
  const AUTO_UPDATE = false;   // true = versi baru langsung dipasang sendiri tanpa klik (tetap tanpa refresh)

  // versi diambil dari @version di header (cukup ganti di satu tempat)
  const VERSION = (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) || '0';

  // #####################################################################
  // APP = seluruh isi script. Bisa dicopot (stop) & dipasang ulang versi baru tanpa refresh.
  // #####################################################################
  // 2.2.0: alamat panel UG buat jalur "Tanpa tab" bisa diisi manual (ga perlu buka halaman transaction)
  function askPanelUrl() {
    const cur = GM_getValue('wdPanelUrl', '');
    const v = window.prompt('Alamat panel UG (contoh: https://namapanel.com)\nCukup sekali per Chrome. Panel tetap harus login di Chrome ini.', cur);
    if (v == null) return cur;
    try {
      const o = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : 'https://' + v.trim()).origin;
      GM_setValue('wdPanelUrl', o);
      return o;
    } catch (e) { window.alert('Alamat tidak valid'); return cur; }
  }

  function APP(env) {
  const PW = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;   // window asli halaman
  // 2.0.0: 'ug' = panel UG (halaman transaction), cuma dipakai jalur WD "1 Profil"
  // 2.3.0: 'worker' = halaman kecil bridge.py (http://127.0.0.1:8765/worker) di profil panel UG
  const SITE = /(^|\.)text\.com$/i.test(location.hostname) ? 'text' : /(^|\.)livechatinc\.com$/i.test(location.hostname) ? 'lc'
    : (location.hostname === '127.0.0.1' && location.pathname.startsWith('/worker')) ? 'worker' : 'ug';

  // 1.7.0: semua yang dipasang script dicatat di sini, biar pas update bisa dicopot bersih (ga dobel)
  let stopped = false;
  const CLEAN = [];
  const onStop = (fn) => CLEAN.push(fn);
  const _tos = new Set(), _ivs = new Set();
  // timer versi script: otomatis mati kalau script dicopot
  const setTimeout = (f, ms, ...a) => {
    const id = window.setTimeout(() => { _tos.delete(id); if (!stopped) f(...a); }, ms);
    _tos.add(id);
    return id;
  };
  const setInterval = (f, ms, ...a) => {
    const id = window.setInterval(() => { if (!stopped) f(...a); }, ms);
    _ivs.add(id);
    return id;
  };
  const requestAnimationFrame = (f) => window.requestAnimationFrame((t) => { if (!stopped) f(t); });
  const on = (target, type, fn, opt) => { target.addEventListener(type, fn, opt); onStop(() => target.removeEventListener(type, fn, opt)); };
  // dijalankan PALING AKHIR waktu stop: buang semua elemen & tanda yang dibikin script
  onStop(() => {
    document.querySelectorAll('[data-csw-flex]').forEach((b) => { for (const c of b.children) c.style.removeProperty('order'); });
    document.querySelectorAll('#csw-ar-panel,#csw-ar-nav,#csw-bar,#csw-native,#csw-style,.csw-ar').forEach((e) => e.remove());
    for (const a of ['data-csw', 'data-csw-dot', 'data-csw-hide', 'data-csw-t', 'data-csw-row', 'data-csw-flex', 'data-csw-dark', 'data-csw-site'])
      document.querySelectorAll('[' + a + ']').forEach((e) => e.removeAttribute(a));
  });
  onStop(() => { _tos.forEach((id) => window.clearTimeout(id)); _ivs.forEach((id) => window.clearInterval(id)); });
  env.stop = () => {
    if (stopped) return;
    stopped = true;
    for (const f of CLEAN.reverse()) { try { f(); } catch (e) { console.error('[CS] stop:', e); } }
  };

  // 1.5.2: Alt+↑/↓ dipasang sedini mungkin (document-start) supaya jalan duluan sebelum shortcut LiveChat/Text
  let altNav = null;
  on(window, 'keydown', (e) => { if (altNav) altNav(e); }, true);

  // #####################################################################
  // BAGIAN A: SAPAAN OTOMATIS (hanya LiveChat)
  // Harus jalan di document-start supaya bisa numpang koneksi LiveChat.
  // #####################################################################
  function initSapaan() {
    const W = PW;

    // =========================================================
    // ISI BAGIAN INI SAJA
    // =========================================================
    // Member yang disapa (nama/email persis). Kosongkan [] = semua chat baru disapa.
    const MEMBERS = [
      // 'Jalil123',
      // 'Jujun90',
    ];

    // 1.6.0: sapaan diambil dari canned response (#shortcut) LiveChat. Shortcut per waktu diatur di panel 🤖.
    const TAG_AWAL = { pagi: 'pagi', siang: 'siang', sore: 'sore', malam: 'malam' };
    // Teks di bawah cuma CADANGAN, dipakai kalau #shortcut-nya tidak ketemu.
    const TEKS_AWAL = {
      pagi: `Hello bossku,
Selamat pagi, ada yang bisa kami bantu?

SAVE LINK ANTI BLOKIR:
https://webaman.com/mega288`,
      siang: `Hello bossku,
Selamat Siang bossku, ada yang bisa kami bantu?

SAVE LINK ANTI BLOKIR:
https://webaman.com/mega288`,
      sore: `Hello bossku,
Selamat sore bossku, ada yang bisa kami bantu?

SAVE LINK ANTI BLOKIR:
https://webaman.com/mega288`,
      malam: `Hello bossku,
Selamat malam, ada yang bisa kami bantu?

SAVE LINK ANTI BLOKIR:
https://webaman.com/mega288`
    };

    const AKTIF = true;
    const ONLY_MINE = true;        // true = cuma sapa chat yang masuk ke akun lo (aman kalau dipakai bareng partner)
    const DELAY_MIN = 0;           // 1.4.2: komputer UTAMA langsung kirim begitu chat masuk (detik)
    const DELAY_MAX = 0;
    const CADANGAN_SEC = 5;        // komputer CADANGAN nunggu segini (+acak 0-2 dtk), cek isi chat, baru kirim kalau belum disapa
    // Mode per komputer diatur di panel 🤖 (menu kiri) atau menu ikon slider daftar chat: Utama / Cadangan / Off.
    // 1 akun dipakai di 2 komputer -> SATU komputer Utama, sisanya Cadangan.
    const MAX_UMUR_CHAT = 120;     // chat yang mulai lebih lama dari ini (detik) dianggap chat lama, ga disapa
    const SWEEP_SEC = 15;          // cek ulang daftar chat tiap X detik (cadangan kalau notif kelewat)
    const SAPA_TRANSFER = true;    // true = chat yang ditransfer / di-assign ke lo di tengah jalan juga disapa 1x
    const DEBUG = true;
    // 1.4.3: tepat sebelum kirim, cek isi chat. Kalau agent yang ada di chat ini SUDAH BALAS apa pun
    // (sapaan dari komputer lain, atau lo ketik manual) -> sapaan ga dikirim.
    const ANTRI_SEC = 3;          // kalau 2 agent sama-sama di chat: agent ke-2 nunggu segini detik lebih lama, lalu cek lagi
    // =========================================================

    if (!AKTIF) return null;
    const log = (...a) => console.log('%c[Sapaan BG]', 'color:#2e7d4f;font-weight:bold', ...a);
    const dbg = (...a) => { if (DEBUG) log(...a); };
    const norm = s => String(s || '').trim().toLowerCase();
    const members = MEMBERS.map(norm).filter(Boolean);
    const rand = (a, b) => a + Math.random() * Math.max(0, b - a);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const TAB_ID = env.tabId;   // 1.7.0: ID tab tetap sama walau script di-update (tetap jadi tab pengirim)

    // 1.5.3: ANTI-DOBEL ANTAR TAB. Kalau LiveChat kebuka di >1 tab/jendela di browser ini, cuma SATU tab
    // ("tab pengirim") yang boleh kirim sapaan & auto reply. Tab pengirim lapor tiap 2 dtk; kalau tab itu
    // ditutup / koneksinya putus, sesudah ±6 dtk tab lain otomatis gantiin.
    const LEAD_KEY = 'sapaLeader', LEAD_TTL = 6000;
    function isLeader() {
      const l = GM_getValue(LEAD_KEY, null);
      return !!l && l.tab === TAB_ID && Date.now() - l.ts < LEAD_TTL;
    }
    function beat() {
      if (!sock || sock.readyState !== 1) return;          // cuma tab yang koneksinya hidup yang boleh jadi pengirim
      const l = GM_getValue(LEAD_KEY, null), now = Date.now();
      if (!l || l.tab === TAB_ID || now - l.ts > LEAD_TTL) {
        if (!l || l.tab !== TAB_ID) log('Tab ini jadi tab pengirim');
        GM_setValue(LEAD_KEY, { tab: TAB_ID, ts: now });
      }
    }
    setInterval(beat, 2000);
    // mode dibaca ulang tiap kali (diganti di 1 tab -> semua tab ikut)
    const curMode = () => GM_getValue('modeSapa', 'utama');
    // ID thread -> ID chat (daftar chat di LiveChat pakai ID thread)
    const thr2chat = new Map();

    // 1.5.1: teks & jam mulai tiap waktu bisa diubah dari panel (disimpan di browser ini)
    const SLOTS = ['pagi', 'siang', 'sore', 'malam'];
    const JAM_AWAL = { pagi: 2, siang: 12, sore: 15, malam: 19 };   // jam MULAI (WIB)
    const SET = (() => {
      const s = GM_getValue('sapaSet', {}) || {};
      return { teks: Object.assign({}, TEKS_AWAL, s.teks), jam: Object.assign({}, JAM_AWAL, s.jam), tag: Object.assign({}, TAG_AWAL, s.tag) };
    })();
    const normTag = t => String(t || '').trim().replace(/^#/, '').toLowerCase();

    // 1.6.0: CANNED RESPONSE. LiveChat sendiri mengambil daftar canned dari /v2/canned_responses waktu halaman dibuka;
    // jawabannya ikut dibaca di sini (tanpa request tambahan). Shortcut = tag canned (tanpa #).
    let canned = GM_getValue('cannedCache', {}) || {};   // tag -> teks
    function storeCanned(data) {
      const list = Array.isArray(data) ? data : (data && (data.canned_responses || data.items || data.result)) || [];
      if (!Array.isArray(list) || !list.length) return;
      const m = {};
      for (const c of list) {
        const text = String(c && c.text || '').trim();
        if (!text) continue;
        for (const t of (c.tags || [])) { const k = normTag(t); if (k && !m[k]) m[k] = text; }
      }
      if (!Object.keys(m).length) return;
      canned = m;
      GM_setValue('cannedCache', m);
      log(`Canned response kebaca: ${Object.keys(m).length} shortcut`);
    }
    const CANNED_RE = /\/v2\/canned_responses(\?|$)/;
    const origFetch = W.fetch;
    W.fetch = function (input) {
      const p = origFetch.apply(this, arguments);
      if (stopped) return p;
      try {
        const url = String((input && input.url) || input);
        if (CANNED_RE.test(url)) p.then(r => r.clone().json()).then(storeCanned).catch(() => {});
      } catch (e) {}
      return p;
    };
    const myFetch = W.fetch;
    onStop(() => { if (W.fetch === myFetch) W.fetch = origFetch; });
    const xo = W.XMLHttpRequest.prototype.open;
    W.XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (!stopped && CANNED_RE.test(String(url))) this.addEventListener('load', function () {
          try { storeCanned(JSON.parse(this.responseText)); } catch (e) {}
        });
      } catch (e) {}
      return xo.apply(this, arguments);
    };
    const myOpen = W.XMLHttpRequest.prototype.open;
    onStop(() => { if (W.XMLHttpRequest.prototype.open === myOpen) W.XMLHttpRequest.prototype.open = xo; });
    const cannedText = tag => canned[normTag(tag)] || '';
    const TEKS = SET.teks;
    const saveSet = () => GM_setValue('sapaSet', SET);

    // waktu = slot yang jam mulainya paling akhir <= jam sekarang (lewat tengah malam -> slot paling akhir)
    function slotNow() {
      const h = Number(new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta'
      }).format(new Date()));
      const urut = SLOTS.slice().sort((a, b) => SET.jam[a] - SET.jam[b]);
      let cur = urut[urut.length - 1];
      for (const k of urut) if (SET.jam[k] <= h) cur = k;
      return cur;
    }

    // lo beneran anggota aktif chat ini? (agent yang udah keluar/ditransfer bisa masih kecatat dengan present:false)
    const aktifDiChat = users => !!myId && users.some(u => u.id === myId && u.present !== false);

    // =================== KONEKSI (numpang WebSocket LiveChat) ===================
    let sock = null;
    let myId = GM_getValue('myId', null);
    let mode = GM_getValue('modeSapa', 'utama');   // 1.4.2: utama | cadangan | off (disimpan per komputer)
    let reqN = 0;
    const pend = new Map();

    const proto = W.WebSocket.prototype;
    const origSend = proto.send;
    proto.send = function (d) {
      try {
        if (!stopped && this !== sock && /\/agent\/rtm\//.test(String(this.url))) attach(this);
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
    const mySend = proto.send;
    onStop(() => { if (proto.send === mySend) proto.send = origSend; });

    function attach(ws) {
      sock = ws;
      env.sock = ws;
      const onClose = () => { if (sock === ws) sock = null; log('Koneksi putus, nunggu LiveChat nyambung lagi'); };
      ws.addEventListener('message', onMsg);
      ws.addEventListener('close', onClose);
      onStop(() => { ws.removeEventListener('message', onMsg); ws.removeEventListener('close', onClose); });
      log('Terhubung ke koneksi LiveChat');
      setTimeout(beat, 300);
      setTimeout(sweep, 2000);
    }

    function rtm(action, payload, timeout = 15000) {
      return new Promise((res, rej) => {
        if (stopped || !sock || sock.readyState !== 1) return rej(new Error('koneksi belum siap'));
        const id = 'sapa_' + ++reqN + '_' + Date.now();
        pend.set(id, { res, rej });
        setTimeout(() => { if (pend.delete(id)) rej(new Error('timeout ' + action)); }, timeout);
        origSend.call(sock, JSON.stringify({ request_id: id, action, payload }));
      });
    }

    function onMsg(ev) {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.request_id && pend.has(m.request_id)) {
        const p = pend.get(m.request_id);
        pend.delete(m.request_id);
        if (m.success === false) p.rej(new Error(m.payload?.error?.message || 'error'));
        else p.res(m.payload || {});
        return;
      }
      if (m.action === 'login' && m.type === 'response' && m.payload?.my_profile?.id) {
        myId = m.payload.my_profile.id;
        GM_setValue('myId', myId);
        log('Akun agent kebaca:', myId, m.payload.my_profile.name || '');
      }
      if (m.type !== 'push') return;
      if (/incoming_chat|chat_transferred|user_added_to_chat|user_removed_from_chat|chat_deactivated/.test(m.action))
        dbg('notif:', m.action, JSON.stringify(m.payload || {}).slice(0, 300));

      // Chat baru masuk -> langsung sapa
      if (m.action === 'incoming_chat' && m.payload?.chat) {
        const c = m.payload.chat;
        const thread = c.thread || {};
        consider(c.id, thread.id, c.users || [], thread.active !== false, 'chat baru');
      }
      // Chat ditransfer / agent ditambahkan ke chat yang udah jalan
      if (m.action === 'user_added_to_chat') {
        const p = m.payload || {};
        if (p.user?.type === 'agent' && (!ONLY_MINE || p.user.id === myId)) onTransfer(p.chat_id, p.thread_id);
      }
      if (m.action === 'chat_transferred') {
        const p = m.payload || {};
        const to = p.transferred_to?.agent_ids || [];
        if (!ONLY_MINE || to.includes(myId)) onTransfer(p.chat_id, p.thread_id);
        else setTimeout(sweep, 800);   // transfer ke grup: tunggu assign, cek lewat sweep
      }
    }

    // ambil data chat lengkap (nama member dll), lalu sapa
    async function onTransfer(chatId, threadId, why = 'chat transfer') {
      if (!SAPA_TRANSFER || !chatId) return;
      try {
        let ch = null;
        for (let i = 0; i < 3; i++) {                 // kadang data agent baru masuk 1-2 detik setelah notif
          ch = await rtm('get_chat', { chat_id: chatId });
          if (!ONLY_MINE || aktifDiChat(ch.users || [])) break;
          await sleep(1500);
        }
        const t = ch.thread || {};
        dbg(`${why} ${chatId}: lo anggota = ${aktifDiChat(ch.users || [])}`);
        consider(chatId, t.id || threadId, ch.users || [], t.active !== false, why, true);
      } catch (e) {
        dbg(`gagal ambil chat (${why}): ` + e.message);
      }
    }

    // =================== CATATAN SUDAH DISAPA (per thread, antar tab) ===================
    function greetedMap() { return GM_getValue('greetedThreads', {}); }
    function isGreeted(threadId) { return !!greetedMap()[threadId]; }
    function markGreeted(threadId, val) {
      const m = greetedMap(), now = Date.now();
      for (const k of Object.keys(m)) if (now - (m[k].ts || 0) > 6 * 3600000) delete m[k];   // bersihin catatan > 6 jam
      m[threadId] = { ts: now, by: val };
      GM_setValue('greetedThreads', m);
    }
    // klaim thread biar kalau ada 2 tab/2 script, cuma satu yang kirim
    async function claim(threadId) {
      if (isGreeted(threadId)) return false;
      markGreeted(threadId, TAB_ID);
      await sleep(rand(40, 120));
      return greetedMap()[threadId]?.by === TAB_ID;
    }

    // =================== LOGIKA SAPA ===================
    const inProgress = new Set();

    // transfer = true: chat lama yang baru masuk ke lo. Kuncinya beda ("tr:<thread>"),
    // jadi tetap disapa walau thread-nya tadinya ditandai "lama", tapi cuma 1x per thread.
    function consider(chatId, threadId, users, active, why, transfer = false) {
      if (!chatId || !threadId || !active) return;
      thr2chat.set(String(threadId).replace(/^tr:/, ''), chatId);
      mode = curMode();
      if (!isLeader()) { dbg(`${why}: dilewati, bukan tab pengirim (tab LiveChat lain yang kirim)`); return; }
      const base = String(threadId).replace(/^tr:/, ''), trKey = 'tr:' + base;
      const gm = greetedMap();
      // jangan dobel: thread ini lagi diproses / udah disapa lewat jalur mana pun
      if (inProgress.has(base) || inProgress.has(trKey) || gm[trKey]) return;
      if (gm[base] && (!transfer || gm[base].by !== 'lama')) return;
      if (transfer) threadId = trKey;

      const cust = users.find(u => u.type === 'customer');
      if (!cust) return;

      if (ONLY_MINE) {
        if (!myId) { dbg('Akun agent belum kebaca, refresh halaman sekali'); return; }
        if (!aktifDiChat(users)) return;
      }
      if (members.length) {
        const keys = [cust.name, cust.email, cust.id].map(norm);
        if (!members.some(x => keys.includes(x))) return;
      }

      if (mode === 'off') return;
      inProgress.add(threadId);
      const name = cust.name || 'member';
      const delay = (mode === 'cadangan' ? CADANGAN_SEC + rand(0, 2) : rand(DELAY_MIN, DELAY_MAX)) * 1000;
      dbg(`${why}: ${name} -> sapa ${(delay / 1000).toFixed(1)} dtk lagi (${mode})`);
      const go = () => greet(chatId, threadId, name, users).finally(() => inProgress.delete(threadId));
      if (delay > 0) setTimeout(go, delay); else go();
    }

    // =================== 1.4.3 CEK "SUDAH DIBALAS" (baca isi chat di LiveChat) ===================
    // sudah dibalas = agent yang MASIH ada di chat ini sudah kirim pesan / file apa pun di thread ini
    // (agent lama yang sudah transfer & keluar ga dihitung, jadi chat transfer tetap disapa)
    async function cekChat(chatId, threadId) {
      const ch = await rtm('get_chat', { chat_id: chatId, thread_id: threadId });
      const agents = (ch.users || []).filter(u => u.type === 'agent' && u.present !== false).map(u => u.id).sort();
      const ada = new Set(agents);
      const ev = (ch.thread && ch.thread.events) || [];
      const sudah = ev.some(e => (e.type === 'message' || e.type === 'file') && ada.has(e.author_id));
      return { sudah, agents };
    }

    async function greet(chatId, threadId, name, users = []) {
      if (!(await claim(threadId))) { dbg(`${name}: udah disapa (tab/script lain)`); return; }
      const base = String(threadId).replace(/^tr:/, '');
      // 1.4.3: SELALU cek dulu (cuma ±0,1-0,3 dtk): kalau udah dibalas -> ga kirim
      try {
        const c1 = await cekChat(chatId, base);
        if (c1.sudah) { log(`⏭️ ${name}: sudah dibalas, sapaan ga dikirim`); return; }
        if (mode !== 'cadangan' && c1.agents.length > 1) {
          // 2 agent beda di 1 chat: agent urutan ke-2 dst nunggu lebih lama, lalu cek lagi
          const idx = Math.max(0, c1.agents.indexOf(myId));
          if (idx > 0) {
            await sleep(idx * ANTRI_SEC * 1000);
            const c2 = await cekChat(chatId, base);
            if (c2.sudah) { log(`⏭️ ${name}: sudah disapa (agent lain)`); return; }
          }
        }
      } catch (e) {
        if (/not user of the chat|not found|inactive/i.test(e.message)) {
          markGreeted(threadId, 'gagal'); log(`⚠️ ${name}: ${e.message}`); return;
        }
        dbg(`cek chat gagal (${e.message}), tetap kirim`);
      }
      const slot = slotNow();
      let text = cannedText(SET.tag[slot]).trim();
      if (!text) {
        text = String(TEKS[slot] || '').trim();
        log(`⚠️ #${normTag(SET.tag[slot])} tidak ketemu di canned response, pakai teks cadangan ${slot}`);
      }
      if (!text) { log(`Teks ${slot} kosong`); return; }
      try {
        await rtm('send_event', { chat_id: chatId, event: { type: 'message', text, visibility: 'all' } });
        log(`✅ Kirim ${slot} (#${normTag(SET.tag[slot])}) ke ${name}`);
      } catch (e) {
        if (/not user of the chat|not found|inactive/i.test(e.message)) {
          markGreeted(threadId, 'gagal');   // bukan chat lo / udah selesai -> ga usah dicoba lagi
        } else {
          const m = greetedMap(); delete m[threadId]; GM_setValue('greetedThreads', m);   // dicoba lagi pas sweep
        }
        log(`⚠️ Gagal kirim ke ${name}: ${e.message}`);
      }
    }

    // =================== SWEEP (cadangan) ===================
    let seeded = GM_getValue('seededAt', 0) > Date.now() - 6 * 3600000;
    let sweeping = false, lastSweep = 0;
    let mine = null;   // chat yang di sweep sebelumnya udah dipegang lo (buat deteksi transfer yang notifnya kelewat)

    async function sweep() {
      if (!sock || sweeping) return;
      sweeping = true;
      try {
        const all = [];
        let page = null, n = 0;
        do {
          const r = await rtm('list_chats', page ? { page_id: page } : { limit: 100 });
          all.push(...(r.chats_summary || []));
          page = r.next_page_id;
          n++;
        } while (page && n < 5);
        all.forEach(c => { if (c.last_thread_summary?.id) thr2chat.set(c.last_thread_summary.id, c.id); });

        if (!seeded) {
          // pertama kali jalan: semua chat yang udah ada dianggap lama, ga disapa
          all.forEach(c => { const t = c.last_thread_summary; if (t?.id) markGreeted(t.id, 'lama'); });
          seeded = true;
          GM_setValue('seededAt', Date.now());
          log(`Mulai memantau (${all.length} chat lama dilewati). Jadwal sekarang #${slotNow()}`);
        } else {
          for (const c of all) {
            const t = c.last_thread_summary || {};
            if (!t.id || t.active === false) continue;
            const users = c.users || [];
            const pegang = aktifDiChat(users);
            // transfer yang notifnya kelewat: tadi bukan punya lo, sekarang punya lo
            const umur = t.created_at ? (Date.now() - new Date(t.created_at)) / 1000 : Infinity;
            if (SAPA_TRANSFER && mine && pegang && !mine.has(c.id) && umur > MAX_UMUR_CHAT) {
              consider(c.id, t.id, users, true, 'transfer (sweep)', true);
              continue;
            }
            if (isGreeted(t.id)) continue;
            if (umur > MAX_UMUR_CHAT) { markGreeted(t.id, 'lama'); continue; }
            consider(c.id, t.id, users, true, 'sweep');
          }
        }
        // catat chat yang sekarang lo pegang (sweep pertama setelah refresh cuma mencatat)
        mine = new Set(all.filter(c => c.last_thread_summary?.active !== false &&
          aktifDiChat(c.users || [])).map(c => c.id));
        lastSweep = Date.now();
      } catch (e) {
        log('⚠️ ' + e.message);
      } finally {
        sweeping = false;
      }
    }

    setInterval(() => {
      if (sock && Date.now() - lastSweep > SWEEP_SEC * 1000) sweep();
    }, 1000);

    log(`Siap. Jadwal sekarang #${slotNow()}. Nunggu koneksi LiveChat...`);
    // 1.7.0: habis update tanpa refresh -> langsung numpang koneksi LiveChat yang udah kebuka
    if (env.sock && env.sock.readyState === 1) attach(env.sock);

    // 1.4.0: dipanggil Inbox Helper waktu di daftar chat muncul tulisan "Transferred - by ..."
    return {
      // 1.5.3: daftar chat kasih ID thread -> cari ID chat-nya dulu (kalau belum kenal, tunggu sweep)
      fromDom(threadId) {
        if (!sock) return;
        const chatId = thr2chat.get(threadId);
        if (chatId) onTransfer(chatId, threadId, 'transfer (daftar chat)');
        else { lastSweep = 0; dbg(`transfer (daftar chat) ${threadId}: nunggu daftar chat dibaca ulang`); }
      },
      isLeader,
      getMode: () => curMode(),
      slots: SLOTS,
      slotNow,
      getTeks: (k) => SET.teks[k] || '',
      getTag: (k) => SET.tag[k] || '',
      setTag(k, v) { SET.tag[k] = normTag(v); saveSet(); },
      tagStatus: (k) => (cannedText(SET.tag[k]) ? '✅' : (Object.keys(canned).length ? '❌ tidak ada' : '⏳ nunggu canned')),
      setTeks(k, v) { SET.teks[k] = v; saveSet(); },
      getJam: (k) => SET.jam[k],
      setJam(k, v) { SET.jam[k] = v; saveSet(); },
      setMode(m) { mode = m; GM_setValue('modeSapa', m); log(`Mode sapaan komputer ini: ${m}`); },
    };
  }

  const SAPA = SITE === 'lc' ? initSapaan() : null;

  // #####################################################################
  // BAGIAN C: AUTO REPLY (hanya LiveChat) - dari "LiveChat Auto Reply dari Archive" 4.3-lc
  // 1.5.0: centang di samping nama chat = auto reply aktif buat chat itu.
  //        Setelan dibuka dari tombol 🤖 di menu kiri (di atas Billing).
  // #####################################################################
  function initAutoReply() {
    const W = PW;

    // =================== SETTING ===================
    const DEF = {
      on: true,              // saklar utama auto-reply
      onlyMine: true,        // cuma balas chat yang lagi dipegang akun gw (aman kalau dipakai bareng partner)
      filterIds: '',         // ID yang dibalas (diisi otomatis lewat centang di daftar chat)
      phrases: `**1**
Mohon maaf bossku.. menang kalahnya anda dalam permainan semua tergantung bagaimana cara anda memainkan permainan tersebut ya bossku..semua murni dari keberuntungan masing-masing pemain bossku 🙏😉

**2**
Semoga apa pun hasil hari ini, Bosku tetap kuat, sabar, dan optimis. 🙏✨ Kalah ataupun menang, semoga selalu diberi keberuntungan, rezeki yang lancar, dan pikiran yang tenang. Jangan lupa, yang terpenting tetap bermain dengan bijak dan tahu batas. Semoga hari-hari berikutnya membawa kabar baik dan rezeki yang lebih besar. Aamiin 🤲💫

**3**
✨ SETIAP PUTARAN MEMBAWA CERITA BARU, BOSKU! 🎰🌟 Nikmati setiap permainan dengan santai dan jangan biarkan emosi menguasai diri. 🔄💫 Siapa tahu hari ini menjadi momen yang menyenangkan, tetapi ingat bahwa hasil setiap putaran tetap bergantung pada keberuntungan dan tidak ada kemenangan yang bisa dijamin. 🍀🔥 Tetapkan batas permainan dan bermainlah sesuai kemampuan. Jika mendapatkan hasil yang bagus, syukuri dan gunakan dengan bijak. Jika belum beruntung, jangan mengejar kekalahan dan jangan memaksakan diri. 💪✨ Yang terpenting adalah tetap tenang, bermain dengan tanggung jawab, serta tahu kapan waktunya berhenti. 🌈🎉 Semoga hari Bosku dipenuhi keberuntungan, rezeki, dan keputusan yang bijaksana. 🤲💖`,
      delayMode: 'random',   // instant | random
      delayMin: 3,
      delayMax: 8,
      typing: true,          // tampilkan "sedang mengetik" sebelum kirim
      cooldown: 0,           // jeda minimal antar balasan di chat yang sama (detik)
      maxAgeMin: 10,         // abaikan pesan customer yang lebih lama dari ini (menit)
      autoRemove: true,      // hapus ID dari filter setelah chat member selesai
      removeOffline: false,  // hapus juga kalau member offline / keluar dari website
      sweepSec: 15,          // cek ulang semua chat tiap X detik
      minimized: false,
      panelOpen: false,      // 1.5.0: panel setelan dibuka/ditutup lewat tombol 🤖 di menu kiri
    };
    const S = Object.assign({}, DEF, GM_getValue('settings', {}));
    const saveS = () => GM_setValue('settings', S);

    const rand = (a, b) => a + Math.random() * Math.max(0, b - a);

    // =================== KONEKSI REALTIME (numpang koneksi LiveChat) ===================
    let sock = null;
    let myId = GM_getValue('myId', null);
    let reqN = 0;
    const pend = new Map();

    const proto = W.WebSocket.prototype;
    const origSend = proto.send;
    proto.send = function (d) {
      try {
        if (!stopped && this !== sock && /\/agent\/rtm\//.test(String(this.url))) attach(this);
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
    const mySend = proto.send;
    onStop(() => { if (proto.send === mySend) proto.send = origSend; });

    function attach(ws) {
      sock = ws;
      env.sock = ws;
      const onClose = () => { if (sock === ws) sock = null; ui(); };
      ws.addEventListener('message', onMsg);
      ws.addEventListener('close', onClose);
      onStop(() => { ws.removeEventListener('message', onMsg); ws.removeEventListener('close', onClose); });
      ui();
      scheduleSweep(2000);
    }

    function rtm(action, payload, timeout = 15000) {
      return new Promise((res, rej) => {
        if (stopped || !sock || sock.readyState !== 1) return rej(new Error('koneksi belum siap'));
        const id = 'arbot_' + ++reqN + '_' + Date.now();
        pend.set(id, { res, rej });
        setTimeout(() => { if (pend.delete(id)) rej(new Error('timeout ' + action)); }, timeout);
        origSend.call(sock, JSON.stringify({ request_id: id, action, payload }));
      });
    }

    function onMsg(ev) {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.request_id && pend.has(m.request_id)) {
        const p = pend.get(m.request_id);
        pend.delete(m.request_id);
        if (m.success === false) p.rej(new Error(m.payload?.error?.message || 'error'));
        else p.res(m.payload || {});
        return;
      }
      if (m.action === 'login' && m.type === 'response' && m.payload?.my_profile?.id) {
        myId = m.payload.my_profile.id;
        GM_setValue('myId', myId);
        ui();
      }
      if (m.type !== 'push') return;
      if (m.action === 'chat_deactivated' && m.payload?.chat_id) {
        memberLeft(m.payload.chat_id, 'chat selesai');
      }
      if (/incoming_event|incoming_chat|chat_deactivated|chat_transferred|user_added_to_chat|user_removed_from_chat/.test(m.action)) {
        scheduleSweep(400);
      }
    }

    // =================== FILTER ID ===================
    const entries = () => S.filterIds.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const tracked = new Map(); // chatId -> { entry, name } chat aktif yang cocok sama filter

    function matchEntry(c, cust) {
      // 1.5.0: + ID thread (ID yang dipakai di daftar chat / centang)
      const keys = [c.id, c.last_thread_summary?.id, cust.id, cust.name, cust.email]
        .filter(Boolean).map((s) => String(s).toLowerCase().trim());
      const form = c.last_event_per_type?.filled_form?.event;
      (form?.fields || []).forEach((f) => { if (typeof f.answer === 'string') keys.push(f.answer.toLowerCase().trim()); });
      return entries().find((e) => keys.includes(e.toLowerCase())) || null;
    }

    function memberLeft(chatId, why) {
      const t = tracked.get(chatId);
      if (!t) return;
      tracked.delete(chatId);
      cancel(chatId, why);
      if (!S.autoRemove) return;
      if ([...tracked.values()].some((x) => x.entry.toLowerCase() === t.entry.toLowerCase())) return;
      const before = entries();
      const after = before.filter((e) => e.toLowerCase() !== t.entry.toLowerCase());
      if (after.length === before.length) return;
      S.filterIds = after.join('\n');
      saveS();
      syncFilterBox();
      log(`🗑️ ${t.name}: ${why}, ID "${t.entry}" dihapus dari filter`);
    }

    // =================== AUTO REPLY ===================
    const timers = new Map();
    const handled = new Set();
    const lastSent = new Map();
    const lastPhrase = new Map();
    let sweepT = null, sweeping = false, again = false, lastSweep = 0;

    function scheduleSweep(ms) { clearTimeout(sweepT); sweepT = setTimeout(sweep, ms); }

    async function sweep() {
      if (!sock) return;
      if (!S.on && !(S.autoRemove && tracked.size)) return;
      if (sweeping) { again = true; return; }
      sweeping = true;
      try {
        let page = null, n = 0;
        do {
          const r = await rtm('list_chats', page ? { page_id: page } : { limit: 100 });
          (r.chats_summary || []).forEach(handleChat);
          page = r.next_page_id;
          n++;
        } while (page && n < 5);
        lastSweep = Date.now();
      } catch (e) {
        log('⚠️ ' + e.message);
      } finally {
        sweeping = false;
        if (again) { again = false; scheduleSweep(300); }
        ui();
      }
    }

    function cancel(chatId, why) {
      const j = timers.get(chatId);
      if (!j) return;
      clearTimeout(j.t); clearTimeout(j.ty);
      timers.delete(chatId);
      log(`✋ ${j.name}: batal (${why})`);
    }

    function handleChat(c) {
      const cust = (c.users || []).find((u) => u.type === 'customer');
      if (!cust) return;
      const active = c.last_thread_summary?.active !== false;

      if (tracked.has(c.id)) {
        if (!active) return memberLeft(c.id, 'chat selesai');
        if (S.removeOffline && (cust.present === false || cust.online === false)) return memberLeft(c.id, 'member offline');
      }
      if (!active) return;

      const entry = matchEntry(c, cust);
      if (!entry) { tracked.delete(c.id); return cancel(c.id, 'udah ga ada di filter'); }
      const name = cust.name || 'kak';
      tracked.set(c.id, { entry, name });
      if (!S.on) return;
      if (SAPA && !SAPA.isLeader()) return cancel(c.id, 'bukan tab pengirim');   // 1.5.3: cuma 1 tab yang balas
      if (S.onlyMine) {
        if (!myId) return;
        if (!(c.users || []).some((u) => u.id === myId && u.present !== false)) return cancel(c.id, 'chat dipegang agent lain');
      }

      const L = c.last_event_per_type || {};
      const ev = ['message', 'file']
        .map((t) => L[t]?.event).filter(Boolean)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (!ev) return;
      if (ev.author_id !== cust.id) return cancel(c.id, 'udah dibalas');

      const key = c.id + ':' + ev.id;
      if (handled.has(key)) return;
      handled.add(key);
      if (S.maxAgeMin > 0 && (Date.now() - new Date(ev.created_at)) / 60000 > S.maxAgeMin) return;
      if (timers.has(c.id)) return;

      const cd = S.cooldown * 1000 - (Date.now() - (lastSent.get(c.id) || 0));
      const delay = Math.max(S.delayMode === 'instant' ? rand(300, 2000) : rand(S.delayMin, S.delayMax) * 1000, cd, 0);
      const job = { chatId: c.id, name, custId: cust.id };
      job.t = setTimeout(() => fire(job), delay);
      if (S.typing && delay > 1500)
        job.ty = setTimeout(() => rtm('send_typing_indicator', { chat_id: c.id, is_typing: true, visibility: 'all' }).catch(() => {}), delay - 1500);
      timers.set(c.id, job);
      const what = ev.type === 'file' ? '[gambar/file]' : '"' + (ev.text || '').slice(0, 30) + '"';
      log(`⏳ ${name}: ${what} → balas ${Math.round(delay / 1000)} dtk lagi`);
    }

    const MARK = /^\s*\*{0,2}\s*\d+\s*[.)]?\s*\*{0,2}\s*$/;
    function parsePhrases() {
      const lines = S.phrases.replace(/\r/g, '').split('\n');
      let blocks;
      if (lines.some((l) => MARK.test(l))) {
        blocks = [];
        let cur = null;
        lines.forEach((l) => {
          if (MARK.test(l)) { if (cur) blocks.push(cur); cur = []; }
          else if (cur) cur.push(l);
        });
        if (cur) blocks.push(cur);
        blocks = blocks.map((b) => b.join('\n'));
      } else if (/\n\s*\n/.test(S.phrases)) {
        blocks = S.phrases.split(/\n\s*\n/);
      } else {
        blocks = lines;
      }
      return blocks.map((s) => s.trim()).filter(Boolean);
    }

    function randomPhrase(chatId) {
      const ps = parsePhrases();
      if (!ps.length) return null;
      let p;
      for (let i = 0; i < 6; i++) {
        p = ps[Math.floor(Math.random() * ps.length)];
        if (ps.length === 1 || p !== lastPhrase.get(chatId)) break;
      }
      lastPhrase.set(chatId, p);
      return p;
    }

    async function fire(job) {
      timers.delete(job.chatId);
      if (!S.on) return;
      if (SAPA && !SAPA.isLeader()) return;
      // cek ulang tepat sebelum kirim: kalau udah dibalas (sama lo, partner, atau script di komputer lain) → batal
      try {
        const ch = await rtm('get_chat', { chat_id: job.chatId });
        const last = (ch.thread?.events || []).filter((e) => e.type === 'message' || e.type === 'file').pop();
        if (ch.thread?.active === false) { log(`✋ ${job.name}: batal (chat udah selesai)`); return; }
        if (last && last.author_id !== job.custId) { log(`✋ ${job.name}: batal (udah dibalas duluan)`); return; }
      } catch (e) {
        log(`⚠️ ${job.name}: gagal cek ulang (${e.message}), tetap kirim`);
      }
      const p = randomPhrase(job.chatId);
      if (!p) { log('⚠️ Isi balasan masih kosong'); return; }
      const reply = p.replace(/\{nama\}/gi, job.name);
      try {
        await rtm('send_event', { chat_id: job.chatId, event: { type: 'message', text: reply, visibility: 'all' } });
        lastSent.set(job.chatId, Date.now());
        log(`✅ ${job.name}: ${reply.replace(/\n/g, ' ').slice(0, 50)}`);
      } catch (e) {
        log(`⚠️ ${job.name}: gagal kirim (${e.message})`);
      }
      ui();
    }

    setInterval(() => {
      if (sock && Date.now() - lastSweep > S.sweepSec * 1000) scheduleSweep(0);
    }, 1000);

    // =================== PANEL ===================
    const logs = [];
    let panel = null;
    function log(s) {
      logs.unshift(`${new Date().toTimeString().slice(0, 8)} ${s}`);
      logs.length = Math.min(logs.length, 40);
      ui();
    }
    function syncFilterBox() {
      const box = panel?.querySelector('[data-k="filterIds"]');
      if (box && box.ownerDocument.activeElement !== box) box.value = S.filterIds;
      const on = panel?.querySelector('[data-k="on"]');
      if (on) on.checked = !!S.on;
    }

    function ui() {
      updateNav();
      if (!panel) return;
      const q = (id) => panel.querySelector('#' + id);
      q('ar-conn').textContent =
        (sock && sock.readyState === 1 ? '🟢 Terhubung' : '🔴 Belum terhubung (refresh halaman)') +
        ` · ID aktif: ${tracked.size} · antrian: ${timers.size}` +
        (S.onlyMine && !myId ? '\n⚠️ Akun agent belum kebaca, refresh halaman sekali' : '');
      q('ar-log').textContent = logs.join('\n');
      q('ar-count').textContent = `→ kebaca ${parsePhrases().length} pilihan balasan`;
      const ub = q('ar-updbtn');
      if (ub) {
        q('ar-ver').textContent = env.updLabel();
        ub.textContent = env.updBtn();
        ub.disabled = env.updBusy();
        ub.style.background = env.updAvail() ? '#7c3aed' : '#3a3f4b';
      }
      const ui2 = q('ar-upd');
      if (ui2) ui2.style.color = env.updAvail() ? '#c4a5ff' : '';
      if (SAPA) {
        const sm = panel.querySelector('[data-s="mode"]');
        if (sm && sm.ownerDocument.activeElement !== sm && sm.value !== SAPA.getMode()) sm.value = SAPA.getMode();
        const now = q('sp-now');
        if (now) now.textContent = `· sekarang: ${SAPA.slotNow()}`;
        panel.querySelectorAll('[data-s-st]').forEach((el) => { el.textContent = SAPA.tagStatus(el.dataset.sSt); });
      }
    }

    function showPanel(v) {
      S.panelOpen = v; saveS();
      if (pip) { if (!v) pip.close(); return; }
      if (panel) panel.style.display = v ? '' : 'none';
      updateNav();
    }

    function buildPanel() {
      panel = document.createElement('div');
      panel.id = 'csw-ar-panel';
      panel.style.cssText =
        'position:fixed;left:64px;bottom:70px;z-index:99999;background:#1f2229;color:#eee;font:12px sans-serif;' +
        'border:1px solid #444;border-radius:8px;padding:8px 10px;width:300px;max-height:80vh;overflow:auto;box-shadow:0 4px 16px #0008';
      const inp = 'background:#2b2f38;color:#eee;border:1px solid #555;border-radius:4px;padding:2px 4px';
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;font-weight:bold">
          <span id="ar-drag" style="cursor:move;flex:1">🤖 Auto Reply</span>
          <span id="ar-upd" title="Update script tanpa refresh" style="cursor:pointer;padding:0 6px">🔄</span>
          <span id="ar-pop" title="Pisahin jadi jendela sendiri (bisa ditaruh di luar Chrome)" style="cursor:pointer;padding:0 6px">⧉</span>
          <span id="ar-min" style="cursor:pointer;padding:0 4px">–</span>
          <span id="ar-x" title="Tutup (buka lagi lewat tombol 🤖 di menu kiri)" style="cursor:pointer;padding:0 4px">✕</span></div>
        <div id="ar-body">
          <div id="ar-conn" style="margin:4px 0 6px;color:#aaa"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin:0 0 8px">
            <span id="ar-ver" style="color:#aaa"></span>
            <button type="button" id="ar-updbtn" style="border:0;border-radius:999px;padding:3px 10px;cursor:pointer;font:inherit;font-weight:600;background:#3a3f4b;color:#eee">Cek update</button>
          </div>
          ${SAPA ? `
          <div style="font-weight:bold">👋 Sapaan otomatis <span id="sp-now" style="font-weight:normal;color:#8c8"></span></div>
          <label>Komputer ini:
            <select data-s="mode" style="${inp}">
              <option value="utama">⚡ Utama (langsung sapa)</option>
              <option value="cadangan">Cadangan (sapa kalau Utama belum)</option>
              <option value="off">Off (ga nyapa)</option>
            </select></label>
          <div style="color:#888">1 akun di 2 komputer: Utama di SATU komputer saja, lainnya Cadangan.</div>
          <div style="margin-top:4px">Jam mulai (WIB):
            ${SAPA.slots.map((k) => `${k} <input type="number" min="0" max="23" data-s="jam" data-slot="${k}" style="width:36px;${inp}">`).join(' ')}
          </div>
          <div style="margin-top:6px;font-weight:bold">#️⃣ Shortcut canned per waktu</div>
          ${SAPA.slots.map((k) => `<div style="margin-top:3px">${k}: # <input data-s="tag" data-slot="${k}" style="width:110px;${inp}">
            <span data-s-st="${k}" style="color:#8c8"></span></div>`).join('')}
          <details style="margin-top:6px"><summary style="cursor:pointer;color:#ccc">Teks cadangan (dipakai kalau # tidak ketemu)</summary>
          ${SAPA.slots.map((k) => `<div style="margin-top:4px;color:#ccc">Teks ${k}:</div>
          <textarea data-s="teks" data-slot="${k}" rows="4" style="width:100%;${inp}"></textarea>`).join('')}
          </details>
          <hr style="border:0;border-top:1px solid #444;margin:10px 0 8px">
          <div style="font-weight:bold">🤖 Auto Reply</div>` : ''}
          <label style="font-weight:bold"><input type="checkbox" data-k="on"> AUTO-REPLY AKTIF (saklar utama)</label><br>
          <label><input type="checkbox" data-k="onlyMine"> Cuma chat yang gw pegang (biar ga tabrakan sama partner)</label>

          <div style="margin-top:8px;font-weight:bold">🎯 ID yang dibalas</div>
          <textarea data-k="filterIds" rows="3" placeholder="Centang ☑ di samping nama chat, atau tulis manual&#10;satu ID per baris / pisah koma" style="width:100%;${inp}"></textarea>
          <div style="color:#888">Centang di samping nama chat = otomatis masuk sini. ID = nama/username, email, atau ID chat.</div>
          <label><input type="checkbox" data-k="autoRemove"> Hapus ID otomatis setelah chat member selesai</label><br>
          <label><input type="checkbox" data-k="removeOffline"> Hapus juga kalau member offline</label>

          <div style="margin-top:8px;font-weight:bold">💬 Isi balasan (random)</div>
          <textarea data-k="phrases" rows="8" placeholder="**1**&#10;baris pertama&#10;baris kedua&#10;&#10;**2**&#10;..." style="width:100%;${inp}"></textarea>
          <div style="color:#888">Kasih penanda **1**, **2**, dst → tiap nomor dikirim utuh (semua barisnya). Penanda nomornya ga ikut terkirim. {nama} = nama customer.</div>
          <div id="ar-count" style="color:#8c8"></div>

          <div style="margin-top:8px;font-weight:bold">⚙️ Config</div>
          <select data-k="delayMode" style="${inp}">
            <option value="instant">Langsung balas</option>
            <option value="random">Delay random</option>
          </select>
          <input type="number" data-k="delayMin" min="0" style="width:45px;${inp}"> –
          <input type="number" data-k="delayMax" min="0" style="width:45px;${inp}"> detik<br>
          <label><input type="checkbox" data-k="typing"> Tampilin "sedang mengetik" sebelum kirim</label><br>
          <label>Jeda min. antar balasan per chat: <input type="number" data-k="cooldown" min="0" style="width:45px;${inp}"> dtk</label><br>
          <label>Abaikan pesan lebih lama dari <input type="number" data-k="maxAgeMin" min="0" style="width:45px;${inp}"> menit</label>

          <div style="margin-top:8px;font-weight:bold">📝 Log</div>
          <pre id="ar-log" style="white-space:pre-wrap;margin:0;max-height:160px;overflow:auto;color:#ccc;font:11px monospace"></pre>
        </div>`;
      panel.style.display = S.panelOpen ? '' : 'none';
      document.body.appendChild(panel);

      panel.querySelectorAll('[data-k]').forEach((el) => {
        const k = el.dataset.k;
        if (el.type === 'checkbox') el.checked = !!S[k]; else el.value = S[k];
        el.addEventListener('change', () => {
          if (el.type === 'checkbox') S[k] = el.checked;
          else if (el.type === 'number') { const v = parseFloat(el.value); S[k] = isNaN(v) ? DEF[k] : v; el.value = S[k]; }
          else S[k] = el.value;
          if (k === 'delayMax' && S.delayMax < S.delayMin) { S.delayMax = S.delayMin; el.value = S.delayMax; }
          saveS();
          if (k === 'on') {
            log(S.on ? '▶️ Auto-reply nyala' : '⏸️ Auto-reply mati');
            if (!S.on) [...timers.keys()].forEach((id) => cancel(id, 'dimatiin'));
          }
          if (k === 'on' || k === 'filterIds') handled.clear();
          scheduleSweep(200);
          ui();
        });
      });

      // 1.5.1: setelan sapaan (mode, jam, teks)
      if (SAPA) {
        panel.querySelectorAll('[data-s]').forEach((el) => {
          const k = el.dataset.s, slot = el.dataset.slot;
          if (k === 'mode') el.value = SAPA.getMode();
          if (k === 'jam') el.value = SAPA.getJam(slot);
          if (k === 'teks') el.value = SAPA.getTeks(slot);
          if (k === 'tag') el.value = SAPA.getTag(slot);
          el.addEventListener('change', () => {
            if (k === 'tag') { SAPA.setTag(slot, el.value); el.value = SAPA.getTag(slot); log(`👋 Sapaan ${slot} pakai #${SAPA.getTag(slot)}`); }
            if (k === 'mode') { SAPA.setMode(el.value); log(`👋 Sapaan komputer ini: ${el.value}`); }
            if (k === 'jam') {
              const v = Math.round(+el.value);
              if (v >= 0 && v <= 23) { SAPA.setJam(slot, v); log(`👋 Sapaan ${slot} mulai jam ${v}`); }
              else el.value = SAPA.getJam(slot);
            }
            if (k === 'teks') { SAPA.setTeks(slot, el.value); log(`👋 Teks sapaan ${slot} disimpan`); }
            ui();
          });
        });
      }

      const body = panel.querySelector('#ar-body');
      const minBtn = panel.querySelector('#ar-min');
      const applyMin = () => { body.style.display = S.minimized ? 'none' : ''; minBtn.textContent = S.minimized ? '+' : '–'; };
      applyMin();
      minBtn.onclick = () => { S.minimized = !S.minimized; saveS(); applyMin(); };
      panel.querySelector('#ar-x').onclick = () => showPanel(false);
      // 1.7.0: tombol update
      const doUpd = () => { env.updClick(); ui(); };
      panel.querySelector('#ar-upd').onclick = doUpd;
      panel.querySelector('#ar-updbtn').onclick = doUpd;

      // ---- geser panel di dalam halaman (tarik judulnya) ----
      const pos = GM_getValue('panelPos', null);
      if (pos) Object.assign(panel.style, { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' });
      panel.querySelector('#ar-drag').addEventListener('mousedown', (e) => {
        if (pip) return;
        e.preventDefault();
        const r = panel.getBoundingClientRect();
        const dx = e.clientX - r.left, dy = e.clientY - r.top;
        const move = (ev) => {
          const x = Math.min(Math.max(0, ev.clientX - dx), innerWidth - 60);
          const y = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 30);
          Object.assign(panel.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
        };
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          GM_setValue('panelPos', { x: parseInt(panel.style.left), y: parseInt(panel.style.top) });
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });

      // ---- pisahin panel jadi jendela sendiri (Document Picture-in-Picture) ----
      panel.querySelector('#ar-pop').onclick = async () => {
        if (pip) { pip.close(); return; }
        const api = W.documentPictureInPicture || window.documentPictureInPicture;
        if (!api) { log('⚠️ Chrome lu belum dukung jendela terpisah (butuh Chrome 116+)'); return; }
        try {
          pip = await api.requestWindow({ width: 340, height: 640 });
        } catch (e) { log('⚠️ Gagal bikin jendela: ' + e.message); return; }
        const d = pip.document;
        d.title = '🤖 Auto Reply';
        d.body.style.cssText = 'margin:0;background:#1f2229';
        savedCss = panel.style.cssText;
        panel.style.cssText =
          'background:#1f2229;color:#eee;font:12px sans-serif;padding:8px 10px;box-sizing:border-box;' +
          'width:100%;min-height:100vh;overflow:auto';
        d.body.appendChild(panel);
        panel.querySelector('#ar-pop').textContent = '⇲';
        panel.querySelector('#ar-pop').title = 'Balikin panel ke halaman LiveChat';
        log('🪟 Panel dipisah. Tutup jendelanya buat balikin.');
        pip.addEventListener('pagehide', () => {
          pip = null;
          if (stopped) return;   // 1.7.0: lagi di-update, panel lama ga usah dibalikin
          panel.style.cssText = savedCss;
          panel.style.display = S.panelOpen ? '' : 'none';
          document.body.appendChild(panel);
          panel.querySelector('#ar-pop').textContent = '⧉';
          panel.querySelector('#ar-pop').title = 'Pisahin jadi jendela sendiri (bisa ditaruh di luar Chrome)';
          ui();
        });
        ui();
      };
      ui();
    }
    let pip = null, savedCss = '';
    onStop(() => { if (pip) pip.close(); });

    // =================== 1.5.0 TOMBOL 🤖 DI MENU KIRI (di atas Billing) ===================
    let nav = null;
    const NAV_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="24" height="24">'
      + '<path stroke="currentcolor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" '
      + 'd="M12 3v3M7 6h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM9 11v1M15 11v1M10 15h4"/></svg>';
    function navInject() {
      if (nav && nav.isConnected) return;
      const a = document.querySelector('li#Billing a, a[aria-label="Billing"]');
      const inner = a && a.closest('li');
      if (!inner) return;
      const outer = inner.parentElement && inner.parentElement.closest('li');
      const holder = outer && outer.parentElement && outer.parentElement.tagName === 'UL' ? outer : inner;
      nav = holder.cloneNode(false);
      nav.removeAttribute('id');
      nav.id = 'csw-ar-nav';
      const wrap = holder === outer ? inner.cloneNode(false) : null;
      if (wrap) wrap.removeAttribute('id');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = a.className;
      btn.setAttribute('aria-label', 'Auto Reply');
      btn.title = 'Auto Reply (setelan & isi balasan)';
      btn.innerHTML = `<span class="${(a.firstElementChild && a.firstElementChild.className) || ''}">${NAV_SVG}</span><i class="csw-ar-led"></i>`;
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showPanel(!(S.panelOpen && (pip || panel?.style.display !== 'none'))); });
      (wrap || nav).appendChild(btn);
      if (wrap) nav.appendChild(wrap);
      holder.parentElement.insertBefore(nav, holder);
      updateNav();
    }
    function updateNav() {
      if (!nav) return;
      const b = nav.querySelector('button');
      if (!b) return;
      const v = S.on ? 'on' : 'off';
      if (b.dataset.ar !== v) b.dataset.ar = v;
      const open = S.panelOpen ? '1' : '';
      if ((b.dataset.open || '') !== open) { if (open) b.dataset.open = open; else delete b.dataset.open; }
    }
    setInterval(() => { try { navInject(); } catch (e) { /* */ } }, 1000);

    if (document.body) buildPanel();
    else on(document, 'DOMContentLoaded', buildPanel);
    // 1.7.0: habis update tanpa refresh -> langsung numpang koneksi LiveChat yang udah kebuka
    if (env.sock && env.sock.readyState === 1) attach(env.sock);

    // =================== API buat centang di daftar chat ===================
    const low = (s) => String(s || '').toLowerCase().trim();
    return {
      isOn: () => !!S.on,
      isTracked(id, name) {
        const e = entries().map(low);
        return e.includes(low(id)) || (!!name && e.includes(low(name)));
      },
      toggle(id, name) {
        const e = entries();
        const hit = (x) => low(x) === low(id) || (!!name && low(x) === low(name));
        if (e.some(hit)) {
          S.filterIds = e.filter((x) => !hit(x)).join('\n');
          log(`☐ ${name || id}: auto reply dimatiin`);
        } else {
          S.filterIds = e.concat(id).join('\n');
          if (!S.on) { S.on = true; log('▶️ Auto-reply nyala'); }
          log(`☑ ${name || id}: auto reply aktif`);
        }
        saveS();
        syncFilterBox();
        handled.clear();
        scheduleSweep(200);
      },
    };
  }

  const AR = SITE === 'lc' ? initAutoReply() : null;

  // #####################################################################
  // 2.0.0 JALUR CEK WD: "bridge" = lewat bridge.py (LiveChat & panel UG beda profil/komputer)
  //                     "langsung" (2.1.0, "Tanpa tab") = LiveChat nanya panel UG di belakang layar
  //                     "profil" = LiveChat & panel UG di profil Chrome yang SAMA, tanpa bridge
  //                               (ngobrol lewat penyimpanan Tampermonkey script ini)
  // Dipilih per browser lewat menu ikon slider daftar chat: "Jalur cek WD".
  // #####################################################################
  // timer lewat Worker: Chrome tidak memperlambatnya walau tab panel di belakang / di-minimize
  function every(ms, fn) {
    let stop;
    try {
      const w = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms})`])));
      w.onmessage = () => { if (!stopped) fn(); };
      stop = () => w.terminate();
    } catch (e) { // CSP halaman melarang Worker -> timer biasa
      const id = setInterval(fn, ms);
      stop = () => window.clearInterval(id);
    }
    onStop(stop);
    return stop;
  }

  // ---------- tabel transaksi panel UG (dipakai jalur "1 Profil" & "Tanpa tab") ----------
  // kolom diambil berdasarkan judul header tabel, jadi urutan kolom tidak masalah
  const COLS = {
    username: /user\s*name/i,
    status: /^status/i,
    by: /confirm|reject|approve|process|by/i,
    note: /note|remark|keterangan/i,
    debit: /^debit/i,
    date: /transaction\s*date/i,
  };
  // aturan balasan otomatis berdasarkan withdraw terbaru; yang pertama cocok dipakai
  const RULES = [
    { key: 'dc', test: r => /double\s*confirm/i.test(r.status) },
    { key: 'wal', test: r => /gangguan\s*wd|metode\s*bank\s*atau\s*e-?wallet\s*lain/i.test(r.note) },
  ];
  const cellTxt = (c) => ((c && (c.innerText || c.textContent)) || '').trim();
  function scrapeRows(root, user) {
    for (const t of root.querySelectorAll('table')) {
      const heads = [...t.querySelectorAll('thead th')].map(cellTxt);
      const idx = {};
      for (const k in COLS) idx[k] = heads.findIndex(h => COLS[k].test(h));
      if (idx.username < 0 || idx.status < 0) continue;
      return [...t.querySelectorAll('tbody tr')]
        .filter(tr => tr.cells.length > 1 && cellTxt(tr.cells[idx.username]).toLowerCase() === user.toLowerCase())
        .map(tr => {
          const get = k => idx[k] >= 0 ? cellTxt(tr.cells[idx[k]]) : '';
          return { status: get('status'), by: get('by'), note: get('note'), debit: get('debit'), date: get('date').replace(/^Game Wallet\s*/i, '').slice(0, 19) };
        });
    }
    return null; // tabel belum ada
  }
  // withdraw = baris dengan Debit bukan 0; tabel urut terbaru di atas, jadi ambil yang pertama
  const latestWD = rows => (rows || []).filter(r => r.debit && !/^0(\.0+)?$/.test(r.debit.replace(/,/g, ''))).slice(0, 1);

  const WDQ = (() => {
    const BR = 'http://127.0.0.1:8765';
    const P = 'wdq|', R = 'wdres|', UMUR = 5 * 60000;   // antrean lebih tua dari 5 menit dibuang
    // 2.4.0: cuma 2 jalur. 1 Profil = cek di belakang layar (dulu "Tanpa tab"); nilai lama 'profil' ikut jadi itu
    const jalur = () => { const v = GM_getValue('wdJalur', 'bridge'); return v === 'profil' ? 'langsung' : v; };
    const gx = (method, url, body) => new Promise((res, rej) => GM_xmlhttpRequest({
      method, url, timeout: 5000, headers: { 'Content-Type': 'application/json' },
      data: body ? JSON.stringify(body) : undefined,
      onload: (r) => { try { res(JSON.parse(r.responseText) || {}); } catch (e) { res({}); } },
      onerror: () => rej(new Error('bridge mati? jalankan bridge.py')), ontimeout: () => rej(new Error('bridge timeout')),
    }));
    // ---------- 2.1.0 jalur "langsung" (Tanpa tab): tanya panel UG di belakang layar ----------
    // pakai sesi login panel UG di Chrome ini; tab panel ga perlu kebuka. Alamat panel kecatat otomatis
    // waktu halaman transaction panel UG pernah dibuka sekali di profil ini.
    let tok = '';
    const gt = (method, url, data) => new Promise((res, rej) => GM_xmlhttpRequest({
      method, url, data, timeout: 15000, anonymous: false,   // pakai cookie login panel di Chrome ini
      headers: data ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' } : {},
      onload: res, onerror: () => rej(new Error('panel UG ga bisa dihubungi')), ontimeout: () => rej(new Error('panel UG timeout')),
    }));
    const parse = (html) => new DOMParser().parseFromString(html || '', 'text/html');
    async function token(base) {
      const r = await gt('GET', base + '/transaction');
      const d = parse(r.responseText);
      const t = d.querySelector('input[name="_token"]');
      if (t && d.getElementById('lahanat_member')) return (tok = t.value);
      // 2.3.1: diagnosa - panel ngasih apa sebenarnya
      let path = '';
      try { const u = new URL(r.finalUrl || base); path = (u.origin !== base ? u.host : '') + u.pathname; } catch (e) { /* */ }
      const info = `HTTP ${r.status || '?'} ${path} "${(d.title || '').trim().slice(0, 40)}"`;
      console.log('%c[WD] panel ngasih:', 'color:#c00', info, (r.responseText || '').slice(0, 300));
      if (d.querySelector('input[name="p"], input[type="password"]'))
        throw new Error('panel UG belum login: dilempar ke halaman login (' + info + ')');
      throw new Error('halaman panel ga dikenal (' + info + ') - alamat panel bener?');
    }
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    // isi persis kayak form Search panel (rentang default panel: kemarin 00:00 - hari ini 23:59)
    async function cari(base, user, recordType) {
      for (let i = 0; i < 2; i++) {
        if (!tok || i) await token(base);
        const now = new Date(), kmrn = new Date(Date.now() - 86400000);
        const body = new URLSearchParams([['promo_data', '1'], ['show_subsidi', '0'], ['_token', tok],
          ['daterange', ymd(kmrn) + '  00:00:00 - ' + ymd(now) + '  23:59:59'], ['_token', tok], ['recordType', recordType],
          ['all', '0'], ['form_option', 'user_name'], ['agent_id', ''], ['user_name', user], ['acc_name', ''], ['acc_num', ''],
          ['transaction_id', ''], ['ref_id', ''], ['ref_no', ''], ['status', 'all'], ['approved_user', ''], ['show_promotion', 'on']]);
        const rows = scrapeRows(parse((await gt('POST', base + '/transaction_ajax', body.toString())).responseText), user);
        if (rows) return rows;   // tabel ga ada -> token basi / sesi habis: ambil token baru, coba sekali lagi
      }
      throw new Error('panel UG ga ngasih tabel (sesi habis? login ulang di panel)');
    }
    async function lookup(user) {
      const base = GM_getValue('wdPanelUrl', '');
      if (!base) throw new Error('alamat panel UG belum diisi (menu Tampermonkey > 🔗 Atur alamat panel UG)');
      let wd = latestWD(await cari(base, user, '1'));            // 1 = Debit (cuma withdraw)
      if (!wd.length) wd = latestWD(await cari(base, user, '')); // jaga-jaga: semua transaksi, cara lama
      return Object.assign({ user, found: !!wd[0], ts: Date.now() }, wd[0] || {});
    }
    const keys = (q) => GM_listValues().filter((k) => k.startsWith(P + q + '|')).sort();
    return {
      jalur,
      setJalur: (v) => GM_setValue('wdJalur', v),
      // q: '' = antrean cari di panel, 'dc' / 'wal' = antrean balasan
      async push(q, user) {
        if (jalur() === 'bridge') return gx('POST', BR + '/push' + (q ? '/' + q : ''), { user });
        // tiap item 1 key sendiri, biar tab LiveChat & tab panel ga saling timpa
        if (keys(q).some((k) => GM_getValue(k, '') === user)) return;
        GM_setValue(P + q + '|' + Date.now() + '|' + Math.random().toString(36).slice(2, 6), user);
      },
      async pull(q) {
        if (jalur() === 'bridge') return (await gx('GET', BR + '/pull' + (q ? '/' + q : ''))).user || '';
        for (const k of keys(q)) {
          const u = GM_getValue(k, '');
          GM_deleteValue(k);
          if (u && Date.now() - (+k.split('|')[2] || 0) < UMUR) return u;
        }
        return '';
      },
      async setResult(user, r) {
        if (jalur() === 'bridge') return gx('POST', BR + '/result', Object.assign({ user }, r));
        const now = Date.now();
        for (const k of GM_listValues()) if (k.startsWith(R) && now - ((GM_getValue(k, {}) || {}).ts || 0) > 6 * 3600000) GM_deleteValue(k);
        GM_setValue(R + user.toLowerCase(), Object.assign({ user }, r, { ts: now }));
      },
      async result(user) {
        if (jalur() === 'bridge') return gx('GET', BR + '/result?user=' + encodeURIComponent(user));
        return GM_getValue(R + user.toLowerCase(), {}) || {};
      },
      lookup,
      bridge: (method, path, body) => gx(method, BR + path, body),   // 2.3.0: buat halaman worker
    };
  })();

  // #####################################################################
  // BAGIAN D: CEK WITHDRAW + AUTO BALAS #dc / #wal (hanya LiveChat)  - 1.8.0
  // - pesan customer berisi wd/withdraw di chat MANA PUN -> username dikirim ke panel (bridge.py)
  // - panel taruh username di antrean /pull/dc atau /pull/wal -> teksnya dikirim ke chat itu
  // Cuma tab pengirim yang jalan (biar ga dobel kalau LiveChat kebuka di banyak tab).
  // #####################################################################
  function initWD() {
    const W = PW;
    const WD_AKTIF = true;
    // withdraw + salah ketik (widraw, witdraw, withdrw), wd/wdnya/wd2, tarik/penarikan
    const WD = /\bwd|w\w{0,3}dr\w?w|\btarik|penarikan/i;
    const ONLY_MINE = true; // cuma chat yang lagi dipegang akun lo
    // isi canned response #dc (dikirim lewat koneksi, jadi shortcut #dc tidak bisa dipakai di sini)
    const DC_TEXT = `Hallo bosskuu 🙌✨

Untuk ID Anda, saat ini proses withdraw sedang berjalan melalui sistem auto withdraw ya bossku 💸

Namun, saat ini sedang ada kendala pada sistem auto withdraw ⚠️
Jika sistem sudah kembali normal, withdraw Anda akan langsung diproses ke nomor e-wallet / rekening yang terdaftar di ID Anda ✅✨

Apabila sistem masih belum normal, maka withdraw akan otomatis direject dan saldo akan kembali masuk ke ID Anda ya bossku 👍😊

Mohon ditunggu ya bosskuu 🙏
Terima kasih atas pengertiannya 🔥`;
    // isi canned response #wal
    const WAL_TEXT = `Mohon maaf atas ketidaknyamanannya, bossku 🙏

Untuk saat ini, transaksi withdraw melalui BCA, BNI, BRI, MANDIRI, BSI dan SEABANK sedang mengalami gangguan/offline sementara ya, bossku.

Kami sarankan bossku untuk menggunakan rekening Bank atau E-Wallet alternatif yang tersedia agar proses withdraw dapat tetap dilakukan tanpa harus menunggu layanan kembali normal.

E-Wallet yang dapat digunakan:
- DANA
- GOPAY
- LINKAJA
- OVO
- SHOPEEPAY

Jika bossku ingin menggunakan rekening Bank atau E-Wallet alternatif, silakan berikan nomor rekening/nomor HP dengan nama pemilik yang sama agar dapat kami bantu tambahkan ke akun bossku ya 😉

Terima kasih atas pengertian dan kesabarannya, bossku ❤️`;
    // kunci antrean dari panel -> teks yang dikirim
    const REPLIES = { dc: DC_TEXT, wal: WAL_TEXT };
    // 2.4.0: false = #dc / #wal TIDAK dikirim otomatis; Cek WD cuma nampilin hasil. true = nyalain lagi.
    const AUTO_BALAS = false;

    if (!WD_AKTIF) return null;
    // tab pengirim diatur bagian Sapaan; kalau Sapaan mati, tab ini dianggap pengirim
    const leader = () => !SAPA || SAPA.isLeader();
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ---------- badge status (kiri bawah) ----------
    let badge = null, lastLog = 'nunggu koneksi LiveChat...';
    const log = t => {
      lastLog = new Date().toTimeString().slice(0, 8) + ' ' + t;
      console.log('%c[WD]', 'color:#0a0;font-weight:bold', t);
      if (badge) badge.textContent = '[WD] ' + lastLog;
    };
    const mkBadge = () => {
      badge = document.createElement('div');
      badge.id = 'csw-wd-badge';
      badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:#222;color:#0f0;font:11px monospace;' +
        'padding:3px 6px;border-radius:4px;opacity:.85;pointer-events:none;max-width:60vw;white-space:nowrap;overflow:hidden';
      badge.textContent = '[WD] ' + lastLog;
      document.body.appendChild(badge);
    };
    if (document.body) mkBadge(); else on(document, 'DOMContentLoaded', mkBadge);
    onStop(() => { if (badge) badge.remove(); });

    // ---------- numpang koneksi WebSocket LiveChat ----------
    let sock = null, myId = GM_getValue('myId', null), reqN = 0;
    const pend = new Map();
    const proto = W.WebSocket.prototype;
    const origSend = proto.send;
    proto.send = function () {
      try { if (!stopped && this !== sock && /\/agent\/rtm\//.test(String(this.url))) attach(this); } catch (e) {}
      return origSend.apply(this, arguments);
    };
    const mySend = proto.send;
    onStop(() => { if (proto.send === mySend) proto.send = origSend; });

    function attach(ws) {
      sock = ws;
      env.sock = ws;
      const onClose = () => { if (sock === ws) { sock = null; log('koneksi putus, nunggu LiveChat nyambung lagi'); } };
      ws.addEventListener('message', onMsg);
      ws.addEventListener('close', onClose);
      onStop(() => { ws.removeEventListener('message', onMsg); ws.removeEventListener('close', onClose); });
      log('terhubung');
    }
    function rtm(action, payload, timeout = 15000) {
      return new Promise((res, rej) => {
        if (stopped || !sock || sock.readyState !== 1) return rej(new Error('koneksi belum siap'));
        const id = 'wd_' + ++reqN + '_' + Date.now();
        pend.set(id, { res, rej });
        setTimeout(() => { if (pend.delete(id)) rej(new Error('timeout ' + action)); }, timeout);
        origSend.call(sock, JSON.stringify({ request_id: id, action, payload }));
      });
    }

    // ---------- data chat ----------
    const userChat = new Map(); // username (huruf kecil) -> chat_id
    // username = jawaban "USER ID" di pre-chat form; kalau tidak ada, nama customer
    function usernameOf(chat, events) {
      const forms = (events || []).filter(e => e.type === 'filled_form');
      const f = chat.last_event_per_type?.filled_form?.event;
      if (f) forms.push(f);
      for (const ev of forms)
        for (const fl of ev.fields || [])
          if (/user\s*id|username/i.test(fl.label || '') && typeof fl.answer === 'string' && fl.answer.trim()) return fl.answer.trim();
      return (chat.users || []).find(u => u.type === 'customer')?.name || '';
    }
    const formText = events => (events || []).filter(e => e.type === 'filled_form')
      .flatMap(e => (e.fields || []).map(f => (f.answer && (f.answer.label || f.answer)) || '')).join(' ');
    const mine = users => !ONLY_MINE || (!!myId && (users || []).some(u => u.id === myId && u.present !== false));

    function onMsg(ev) {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.request_id && pend.has(m.request_id)) {
        const p = pend.get(m.request_id);
        pend.delete(m.request_id);
        if (m.success === false) p.rej(new Error(m.payload?.error?.message || 'error'));
        else p.res(m.payload || {});
        return;
      }
      if (m.action === 'login' && m.type === 'response' && m.payload?.my_profile?.id) {
        myId = m.payload.my_profile.id;
        log('akun agent kebaca, siap jalan di belakang layar');
      }
      if (m.type !== 'push' || !leader()) return;
      const p = m.payload || {};
      // chat baru: pre-chat "Layanan = Withdraw"
      if (m.action === 'incoming_chat' && p.chat) {
        const c = p.chat, evs = c.thread?.events || [];
        if (WD.test(formText(evs))) check(c.id, 'pre-chat withdraw');
      }
      // pesan baru di chat mana pun
      if (m.action === 'incoming_event' && p.event?.type === 'message' && WD.test(p.event.text || '')) {
        check(p.chat_id, '"' + p.event.text.slice(0, 20) + '"', p.event.author_id);
      }
    }

    // pastikan pesan dari customer & chat ini punya lo, lalu kirim username ke panel
    async function check(chatId, why, authorId) {
      try {
        const ch = await rtm('get_chat', { chat_id: chatId });
        const cust = (ch.users || []).find(u => u.type === 'customer');
        if (!cust || (authorId && authorId !== cust.id)) return; // pesan dari agent (mis. teks #dc) tidak dihitung
        if (!mine(ch.users)) return;
        const user = usernameOf(ch, ch.thread?.events);
        if (!user) return log('username tidak ketemu di chat ' + chatId);
        userChat.set(user.toLowerCase(), chatId);
        push(user, why);
      } catch (e) { log('gagal baca chat: ' + e.message); }
    }

    // username sama tidak dikirim ulang dalam 60 detik
    const lastPush = new Map();
    function push(user, why) {
      const k = user.toLowerCase();
      if (Date.now() - (lastPush.get(k) || 0) < 60000) return;
      lastPush.set(k, Date.now());
      if (WDQ.jalur() === 'langsung') {
        log('cek ' + user + ' (' + why + ', tanpa tab)');
        viaLangsung(user, userChat.get(k))
          .then((r) => log(user + ': ' + (r.found ? r.status + (r.note ? ' · ' + r.note : '') : 'tidak ada withdraw')))
          .catch((e) => { lastPush.delete(k); log('⚠️ ' + e.message); });
        return;
      }
      WDQ.push('', user).catch((e) => { lastPush.delete(k); log(e.message); });
      log('cek ' + user + ' (' + why + ')');
    }

    // 2.1.0 jalur "Tanpa tab": cari langsung ke panel, tampilkan di samping Cek WD, jalankan aturan #dc / #wal
    async function viaLangsung(user, chatId) {
      const r = await WDQ.lookup(user);
      if (chatId) { const l = wdLabel(r); set(chatId, l.html, l.title); }
      const rule = AUTO_BALAS && r.found && RULES.find((x) => x.test(r));
      if (rule) sendReply(user, rule.key);
      return r;
    }

    // ---------- balas #dc / #wal ----------
    const replyDone = new Set(); // "kunci|thread" yang sudah dikirimi
    async function sendReply(user, key) {
      const tag = '#' + key;
      try {
        let chatId = userChat.get(user.toLowerCase());
        if (!chatId) { // belum kenal (mis. tab baru di-refresh): cari di daftar chat
          const r = await rtm('list_chats', { limit: 100 });
          const c = (r.chats_summary || []).find(c => usernameOf(c).toLowerCase() === user.toLowerCase());
          chatId = c?.id;
        }
        if (!chatId) return log(tag + ' batal: chat ' + user + ' tidak ketemu');
        const ch = await rtm('get_chat', { chat_id: chatId });
        const t = ch.thread || {};
        if (t.active === false) return log(tag + ' batal: chat ' + user + ' sudah selesai');
        if (!mine(ch.users)) return log(tag + ' batal: chat ' + user + ' bukan punya lo');
        if (replyDone.has(key + '|' + t.id)) return log(tag + ' sudah pernah dikirim ke ' + user);
        replyDone.add(key + '|' + t.id);
        await rtm('send_event', { chat_id: chatId, event: { type: 'message', text: REPLIES[key], visibility: 'all' } });
        log('✅ ' + tag + ' terkirim ke ' + user);
      } catch (e) { log('⚠️ ' + tag + ' gagal ke ' + user + ': ' + e.message); }
    }

    // ambil antrean balasan dari panel (satu antrean per kunci: /pull/dc, /pull/wal)
    // cuma tab pengirim yang ngambil, biar antrean ga "dimakan" tab lain.
    // 2.4.0: AUTO_BALAS = false -> antrean cuma dibuang (hasil tetap tampil di samping Cek WD), ga ada yang dikirim
    setInterval(async () => {
      if (!sock || !leader()) return;
      for (const key of Object.keys(REPLIES)) {
        try {
          const user = await WDQ.pull(key);
          if (user && !stopped && AUTO_BALAS) sendReply(user, key);
        } catch (e) { /* bridge mati */ }
      }
    }, 2000);

    // ---------- 1.9.0: tombol Cek WD di header chat (samping nama customer) ----------
    // klik -> username dikirim ke panel UG -> hasil (pending / success / reject + note) tampil di sampingnya
    const cekRes = new Map();   // chat_id -> { html, title } hasil terakhir (balik lagi pas chat dibuka ulang)
    const chatIdNow = () => (location.pathname.match(/\/chats\/([^/?#]+)/) || [])[1] || '';
    const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function wdLabel(r) {
      if (r.error) return { html: `<span style="color:#ff6b6b">⚠️ ${escH(r.error)}</span>`, title: '' };
      if (!r.found) return { html: '<span style="color:#aaa">❓ tidak ada withdraw</span>', title: '' };
      const s = r.status || '-';
      const title = [r.debit && 'Debit: ' + r.debit, r.date && 'Tgl: ' + r.date, r.by && 'Oleh: ' + r.by, r.note && 'Note: ' + r.note].filter(Boolean).join('\n');
      if (/reject|tolak|cancel|decline|fail|gagal/i.test(s))
        return { html: `<span style="color:#ff6b6b">❌ ${escH(s)}</span>` + (r.note ? `<span style="color:#ffb3b3"> · ${escH(r.note)}</span>` : ''), title };
      if (/pending|double\s*confirm|process|wait|proses/i.test(s)) return { html: `<span style="color:#fbbf24">⏳ ${escH(s)}</span>`, title };
      if (/success|sukses|berhasil|approve|complete|done|confirm/i.test(s)) return { html: `<span style="color:#4ade80">✅ ${escH(s)}</span>`, title };
      return { html: `<span style="color:#ddd">${escH(s)}</span>`, title };
    }
    let cekEl = null, cekChat = '';
    function cekShow(chatId, html, title = '') {
      if (chatId === chatIdNow() && cekEl) { const o = cekEl.querySelector('.res'); o.innerHTML = html; o.title = title; }
    }
    function cekInject() {
      const h = document.querySelector('[data-testid="feed-container"] h4');
      if (!h) return;
      // nama aslinya melebar penuh -> dibikin selebar teksnya biar tombol nempel di samping nama
      if (h.style.width !== 'auto') { h.style.width = 'auto'; h.style.flex = '0 1 auto'; }
      if (!cekEl) {
        cekEl = document.createElement('span');
        cekEl.id = 'csw-wd-cek';
        cekEl.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:10px;font:600 12px system-ui,sans-serif;min-width:0;overflow:hidden;white-space:nowrap';
        cekEl.innerHTML = '<button type="button" style="border:0;border-radius:999px;padding:4px 10px;cursor:pointer;font:inherit;background:#2f6fed;color:#fff;flex:none">Cek WD</button><span class="res" style="overflow:hidden;text-overflow:ellipsis"></span>';
        cekEl.querySelector('button').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); cekWD(); });
      }
      if (h.nextSibling !== cekEl) h.after(cekEl);
      const id = chatIdNow();
      if (id !== cekChat) {          // ganti chat -> tampilkan hasil terakhir chat itu (kalau ada)
        cekChat = id;
        const r = cekRes.get(id);
        cekShow(id, r ? r.html : '', r ? r.title : '');
      }
    }
    setInterval(() => { try { cekInject(); } catch (e) { /* */ } }, 700);
    onStop(() => {
      if (cekEl) cekEl.remove();
      const h = document.querySelector('[data-testid="feed-container"] h4');
      if (h) { h.style.removeProperty('width'); h.style.removeProperty('flex'); }
    });

    const set = (chatId, html, title) => { cekRes.set(chatId, { html, title }); cekShow(chatId, html, title); };
    async function cekWD() {
      const chatId = chatIdNow();
      if (!chatId) return;
      if (!sock) return set(chatId, '<span style="color:#ff6b6b">koneksi LiveChat belum siap</span>');
      set(chatId, '<span style="color:#aaa">⏳ mencari...</span>');
      try {
        const ch = await rtm('get_chat', { chat_id: chatId });
        const user = usernameOf(ch, ch.thread?.events);
        if (!user) return set(chatId, '<span style="color:#ff6b6b">username tidak ketemu</span>');
        userChat.set(user.toLowerCase(), chatId);
        lastPush.set(user.toLowerCase(), Date.now());   // biar deteksi otomatis ga ngirim dobel
        if (WDQ.jalur() === 'langsung') {
          set(chatId, `<span style="color:#aaa">⏳ cek ${escH(user)} di panel...</span>`);
          log('Cek WD ' + user + ' (tombol, tanpa tab)');
          await viaLangsung(user, chatId);
          return;
        }
        const t0 = Date.now() - 2000;
        await WDQ.push('', user);
        set(chatId, `<span style="color:#aaa">⏳ cek ${escH(user)} di panel...</span>`);
        log('Cek WD ' + user + ' (tombol)');
        for (let i = 0; i < 45 && !stopped; i++) {       // panel butuh ±2-17 dtk
          await sleep(1000);
          const r = await WDQ.result(user);
          if (r && r.ts >= t0) { const l = wdLabel(r); return set(chatId, l.html, l.title); }
        }
        set(chatId, '<span style="color:#ff6b6b">panel UG ga jawab (' + (WDQ.jalur() === 'profil'
          ? 'tab panel UG kebuka di profil Chrome ini?' : 'tab panel kebuka? bridge jalan?') + ')</span>');
      } catch (e) { set(chatId, `<span style="color:#ff6b6b">⚠️ ${escH(e.message)}</span>`); }
    }

    // habis update tanpa refresh -> langsung numpang koneksi LiveChat yang udah kebuka
    if (env.sock && env.sock.readyState === 1) attach(env.sock);
    return {};
  }

  const WDX = SITE === 'lc' ? initWD() : null;

  // #####################################################################
  // BAGIAN E: PANEL UG - 2.4.0: semua jalur cek di belakang layar, halaman panel cuma nyatet alamatnya
  // (biar ga perlu diisi manual). Nyari lewat tab panel udah ga dipakai lagi.
  // #####################################################################
  function initPanelUG() {
    GM_setValue('wdPanelUrl', location.origin);
    return {};
  }
  const PUG = SITE === 'ug' ? initPanelUG() : null;

  // #####################################################################
  // BAGIAN F: WORKER BRIDGE (2.3.0) - halaman http://127.0.0.1:8765/worker dibuka di PROFIL PANEL UG
  // Ganti tab transaction: ambil antrean dari bridge, tanya panel UG di belakang layar pakai login panel
  // di profil ini, kirim hasil + aturan #dc / #wal balik ke bridge. LiveChat tetap jalur "Bridge".
  // #####################################################################
  function initWorker() {
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    document.title = 'CS Helper - Worker WD';
    document.body.style.cssText = 'margin:0;background:#1f2229;color:#eee;font:13px system-ui,sans-serif';
    document.body.innerHTML = `<div style="max-width:720px;margin:24px auto;padding:0 16px">
      <h2 style="margin:0 0 4px">🔎 Worker Cek WD</h2>
      <div style="color:#aaa;margin-bottom:12px">Biarkan tab ini terbuka di profil panel UG (boleh di-pin / di belakang). Halaman panel tidak perlu dibuka.</div>
      <div id="st" style="margin-bottom:10px"></div>
      <div style="margin-bottom:12px">Alamat panel UG: <input id="url" style="width:260px;background:#2b2f38;color:#eee;border:1px solid #555;border-radius:4px;padding:3px 6px">
        <button id="save" style="border:0;border-radius:999px;padding:4px 12px;background:#2f6fed;color:#fff;cursor:pointer">Simpan</button></div>
      <pre id="log" style="background:#15171c;border-radius:6px;padding:8px;min-height:200px;white-space:pre-wrap;font:12px monospace;color:#ccc"></pre></div>`;
    const $ = (id) => document.getElementById(id);
    $('url').value = GM_getValue('wdPanelUrl', '');
    $('save').onclick = () => {
      const v = $('url').value.trim();
      try { GM_setValue('wdPanelUrl', new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v).origin); $('url').value = GM_getValue('wdPanelUrl', ''); log('alamat panel disimpan'); }
      catch (e) { log('⚠️ alamat tidak valid'); }
    };
    const logs = [];
    function log(t) {
      logs.unshift(new Date().toTimeString().slice(0, 8) + ' ' + t);
      logs.length = Math.min(logs.length, 100);
      $('log').textContent = logs.join('\n');
    }
    const status = (t) => { if ($('st').textContent !== t) $('st').textContent = t; };
    onStop(() => { document.body.innerHTML = '<p style="font:13px sans-serif">CS Helper lagi di-update...</p>'; });

    let busy = false;
    every(2000, async () => {
      if (busy) return;
      busy = true;
      try {
        const { user } = await WDQ.bridge('GET', '/pull');
        status(GM_getValue('wdPanelUrl', '') ? '🟢 Nyambung ke bridge, nunggu antrean' : '🟡 Isi alamat panel UG dulu');
        if (user && !stopped) {
          log('cari ' + user + '...');
          let r;
          try { r = await WDQ.lookup(user); }
          catch (e) { r = { user, found: false, error: e.message }; }
          await WDQ.bridge('POST', '/result', r);
          const rule = r.found && RULES.find((x) => x.test(r));
          if (rule) await WDQ.bridge('POST', '/push/' + rule.key, { user });
          log(user + ': ' + (r.error ? '⚠️ ' + r.error : r.found ? r.status + (r.note ? ' · ' + r.note : '') : 'tidak ada withdraw')
            + (rule ? '  → #' + rule.key : ''));
        }
      } catch (e) { status('🔴 Bridge mati? jalankan bridge.py'); }
      busy = false;
    });
    log('worker siap');
    return {};
  }
  const WRK = SITE === 'worker' ? initWorker() : null;

  // #####################################################################
  // BAGIAN B: CS INBOX HELPER (LiveChat & Text)
  // Butuh <body>, jadi dijalankan sesudah halaman siap.
  // #####################################################################
  function initInbox() {
    if (stopped || window.__csInboxHelper) return;
    window.__csInboxHelper = true;
    onStop(() => { window.__csInboxHelper = false; });

    // 1.7.2: bagian ini disamakan dengan "Inbox Helper (LiveChat & Text)" 1.4.10 (pemilik):
    // baca memori aplikasi (LiveChat Redux / Text react-query) buat status dibalas & jam pesan persis, cuma chat di "My chats",
    // timer ga loncat (ageWin), kedip lebih ringan, Alt+↑/↓ pakai hasil pindai terakhir, menu setelan rapi.

    // ===================== PENGATURAN =====================
    const AUTO_JEDA = 800;     // auto-tutup: tunggu sebentar sesudah chat jadi Archived (ms)
    const AUTO_BUKA = true;    // 1.7.3: chat Archived yang LAGI DIBUKA juga ikut di-clear (false = dibiarin)
    const AUTO_JEDA_BUKA = 3000; // 1.7.3: jeda buat chat yang lagi dibuka (ms), biar sempat kebaca
    const SIMPAN_JAM = 24;     // catatan jam masuk per chat disimpan 24 jam
    const SAPA_DOM_MAX = 120;  // 1.4.0: "Transferred - by" di daftar disapa kalau umurnya <= ini (detik)
    const DEBUG = false;

    const KEY = 'csInboxHelper.v1';
    const KEY_AUTO = 'csInboxHelper.auto';
    const KEY_SET = 'csInboxHelper.set';      // 1.1.0 setelan
    const ARCH_RE = /^\s*archived\s*[-–—]/i;          // "Archived - 3 min inactivity"
    // chat selesai: teks "Archived - ..." ATAU (LiveChat) status chat di memori aplikasi = 2 (ditutup)
    const isDone = (it) => it.archived && (ARCH_RE.test(it.text) || it.closed);
    const TRF_RE = /^\s*transferred\s*[-–—]/i;        // "Transferred - by Lily to CS ..."
    const AGE_RE = /^(\d+)\s*(s|m|h|d)$/i;                      // label jam di daftar: 6s / 2m / 1h
    const UNIT = { s: 1, m: 60, h: 3600, d: 86400 };
    const X_PATHS = ['m6 6 12 12m0-12L6 18', 'M18 6L6 18M6 6L18 18', 'M6 18L18 6M6 6L18 18',
      'M18 6L6 18M6 6l12 12', 'M6 18L18 6M6 6l12 12'];
    // memori React cuma kebaca dari dokumen halaman asli (script ini pakai @grant)
    const PD = PW.document || document;

    const log = (...a) => { if (DEBUG) console.log('[CS Inbox]', ...a); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const txt = (el) => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();

    // ---------- bantuan ----------
    function ageNode(root, skip) {        // elemen label jam "25s" / "2m" / "1h" di item daftar
      if (!root) return null;
      for (const e of root.querySelectorAll('span,div,p')) {
        if (e.children.length || (skip && e.closest(skip))) continue;
        if (AGE_RE.test(e.textContent.trim())) return e;
      }
      return null;
    }
    function ageOf(el) {                  // detik dari label jam (batas bawah: "1m" = 60)
      const m = el && AGE_RE.exec(el.textContent.trim());
      return m ? +m[1] * UNIT[m[2].toLowerCase()] : 0;
    }
    // "1m" = 60..119 dtk dan label bawaan diperbarui telat -> timer hanya disetel ulang kalau keluar dari rentang ini
    const SLACK = { s: 5, m: 60, h: 600, d: 3600 };
    function ageWin(el) {
      const m = el && AGE_RE.exec(el.textContent.trim());
      if (!m) return null;
      const u = m[2].toLowerCase(), lo = +m[1] * UNIT[u];
      return { lo, hi: lo + UNIT[u], slack: SLACK[u] };
    }
    function isX(btn) {
      const lab = [btn.getAttribute('aria-label'), btn.getAttribute('title'), btn.getAttribute('data-testid')].join(' ');
      if (/close|remove|dismiss|hapus|tutup/i.test(lab)) return true;
      return [...btn.querySelectorAll('path')].some((p) => X_PATHS.includes((p.getAttribute('d') || '').trim()));
    }
    function findX(root, skipLabel) {
      for (const b of root.querySelectorAll('button')) {
        if (skipLabel && b.getAttribute('aria-label') === skipLabel) continue;
        if (isX(b)) return b;
      }
      return null;
    }
    function dirFrom(root) {              // 1 = Oldest (lama di atas), -1 = Newest
      if (!root) return 0;
      for (const b of root.querySelectorAll('button')) {
        const t = txt(b);
        if (/^(oldest|terlama)$/i.test(t)) return 1;
        if (/^(newest|terbaru)$/i.test(t)) return -1;
      }
      return 0;
    }
    function fmt(sec) {
      sec = Math.max(0, Math.floor(sec));
      if (sec < 3600) return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      return Math.floor(sec / 3600) + 'j ' + String(Math.floor((sec % 3600) / 60)).padStart(2, '0') + 'm';
    }
    function setAttr(el, k, v) {
      if (v) { if (el.getAttribute(k) !== v) el.setAttribute(k, v); }
      else if (el.hasAttribute(k)) el.removeAttribute(k);
    }

    // ---------- LiveChat (my.livechatinc.com) ----------
    // data chat dari memori aplikasi LiveChat (Redux: entities.chats.threads[threadId] {status 0 aktif / 2 ditutup,
    // currentAgentId}, entities.chats.events.byIds[threadId] {authorType customer|agent, authorId, type, timestampInMs}).
    // HANYA dibaca. Tidak ketemu -> cara lama (ikon ↰ / teks Archived).
    const LCS = { store: null, miss: 0 };
    const LCI = new Map();                // tid -> {th, evs, r}
    function lcStore() {
      const ok = (s) => { try { return !!s.getState().entities.chats.threads; } catch (e) { return false; } };
      if (LCS.store && ok(LCS.store)) return LCS.store;
      LCS.store = null;
      if (Date.now() - LCS.miss < 5000) return null;
      const li = PD.querySelector('li[data-testid^="chat-item-"]');
      const fk = li && Object.keys(li).find((k) => k.startsWith('__reactFiber$'));
      for (let f = fk && li[fk], i = 0; f && i < 400; f = f.return, i++) {
        for (const o of [f.memoizedProps, f.memoizedProps && f.memoizedProps.value]) {
          const s = o && (o.store || o);
          if (s && typeof s.getState === 'function' && ok(s)) return (LCS.store = s);
        }
      }
      LCS.miss = Date.now();
      return null;
    }
    function lcInfo(tid) {
      const s = lcStore();
      if (!s) return null;
      let C;
      try { C = s.getState().entities.chats; } catch (e) { return null; }
      const th = C && C.threads && C.threads[tid];
      if (!th) return null;
      const evs = (C.events && C.events.byIds && C.events.byIds[tid]) || {};
      const hit = LCI.get(tid);                     // data memori tidak berubah (objek sama) -> hasil lama
      if (hit && hit.th === th && hit.evs === evs) return hit.r;
      let last = null;
      for (const e of Object.values(evs)) {
        // hanya pesan yang terlihat member (customer / agent); Internal note (supervisor) & event sistem / rating dilewati
        if (!e || e.isDeleted || (e.authorType !== 'customer' && e.authorType !== 'agent')) continue;
        if (!/^(message|file|rich_message)$/.test(e.type)) continue;
        if (!last || (+e.timestampInMs || 0) > (+last.timestampInMs || 0)) last = e;
      }
      const r = { status: +th.status, cur: th.currentAgentId || '', last };
      if (LCI.size > 500) LCI.clear();
      LCI.set(tid, { th, evs, r });
      return r;
    }
    const LC = {
      items() {
        const out = [];
        const mine = document.querySelector('[data-testid="my-chats"]');
        for (const li of document.querySelectorAll('li[data-testid^="chat-item-"]')) {
          const id = li.getAttribute('data-testid').slice(10);
          const text = txt(li.querySelector('[data-testid="last-message-text"]'));
          const row = li.querySelector('.chat-item') || li;
          const ageEl = ageNode(li, '[data-testid="last-message-text"],[data-testid="visitor-name"]');
          const it = {
            id, wrap: li, el: row, clickEl: row,
            name: txt(li.querySelector('[data-testid="visitor-name"]')), text,
            archived: ARCH_RE.test(text), transfer: TRF_RE.test(text),
            replied: !!li.querySelector('[data-testid="replied"]'),
            // member mengetik -> teks terakhir diganti sneak-peek & ikon replied hilang
            typing: !!li.querySelector('[data-test="typing-indicator"],[data-testid="sneak-peek-text"]'),
            age: ageOf(ageEl), ageEl, nameEl: li.querySelector('[data-testid="visitor-name"]'),
            open: location.pathname.includes('/' + id),
            group: '',
            mine: !mine || mine.contains(li),
          };
          const inf = lcInfo(id);
          if (inf) {
            if (inf.status === 2) { it.archived = true; it.closed = true; }   // 2 = ditutup (This chat has been archived)
            if (inf.last) {
              // sudah dibalas = pesan terakhir dari agent yang memegang chat (pesan bot sebelum transfer TIDAK dihitung)
              it.replied = inf.last.authorType === 'agent' && (!inf.cur || inf.last.authorId === inf.cur);
              it.lastTs = +inf.last.timestampInMs || 0;
              it.fromStore = true;
            }
          }
          out.push(it);
        }
        return out;
      },
      orderBox: () => document.querySelector('[data-testid="my-chats"]'),
      canOrder: () => true,               // daftar LiveChat tidak virtual -> aman diurut ulang
      // bar di baris "My chats (n)"; tidak ada -> di samping judul "Chats"
      header() {
        const t = document.querySelector('[data-testid="my-chats-title"]');
        if (t) return t.closest('button') || t;
        const c = document.getElementById('chats-list-column');
        return c && c.querySelector('h4');
      },
      sortDir: () => dirFrom(document.getElementById('chats-list-column')),
      async close(it) {
        if (!isDone(it)) return false;
        const btn = it.wrap.querySelector('button[data-testid="list-close-chat-button"]') || findX(it.wrap);
        if (!btn) return false;
        btn.click();
        return true;
      },
    };

    // ---------- Text App (www.text.com/app) ----------
    const TX = {
      root: () => document.querySelector('[aria-label="Chat list"]'),
      items() {
        const root = this.root();
        if (!root) return [];
        const out = [];
        const my = this.myGroups(root);
        for (const a of root.querySelectorAll('a[href*="/inbox/chats/"]')) {
          const m = (a.getAttribute('href') || '').match(/\/inbox\/chats\/[^/]+\/([^/?#]+)\/([^/?#]+)/);
          if (!m) continue;
          const card = a.firstElementChild || a;
          const cls = String(card.className || '');
          const text = txt(card.querySelector('[class*="message-list-item-content__text"]'));
          const left = card.querySelector('[class*="message-list-item-content__left-node"]');
          const replied = !!left && [...left.querySelectorAll('path')]
            .some((p) => /^M9 14L5 10/i.test((p.getAttribute('d') || '').trim()));
          const wrap = a.closest('[data-index]') || a;
          const act = card.querySelector('button[aria-label]');
          const ageEl = ageNode(card.querySelector('[class*="message-list-item-header__right-node"]'));
          const it = {
            id: m[2], chatId: m[1], wrap, el: card, clickEl: a,
            name: act ? act.getAttribute('aria-label') : '', text,
            archived: /message-list-item--inactive/.test(cls) || ARCH_RE.test(text),
            transfer: TRF_RE.test(text), replied,
            typing: !!(left && left.querySelector('[class*="typing-indicator"]')),
            age: ageOf(ageEl), ageEl,
            nameEl: card.querySelector('[class*="message-list-item-header__text"] > *')
              || card.querySelector('[class*="message-list-item-header__text"]'),
            open: /message-list-item--active/.test(cls) || a.getAttribute('aria-current') === 'page'
              || location.pathname.includes('/' + m[2]),
            group: wrap.getAttribute('data-item-group-index') || '',
          };
          it.mine = !it.group || !my.known || my.set.has(it.group);
          const inf = txInfo(m[1], m[2]);
          if (inf) { it.replied = inf.replied; it.lastTs = inf.ts; it.fromStore = true; }
          out.push(it);
        }
        return out;
      },
      orderBox() { const r = this.root(); return r && r.querySelector('[data-testid="virtuoso-item-list"]'); },
      // nomor kelompok -> judul "My chats"? (diingat: daftar virtual, judul bisa tergulir keluar layar)
      groups: new Map(),
      myGroups(root) {
        for (const b of root.querySelectorAll('[class*="group-header__button"]')) {
          const w = b.closest('[data-index]');
          if (!w || w.hasAttribute('data-item-group-index') || !w.hasAttribute('data-item-index')) continue;
          this.groups.set(w.getAttribute('data-item-index'), /^\s*my chats\b/i.test(txt(b)));
        }
        const set = new Set([...this.groups].filter(([, v]) => v).map(([k]) => k));
        return { known: set.size > 0, set };
      },
      headerCount() {
        const r = this.root();
        const b = r && (r.querySelector('[class*="chat-list__group-label"]')
          || r.querySelector('[data-testid="virtuoso-top-item-list"] button'));
        const m = b && txt(b).match(/(\d+)\s*$/);
        return m ? +m[1] : null;
      },
      // Daftar Text = daftar virtual: hanya diurut ulang kalau ada di paling atas & semua chat aktif sudah tampil.
      canOrder(box, items) {
        const sc = this.root().querySelector('[data-testid="virtuoso-scroller"]');
        if (sc && sc.scrollTop > 60) return false;
        const ws = [...box.children].filter((w) => w.hasAttribute('data-item-index'));
        if (!ws.length || ws[0].getAttribute('data-item-index') !== '0') return false;
        const g = ws[0].getAttribute('data-item-group-index') || '';
        const g0 = items.filter((it) => it.group === g && it.wrap.parentElement === box);
        const act = g0.filter((it) => !it.archived);
        if (!act.length) return false;
        const idx = (it) => +it.wrap.getAttribute('data-index');
        const last = Math.max(...act.map(idx));
        if (g0.some((it) => it.archived && idx(it) > last)) return true;
        if ((parseFloat(box.style.paddingBottom) || 0) === 0) return true;
        return this.headerCount() === act.length;
      },
      // bar di baris "My chats n ▾" (atau "Chats n"); tidak ada -> di samping judul "All chats"
      header() {
        const r = this.root();
        return (r && (r.querySelector('[class*="group-header__left"] > button')
          || r.querySelector('[class*="chat-list__group-label"]')))
          || document.querySelector('[aria-label="Chat list header"] h5');
      },
      sortDir() { return dirFrom(this.root()); },
      // Text tidak punya tombol ✕. Buang ID chat Archived dari memori react-query daftar chat
      // (hanya di browser ini, TANPA request ke server).
      qc: null,
      findQC() {
        if (this.qc && typeof this.qc.getQueryCache === 'function') return this.qc;
        const root = PD.querySelector('[aria-label="Chat list"]');
        const fk = root && Object.keys(root).find((k) => k.startsWith('__reactFiber$'));
        if (!fk) return null;
        for (let f = root[fk], n = 0; f && n < 800; f = f.return, n++) {
          for (const c of [f.memoizedProps, f.memoizedProps && f.memoizedProps.value]) {
            if (c && typeof c.getQueryCache === 'function') return (this.qc = c);
            if (c && c.client && typeof c.client.getQueryCache === 'function') return (this.qc = c.client);
          }
        }
        return null;
      },
      closeMany(list) {
        const qc = this.findQC();
        if (!qc) return 0;
        const ids = new Set(list.map((it) => it.chatId));
        const idOf = (c) => (typeof c === 'string' ? c : c && (c.id || c.chat_id));
        const gone = new Set();
        try {
          const lists = qc.getQueryCache().getAll().filter((q) => q.queryKey[0] === 'agent-chat-api'
            && q.queryKey[1] === 'chats-summaries' && q.queryKey[2] && typeof q.queryKey[2] === 'object');
          for (const q of lists) {
            qc.setQueryData(q.queryKey, (old) => {
              if (!old || !Array.isArray(old.pages)) return old;
              let changed = false;
              const pages = old.pages.map((pg) => {
                const arr = pg && pg.chats_summary;
                if (!Array.isArray(arr)) return pg;
                const keep = arr.filter((c) => { const id = idOf(c); if (ids.has(id)) { gone.add(id); return false; } return true; });
                if (keep.length === arr.length) return pg;
                changed = true;
                return { ...pg, chats_summary: keep };
              });
              return changed ? { ...old, pages } : old;
            });
          }
        } catch (e) { console.error('[CS Inbox] gagal membersihkan daftar Text', e); }
        return gone.size;
      },
    };

    // Text -> data pesan dari memori aplikasi (HANYA BACA). Kunci: ["agent-chat-api","chats",<chat>,"threads",<sesi>,"events"]
    // = daftar ID pesan, [..,"events",<ID>] = {created_at, visibility all|agents, type, text, author_id, system_message_type},
    // [..,"threads",<sesi>,"users"] = [{id, type customer|agent, name}].
    const TXI = new Map();
    function txInfo(ck, tk) {
      const qc = TX.findQC();
      if (!qc || !ck || !tk) return null;
      const base = ['agent-chat-api', 'chats', ck, 'threads', tk];
      let list;
      try { list = qc.getQueryData([...base, 'events']); } catch (e) { return null; }
      if (!Array.isArray(list) || !list.length) return null;
      const hit = TXI.get(tk);
      if (hit && hit.list === list) return hit.r;            // daftar pesan tidak berubah (objek sama) -> hasil lama
      const typ = {};
      for (const key of [[...base, 'users'], ['agent-chat-api', 'chats', ck, 'users']]) {
        let us = null;
        try { us = qc.getQueryData(key); } catch (e) { /* */ }
        for (const u of Array.isArray(us) ? us : Object.values(us || {})) if (u && u.id && !typ[u.id]) typ[u.id] = u.type;
      }
      const evs = [];
      for (const x of list) {
        let e = x;
        if (typeof x === 'string') { try { e = qc.getQueryData([...base, 'events', x]); } catch (er) { e = null; } }
        if (e && e.created_at) evs.push(e);
      }
      evs.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      let r = null;
      for (let i = evs.length - 1; i >= 0 && !r; i--) {
        const e = evs[i], ts = Date.parse(e.created_at) || 0;
        if (e.type === 'system_message') {
          if (/transfer/i.test(String(e.system_message_type || '') + ' ' + String(e.text || ''))) r = { replied: false, ts };
          continue;
        }
        if (!/^(message|file|rich_message)$/.test(e.type) || e.visibility === 'agents') continue;   // Internal note dilewati
        const t = typ[e.author_id];
        if (t === 'customer') r = { replied: false, ts };
        else if (t === 'agent') r = { replied: true, ts };
      }
      if (TXI.size > 500) TXI.clear();
      TXI.set(tk, { list, r });
      return r;
    }

    const A = SITE === 'text' ? TX : LC;

    // ---------- simpan jam masuk / mulai menunggu ----------
    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    const st = load();
    let lastSave = 0;
    function save(now) {
      if (now - lastSave < 3000) return;
      lastSave = now;
      const cut = now - SIMPAN_JAM * 3600000;
      for (const k of Object.keys(st)) if (!(st[k].s > cut)) delete st[k];
      try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* penuh / diblok */ }
    }
    // setelan per browser: blue = tandai semua yang belum dibalas, red = merah sesudah redMin menit, auto = bersihkan closed
    const cfg = { blue: true, red: true, redMin: 2, auto: true };
    try {
      cfg.auto = localStorage.getItem(KEY_AUTO) !== '0';
      Object.assign(cfg, JSON.parse(localStorage.getItem(KEY_SET)) || {});
    } catch (e) { /* */ }
    function saveCfg() { try { localStorage.setItem(KEY_SET, JSON.stringify(cfg)); } catch (e) { /* */ } }

    // ---------- urutan (CSS order, node React tidak dipindah) ----------
    function applyOrder(box, items, dir) {
      const kids = [...box.children];
      const pos = new Map(kids.map((c, i) => [c, i]));
      const set = (el, v) => { if (el.style.order !== String(v)) el.style.order = String(v); };
      if (box.getAttribute('data-csw-flex') !== '1') box.setAttribute('data-csw-flex', '1');
      kids.forEach((c, i) => set(c, i));
      const groups = new Map();
      for (const it of items) {
        if (it.archived || !pos.has(it.wrap)) continue;
        if (!groups.has(it.group)) groups.set(it.group, []);
        groups.get(it.group).push(it);
      }
      for (const list of groups.values()) {   // chat aktif ditukar di antara posisinya sendiri
        const slots = list.map((it) => pos.get(it.wrap)).sort((a, b) => a - b);
        // chat biasa tetap urutan bawaan LiveChat/Text (jam pertama masuk); chat hasil transfer disisipkan menurut JAM TRANSFER.
        const byPos = (a, b) => pos.get(a.wrap) - pos.get(b.wrap);
        const plain = list.filter((it) => !it.trf).sort(byPos);
        const trf = list.filter((it) => it.trf).sort((a, b) => dir * (a.entry - b.entry) || byPos(a, b));
        const out = [];
        let i = 0, j = 0;
        while (i < plain.length || j < trf.length) {
          if (j < trf.length && (i >= plain.length || dir * (trf[j].entry - plain[i].entry) < 0)) out.push(trf[j++]);
          else out.push(plain[i++]);
        }
        out.forEach((it, k) => set(it.wrap, slots[k]));
      }
    }
    function clearOrder(box) {
      if (!box || box.getAttribute('data-csw-flex') !== '1') return;
      box.removeAttribute('data-csw-flex');
      for (const c of box.children) c.style.removeProperty('order');
    }

    // ---------- tampilan ----------
    const css = document.createElement('style');
    css.id = 'csw-style';
    css.textContent = `
#csw-bar{display:inline-flex;align-items:center;gap:4px;margin:0 6px;flex-wrap:wrap;vertical-align:middle;
  font:600 11px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif}
#csw-bar.csw-float{position:fixed;left:72px;bottom:12px;z-index:2147483000;background:#fff;padding:6px;border-radius:10px;
  box-shadow:0 4px 18px rgba(0,0,0,.18)}
#csw-bar button{border:0;border-radius:999px;padding:4px 9px;cursor:pointer;font:inherit;white-space:nowrap;line-height:1.2}
#csw-bar .csw-need{background:#e3edff;color:#1f5fd6}
#csw-bar .csw-need.red{background:#e5484d;color:#fff;position:relative}
#csw-bar .csw-need.red::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  box-shadow:0 0 0 4px rgba(229,72,77,.25);opacity:0;will-change:opacity;animation:cswPulse 1.6s infinite}
html[data-csw-dark] #csw-bar.csw-float{background:#1f2125;box-shadow:0 4px 18px rgba(0,0,0,.5)}
html[data-csw-dark] #csw-bar .csw-need{background:rgba(92,145,255,.2);color:#9dbdff}
html[data-csw-dark] #csw-bar .csw-need.red{background:#e5484d;color:#fff}
#csw-native{border-top:1px solid rgba(128,128,128,.25);margin-top:4px;padding-top:4px;padding-bottom:4px;cursor:default;
  list-style:none;color:inherit}
#csw-native .r{min-height:var(--csw-h,32px);padding:0 var(--csw-px,16px);box-sizing:border-box;display:flex;align-items:center;
  justify-content:space-between;gap:24px;cursor:pointer;user-select:none}
#csw-native .r:hover{background:rgba(128,128,128,.08)}
#csw-native .t{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;min-width:0;overflow:hidden}
#csw-native input[type=number]{width:28px;height:20px;box-sizing:border-box;padding:0 2px;border:1px solid rgba(128,128,128,.45);
  border-radius:4px;font:inherit;text-align:center;background:transparent;color:inherit;-moz-appearance:textfield}
#csw-native input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
#csw-native .sw{position:relative;width:32px;height:16px;border-radius:999px;background:#8b8f98;border:0;padding:0;flex:none;
  cursor:pointer;transition:background .15s}
#csw-native .sw::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;
  transition:transform .15s}
#csw-native .sw[aria-checked="true"]{background:#00893C}
#csw-native .sw[aria-checked="true"]::after{transform:translateX(16px)}
#csw-native .r.u{cursor:default}
#csw-native .r.u .t{opacity:.8}
#csw-native .r.u button,#csw-native .mode{border:0;border-radius:999px;padding:3px 10px;font:inherit;font-weight:600;cursor:pointer;
  white-space:nowrap;background:rgba(128,128,128,.16);color:inherit}
#csw-native .r.u button:disabled{opacity:.45;cursor:default}
#csw-native .mode{background:#8b8f98;color:#fff}
#csw-native .mode[data-m="utama"]{background:#00893C}
#csw-native .mode[data-m="cadangan"]{background:#d97706}
#csw-native .mode[data-m="profil"]{background:#2f6fed}
#csw-native .mode[data-m="langsung"]{background:#16a34a}
.csw-ar{flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:16px;height:16px;
  margin:0 6px;border-radius:4px;border:2px solid #8b8f98;cursor:pointer;vertical-align:middle;
  font:700 11px/1 system-ui,sans-serif;color:#fff;background:transparent}
.csw-ar:hover{border-color:#16a34a}
.csw-ar[aria-checked="true"]{background:#16a34a;border-color:#16a34a}
.csw-ar[aria-checked="true"]::after{content:"✓"}
.csw-ar[aria-checked="true"][data-off]{background:#8b8f98;border-color:#8b8f98}
#csw-ar-nav button{position:relative}
#csw-ar-nav .csw-ar-led{position:absolute;right:6px;bottom:6px;width:8px;height:8px;border-radius:50%;background:#8b8f98;
  box-shadow:0 0 0 2px #000}
#csw-ar-nav button[data-ar="on"] .csw-ar-led{background:#16a34a}
[data-csw="red"]{box-shadow:inset 0 0 0 999px rgba(229,72,77,.06) !important}
[data-csw-row="1"]{display:flex !important;align-items:center;min-width:0}
[data-csw-row="1"] #csw-bar{flex-wrap:nowrap;flex:none}
[data-csw-row="1"] > :not(#csw-bar){white-space:nowrap;flex:none}
[data-csw-row="1"] #csw-bar{gap:3px;margin:0 auto 0 4px}
[data-csw-row="1"] #csw-bar button{padding:3px 7px}
[data-csw-dot]::before{content:"";display:inline-block;width:12px;height:12px;min-width:12px;min-height:12px;flex:none;
  align-self:center;box-sizing:border-box;border-radius:50%;margin-right:6px;vertical-align:-1px;background-clip:padding-box;
  background-color:#2f6fed;border:2px solid rgba(47,111,237,.22)}
[data-csw-dot="red"]::before{background-color:#e5484d;border-color:rgba(229,72,77,.5);will-change:opacity;animation:cswDot 1.6s infinite}
html[data-csw-dark] [data-csw-dot="blue"]::before{background-color:#5c91ff;border-color:rgba(92,145,255,.3)}
[data-csw][data-csw-t]::after{content:attr(data-csw-t);position:absolute;right:var(--csw-r,12px);top:50%;transform:translateY(-50%);
  z-index:3;pointer-events:none;white-space:nowrap;padding:2px 7px;border-radius:999px;
  font:600 var(--csw-fs,12px)/1.25 system-ui,-apple-system,"Segoe UI",sans-serif;background:#e6eefd;color:#1f5fd6}
[data-csw="red"][data-csw-t]::after{background:#e5484d;color:#fff}
html[data-csw-dark] [data-csw][data-csw-t]::after{background:#24324d;color:#9dbdff}
html[data-csw-dark] [data-csw="red"][data-csw-t]::after{background:#e5484d;color:#fff}
[data-csw-hide]{font-size:0 !important}
[data-csw-flex="1"]{display:flex !important;flex-direction:column !important}
@keyframes cswPulse{50%{opacity:1}}
@keyframes cswDot{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){#csw-bar .csw-need.red::after,[data-csw-dot="red"]::before{animation:none}}`;
    (document.head || document.documentElement).appendChild(css);

    let bar = null, needBtn, nat = null;
    let busy = false, closeMiss = false, archN = 0;
    // setelan masuk ke menu bawaan (ikon slider daftar chat): <li id=csw-native> sendiri di akhir ul[role=menu]
    function natHtml() {
      const sw = (k) => `<button type="button" role="switch" class="sw" data-k="${k}"></button>`;
      return '<div class="r" data-row="blue" title="Tandai biru semua chat yang belum dibalas"><span class="t">Belum dibalas</span>'
        + sw('blue') + '</div>'
        + '<div class="r" data-row="red" title="Tandai merah kalau belum dibalas lebih dari n menit"><span class="t">Merah &gt;'
        + '<input type="number" min="1" max="120" step="1" data-k="redMin">mnt</span>' + sw('red') + '</div>'
        + '<div class="r" data-row="auto" title="Otomatis bersihkan chat closed / Archived (termasuk yang lagi dibuka, jeda 3 dtk)">'
        + '<span class="t">Auto clear closed</span>' + sw('auto') + '</div>'
        + (SAPA ? '<div class="r" data-row="sapa" title="Utama = langsung sapa. Cadangan = sapa cuma kalau komputer Utama belum nyapa (±5 dtk). '
          + '1 akun di 2 komputer: pilih Utama di SATU komputer saja."><span class="t">Sapaan otomatis</span>'
          + '<button type="button" class="mode"></button></div>' : '')
        + (SITE === 'lc' ? '<div class="r" data-row="jalur" title="Bridge = panel UG login di profil lain (bridge.py + tab worker 127.0.0.1:8765/worker di profil panel). '
          + '1 Profil = panel UG login di profil Chrome ini, dicek di belakang layar tanpa bridge & tanpa buka panel."><span class="t">Jalur cek WD</span>'
          + '<button type="button" class="mode jalur"></button></div>' : '')
        + '<div class="r u" title="Update script tanpa refresh halaman"><span class="t v"></span>'
        + '<button type="button" data-act="upd">Cek update</button></div>';
    }
    function natFill() {
      if (!nat || !nat.isConnected) return;
      for (const b of nat.querySelectorAll('.sw')) {
        const v = cfg[b.dataset.k] ? 'true' : 'false';
        if (b.getAttribute('aria-checked') !== v) b.setAttribute('aria-checked', v);
      }
      const i = nat.querySelector('input[data-k]');
      if (document.activeElement !== i && i.value !== String(cfg.redMin)) i.value = cfg.redMin;
      const mb = nat.querySelector('.mode');
      if (mb && SAPA) {
        const m = SAPA.getMode();
        setText(mb, { utama: '⚡ Utama', cadangan: 'Cadangan', off: 'Off' }[m] || m);
        if (mb.dataset.m !== m) mb.dataset.m = m;
      }
      const jb = nat.querySelector('.jalur');
      if (jb) {
        const j = WDQ.jalur();
        setText(jb, j === 'langsung' ? '1 Profil' : 'Bridge');
        if (jb.dataset.m !== j) jb.dataset.m = j;
      }
      const ub = nat.querySelector('[data-act=upd]');
      setText(nat.querySelector('.v'), env.updLabel());
      setText(ub, env.updBtn());
      ub.disabled = env.updBusy();
      const bg = env.updAvail() ? '#7c3aed' : '';
      if (ub.style.background !== bg) { ub.style.background = bg; ub.style.color = bg ? '#fff' : ''; }
    }
    function natSet(k, v) {
      cfg[k] = v;
      if (k === 'auto') { try { localStorage.setItem(KEY_AUTO, cfg.auto ? '1' : '0'); } catch (x) { /* */ } }
      saveCfg();
      natFill();
      schedule();
    }
    function natInject() {
      if (nat && nat.isConnected) return;
      const g = document.querySelector('ul[role="menu"] > li > button[data-testid="groups"]');
      const ul = g && g.closest('ul[role="menu"]');
      if (!ul) return;
      nat = document.createElement('li');
      nat.id = 'csw-native';
      nat.setAttribute('role', 'none');
      nat.innerHTML = natHtml();
      const cs = getComputedStyle(g.firstElementChild || g);
      const px = parseFloat(cs.paddingLeft) || parseFloat(getComputedStyle(g).paddingLeft) || 16;
      nat.style.setProperty('--csw-px', px + 'px');
      nat.style.font = getComputedStyle(g).font;
      const gh = Math.round(g.getBoundingClientRect().height);        // tinggi baris = tombol bawaan
      if (gh >= 24 && gh <= 64) nat.style.setProperty('--csw-h', gh + 'px');
      const stop = (e) => { e.stopPropagation(); };
      ['click', 'keydown', 'keyup', 'keypress', 'input'].forEach((t) => nat.addEventListener(t, stop));
      nat.addEventListener('click', (e) => {
        const up = e.target.closest('[data-act=upd]');
        if (up) { e.preventDefault(); if (!up.disabled) { env.updClick(); natFill(); } return; }
        if (e.target.closest('input')) return;
        const r = e.target.closest('.r');
        if (!r || r.classList.contains('u')) return;
        e.preventDefault();
        if (r.dataset.row === 'jalur') {
          const urut = ['bridge', 'langsung'];
          const next = urut[(urut.indexOf(WDQ.jalur()) + 1) % urut.length];
          // Tanpa tab butuh alamat panel: kalau belum kecatat, tanya sekali
          if (next === 'langsung' && !GM_getValue('wdPanelUrl', '') && !askPanelUrl()) { WDQ.setJalur('bridge'); natFill(); return; }
          WDQ.setJalur(next);
          natFill();
          return;
        }
        if (r.dataset.row === 'sapa') {
          const urut = ['utama', 'cadangan', 'off'];
          SAPA.setMode(urut[(urut.indexOf(SAPA.getMode()) + 1) % urut.length]);
          natFill();
          return;
        }
        natSet(r.dataset.row, !cfg[r.dataset.row]);
      });
      nat.addEventListener('change', (e) => {
        const i = e.target;
        if (!i.dataset || i.dataset.k !== 'redMin') return;
        const v = Math.round(+i.value);
        if (v >= 1 && v <= 120) natSet('redMin', v); else i.value = cfg.redMin;
      });
      ul.appendChild(nat);
      natFill();
    }
    function ensureBar(show) {
      if (!bar) {
        bar = document.createElement('span');
        bar.id = 'csw-bar';
        bar.innerHTML = '<button type="button" class="csw-need"></button>';
        needBtn = bar.querySelector('button');
        const stop = (e) => { e.stopPropagation(); };
        bar.addEventListener('mousedown', stop);
        bar.addEventListener('click', stop);
        needBtn.addEventListener('click', (e) => { e.preventDefault(); openNext(); });
      }
      const h = A.header();
      if (h && h.parentNode) {
        if (bar.parentNode !== h.parentNode || bar.previousSibling !== h) h.parentNode.insertBefore(bar, h.nextSibling);
        if (h.parentNode.getAttribute('data-csw-row') !== '1') h.parentNode.setAttribute('data-csw-row', '1');
        bar.classList.remove('csw-float');
      } else if (bar.parentNode !== document.body) {
        document.body.appendChild(bar);
        bar.classList.add('csw-float');
      }
      const d = show ? '' : 'none';
      if (bar.style.display !== d) bar.style.display = d;
    }
    function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
    function updateBar(need, red, arch, ordered, dir) {
      archN = arch;
      const cls = 'csw-need' + (red ? ' red' : '');
      if (needBtn.className !== cls) needBtn.className = cls;
      setText(needBtn, `⚠ ${need} Waiting`);
      const d = need ? '' : 'none';                     // 0 -> disembunyikan
      if (needBtn.style.display !== d) needBtn.style.display = d;
      needBtn.title = `${red} merah (≥ ${cfg.redMin} mnt), ${need - red} biru.\nKlik: buka chat yang paling lama menunggu.`
        + '\nUrutan jam masuk ke CS: ' + (ordered ? (dir > 0 ? 'Oldest (terlama di atas)' : 'Newest (terbaru di atas)')
          : 'tidak aktif' + (SITE === 'text' ? ' (daftar sedang digulir / belum semua tampil)' : ''));
      natFill();
    }

    // ---------- aksi ----------
    function openNext() {
      const list = A.items().filter((it) => it.mine !== false && !it.archived && !it.replied && st[it.id] && st[it.id].w)
        .sort((a, b) => st[a.id].w - st[b.id].w);
      if (!list.length) return;
      (list.find((x) => !x.open) || list[0]).clickEl.click();
    }
    let orderOn = false;                 // urutan script sedang dipakai (scan terakhir)
    // Alt+↑/↓: urutan layar dari hasil pindai terakhir; sesudah pindah, pemindai ditahan sebentar supaya aplikasi menggambar dulu
    let lastItems = [], navAt = 0, holdUntil = 0;
    const isOpen = (it) => location.pathname.includes('/' + it.id)
      || (SITE === 'text' && (it.clickEl.getAttribute('aria-current') === 'page' || /message-list-item--active/.test(String(it.el.className))));
    altNav = (e) => {
      if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      if (!orderOn) return;                // urutan asli -> shortcut bawaan saja
      const live = lastItems.filter((it) => it.wrap.isConnected && it.wrap.style.display !== 'none');
      if (!live.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const now = Date.now();
      if (now - navAt < 120) return;        // tombol ditahan: maks 1 pindah / 120 ms
      const dom = new Map(live.map((it, k) => [it, k]));
      const ord = (it) => { const o = it.wrap.style.order; return o === '' ? dom.get(it) : +o; };
      const list = live.slice().sort((a, b) => (a.wrap.parentElement === b.wrap.parentElement ? ord(a) - ord(b) : 0) || dom.get(a) - dom.get(b));
      const i = list.findIndex(isOpen), up = e.key === 'ArrowUp';
      const j = i < 0 ? (up ? list.length - 1 : 0) : i + (up ? -1 : 1);
      if (j < 0 || j >= list.length || j === i) return;    // ujung daftar: diam (seperti bawaan)
      navAt = now;
      holdUntil = now + 600;
      list[j].clickEl.click();
      try { list[j].wrap.scrollIntoView({ block: 'nearest' }); } catch (x) { /* */ }
    };
    const archSeen = new Map(), tried = new Map();
    async function runClose(ids, manual) {
      if (busy) return;
      let cands = A.items().filter((it) => isDone(it) && (manual || AUTO_BUKA || !it.open));
      if (ids) cands = cands.filter((it) => ids.includes(it.id));
      if (!cands.length) return;
      if (manual && !window.confirm(`Tutup ${cands.length} chat yang sudah Archived dari daftar?`)) return;
      busy = true;
      let ok = 0, miss = 0;
      try {
        const fresh = A.items();                              // baca ulang tepat sebelum menutup
        const sel = cands.map((c) => fresh.find((x) => x.id === c.id))
          .filter((it) => it && isDone(it) && (manual || AUTO_BUKA || !it.open));
        const now = Date.now();
        sel.forEach((it) => tried.set(it.id, now));
        if (A.closeMany) {                                    // Text: sekali buang dari memori daftar
          A.closeMany(sel);
          await sleep(1500);
          const ids = new Set(sel.map((it) => it.id));
          miss = A.items().filter((x) => ids.has(x.id)).length;
          ok = sel.length - miss;
        } else {                                              // LiveChat: klik ✕ per chat
          for (const it of sel) {
            if (await A.close(it)) { ok++; log('ditutup', it.name, it.text); } else miss++;
            await sleep(200);
          }
        }
      } finally { busy = false; }
      if (ok) closeMiss = false;
      if (miss && !ok) closeMiss = true;
      if (miss && manual && !ok) {
        window.alert(SITE === 'text'
          ? 'Chat Archived belum bisa dibersihkan dari daftar Text (tampilan aplikasi mungkin berubah). Kabari admin.'
          : 'Tombol tutup chat belum dikenali di halaman ini.\n'
            + 'Arahkan mouse ke chat Archived, klik kanan > Inspect, lalu kirim HTML-nya supaya bisa ditambahkan.');
      }
      schedule();
    }
    function autoTick(items, now) {
      if (!cfg.auto || busy) return;
      const retry = SITE === 'text' ? 60000 : 5000;
      const due = items.filter((it) => it.mine !== false && isDone(it) && (AUTO_BUKA || !it.open)
        && now - (archSeen.get(it.id) || now) >= (it.open ? AUTO_JEDA_BUKA : AUTO_JEDA) && now - (tried.get(it.id) || 0) > retry)
        .map((it) => it.id);
      if (due.length) runClose(due, false);
    }

    // ---------- penanda (titik sebelum nama + chip timer di samping jam) ----------
    const marked = new Map();                 // id -> [elemen bertanda] (dibersihkan kalau ganti / tidak perlu lagi)
    const posSeen = new WeakSet();
    function mark(it, col, lab) {
      const els = [];
      if (col) {
        if (it.nameEl) { setAttr(it.nameEl, 'data-csw-dot', col); els.push(it.nameEl); }
        const t = it.ageEl;                // tanpa label jam (mouse di atas chat) -> tanpa chip, warna tetap
        if (t) {
          if (!t.hasAttribute('data-csw-hide')) {      // ukuran & posisi kanan = label jam bawaan (diukur sebelum disembunyikan)
            const fs = getComputedStyle(t).fontSize;
            if (parseFloat(fs) > 0) it.el.style.setProperty('--csw-fs', fs);
            const r = Math.round(it.el.getBoundingClientRect().right - t.getBoundingClientRect().right);
            if (r >= 0 && r < 80) it.el.style.setProperty('--csw-r', r + 'px');
            t.setAttribute('data-csw-hide', '1');
          }
          els.push(t);
          if (!posSeen.has(it.el)) {         // dicek sekali per elemen (getComputedStyle tiap detik = berat)
            posSeen.add(it.el);
            if (getComputedStyle(it.el).position === 'static') it.el.style.position = 'relative';
          }
        }
        setAttr(it.el, 'data-csw-t', t ? lab : '');
      } else setAttr(it.el, 'data-csw-t', '');
      for (const e of marked.get(it.id) || []) {
        if (els.includes(e)) continue;
        e.removeAttribute('data-csw-dot'); e.removeAttribute('data-csw-hide');
      }
      if (els.length) marked.set(it.id, els); else marked.delete(it.id);
    }
    function lum(c) {                     // terang warna "rgb(a)" 0..1, null kalau transparan
      const m = (c || '').match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?/);
      if (!m || (m[4] !== undefined && +m[4] < 0.5)) return null;
      return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
    }
    const DK = { at: 0, v: false };
    function isDark() {                   // warna latar dicek paling cepat tiap 10 dtk (class tema tetap langsung)
      const cl = document.body.className + ' ' + document.documentElement.className;
      if (/\blc-dark-theme\b/.test(cl)) return true;
      if (/\blc-light-theme\b/.test(cl)) return false;
      if (Date.now() - DK.at < 10000) return DK.v;
      DK.at = Date.now();
      DK.v = false;
      for (let e = A.header() || A.orderBox() || document.body; e; e = e.parentElement) {
        const l = lum(getComputedStyle(e).backgroundColor);
        if (l !== null) { DK.v = l < 0.4; break; }
      }
      return DK.v;
    }

    // ---------- 1.5.0: centang auto reply di samping nama chat (LiveChat) ----------
    function arBox(it) {
      if (!AR || !it.nameEl) return;
      let b = it.nameEl.nextElementSibling;
      if (!b || !b.classList.contains('csw-ar')) {
        b = document.createElement('span');
        b.className = 'csw-ar';
        b.setAttribute('role', 'checkbox');
        b.tabIndex = 0;
        const stop = (e) => { e.stopPropagation(); };
        ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown'].forEach((t) => b.addEventListener(t, stop));
        b.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          AR.toggle(b.dataset.id, b.dataset.name);
          arFill(b);
        });
        it.nameEl.after(b);
      }
      if (b.dataset.id !== it.id) b.dataset.id = it.id;
      if (b.dataset.name !== it.name) b.dataset.name = it.name;
      arFill(b);
    }
    function arFill(b) {
      const on = AR.isTracked(b.dataset.id, b.dataset.name);
      setAttr(b, 'aria-checked', on ? 'true' : 'false');
      setAttr(b, 'data-off', AR.isOn() ? '' : '1');
      const t = on ? (AR.isOn() ? 'Auto reply AKTIF buat chat ini (klik buat matiin)'
        : 'Dicentang, tapi saklar utama Auto Reply lagi mati (tombol 🤖 di menu kiri)')
        : 'Klik buat aktifin auto reply di chat ini';
      if (b.title !== t) b.title = t;
    }

    // ---------- 1.4.0: sapa chat yang di daftar muncul "Transferred - by ..." ----------
    const trSeen = new Map();             // id -> teks transfer terakhir yang sudah dilihat
    let firstScan = true;                 // scan pertama cuma mencatat (biar chat lama ga ikut disapa)
    function sapaTransfer(it) {
      if (!SAPA || !it.transfer || it.archived) return;
      if (trSeen.get(it.id) === it.text) return;
      trSeen.set(it.id, it.text);
      if (firstScan || it.age > SAPA_DOM_MAX) return;
      SAPA.fromDom(it.id);
    }

    // ---------- inti: baca daftar ----------
    function scan() {
      const now = Date.now();
      const items = A.items();
      const box = A.orderBox();
      setAttr(document.documentElement, 'data-csw-dark', isDark() ? '1' : '');
      setAttr(document.documentElement, 'data-csw-site', SITE);
      const listOn = items.length > 0 || !!box;
      let need = 0, red = 0, arch = 0;
      for (const it of items) {
        const ageMs = it.age * 1000;
        let r = st[it.id];
        if (!r) r = st[it.id] = { e: now - ageMs, w: 0, s: now, t: 0 };
        if (it.typing) {                                   // member sedang mengetik: ikon & teks terakhir tertutup -> catatan
          if (r.tx) { it.text = r.tx; it.transfer = TRF_RE.test(r.tx); if (ARCH_RE.test(r.tx)) it.archived = true; }
          if (!it.fromStore) it.replied = !!r.rp;
        } else { r.tx = it.text; r.rp = it.replied ? 1 : 0; }
        if (it.transfer && !r.t) { r.e = now - ageMs; r.tr = 1; }   // jam transfer = jam masuk ke CS
        sapaTransfer(it);
        r.t = it.transfer ? 1 : 0;
        r.s = now;
        it.entry = r.e;
        it.trf = !!r.tr;
        const needs = it.mine !== false && !it.archived && !it.replied;   // di luar My chats -> tanpa tanda
        let col = '', lab = '';
        if (needs && it.typing) {
          // member lagi ngetik: tanpa tanda, tidak masuk Waiting, catatan timer tidak diubah
        } else if (needs) {
          // waktu tunggu = umur PESAN TERAKHIR. Pesan baru atau label ga cocok lagi dengan hitungan sendiri -> mulai dari label.
          const win = ageWin(it.ageEl), cur = (now - r.w) / 1000;
          const off = win && (cur < win.lo - 5 || cur > win.hi + win.slack);
          if (it.lastTs) r.w = Math.min(now, it.lastTs);   // jam pesan terakhir persis dari memori aplikasi
          else if (!r.w || r.lt !== it.text || off) r.w = now - ageMs;
          r.lt = it.text;
          const sec = (now - r.w) / 1000;
          col = cfg.red && sec >= cfg.redMin * 60 ? 'red' : cfg.blue ? 'blue' : '';
          lab = '⏳ ' + fmt(sec);
          if (col) need++;
          if (col === 'red') red++;
        } else { r.w = 0; r.lt = ''; }
        setAttr(it.el, 'data-csw', col);
        mark(it, col, lab);
        if (!it.archived) arBox(it);
        else if (it.nameEl && it.nameEl.nextElementSibling && it.nameEl.nextElementSibling.classList.contains('csw-ar'))
          it.nameEl.nextElementSibling.remove();   // 1.7.3: chat udah Archived -> centang auto reply dibuang
        if (it.mine !== false && isDone(it)) {
          arch++;
          if (!archSeen.has(it.id)) archSeen.set(it.id, now);
        } else archSeen.delete(it.id);
      }
      if (items.length) firstScan = false;
      const dir = A.sortDir();
      let ordered = false;
      if (box && dir && items.length && A.canOrder(box, items)) { applyOrder(box, items, dir); ordered = true; }
      else clearOrder(box);
      orderOn = ordered;
      lastItems = items;
      ensureBar(listOn);
      if (listOn) updateBar(need, red, arch, ordered, dir);
      save(now);
      autoTick(items, now);
    }

    let tmr = 0;
    function schedule() {
      if (tmr) return;
      const wait = Math.max(300, holdUntil - Date.now());   // sesudah Alt + ↑/↓ tunggu aplikasi selesai menggambar
      tmr = setTimeout(() => { tmr = 0; try { scan(); } catch (e) { console.error('[CS Inbox]', e); } }, wait);
    }
    let natRaf = 0;
    const listRoot = () => (SITE === 'text' ? TX.root() : document.getElementById('chats-list-column'));
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (bar && (m.target === bar || bar.contains(m.target))) continue;
        if (nat && (m.target === nat || nat.contains(m.target))) continue;
        if (!natRaf && !(nat && nat.isConnected)) natRaf = requestAnimationFrame(() => { natRaf = 0; try { natInject(); } catch (e) { console.error('[CS Inbox]', e); } });
        // pindai hanya kalau perubahan ada di daftar chat (panel pesan, mengetik, dll. tidak); lainnya cukup tiap 1 dtk
        const lr = listRoot();
        if (!lr || lr.contains(m.target)) { schedule(); return; }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    onStop(() => mo.disconnect());
    setInterval(schedule, 1000);
    schedule();
    log('aktif di', SITE);
  }

  if (SITE === 'ug' || SITE === 'worker') { /* panel UG / worker: daftar chat ga ada */ }
  else if (document.readyState === 'loading') on(document, 'DOMContentLoaded', initInbox, { once: true });
  else initInbox();
  } // akhir APP

  // file ini dipanggil sama tombol Update cuma buat ngambil APP versi barunya (bagian di bawah ga jalan)
  if (typeof __HOT__ === 'object' && __HOT__) { __HOT__.APP = APP; __HOT__.VERSION = VERSION; return; }

  // #####################################################################
  // UPDATER: tombol Update -> download versi baru -> copot versi lama -> pasang versi baru. Tanpa refresh.
  // #####################################################################
  const K_UPD = 'upd.cache';
  const lg = (...a) => console.log('%c[Update]', 'color:#7c3aed;font-weight:bold', ...a);
  const PWIN = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const cmpVer = (a, b) => {
    const x = String(a).split('.').map((n) => parseInt(n, 10) || 0), y = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  };
  // baca file versi baru TANPA menjalankan isinya, ambil APP-nya aja
  function unpack(code) {
    if (!/==UserScript==/.test(code)) throw new Error('file bukan userscript (link salah?)');
    const ver = (code.match(/@version\s+(\S+)/) || [])[1];
    if (!ver) throw new Error('@version ga ketemu');
    const h = {};
    new Function('GM_getValue', 'GM_setValue', 'GM_listValues', 'GM_deleteValue', 'unsafeWindow', 'GM_xmlhttpRequest', 'GM_registerMenuCommand', 'GM_info', '__HOT__',
      code + '\n//# sourceURL=cs-helper-v' + ver + '.user.js')(
      GM_getValue, GM_setValue, GM_listValues, GM_deleteValue, PWIN, GM_xmlhttpRequest, GM_registerMenuCommand, { script: { version: ver } }, h);
    if (typeof h.APP !== 'function') throw new Error('format file beda (harus versi 1.7.0 ke atas)');
    return h;
  }
  function fetchCode() {
    return new Promise((res, rej) => GM_xmlhttpRequest({
      method: 'GET',
      url: UPDATE_URL + (UPDATE_URL.includes('?') ? '&' : '?') + 't=' + Date.now(),
      nocache: true,
      timeout: 20000,
      onload: (r) => (r.status === 200 ? res(r.responseText) : rej(new Error('HTTP ' + r.status))),
      onerror: () => rej(new Error('jaringan error')),
      ontimeout: () => rej(new Error('timeout')),
    }));
  }

  const env = { tabId: Math.random().toString(36).slice(2), sock: null, version: VERSION, stop: null };
  const U = { st: 'idle', ver: '', msg: '', h: null, code: '' };

  async function check() {
    if (U.st === 'checking' || U.st === 'applying') return;
    U.st = 'checking';
    try {
      const code = await fetchCode();
      const h = unpack(code);
      if (cmpVer(h.VERSION, env.version) > 0) Object.assign(U, { st: 'avail', ver: h.VERSION, h, code });
      else U.st = 'latest';
    } catch (e) {
      Object.assign(U, { st: 'error', msg: e.message });
      lg('Gagal cek update:', e.message);
    }
  }
  function run(fn) {
    env.stop = null;
    try { fn(env); return true; } catch (e) {
      console.error('[Update] script gagal jalan:', e);
      if (env.stop) env.stop();   // copot sisa yang udah sempat kepasang
      return false;
    }
  }
  function apply() {
    if (U.st !== 'avail') return;
    U.st = 'applying';
    const oldFn = curFn, oldVer = env.version;
    if (env.stop) env.stop();                      // 1) copot versi lama sampai bersih
    if (run(U.h.APP)) {                            // 2) pasang versi baru
      curFn = U.h.APP;
      env.version = U.ver;
      GM_setValue(K_UPD, { ver: U.ver, code: U.code });   // dipakai juga waktu halaman dibuka lagi
      lg(`Update ke v${U.ver} tanpa refresh`);
      toast(`✅ Script ke-update ke v${U.ver} (tanpa refresh)`);
      U.st = 'latest';
    } else {                                       // versi baru error -> balik ke versi lama
      run(oldFn);
      env.version = oldVer;
      Object.assign(U, { st: 'error', msg: 'versi baru error, balik ke versi lama' });
      toast(`⚠️ v${U.ver} error, tetap pakai v${oldVer}. Cek Console (F12).`);
    }
  }
  env.updClick = async () => {
    if (U.st !== 'avail') await check();
    if (U.st === 'avail') apply();
    else if (U.st === 'latest') toast(`✅ Sudah versi terbaru (v${env.version})`);
    else if (U.st === 'error') toast(`⚠️ Gagal cek update: ${U.msg}`);
  };
  env.updLabel = () => ({
    checking: 'Ngecek update...',
    applying: 'Masang update...',
    avail: `v${env.version} → v${U.ver} tersedia`,
    error: `v${env.version} · gagal cek`,
  }[U.st] || `Versi v${env.version}`);
  env.updBtn = () => (U.st === 'avail' ? `Update ke v${U.ver}` : 'Cek update');
  env.updBusy = () => U.st === 'checking' || U.st === 'applying';
  env.updAvail = () => U.st === 'avail';

  let box = null;
  function toast(msg) {
    if (box) box.remove();
    box = document.createElement('div');
    box.textContent = msg;
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1f2229;color:#eee;'
      + 'font:600 12px system-ui,sans-serif;padding:10px 14px;border-radius:8px;box-shadow:0 4px 16px #0008;max-width:360px';
    (document.body || document.documentElement).appendChild(box);
    const b = box;
    window.setTimeout(() => { b.remove(); if (box === b) box = null; }, 5000);
  }

  // ---------- mulai ----------
  // 2.0.0: @match "*/transaction*" juga kena web lain -> di luar LiveChat/Text script cuma jalan kalau ini halaman panel UG
  let curFn = APP;
  function boot() {
    // kalau tadi udah pernah update lewat tombol & versinya lebih baru dari yang terpasang -> pakai itu
    const cache = GM_getValue(K_UPD, null);
    if (cache && cache.code && cmpVer(cache.ver, VERSION) > 0) {
      try { curFn = unpack(cache.code).APP; env.version = cache.ver; } catch (e) { lg('Versi simpanan rusak, pakai versi terpasang', e); }
    } else if (cache) GM_setValue(K_UPD, null);
    if (!run(curFn) && curFn !== APP) {
      lg('Versi simpanan error, balik ke versi terpasang');
      GM_setValue(K_UPD, null);
      curFn = APP;
      env.version = VERSION;
      run(APP);
    }
    lg(`v${env.version} jalan`);

    // cek diam-diam berkala; kalau ada versi baru tombol Update jadi ungu (atau langsung dipasang kalau AUTO_UPDATE)
    const autoCheck = async () => { await check(); if (AUTO_UPDATE && U.st === 'avail') apply(); };
    window.setTimeout(autoCheck, 15000);
    window.setInterval(autoCheck, CEK_MENIT * 60000);
    GM_registerMenuCommand('🔄 Update script sekarang', () => env.updClick());
    GM_registerMenuCommand('🔗 Atur alamat panel UG', askPanelUrl);
  }
  if (/(^|\.)(livechatinc|text)\.com$/i.test(location.hostname)) boot();
  else if (location.hostname === '127.0.0.1') {   // halaman worker bridge.py
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  }
  else {
    let ok = false;
    const go = () => { if (!ok && document.getElementById('lahanat_member')) { ok = true; boot(); } };
    document.addEventListener('DOMContentLoaded', go, { once: true });
    window.addEventListener('load', () => { go(); window.setTimeout(go, 3000); }, { once: true });
  }
})();