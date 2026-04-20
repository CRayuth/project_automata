(() => {
  // ── Init ──────────────────────────────────────
  Grid.init();
  log('System boot complete.', 'ok');
  log('Unit RX-9 ready. Awaiting commands.', 'info');
  log(`Valid: ${API.VALID.join(' · ')}`, 'dim');

  let cmdCount = 0;
  let errCount = 0;
  let energy = 3;
  let isPoweredOn = false;
  let isRunning = false;
  let isHolding = false;
  let isCommandBusy = false;
  const moveAudio = new Audio('assets/audio/sound_vaccum.mp3');
  moveAudio.preload = 'auto';
  let isAudioEnabled = true;
  let isMoveAudioUnlocked = false;
  const toastCooldowns = Object.create(null);

  const ALERT_STYLE = {
    success: {
      wrap: 'bg-green-100 border-l-4 border-green-500 text-green-900',
      icon: 'text-green-600',
      label: 'Success',
    },
    info: {
      wrap: 'bg-blue-100 border-l-4 border-blue-500 text-blue-900',
      icon: 'text-blue-600',
      label: 'Info',
    },
    warning: {
      wrap: 'bg-yellow-100 border-l-4 border-yellow-500 text-yellow-900',
      icon: 'text-yellow-600',
      label: 'Warning',
    },
    error: {
      wrap: 'bg-red-100 border-l-4 border-red-500 text-red-900',
      icon: 'text-red-600',
      label: 'Error',
    },
  };

  // CLI panel
  const cliPanel = document.getElementById('cli-panel');
  const openCliBtn = document.getElementById('open-cli-btn');
  const closeCliBtn = document.getElementById('close-cli-btn');
  const cliInput = document.getElementById('cli-input');
  const docPanel = document.getElementById('doc-panel');
  const toggleDocBtn = document.getElementById('toggle-doc-btn');
  const audioToggleBtn = document.getElementById('audio-toggle-btn');
  const audioOffSlash = document.getElementById('audio-off-slash');
  const placeItemBtn = document.getElementById('place-item-btn');
  const placeXInput = document.getElementById('place-x-input');
  const placeYInput = document.getElementById('place-y-input');

  function isDocOpen() {
    return docPanel && docPanel.classList.contains('doc-open');
  }

  function openDocPanel() {
    if (!docPanel) return;
    docPanel.classList.add('doc-open');
    if (toggleDocBtn) toggleDocBtn.setAttribute('aria-expanded', 'true');
  }

  function closeDocPanel() {
    if (!docPanel) return;
    docPanel.classList.remove('doc-open');
    if (toggleDocBtn) toggleDocBtn.setAttribute('aria-expanded', 'false');
  }

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
  updateAudioToggleUI();
  updateStartButtonUI();

  // ── Events ────────────────────────────────────
  document.getElementById('run-btn').addEventListener('click', () => handleRun('START'));
  document.getElementById('reset-btn').addEventListener('click', () => handleRun('RESET'));
  const endBtn = document.getElementById('end-btn');
  if (endBtn) {
    endBtn.addEventListener('click', () => handleRun('END'));
  }
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
      if (isCommandBusy) return;
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

  if (toggleDocBtn && docPanel) {
    toggleDocBtn.addEventListener('click', () => {
      if (isDocOpen()) closeDocPanel();
      else openDocPanel();
    });

    document.addEventListener('click', e => {
      if (!isDocOpen()) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (docPanel.contains(target) || toggleDocBtn.contains(target)) return;
      closeDocPanel();
    });
  }

  if (audioToggleBtn) {
    audioToggleBtn.addEventListener('click', () => {
      isAudioEnabled = !isAudioEnabled;
      updateAudioToggleUI();
    });
  }

  if (placeItemBtn && placeXInput && placeYInput) {
    const placeFromInput = () => {
      if (isHolding) {
        notifyToast('warning', 'Cannot place a new item while robot is holding one.', 'place-item-while-holding', 1000);
        return;
      }
      const x = Number.parseInt(placeXInput.value, 10);
      const y = Number.parseInt(placeYInput.value, 10);
      const res = Grid.placeItem(x, y);
      if (!res.ok) {
        notifyToast('warning', res.reason || 'Invalid coordinates.', 'place-item-invalid', 700);
        return;
      }
      notifyToast('success', `Item placed at (${x}, ${y}).`, 'place-item-success', 300);
      log(`ITEM → placed at (${x}, ${y})`, 'info');
    };

    placeItemBtn.addEventListener('click', placeFromInput);
    [placeXInput, placeYInput].forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') placeFromInput();
      });
    });
  }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (isCliOpen()) closeCli();
      else openCli();
      return;
    }
    if (e.key === 'Escape' && isCliOpen()) closeCli();
    if (e.key === 'Escape' && isDocOpen()) closeDocPanel();
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
    const runLabel = document.getElementById('run-label');
    const raw = String(rawInput || '').trim();
    const upperRaw = raw.toUpperCase();

    if (isCommandBusy) return;

    // Fast-path UX: clicking START again should immediately inform user.
    if (upperRaw === 'START' && isPoweredOn) {
      notifyToast('info', 'START already active.', 'already-started-click', 0);
      log('START → ignored: robot already active', 'info');
      return;
    }

    unlockMoveAudio();

    isCommandBusy = true;
    if (upperRaw === 'START' && !isPoweredOn && runLabel) {
      runLabel.textContent = 'Sending…';
    }
    log(`TX → "${raw || '(empty)'}"`, 'dim');

    try {
      const res = await API.sendCommands(raw);

      if (!res.success) {
        log(res.message, 'err');
        errCount++;
        document.getElementById('stat-errs').textContent = errCount;
        const invalidInMessage = /no valid commands/i.test(res.message);
        if (invalidInMessage) {
          notifyToast('warning', res.message.replace(/^ERR:\s*/, ''), 'wrong-command', 1800);
        } else {
          notifyToast('error', res.message.replace(/^ERR:\s*/, ''), 'api-error', 1800);
        }
      } else {
        log(res.message, 'ok');
        if (res.invalid.length) {
          log(`Ignored: [${res.invalid.join(', ')}]`, 'warn');
          notifyToast('warning', `Wrong command ignored: ${res.invalid.join(', ')}`, 'wrong-command', 1800);
        }
        await runSequence(res.commands);
      }
    } catch (e) {
      log('FATAL: Unexpected error.', 'err');
      notifyToast('error', 'Unexpected error while sending command.', 'fatal-error', 2200);
    }

    isCommandBusy = false;
    updateStartButtonUI();
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
      if (isPoweredOn) {
        notifyToast('info', 'Robot already started.', 'already-started', 1200);
        log('START → ignored: robot already active', 'info');
        return;
      }
      isPoweredOn = true;
      isRunning = true;
      updateModeUI();
      updateStartButtonUI();
      notifyToast('success', 'Robot started. Commands enabled.', 'robot-started', 800);
      log('START → unit active', 'info');
      return;
    }

    if (cmd === 'END') {
      if (!isPoweredOn) {
        notifyToast('info', 'Robot is already ended.', 'already-ended', 1200);
        log('END → ignored: robot already inactive', 'info');
        return;
      }
      isPoweredOn = false;
      isRunning = false;
      isHolding = false;
      Grid.setCarrying(false);
      updateHoldingUI();
      updateModeUI();
      updateStartButtonUI();
      notifyToast('success', 'Robot ended. Send START to begin again.', 'robot-ended', 800);
      log('END → session closed', 'warn');
      return;
    }

    if (cmd === 'STOP') {
      isRunning = false;
      updateModeUI();
      log('STOP → unit paused', 'warn');
      return;
    }

    if (cmd === 'RECHARGE') {
      if (energy === 3) {
        showToast('info', 'RECHARGE not needed: energy is already full (3/3).');
        log('RECHARGE → already full (3/3)', 'info');
        return;
      }
      energy = 3;
      updateEnergyUI();
      showToast('success', 'RECHARGE completed: energy restored to 3/3.');
      log('RECHARGE → energy restored to 3/3', 'ok');
      return;
    }

    if (cmd === 'PICK') {
      if (isHolding) {
        showToast('warning', 'PICK blocked: robot is already holding an item.');
        log('PICK → already holding object', 'warn');
        return;
      }
      const pickRes = Grid.pickItemAtRobot();
      if (!pickRes.ok) {
        showToast('warning', `PICK blocked: ${pickRes.reason}`);
        log(`PICK → blocked: ${pickRes.reason}`, 'warn');
        return;
      }
      if (!consumeEnergy(1)) {
        errCount++;
        document.getElementById('stat-errs').textContent = errCount;
        // Revert pick when energy check fails.
        Grid.dropItemAtRobot();
        notifyToast('error', 'No energy left. Use RECHARGE.', 'no-energy', 1400);
        log('PICK → blocked: no energy', 'err');
        return;
      }
      isHolding = true;
      Grid.setCarrying(true);
      updateHoldingUI();
      cmdCount++;
      document.getElementById('stat-cmds').textContent = cmdCount;
      showToast('success', 'PICK completed: item secured from current cell.');
      log('PICK → object secured', 'ok');
      return;
    }

    if (cmd === 'DROP') {
      if (!isHolding) {
        showToast('warning', 'DROP blocked: there is no item to drop.');
        log('DROP → nothing to drop', 'warn');
        return;
      }
      const dropRes = Grid.dropItemAtRobot();
      if (!dropRes.ok) {
        showToast('warning', `DROP blocked: ${dropRes.reason}`);
        log(`DROP → blocked: ${dropRes.reason}`, 'warn');
        return;
      }
      isHolding = false;
      Grid.setCarrying(false);
      updateHoldingUI();
      cmdCount++;
      document.getElementById('stat-cmds').textContent = cmdCount;
      showToast('success', 'DROP completed: item placed on current cell.');
      log('DROP → object released', 'ok');
      return;
    }

    if (cmd === 'RESET') {
      Grid.reset();
      isRunning = isPoweredOn;
      isHolding = false;
      energy = 3;
      updateHoldingUI();
      updateEnergyUI();
      updateModeUI();
      log('RESET → origin (0,0)', 'warn');
      return;
    }

    if (!isPoweredOn) {
      notifyToast('warning', 'Robot is OFF. Start with START first.', 'start-required', 1200);
      log(`${cmd} → blocked: START required`, 'warn');
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
      notifyToast('error', 'No energy left. Use RECHARGE.', 'no-energy', 1400);
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
      playMoveAudio();
      cmdCount++;
      document.getElementById('stat-cmds').textContent = cmdCount;
      const pos = Grid.getPosition();
      log(`${cmd} → (${pos.col}, ${7 - pos.row})`, 'ok');
    } else {
      errCount++;
      document.getElementById('stat-errs').textContent = errCount;
      log(`${cmd} → blocked: boundary`, 'err');
      notifyToast('error', 'Movement blocked by boundary.', 'boundary-error', 1400);
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

  function playMoveAudio() {
    if (!isAudioEnabled || !isMoveAudioUnlocked) return;
    try {
      moveAudio.currentTime = 0;
      const maybePromise = moveAudio.play();
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
    } catch {
      // Ignore playback failures (e.g., autoplay restrictions).
    }
  }

  function unlockMoveAudio() {
    if (isMoveAudioUnlocked) return;

    try {
      moveAudio.muted = true;
      const maybePromise = moveAudio.play();

      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(() => {
          moveAudio.pause();
          moveAudio.currentTime = 0;
          moveAudio.muted = false;
          isMoveAudioUnlocked = true;
        }).catch(() => {
          moveAudio.muted = false;
        });
      } else {
        moveAudio.pause();
        moveAudio.currentTime = 0;
        moveAudio.muted = false;
        isMoveAudioUnlocked = true;
      }
    } catch {
      moveAudio.muted = false;
    }
  }

  function showToast(kind, message) {
    const host = document.getElementById('toast-stack');
    if (!host) return;

    const style = ALERT_STYLE[kind] || ALERT_STYLE.info;
    const toast = document.createElement('div');
    toast.setAttribute('role', 'alert');
    toast.className = `${style.wrap} p-2.5 rounded-xl flex items-center shadow-md pointer-events-auto opacity-0 translate-y-1 transition duration-200 ease-out`;
    toast.innerHTML = `
      <svg
        stroke="currentColor"
        viewBox="0 0 24 24"
        fill="none"
        class="h-5 w-5 shrink-0 mr-2 ${style.icon}"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M13 16h-1v-4h1m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        ></path>
      </svg>
      <p class="text-sm font-semibold">${style.label} - ${escHtml(message)}</p>
    `;

    host.prepend(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('opacity-0', 'translate-y-1');
    });

    const closeToast = () => {
      toast.classList.add('opacity-0', 'translate-y-1');
      window.setTimeout(() => {
        if (toast.parentElement) toast.remove();
      }, 180);
    };

    window.setTimeout(closeToast, 2200);

    while (host.children.length > 5) {
      host.removeChild(host.lastChild);
    }
  }

  function notifyToast(kind, message, key = message, cooldownMs = 1200) {
    const cacheKey = `${kind}:${key}`;
    const now = Date.now();
    const last = toastCooldowns[cacheKey] || 0;
    if (now - last < cooldownMs) return;
    toastCooldowns[cacheKey] = now;
    showToast(kind, message);
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
    if (!isPoweredOn) {
      indicator.textContent = 'OFFLINE';
      indicator.className = 'inline-flex items-center px-2 py-0.5 rounded-md border border-border font-semibold bg-neutral-100 text-neutral-700';
      return;
    }
    indicator.textContent = isRunning ? 'RUNNING' : 'STOPPED';
    indicator.className = `inline-flex items-center px-2 py-0.5 rounded-md border border-border font-semibold ${isRunning ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`;
  }

  function updateAudioToggleUI() {
    if (!audioToggleBtn) return;
    audioToggleBtn.setAttribute('aria-pressed', String(isAudioEnabled));
    audioToggleBtn.setAttribute('aria-label', isAudioEnabled ? 'Turn movement sound off' : 'Turn movement sound on');
    if (audioOffSlash) {
      audioOffSlash.classList.toggle('hidden', isAudioEnabled);
    }
  }

  function updateStartButtonUI() {
    const runBtn = document.getElementById('run-btn');
    const runLabel = document.getElementById('run-label');
    if (!runBtn || !runLabel) return;

    if (isPoweredOn) {
      runBtn.disabled = true;
      runBtn.setAttribute('aria-disabled', 'true');
      runBtn.classList.remove('bg-blue-600', 'hover:bg-blue-500', 'text-white');
      runBtn.classList.add('bg-gray-300', 'hover:bg-gray-300', 'cursor-not-allowed', 'text-gray-800');
      runBtn.style.opacity = '1';
      runLabel.textContent = 'START';
      return;
    }

    runBtn.disabled = false;
    runBtn.setAttribute('aria-disabled', 'false');
    runBtn.classList.remove('bg-gray-300', 'hover:bg-gray-300', 'cursor-not-allowed', 'text-gray-800');
    runBtn.classList.add('bg-blue-600', 'hover:bg-blue-500', 'text-white');
    runBtn.style.opacity = '';
    runLabel.textContent = 'START';
  }
})();