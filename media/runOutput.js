(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const persisted = vscode.getState() || {};
  let state = persisted.state || { kind: 'list', files: [] };
  let elapsedTimer = null;
  const expanded = new Set(persisted.expanded || []);

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'state') {
      state = e.data.state;
      vscode.setState({ state: state, expanded: Array.from(expanded) });
      render();
    }
  });

  function render() {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    if (state.kind === 'list') {
      renderList();
    } else {
      renderRun();
    }
    bind();
  }

  function renderList() {
    const hasFiles = state.files && state.files.length > 0;
    const header =
      '<div class="list-header">' +
        '<span class="list-title">' +
          (hasFiles
            ? state.files.length + ' .ad ' + (state.files.length === 1 ? 'script' : 'scripts')
            : 'Agent Device') +
        '</span>' +
        '<button id="new-file" class="ghost" title="New from template">' +
          '<i class="codicon codicon-new-file"></i>New' +
        '</button>' +
      '</div>';

    let body;
    if (!hasFiles) {
      body =
        '<div class="empty-state">' +
          '<i class="codicon codicon-file-code empty-icon"></i>' +
          '<h3>No .ad scripts yet</h3>' +
          '<p>Create one from a template, or start from an empty file.</p>' +
          '<button id="new-file-empty">' +
            '<i class="codicon codicon-new-file"></i>Create from template' +
          '</button>' +
        '</div>';
    } else {
      body = '<ol class="files">' +
        state.files.map(function (file) {
          return '<li class="file" data-uri="' + esc(file.uri) + '" title="Run">' +
            '<i class="codicon codicon-file-code"></i>' +
            '<span class="file-path">' + esc(file.relativePath) + '</span>' +
            '<i class="codicon codicon-play file-run-hint" title="Run"></i>' +
          '</li>';
        }).join('') +
      '</ol>';
    }
    root.innerHTML = header + body;
  }

  function renderRun() {
    const back = '<div class="actions"><button id="back" class="ghost"><i class="codicon codicon-arrow-left"></i>Back to list</button></div>';
    const summary = renderSummary();
    let actions = '';
    if (state.status === 'running') {
      actions = '<div class="actions"><button id="stop"><i class="codicon codicon-debug-stop"></i>Stop</button></div>';
    } else if (state.status !== 'idle') {
      const buttons = ['<button id="run">Re-run</button>'];
      if (state.reportAvailable) {
        buttons.push('<button id="open-report" class="ghost"><i class="codicon codicon-file-symlink-file"></i>View report</button>');
      }
      actions = '<div class="actions">' + buttons.join('') + '</div>';
    }
    const list = state.steps && state.steps.length
      ? '<ol class="steps">' + state.steps.map(renderStep).join('') + '</ol>'
      : '<div class="placeholder">No steps to show.</div>';
    root.innerHTML = back + summary + actions + list;

    if (state.status === 'running' && state.startedAt) {
      const startedAt = state.startedAt;
      elapsedTimer = setInterval(function () {
        const el = document.getElementById('elapsed');
        if (el) el.textContent = formatDuration(Date.now() - startedAt);
        const running = document.querySelector('li.step.running');
        if (running) {
          const stepStartedAtAttr = running.getAttribute('data-started-at');
          if (stepStartedAtAttr) {
            const stepStartedAt = Number(stepStartedAtAttr);
            const dur = running.querySelector('.step-duration');
            if (dur) dur.textContent = formatDuration(Date.now() - stepStartedAt);
          }
        }
      }, 100);
    }
  }

  function renderSummary() {
    const status = statusHtml(state.status);
    const name = state.scriptName ? '<span class="script-name" id="reveal">' + esc(state.scriptName) + '</span>' : '';
    const dur = state.status === 'running'
      ? '<span class="duration" id="elapsed">0ms</span>'
      : (state.durationMs != null ? '<span class="duration">' + formatDuration(state.durationMs) + '</span>' : '');
    return '<div class="summary">' + status + name + dur + '</div>';
  }

  function statusHtml(status) {
    if (status === 'running')   return '<span class="status running"><i class="codicon codicon-loading codicon-modifier-spin"></i>Running</span>';
    if (status === 'success')   return '<span class="status success"><i class="codicon codicon-pass-filled"></i>Pass</span>';
    if (status === 'failure')   return '<span class="status failure"><i class="codicon codicon-error"></i>Fail</span>';
    if (status === 'cancelled') return '<span class="status cancelled"><i class="codicon codicon-circle-slash"></i>Cancelled</span>';
    return '';
  }

  function stepIconHtml(state) {
    if (state === 'pending') return '<span class="step-icon pending"><i class="codicon codicon-circle-large-outline"></i></span>';
    if (state === 'running') return '<span class="step-icon running"><i class="codicon codicon-loading codicon-modifier-spin"></i></span>';
    if (state === 'passed')  return '<span class="step-icon passed"><i class="codicon codicon-pass-filled"></i></span>';
    if (state === 'failed')  return '<span class="step-icon failed"><i class="codicon codicon-error"></i></span>';
    if (state === 'skipped') return '<span class="step-icon skipped"><i class="codicon codicon-circle-slash"></i></span>';
    return '';
  }

  function renderStep(step) {
    const isExpanded = expanded.has(step.index);
    const dur = step.durationMs != null ? formatDuration(step.durationMs) : '';
    const startedAt = step.state === 'running' && step.startedAt ? step.startedAt : '';
    const header =
      '<div class="step-header" data-step="' + step.index + '">' +
        stepIconHtml(step.state) +
        '<span class="step-line" data-line="' + step.lineNumber + '">L' + step.lineNumber + '</span>' +
        '<span class="step-text">' + esc(step.display) + '</span>' +
        '<span class="step-duration">' + dur + '</span>' +
      '</div>';
    const body = isExpanded ? renderStepBody(step) : '';
    return '<li class="step ' + step.state + (isExpanded ? ' expanded' : '') + '"' +
      (startedAt ? ' data-started-at="' + startedAt + '"' : '') + '>' + header + body + '</li>';
  }

  function renderStepBody(step) {
    const parts = [];
    if (step.errorMessage) {
      parts.push(renderOutputBlock('Error', step.errorMessage, 'error'));
    }
    if (step.stderr && step.stderr.trim()) {
      parts.push(renderOutputBlock('stderr', step.stderr.trim(), ''));
    }
    if (step.stdout && step.stdout.trim()) {
      parts.push(renderOutputBlock('stdout', step.stdout.trim(), ''));
    }
    if (parts.length === 0) {
      const placeholder = step.state === 'running' ? 'in progress…' : 'no output';
      parts.push('<div class="step-body"><div class="label-row"><span class="label">' + placeholder + '</span></div></div>');
    }
    return parts.join('');
  }

  function renderOutputBlock(label, text, extraClass) {
    return '<div class="step-body ' + extraClass + '">' +
      '<div class="label-row">' +
        '<span class="label">' + esc(label) + '</span>' +
        '<button class="copy-btn" type="button" title="Copy"><i class="codicon codicon-clippy"></i><span class="copy-label">Copy</span></button>' +
      '</div>' +
      '<pre>' + esc(text) + '</pre>' +
    '</div>';
  }

  function bind() {
    const runBtn = document.getElementById('run');
    if (runBtn) runBtn.addEventListener('click', function () { vscode.postMessage({ type: 'run' }); });

    const stopBtn = document.getElementById('stop');
    if (stopBtn) stopBtn.addEventListener('click', function () { vscode.postMessage({ type: 'cancel' }); });

    const reportBtn = document.getElementById('open-report');
    if (reportBtn) reportBtn.addEventListener('click', function () { vscode.postMessage({ type: 'open-report' }); });

    const backBtn = document.getElementById('back');
    if (backBtn) backBtn.addEventListener('click', function () { vscode.postMessage({ type: 'show-list' }); });

    const newBtn = document.getElementById('new-file');
    if (newBtn) newBtn.addEventListener('click', function () { vscode.postMessage({ type: 'new-file' }); });
    const newBtnEmpty = document.getElementById('new-file-empty');
    if (newBtnEmpty) newBtnEmpty.addEventListener('click', function () { vscode.postMessage({ type: 'new-file' }); });

    const reveal = document.getElementById('reveal');
    if (reveal) reveal.addEventListener('click', function () { vscode.postMessage({ type: 'reveal-script' }); });

    const fileRows = document.querySelectorAll('li.file');
    fileRows.forEach(function (row) {
      row.addEventListener('click', function () {
        const uri = row.getAttribute('data-uri');
        if (uri) vscode.postMessage({ type: 'run-file', uri: uri });
      });
    });

    const expandableHeaders = document.querySelectorAll('li.step.passed > .step-header, li.step.failed > .step-header, li.step.running > .step-header');
    expandableHeaders.forEach(function (header) {
      header.addEventListener('click', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('step-line')) {
          return;
        }
        const idx = Number(header.getAttribute('data-step'));
        if (expanded.has(idx)) expanded.delete(idx); else expanded.add(idx);
        vscode.setState({ state: state, expanded: Array.from(expanded) });
        render();
      });
    });

    const lineLinks = document.querySelectorAll('.step-line');
    lineLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.stopPropagation();
        const lineNumber = Number(link.getAttribute('data-line'));
        vscode.postMessage({ type: 'reveal-line', lineNumber: lineNumber });
      });
    });

    const copyButtons = document.querySelectorAll('.copy-btn');
    copyButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const body = btn.closest('.step-body');
        const pre = body && body.querySelector('pre');
        if (!pre) return;
        const text = pre.textContent || '';
        Promise.resolve(navigator.clipboard.writeText(text))
          .then(function () { flashCopied(btn, 'Copied'); })
          .catch(function () { flashCopied(btn, 'Failed'); });
      });
    });
  }

  function flashCopied(btn, label) {
    const span = btn.querySelector('.copy-label');
    if (!span) return;
    btn.classList.add('copied');
    span.textContent = label;
    setTimeout(function () {
      btn.classList.remove('copied');
      span.textContent = 'Copy';
    }, 1200);
  }

  const esc = window.AgentDevice.escapeHtml;
  const formatDuration = window.AgentDevice.formatDuration;

  vscode.postMessage({ type: 'ready' });
})();
