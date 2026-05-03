(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const fields = (window.AgentDevice && window.AgentDevice.data && window.AgentDevice.data.fields) || [];
  let snapshot = [];
  let hasWorkspace = false;
  let scope = (vscode.getState() && vscode.getState().scope) || 'user';

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'snapshot') {
      snapshot = e.data.fields;
      hasWorkspace = !!e.data.hasWorkspace;
      if (!hasWorkspace && scope === 'workspace') scope = 'user';
      render();
    }
  });

  function render() {
    const scopeBar =
      '<div class="scope" role="tablist">' +
        scopeBtn('user', 'User') +
        scopeBtn('workspace', 'Workspace', !hasWorkspace) +
      '</div>';

    const fieldHtml = fields.map(renderField).join('');
    const footer =
      '<div class="footer">' +
        '<button class="link-btn" id="open-native">' +
          'Open in Settings UI →' +
        '</button>' +
      '</div>';
    root.innerHTML = scopeBar + '<div class="fields">' + fieldHtml + '</div>' + footer;
    bind();
  }

  function scopeBtn(value, label, disabled) {
    const selected = scope === value;
    return '<button class="scope-btn" data-scope="' + value + '"' +
      (disabled ? ' disabled' : '') +
      ' aria-selected="' + selected + '" role="tab">' + esc(label) + '</button>';
  }

  function renderField(field) {
    const snap = snapshot.find(function (s) { return s.key === field.key; }) || {};
    const scopeValue = scope === 'user' ? snap.userValue : snap.workspaceValue;
    const otherValue = scope === 'user' ? snap.workspaceValue : snap.userValue;
    const explicitlySet = scopeValue !== undefined;

    const sourceLabel = explicitlySet
      ? '<span class="field-source from-' + scope + '">' + scope + '</span>'
      : (otherValue !== undefined
          ? '<span class="field-source">inherited from ' + (scope === 'user' ? 'workspace' : 'user') + '</span>'
          : '<span class="field-source">default</span>');

    if (field.type === 'boolean') {
      const effective = explicitlySet
        ? !!scopeValue
        : (otherValue !== undefined ? !!otherValue : !!snap.defaultValue);
      return '<div class="field">' +
        '<div class="field-label">' + esc(field.label) + '</div>' +
        '<div class="field-checkbox">' +
          '<input type="checkbox" id="f-' + esc(field.key) + '"' + (effective ? ' checked' : '') + ' />' +
          '<label for="f-' + esc(field.key) + '">' + esc(field.hint) + '</label>' +
        '</div>' +
        sourceLabel +
      '</div>';
    }

    const stringValue = typeof scopeValue === 'string' ? scopeValue : '';
    const placeholder = (typeof otherValue === 'string' && otherValue) || field.placeholder || '';
    const resetBtn = explicitlySet
      ? '<button class="action" data-reset="' + esc(field.key) + '" title="Reset this scope">↺</button>'
      : '';
    return '<div class="field">' +
      '<div class="field-label">' + esc(field.label) + '</div>' +
      '<div class="field-row">' +
        '<input type="text" id="f-' + esc(field.key) + '" value="' + esc(stringValue) + '" placeholder="' + esc(placeholder) + '" />' +
        resetBtn +
      '</div>' +
      '<div class="field-hint">' + esc(field.hint) + '</div>' +
      sourceLabel +
    '</div>';
  }

  function bind() {
    document.querySelectorAll('.scope-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const next = btn.getAttribute('data-scope');
        if (!next || btn.disabled) return;
        scope = next;
        vscode.setState({ scope: scope });
        render();
      });
    });

    fields.forEach(function (field) {
      const el = document.getElementById('f-' + field.key);
      if (!el) return;
      if (field.type === 'boolean') {
        el.addEventListener('change', function () {
          vscode.postMessage({
            type: 'set',
            key: field.key,
            value: el.checked,
            scope: scope,
          });
        });
      } else {
        el.addEventListener('change', function () {
          vscode.postMessage({
            type: 'set',
            key: field.key,
            value: el.value,
            scope: scope,
          });
        });
      }
    });

    document.querySelectorAll('[data-reset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const key = btn.getAttribute('data-reset');
        if (!key) return;
        vscode.postMessage({ type: 'reset-field', key: key, scope: scope });
      });
    });

    const native = document.getElementById('open-native');
    if (native) native.addEventListener('click', function () { vscode.postMessage({ type: 'open-native' }); });
  }

  const esc = window.AgentDevice.escapeHtml;

  vscode.postMessage({ type: 'ready' });
})();
