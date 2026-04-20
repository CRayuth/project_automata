(() => {
  // ── Init ──────────────────────────────────────
  Grid.init();
  log('System boot complete.', 'ok');
  log('Unit RX-9 ready. Awaiting commands.', 'info');
  log(`Valid: ${API.VALID.join(' · ')}`, 'dim');

  let cmdCount = 0;
  let errCount = 0;
  let energy = 3;
  let isRunning = true;
  let isHolding = false;

  // CLI panel
  const cliPanel = document.getElementById('cli-panel');
  const openCliBtn = document.getElementById('open-cli-btn');
  const closeCliBtn = document.getElementById('close-cli-btn');
  const cliInput = document.getElementById('cli-input');

  function isCliOpen() {
    return cliPanel && cliPanel.classList.contains('cli-open');
  }

  function openCli() {
    if (!cliPanel) return;
    cliPanel.classList.remove('hidden');
    document.body.classList.add('cli-open');
    cliPanel.classList.add('cli-open');
    if (openCliBtn) openCliBtn.setAttribute('aria-expanded', 'true');
    if (cliInput) cliInput.focus();
  }

  function closeCli() {
    if (!cliPanel) return;
    if (openCliBtn) openCliBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('cli-open');
    cliPanel.classList.remove('cli-open');
    window.setTimeout(() => {
      if (cliPanel && !isCliOpen()) cliPanel.classList.add('hidden');
    }, 200);
  }

  updateEnergyUI();
  updateHoldingUI();
  updateModeUI();

  // ── Events ────────────────────────────────────
  document.getElementById('run-btn').addEventListener('click', () => handleRun('START'));
  document.getElementById('reset-btn').addEventListener('click', () => {
    Grid.reset();
    isRunning = true;
    isHolding = false;
    energy = 3;
    updateHoldingUI();
    updateEnergyUI();
    updateModeUI();
    log('Manual reset — origin (0,0).', 'warn');
  });
  const clearLogBtn = document.getElementById('clear-log');
  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', () => {
      const logOut = document.getElementById('log-output');
      if (logOut) logOut.innerHTML = '';
      log('Log cleared.', 'dim');
    });
  }
  document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const runBtn = document.getElementById('run-btn');
      if (runBtn && runBtn.disabled) return;
      const cmd = btn.dataset.cmd;
      if (!cmd) return;
      await handleRun(cmd);
    });
  });

  if (openCliBtn && cliPanel) {
    openCliBtn.addEventListener('click', () => {
      if (isCliOpen()) closeCli();
      else openCli();
    });
  }

  if (closeCliBtn && cliPanel) {
    closeCliBtn.addEventListener('click', closeCli);
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isCliOpen()) closeCli();
  });

  if (cliInput) {
    cliInput.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return;
      const value = cliInput.value.trim();
      if (!value) return;
      await handleRun(value);
      cliInput.value = '';
    });
  }

  // ── Run handler ───────────────────────────────
  async function handleRun(rawInput = 'START') {
    const runBtn  = document.getElementById('run-btn');
    const runLabel = document.getElementById('run-label');
    const raw = String(rawInput || '').trim();

    runBtn.disabled = true;
    runLabel.textContent = 'Sending…';
    log(`TX → "${raw || '(empty)'}"`, 'dim');

    try {
      const res = await API.sendCommands(raw);

      if (!res.success) {
        log(res.message, 'err');
        errCount++;
        document.getElementById('stat-errs').textContent = errCount;
      } else {
        log(res.message, 'ok');
        if (res.invalid.length) {
          log(`Ignored: [${res.invalid.join(', ')}]`, 'warn');
        }
        await runSequence(res.commands);
      }
    } catch (e) {
      log('FATAL: Unexpected error.', 'err');
    }

    runBtn.disabled = false;
    runLabel.textContent = 'Execute';
  }

  async function runSequence(commands) {
    for (const cmd of commands) {
      await new Promise(r => setTimeout(r, 190));
      executeCmd(cmd);
    }
    const pos = Grid.getPosition();
    log(`Halt @ X:${pos.col} Y:${7 - pos.row} DIR:${pos.direction}`, 'info');
  }

  function executeCmd(cmd) {
    if (cmd === 'START') {
      isRunning = true;
      updateModeUI();
      log('START → unit active', 'info');
      return;
    }

    if (cmd === 'STOP') {
      isRunning = false;
      updateModeUI();
      log('STOP → unit paused', 'warn');
      return;
    }

    if (cmd === 'RECHARGE') {
      energy = 3;
      updateEnergyUI();
      log('RECHARGE → energy restored to 3/3', 'ok');
      return;
    }

    if (cmd === 'PICK') {
      if (isHolding) {
        log('PICK → already holding object', 'warn');
        return;
      }
      if (!consumeEnergy(1)) {
        errCount++;
        document.getElementById('stat-errs').textContent = errCount;
        log('PICK → blocked: no energy', 'err');
        return;
      }
      isHolding = true;
      Grid.setCarrying(true);
      updateHoldingUI();
      cmdCount++;
      document.getElementById('stat-cmds').textContent = cmdCount;
      log('PICK → object secured', 'ok');
      return;
    }

    if (cmd === 'DROP') {
      if (!isHolding) {
        log('DROP → nothing to drop', 'warn');
        return;
      }
      isHolding = false;
      Grid.setCarrying(false);
      updateHoldingUI();
      cmdCount++;
      document.getElementById('stat-cmds').textContent = cmdCount;
      log('DROP → object released', 'ok');
      return;
    }

    if (cmd === 'RESET') {
      Grid.reset();
      isRunning = true;
      isHolding = false;
      energy = 3;
      updateHoldingUI();
      updateEnergyUI();
      updateModeUI();
      log('RESET → origin (0,0)', 'warn');
      return;
    }

    if (!isRunning) {
      log(`${cmd} → ignored: unit is stopped`, 'warn');
      return;
    }

    if (energy < 1) {
      errCount++;
      document.getElementById('stat-errs').textContent = errCount;
      log(`${cmd} → blocked: no energy (use RECHARGE)`, 'err');
      return;
    }

    const { row, col } = Grid.getPosition();
    const moves = {
      UP:    { dr: -1, dc:  0, dir: 'NORTH' },
      DOWN:  { dr:  1, dc:  0, dir: 'SOUTH' },
      LEFT:  { dr:  0, dc: -1, dir: 'WEST'  },
      RIGHT: { dr:  0, dc:  1, dir: 'EAST'  },
    };
    const m = moves[cmd];
    if (!m) return;

    const moved = Grid.move(row + m.dr, col + m.dc, m.dir);
    if (moved) {
      consumeEnergy(1);
      cmdCount++;
      document.getElementById('stat-cmds').textContent = cmdCount;
      const pos = Grid.getPosition();
      log(`${cmd} → (${pos.col}, ${7 - pos.row})`, 'ok');
    } else {
      errCount++;
      document.getElementById('stat-errs').textContent = errCount;
      log(`${cmd} → blocked: boundary`, 'err');
    }
  }

  // ── Logger ─────────────────────────────────────
  const COLOR = {
    ok:   'text-green-400',
    err:  'text-red-400',
    warn: 'text-yellow-400',
    info: 'text-blue-400',
    dim:  'text-neutral-600',
  };

  function log(msg, type = 'ok') {
    const out = document.getElementById('log-output');
    if (!out) return;
    const ts  = new Date().toTimeString().slice(0, 8);
    const line = document.createElement('div');
    line.className = 'log-line flex gap-2 items-baseline px-4 py-[3px]';
    line.innerHTML = `
      <span class="text-neutral-700 shrink-0">[${ts}]</span>
      <span class="${COLOR[type] || COLOR.ok}">${escHtml(msg)}</span>
    `;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
    while (out.children.length > 100) out.removeChild(out.firstChild);
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function consumeEnergy(units) {
    if (energy < units) return false;
    energy -= units;
    updateEnergyUI();
    return true;
  }

  function updateEnergyUI() {
    const stat = document.getElementById('stat-energy');
    const dots = [
      document.getElementById('energy-dot-1'),
      document.getElementById('energy-dot-2'),
      document.getElementById('energy-dot-3'),
    ];

    if (stat) {
      stat.textContent = `${energy}/3`;
      stat.className = `text-2xl font-extrabold font-mono mb-3 ${energy === 0 ? 'text-red-500' : energy === 1 ? 'text-amber-500' : 'text-green-600'}`;
    }

    dots.forEach((dot, idx) => {
      if (!dot) return;
      const filled = idx < energy;
      dot.className = `w-3 h-3 rounded-full ${filled ? 'bg-green-500' : 'bg-border'}`;
    });
  }

  function updateHoldingUI() {
    const indicator = document.getElementById('holding-indicator');
    if (!indicator) return;
    indicator.textContent = isHolding ? 'YES' : 'NO';
    indicator.className = `inline-flex items-center px-2 py-0.5 rounded-md border border-border font-semibold ${isHolding ? 'bg-amber-100 text-amber-700' : 'bg-surface text-gray'}`;
  }

  function updateModeUI() {
    const indicator = document.getElementById('mode-indicator');
    if (!indicator) return;
    indicator.textContent = isRunning ? 'RUNNING' : 'STOPPED';
    indicator.className = `inline-flex items-center px-2 py-0.5 rounded-md border border-border font-semibold ${isRunning ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`;
  }
})();