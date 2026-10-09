const $ = (s) => document.querySelector(s);

let memos = [];
let editing = false;   // 是否展开编辑面板
let showDone = false;  // 编辑模式下是否显示已完成

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function incomplete() {
  return memos
    .filter((m) => !m.done)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function sorted() {
  const undone = incomplete();
  const done = memos
    .filter((m) => m.done)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  return showDone ? [...undone, ...done] : undone;
}

function render() {
  const list = $('#list');
  const items = editing ? sorted() : incomplete();
  list.innerHTML = '';

  const undoneCount = memos.filter((m) => !m.done).length;
  $('#count').textContent = undoneCount;

  if (items.length === 0) {
    const d = document.createElement('div');
    d.className = 'empty';
    if (!editing) {
      d.innerHTML =
        '<div class="empty-icon">✍️</div>' +
        '<div class="empty-t1">还没有待办</div>' +
        '<div class="empty-t2">点右上角 ＋ 添加</div>';
    } else {
      d.innerHTML =
        '<div class="empty-icon">🎉</div>' +
        '<div class="empty-t1">' + (memos.length === 0 ? '还没有备忘录' : '暂无未完成事项') + '</div>' +
        '<div class="empty-t2">' + (memos.length === 0 ? '在下方输入框添加一条吧' : '点右下角可查看已完成') + '</div>';
    }
    list.appendChild(d);
  } else {
    items.forEach((m) => list.appendChild(createItem(m)));
  }

  const doneCount = memos.length - undoneCount;
  $('#done-count').textContent = `${undoneCount} 项未完成`;
  $('#btn-toggle-done').textContent = showDone
    ? '隐藏已完成'
    : (doneCount ? `显示已完成 (${doneCount})` : '显示已完成');
}

function createItem(m) {
  const row = document.createElement('div');
  row.className = 'item' + (m.done ? ' done' : '');
  row.dataset.id = m.id;

  const check = document.createElement('button');
  check.className = 'check';
  check.title = m.done ? '标记为未完成' : '标记为完成';
  check.addEventListener('click', () => {
    m.done = !m.done;
    m.completedAt = m.done ? Date.now() : null;
    save();
  });

  const text = document.createElement('div');
  text.className = 'text';
  text.textContent = m.text || '(空)';
  if (editing) {
    text.title = '双击编辑';
    text.addEventListener('dblclick', () => startEdit(m, text));
  } else {
    text.title = '双击打开编辑';
    text.addEventListener('dblclick', () => setEditing(true));
  }

  row.append(check, text);

  if (editing) {
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '删除';
    del.title = '删除这条备忘录';
    del.addEventListener('click', () => {
      memos = memos.filter((x) => x.id !== m.id);
      save();
    });
    row.append(del);
  }

  return row;
}

function setEditing(v) {
  editing = v;
  document.body.classList.toggle('editing', v);
  const btn = $('#btn-edit');
  btn.textContent = v ? '✕' : '＋';
  btn.title = v ? '收起编辑' : '添加 / 编辑';
  btn.classList.toggle('active', v);
  if (v) setTimeout(() => $('#new-input').focus(), 60);
  render();
}

function startEdit(m, el) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = m.text;
  input.maxLength = 200;
  el.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    if (commit) {
      const v = input.value.trim();
      if (v) m.text = v;
      save();
    }
    render();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    else if (e.key === 'Escape') finish(false);
  });
}

function addMemo() {
  const input = $('#new-input');
  const v = input.value.trim();
  if (!v) return;
  memos.unshift({
    id: genId(),
    text: v,
    done: false,
    createdAt: Date.now(),
    completedAt: null,
  });
  input.value = '';
  save();
}

async function save() {
  try { await window.api.updateMemos(memos); } catch (e) { console.error(e); }
}

function setBounce(v) {
  document.body.classList.toggle('bouncing', v);
  $('#btn-bounce').classList.toggle('active', v);
  $('#btn-bounce').title = v ? '停止移动' : '对角移动';
}

async function init() {
  try {
    memos = await window.api.getMemos();
  } catch (e) {
    memos = [];
  }
  if (!Array.isArray(memos)) memos = [];
  memos.forEach((m) => {
    if (typeof m.text !== 'string') m.text = '';
    if (typeof m.done !== 'boolean') m.done = false;
    if (!m.id) m.id = genId();
  });

  window.api.onMemosChanged((next) => { memos = next; render(); });
  window.api.onBounceState(setBounce);

  $('#btn-edit').addEventListener('click', () => setEditing(!editing));
  $('#btn-hide').addEventListener('click', () => window.api.minimize());
  $('#btn-pin').addEventListener('click', async () => {
    const p = await window.api.togglePin();
    $('#btn-pin').classList.toggle('active', p);
  });
  $('#btn-bounce').addEventListener('click', async () => {
    const b = await window.api.toggleBounce();
    setBounce(b);
  });

  $('#btn-add').addEventListener('click', addMemo);
  $('#new-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addMemo(); });
  $('#btn-toggle-done').addEventListener('click', () => { showDone = !showDone; render(); });
  $('#btn-done').addEventListener('click', () => setEditing(false));

  // 点击列表空白处，收起编辑面板
  $('#list').addEventListener('click', (e) => {
    if (!editing) return;
    if (e.target === $('#list') || e.target.closest('.empty')) setEditing(false);
  });

  // 右下角拖拽调整窗口大小
  const grip = $('#resize-grip');
  grip.addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const startX = e.screenX;
    const startY = e.screenY;
    const { width, height, scale } = await window.api.getSize();
    const s = scale || 1;
    const minW = 240, minH = 300;

    const onMove = (ev) => {
      const w = Math.max(minW, width + (ev.screenX - startX) / s);
      const h = Math.max(minH, height + (ev.screenY - startY) / s);
      window.api.setSize(w, h);
    };
    const onEnd = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onEnd);
      grip.removeEventListener('pointercancel', onEnd);
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onEnd);
    grip.addEventListener('pointercancel', onEnd);
  });

  const s = await window.api.getState();
  $('#btn-pin').classList.toggle('active', s.pin);
  setBounce(s.bounce);

  render();
}

init();
