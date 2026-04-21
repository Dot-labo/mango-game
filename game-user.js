// game-user.js — shared user & score module for SAKURA KIDS games
// Requires Firebase App + Firestore compat CDN scripts loaded before this file

(function(g) {
  'use strict';

  const FB_CFG = {
    apiKey: "AIzaSyCaVth-8AXqUWQD4b-Y-vkwousv230HyQ4",
    authDomain: "sakura-kids-game.firebaseapp.com",
    projectId: "sakura-kids-game",
    storageBucket: "sakura-kids-game.firebasestorage.app",
    messagingSenderId: "1062925555996",
    appId: "1:1062925555996:web:312716b57348c1e06f82d9"
  };

  let _db = null;
  function db() {
    if (_db) return _db;
    if (!firebase.apps.length) firebase.initializeApp(FB_CFG);
    _db = firebase.firestore();
    return _db;
  }

  const LS_KEY = 'sakura_username';

  const GameUser = {

    // ── Username ──────────────────────────────────────────────────────────
    getUsername() { return localStorage.getItem(LS_KEY) || ''; },

    async setUsername(raw) {
      const name = (raw || '').trim().slice(0, 12);
      if (!name) return false;
      localStorage.setItem(LS_KEY, name);
      try {
        await db().collection('users').doc(name).set({
          username: name,
          lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch(e) {}
      return true;
    },

    clearUsername() { localStorage.removeItem(LS_KEY); },

    // ── Save score ────────────────────────────────────────────────────────
    async saveScore(game, stage, data) {
      const username = this.getUsername();
      if (!username) return false;
      try {
        await db().collection('scores').add({
          username,
          game,
          stage,
          score:    +(data.score    || 0),
          wpm:      +(data.wpm      || 0),
          accuracy: +(data.accuracy || 0),
          grade:     data.grade     || '',
          words:    +(data.words    || 0),
          ts: firebase.firestore.FieldValue.serverTimestamp(),
          dateStr: new Date().toLocaleDateString('ja-JP'),
        });
        return true;
      } catch(e) { return false; }
    },

    // ── Fetch personal scores ─────────────────────────────────────────────
    async getMyScores(username) {
      username = username || this.getUsername();
      if (!username) return [];
      try {
        const snap = await db().collection('scores')
          .where('username', '==', username)
          .limit(200).get();
        return snap.docs.map(d => d.data())
          .sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0));
      } catch(e) { return []; }
    },

    // ── Fetch leaderboard (one game+stage) ───────────────────────────────
    async getLeaderboard(game, stage, limit = 15) {
      try {
        const snap = await db().collection('scores')
          .where('game', '==', game)
          .where('stage', '==', stage)
          .limit(400).get();
        const best = {};
        snap.docs.forEach(d => {
          const s = d.data();
          if (!best[s.username] || best[s.username].score < s.score) best[s.username] = s;
        });
        return Object.values(best).sort((a, b) => b.score - a.score).slice(0, limit);
      } catch(e) { return []; }
    },

    // ── Name input modal ─────────────────────────────────────────────────
    // Returns Promise<string> — resolves with username (or '' if skipped)
    showNameModal(opts) {
      opts = opts || {};
      const title    = opts.title    || 'あなたのなまえは？';
      const subtitle = opts.subtitle || 'スコアを記録してランキングに載ろう！';
      const canSkip  = opts.canSkip  !== false;
      const prefill  = opts.prefill  || this.getUsername();

      return new Promise(resolve => {
        const old = document.getElementById('_guModal');
        if (old) old.remove();

        const el = document.createElement('div');
        el.id = '_guModal';
        el.style.cssText = 'position:fixed;inset:0;z-index:900;display:flex;align-items:center;' +
          'justify-content:center;background:rgba(0,0,0,.84);backdrop-filter:blur(8px)';

        el.innerHTML = `
<div style="background:#0c0820;border:1px solid rgba(124,58,237,.5);border-radius:22px;
  padding:2rem 1.8rem;text-align:center;max-width:320px;width:90%;
  animation:_guBounce .42s cubic-bezier(.34,1.56,.64,1)">
  <div style="font-size:2.2rem;margin-bottom:.4rem">👋</div>
  <div style="font-size:1.15rem;font-weight:800;color:#fff;margin-bottom:.3rem">${title}</div>
  <div style="font-size:.72rem;color:#555;margin-bottom:1.1rem;line-height:1.5">${subtitle}</div>
  <input id="_guIn" type="text" maxlength="12" placeholder="なまえを入力（最大12文字）"
    value="${prefill}"
    style="width:100%;padding:.7rem 1rem;border-radius:11px;
    border:1.5px solid rgba(124,58,237,.5);background:rgba(255,255,255,.05);
    color:#fff;font-size:1rem;outline:none;text-align:center;margin-bottom:1rem;
    font-family:'Segoe UI',system-ui,sans-serif">
  <div style="display:flex;gap:.7rem;justify-content:center">
    ${canSkip ? '<button id="_guSkip" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#555;border-radius:30px;padding:.5rem 1.2rem;font-size:.8rem;cursor:pointer;font-weight:600">スキップ</button>' : ''}
    <button id="_guOk" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;color:#fff;border-radius:30px;padding:.5rem 1.6rem;font-size:.9rem;cursor:pointer;font-weight:700">決定 ▶</button>
  </div>
  <div style="font-size:.62rem;color:#333;margin-top:.75rem">※ パスワード不要・いつでも変更できます</div>
</div>
<style>@keyframes _guBounce{from{transform:scale(.5);opacity:0}to{transform:none;opacity:1}}</style>`;

        document.body.appendChild(el);

        const inp  = document.getElementById('_guIn');
        const ok   = document.getElementById('_guOk');
        const skip = document.getElementById('_guSkip');
        setTimeout(() => { inp.focus(); inp.select(); }, 60);

        async function done(save) {
          if (save) {
            const n = inp.value.trim();
            if (n) await GameUser.setUsername(n);
          }
          el.remove();
          resolve(GameUser.getUsername());
        }

        ok.onclick = () => done(true);
        if (skip) skip.onclick = () => done(false);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); });
      });
    },

    // ── "Save score?" post-game prompt ───────────────────────────────────
    // Shows only when username is empty. Returns Promise<string>.
    showSavePrompt() {
      if (this.getUsername()) return Promise.resolve(this.getUsername());
      return this.showNameModal({
        title: 'スコアを保存する？',
        subtitle: '名前をつけるとスコアが残ってランキングに載れます！',
        canSkip: true,
      });
    },

    // ── Render compact username badge ────────────────────────────────────
    // Injects a small badge element; returns the element.
    renderBadge(container) {
      const old = document.getElementById('_guBadge');
      if (old) old.remove();

      const badge = document.createElement('div');
      badge.id = '_guBadge';
      const name = this.getUsername();
      badge.style.cssText = 'display:inline-flex;align-items:center;gap:.4rem;' +
        'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);' +
        'border-radius:30px;padding:.35rem .9rem;font-size:.78rem;font-weight:700;' +
        'cursor:pointer;color:#ccc;transition:all .18s;margin:.4rem';
      badge.innerHTML = `<span style="font-size:.9rem">👤</span>${name || 'ゲスト'}<span style="font-size:.65rem;color:#555">▾</span>`;
      badge.title = name ? '名前を変更' : '名前を設定してスコアを記録';
      badge.onmouseenter = () => badge.style.background = 'rgba(124,58,237,.2)';
      badge.onmouseleave = () => badge.style.background = 'rgba(255,255,255,.07)';
      badge.onclick = async () => {
        await GameUser.showNameModal({ title: '名前を変更する', canSkip: true });
        GameUser.renderBadge(container);
      };

      if (container) container.appendChild(badge);
      return badge;
    },
  };

  g.GameUser = GameUser;
})(window);
