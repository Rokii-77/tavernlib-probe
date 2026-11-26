/*
 * 洛书匣探针 / TavernLib Probe
 * 作用：只读检测《酒馆》(TauriTavern) 是否允许第三方扩展运行、扩展内能否直接读到本机角色卡。
 * 不写入、不修改、不上传任何数据，全部结果只显示在当前界面。
 */

const TAG = '[洛书匣探针]';
const lines = [];

function add(label, value) {
  lines.push('【' + label + '】\n' + value);
  try {
    console.log(TAG, label, value);
  } catch (_) {}
}

function safeJson(v, max) {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    return s.length > (max || 2500) ? s.slice(0, max || 2500) + '\n...(已截断)' : s;
  } catch (e) {
    return String(v);
  }
}

async function getCsrf() {
  try {
    if (typeof window.getRequestHeaders === 'function') {
      const h = window.getRequestHeaders();
      if (h && (h['X-CSRF-Token'] || h['x-csrf-token'])) return h['X-CSRF-Token'] || h['x-csrf-token'];
    }
  } catch (_) {}
  try {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch (_) {}
  try {
    const r = await fetch('/csrf-token', { credentials: 'same-origin' });
    if (r.ok) {
      const j = await r.json();
      if (j && j.token) return j.token;
    }
  } catch (_) {}
  return '';
}

async function api(path, body) {
  const token = await getCsrf();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-CSRF-Token'] = token;
  const res = await fetch(path, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text.slice(0, 300);
  }
  return { status: res.status, ok: res.ok, hasToken: !!token, data };
}

function buildPanel() {
  const old = document.getElementById('tl-probe-panel');
  if (old) old.remove();

  const panel = document.createElement('div');
  panel.id = 'tl-probe-panel';

  const bar = document.createElement('div');
  bar.className = 'tl-bar';

  const btnCopy = document.createElement('button');
  btnCopy.textContent = '复制结果';
  btnCopy.onclick = async () => {
    const text = lines.join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      btnCopy.textContent = '已复制';
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); btnCopy.textContent = '已复制'; } catch (e) { btnCopy.textContent = '复制失败，请长按选中'; }
      ta.remove();
    }
  };

  const btnClose = document.createElement('button');
  btnClose.textContent = '关闭';
  btnClose.onclick = () => panel.remove();

  bar.appendChild(btnCopy);
  bar.appendChild(btnClose);

  const pre = document.createElement('pre');
  pre.textContent = lines.join('\n\n');

  const verdict = document.createElement('div');
  verdict.className = 'tl-verdict';
  verdict.id = 'tl-probe-verdict';
  verdict.textContent = '检测中…';

  panel.appendChild(bar);
  panel.appendChild(pre);
  panel.appendChild(verdict);
  document.body.appendChild(panel);
  return { panel, pre, verdict };
}

function setVerdict(text) {
  const v = document.getElementById('tl-probe-verdict');
  if (v) v.textContent = text;
}

function addButton() {
  if (document.getElementById('tl-probe-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'tl-probe-btn';
  btn.textContent = '探针结果';
  btn.onclick = () => buildPanel();
  document.body.appendChild(btn);
}

async function waitForBody() {
  for (let i = 0; i < 60; i++) {
    if (document.body) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function run() {
  await waitForBody();
  addButton();

  add('探针版本', '0.1.0');
  add('当前地址', location.origin + location.pathname);
  add('设备标识', navigator.userAgent);
  add('屏幕', window.innerWidth + ' x ' + window.innerHeight + ' / dpr ' + (window.devicePixelRatio || 1));

  const host = window.__TAURITAVERN__;
  add('宿主对象 __TAURITAVERN__', host ? '存在，字段：' + Object.keys(host).join(', ') : '不存在');

  if (host && host.ready) {
    try {
      await Promise.race([host.ready, new Promise((r) => setTimeout(r, 6000))]);
      add('宿主就绪', 'ready 已完成');
    } catch (e) {
      add('宿主就绪', '等待出错：' + e.message);
    }
  }

  try {
    const p = host && host.iosPolicy;
    add('iOS 策略 iosPolicy', p ? safeJson(p, 2500) : '未下发（安卓/桌面版，或该版本无此策略）');
  } catch (e) {
    add('iOS 策略 iosPolicy', '读取异常：' + e.message);
  }

  try {
    const boot = await fetch('/api/bootstrap', { credentials: 'same-origin' });
    if (boot.ok) {
      const j = await boot.json();
      add('/api/bootstrap 可用', '是，返回字段：' + Object.keys(j || {}).join(', '));
      if (j && j.ios_policy) add('bootstrap 内 ios_policy', safeJson(j.ios_policy, 2500));
    } else {
      add('/api/bootstrap 可用', '否，HTTP ' + boot.status);
    }
  } catch (e) {
    add('/api/bootstrap 可用', '请求失败：' + e.message);
  }

  let charCount = -1;
  try {
    const r = await api('/api/characters/all', {});
    if (r.ok && Array.isArray(r.data)) {
      charCount = r.data.length;
      add('角色卡读取', '成功（CSRF ' + (r.hasToken ? '有' : '无') + '）');
      add('角色卡数量', String(charCount));
      const names = r.data.slice(0, 8).map((c) => c && (c.name || c.avatar)).filter(Boolean);
      add('前几张卡', names.length ? names.join(' / ') : '（暂无角色卡）');
    } else {
      add('角色卡读取', '失败 HTTP ' + r.status + ' → ' + safeJson(r.data, 400));
    }
  } catch (e) {
    add('角色卡读取', '请求异常：' + e.message);
  }

  try {
    const r = await api('/api/settings/get', {});
    if (r.ok) {
      const s = r.data || {};
      add('设置读取', '成功；用户名=' + (s.username || '未知') + '；界面语言=' + (s.language || '未知'));
    } else {
      add('设置读取', '失败 HTTP ' + r.status);
    }
  } catch (e) {
    add('设置读取', '请求异常：' + e.message);
  }

  buildPanel();

  if (charCount > 0) {
    setVerdict('结论：可用。扩展能正常运行，并能直接读到本机 ' + charCount + ' 张角色卡 —— 洛书匣走这条路可行。');
  } else if (charCount === 0) {
    setVerdict('结论：接口可用，但当前酒馆里没有角色卡。导入一张卡后再点"探针结果"复测。');
  } else {
    setVerdict('结论：扩展运行了，但读卡接口没通，上面【角色卡读取】是失败原因。');
  }
}

(async () => {
  add('启动', '扩展脚本已执行');
  try {
    await run();
  } catch (e) {
    add('致命错误', (e && (e.stack || e.message)) || String(e));
    try {
      await waitForBody();
      addButton();
      buildPanel();
      setVerdict('结论：扩展运行了，但内部出错，见上方【致命错误】。');
    } catch (_) {}
  }
})();
