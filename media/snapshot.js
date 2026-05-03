(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const persisted = vscode.getState() || {};
  let state = persisted.state || { refs: [], scriptName: null };
  let query = persisted.query || '';

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'state') {
      state = e.data.state;
      vscode.setState({ state: state, query: query });
      render();
    }
  });

  function render() {
    if (!state.refs || state.refs.length === 0) {
      root.innerHTML = renderEmpty();
      return;
    }
    const summary = state.scriptName
      ? state.refs.length + ' element' + (state.refs.length === 1 ? '' : 's') + ' from ' + esc(state.scriptName)
      : state.refs.length + ' elements';
    root.innerHTML =
      '<div class="toolbar">' +
        '<label class="search">' +
          '<i class="codicon codicon-search"></i>' +
          '<input id="search" type="search" placeholder="Filter by ref, type, label" autocomplete="off" spellcheck="false" />' +
        '</label>' +
      '</div>' +
      '<div class="summary">' + summary + '</div>' +
      '<div class="tree" id="tree">' +
        state.refs.map(renderRow).join('') +
      '</div>';
    bind();
    if (query) {
      const input = document.getElementById('search');
      if (input) input.value = query;
      applyFilter();
    }
  }

  function renderEmpty() {
    return '<div class="empty">' +
      'No snapshot yet.<br>' +
      'Run <code>snapshot -i</code> in your .ad to capture one.' +
    '</div>';
  }

  function renderRow(ref) {
    const padding = (ref.depth || 0) * 12;
    const type = ref.type || '';
    const label = ref.label;
    const haystack = (ref.id + ' ' + type + ' ' + (label || '')).toLowerCase();
    const labelHtml = label
      ? '<span class="label"><span class="label-text">' + esc(label) + '</span><span class="label-type">[' + esc(type) + ']</span></span>'
      : '<span class="label no-label"><span class="label-text">' + esc(type || 'unnamed') + '</span></span>';
    return '<div class="row" data-id="' + esc(ref.id) + '" data-type="' + esc(type) + '" data-search="' + esc(haystack) + '" style="padding-left:' + (6 + padding) + 'px">' +
      '<i class="codicon ' + iconForType(type) + ' icon"></i>' +
      '<span class="ref">@' + esc(ref.id) + '</span>' +
      labelHtml +
      '<span class="actions">' +
        '<button class="action insert" data-action="insert" data-ref="' + esc(ref.id) + '" title="Insert at cursor">→ Insert</button>' +
        '<button class="action copy" data-action="copy" data-ref="' + esc(ref.id) + '" title="Copy"><i class="codicon codicon-clippy"></i></button>' +
      '</span>' +
    '</div>';
  }

  function iconForType(type) {
    switch ((type || '').toLowerCase()) {
      case 'application': return 'codicon-window';
      case 'window':      return 'codicon-window';
      case 'button':      return 'codicon-debug-line-by-line';
      case 'text':
      case 'statictext':  return 'codicon-symbol-string';
      case 'image':       return 'codicon-file-media';
      case 'textfield':
      case 'searchfield': return 'codicon-edit';
      case 'switch':
      case 'toggle':      return 'codicon-circle-large-filled';
      case 'cell':        return 'codicon-symbol-array';
      case 'other':       return 'codicon-symbol-misc';
      default:            return 'codicon-symbol-namespace';
    }
  }

  function bind() {
    document.querySelectorAll('.row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        const target = e.target;
        if (target instanceof HTMLElement && target.closest('.action')) return;
        const refId = row.getAttribute('data-id');
        if (refId) vscode.postMessage({ type: 'insert', refId: refId });
      });
    });

    document.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const refId = btn.getAttribute('data-ref');
        if (!action || !refId) return;
        vscode.postMessage({ type: action, refId: refId });
        if (action === 'copy') {
          flashCopied(btn);
        }
      });
    });

    const search = document.getElementById('search');
    if (search) {
      search.addEventListener('input', function () {
        query = search.value || '';
        vscode.setState({ state: state, query: query });
        applyFilter();
      });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          search.value = '';
          query = '';
          vscode.setState({ state: state, query: query });
          applyFilter();
        }
      });
    }
  }

  function applyFilter() {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('.row').forEach(function (row) {
      const haystack = row.getAttribute('data-search') || '';
      row.hidden = q.length > 0 && haystack.indexOf(q) === -1;
    });
  }

  function flashCopied(btn) {
    const original = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '<i class="codicon codicon-check"></i>';
    setTimeout(function () {
      btn.classList.remove('copied');
      btn.innerHTML = original;
    }, 1200);
  }

  const esc = window.AgentDevice.escapeHtml;

  vscode.postMessage({ type: 'ready' });
})();
