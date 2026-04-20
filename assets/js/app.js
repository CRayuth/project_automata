(() => {
  // ── Init ──────────────────────────────────────
  Grid.init();
  log('System boot complete.', 'ok');
  log('Unit RX-9 ready. Awaiting commands.', 'info');
  log(`Valid: ${API.VALID.join(' · ')}`, 'dim');

  let cmdCount = 0;
  let errCount = 0;
  let battery  = 87;

  // Clock
  const clockEl = document.getElementById('clock');
  function tick() { clockEl.textContent = new Date().toTimeString().slice(0, 8); }
  tick(); setInterval(tick, 1000);

  // Battery drain
  setInterval(() => {
    battery = Math.max(0, battery - Math.random() * 0.25);
    const pct = Math.round(battery);
    document.getElementById('stat-battery').textContent = pct + '%';
    document.getElementById('stat-battery').className =
      `text-lg font-bold font-mono mb-2 ${pct < 20 ? 'text-red-400' : pct < 50 ? 'text-yellow-400' : 'text-green-400'}`;
    document.getElementById('battery-fill').style.width = pct + '%';
    document.getElementById('battery-fill').style.background =
      pct < 20 ? '#ef4444' : pct < 50 ? '#eab308' : '#22c55e';
  }, 3500);

  // ── Events ────────────────────────────────────
  document.getElementById('run-btn').addEventListener('click', handleRun);
  document.getElementById('reset-btn').addEventListener('click', () => {
    Grid.reset();
    log('Manual reset — origin (0,0).', 'warn');
  });
  document.getElementById('cmd-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRun();
  });
  document.getElementById('clear-log').addEventListener('click', () => {
    document.getElementById('log-output').innerHTML = '';
    log('Log cleared.', 'dim');
  });
  document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('cmd-input');
      const cmd = btn.dataset.cmd;
      input.value = input.value.trim() ? `${input.value.trim()} ${cmd}` : cmd;
      input.focus();
    });
  });

  // ── Run handler ───────────────────────────────
  async function handleRun() {
    const input   = document.getElementById('cmd-input');
    const runBtn  = document.getElementById('run-btn');
    const runLabel = document.getElementById('run-label');
    const raw = input.value.trim();

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
        input.value = '';
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
    if (cmd === 'RESET') {
      Grid.reset();
      log('RESET → origin (0,0)', 'warn');
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
    const ts  = new Date().toTimeString().slice(0, 8);
    const line = document.createElement('div');
    line.className = 'log-line flex gap-2 items-baseline px-4 py-[3px]';
    line.innerHTML = `
      <span class="text-neutral-700 flex-shrink-0">[${ts}]</span>
      <span class="${COLOR[type] || COLOR.ok}">${escHtml(msg)}</span>
    `;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
    while (out.children.length > 100) out.removeChild(out.firstChild);
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();