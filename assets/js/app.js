(() => {
  // ── Init ──────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

  function initApp() {
    try {
      Grid.init();
      log('System boot complete.', 'ok');
      log('Unit RX-9 ready. Awaiting commands.', 'info');
      log(`Valid: ${API.VALID.join(' · ')}`, 'dim');
    } catch (error) {
      console.error('Failed to initialize grid:', error);
    }

  let cmdCount = 0;
  let errCount = 0;
  let energy = 3;
  let isPoweredOn = false;
  let isHolding = false;
  let isCommandBusy = false;
  let commandBuffer = []; // Accumulate commands for sequence
  const cliHistory = [];
  let cliHistoryIndex = -1;
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
  updateAudioToggleUI();
  updateStartButtonUI();

  // ── Events ────────────────────────────────────
  document.getElementById('run-btn').addEventListener('click', () => executeCmd('START'));
  document.getElementById('stop-btn').addEventListener('click', () => executeCmd('STOP'));
  document.getElementById('reset-btn').addEventListener('click', () => executeCmd('RESET'));
  const endBtn = document.getElementById('end-btn');
  if (endBtn) {
    endBtn.addEventListener('click', () => executeCmd('END'));
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
      await executeCmd(cmd);
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
      if (e.key === 'ArrowUp') {
        if (!cliHistory.length) return;
        e.preventDefault();
        if (cliHistoryIndex < 0) cliHistoryIndex = cliHistory.length;
        cliHistoryIndex = Math.max(0, cliHistoryIndex - 1);
        cliInput.value = cliHistory[cliHistoryIndex] || '';
        cliInput.setSelectionRange(cliInput.value.length, cliInput.value.length);
        return;
      }

      if (e.key === 'ArrowDown') {
        if (!cliHistory.length) return;
        e.preventDefault();
        if (cliHistoryIndex < 0) return;
        if (cliHistoryIndex < cliHistory.length - 1) {
          cliHistoryIndex += 1;
          cliInput.value = cliHistory[cliHistoryIndex] || '';
        } else {
          cliHistoryIndex = cliHistory.length;
          cliInput.value = '';
        }
        cliInput.setSelectionRange(cliInput.value.length, cliInput.value.length);
        return;
      }

      if (e.key !== 'Enter') return;
      const value = cliInput.value.trim();
      if (!value) return;
      await handleRun(value);
      cliHistory.push(value);
      cliHistoryIndex = cliHistory.length;
      cliInput.value = '';
    });
  }

  // ── Run handler ───────────────────────────────
  async function handleRun(rawInput = 'START') {
    const runLabel = document.getElementById('run-label');
    const raw = String(rawInput || '').trim();
    const upperRaw = raw.toUpperCase();

    if (isCommandBusy) return;

    // Handle individual commands from CLI
    const commands = upperRaw.split(/\s+/).filter(Boolean);
    
    // If it's a single command, execute it directly
    if (commands.length === 1) {
      await executeCmd(commands[0]);
      return;
    }

    // Multiple commands - validate and run sequence
    if (upperRaw === 'START' && isPoweredOn) {
      notifyToast('info', 'START already active.', 'already-started-click', 0);
      log('START → ignored: robot already active', 'info');
      return;
    }

    unlockMoveAudio();

    isCommandBusy = true;
    if (upperRaw === 'START' && !isPoweredOn && runLabel) {
      runLabel.textContent = 'Validating…';
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
        await runSequenceWithBackend(res.commands);
      }
    } catch (e) {
      log('FATAL: Unexpected error.', 'err');
      notifyToast('error', 'Unexpected error while sending command.', 'fatal-error', 2200);
    }

    isCommandBusy = false;
    updateStartButtonUI();
  }

  async function runSequenceWithBackend(commands) {
    const commandString = commands.join(' ');
    const simResult = await API.simulateCommands(commandString);

    if (!simResult.success || !simResult.steps.length) {
      log('Simulation failed.', 'err');
      notifyToast('error', 'Command execution failed.', 'exec-failed', 1200);
      return;
    }

    for (let i = 0; i < simResult.steps.length; i++) {
      const step = simResult.steps[i];
      await new Promise(r => setTimeout(r, 190));
      
      Grid.setPosition(step.x, step.y, step.heading);
      energy = step.energy;
      isHolding = step.carrying;
      Grid.setCarrying(isHolding);
      updateEnergyUI();
      
      log(`${step.command} → X:${step.x} Y:${step.y} DIR:${step.heading} E:${step.energy}`, 'info');
    }

    if (simResult.finalState) {
      const phase = simResult.finalState.phase;
      if (phase === 'ACCEPT') {
        log('Sequence completed successfully.', 'ok');
        notifyToast('success', 'Command sequence validated and executed.', 'sequence-complete', 1200);
      } else if (phase === 'TRAP') {
        log('Sequence rejected by DFA.', 'err');
        notifyToast('error', 'Command sequence invalid.', 'sequence-invalid', 1200);
      }
    }
  }

  async function executeSingleCommand(cmd) {
    // Send the full accumulated sequence so backend simulates from correct state
    const simResult = await API.simulateCommands(commandBuffer.join(' '));
    
    if (!simResult.success || !simResult.steps.length || simResult.valid === false) {
      if (commandBuffer[commandBuffer.length - 1] === cmd) {
        commandBuffer.pop();
      }
      log(`${cmd} failed.`, 'err');
      errCount++;
      document.getElementById('stat-errs').textContent = errCount;
      notifyToast('error', 'Command rejected.', 'cmd-rejected', 1200);
      return;
    }

    // Get the last step (current command result)
    const step = simResult.steps[simResult.steps.length - 1];
    Grid.setPosition(step.x, step.y, step.heading);
    energy = step.energy;
    isHolding = step.carrying;
    Grid.setCarrying(isHolding);
    updateEnergyUI();
    
    cmdCount++;
    document.getElementById('stat-cmds').textContent = cmdCount;
    playMoveAudio();
    
    log(`${cmd} → X:${step.x} Y:${step.y} DIR:${step.heading} E:${step.energy}`, 'ok');
  }

  async function executeCmd(cmd) {
    if (cmd === 'RESET') {
      Grid.reset();
      isPoweredOn = false;
      isHolding = false;
      energy = 3;
      cmdCount = 0;
      errCount = 0;
      commandBuffer = [];
      updateEnergyUI();
      document.getElementById('stat-cmds').textContent = 0;
      document.getElementById('stat-errs').textContent = 0;
      updateStartButtonUI();
      log('RESET → origin (0,0)', 'warn');
      notifyToast('info', 'Robot reset to initial state.', 'reset', 800);
      return;
    }

    if (cmd === 'START') {
      if (isPoweredOn) {
        notifyToast('info', 'Robot already started.', 'already-started', 1200);
        return;
      }
      isPoweredOn = true;
      commandBuffer = ['START'];
      updateStartButtonUI();
      notifyToast('success', 'Robot started. Enter commands and finish with STOP.', 'robot-started', 1200);
      log('START → unit active. Build your command sequence.', 'info');
      return;
    }

    if (cmd === 'STOP') {
      if (!isPoweredOn) {
        notifyToast('warning', 'Robot is OFF. Start with START first.', 'start-required', 1200);
        return;
      }
      
      // Add STOP to buffer and validate full sequence
      commandBuffer.push('STOP');
      log(`STOP → Validating sequence: ${commandBuffer.join(' ')}`, 'info');
      
      // Validate and execute the full sequence
      await runSequenceWithBackend([...commandBuffer]);
      
      // Reset state after execution
      isPoweredOn = false;
      commandBuffer = [];
      updateStartButtonUI();
      return;
    }

    if (cmd === 'END') {
      if (!isPoweredOn) {
        notifyToast('info', 'Robot is already ended.', 'already-ended', 1200);
        return;
      }
      isPoweredOn = false;
      isHolding = false;
      Grid.setCarrying(false);
      commandBuffer = [];
      updateStartButtonUI();
      notifyToast('success', 'Robot ended. Send START to begin again.', 'robot-ended', 800);
      log('END → session closed', 'warn');
      return;
    }

    if (!isPoweredOn) {
      notifyToast('warning', 'Robot is OFF. Start with START first.', 'start-required', 1200);
      log(`${cmd} → blocked: START required`, 'warn');
      return;
    }

    // Handle PICK and DROP with grid item visualization
    if (cmd === 'PICK') {
      const pickRes = Grid.pickItemAtRobot();
      if (!pickRes.ok) {
        notifyToast('warning', `PICK blocked: ${pickRes.reason}`, 'pick-blocked', 1200);
        log(`PICK → blocked: ${pickRes.reason}`, 'warn');
        return;
      }
      isHolding = true;
      Grid.setCarrying(true);
      cmdCount++;
      document.getElementById('stat-cmds').textContent = cmdCount;
      playMoveAudio();
      log('PICK → item secured', 'ok');
      notifyToast('success', 'Item picked up!', 'pick-success', 800);
      commandBuffer.push(cmd);
      return;
    }

    if (cmd === 'DROP') {
      if (!isHolding) {
        notifyToast('warning', 'DROP blocked: not holding an item.', 'drop-blocked', 1200);
        log('DROP → blocked: not holding item', 'warn');
        return;
      }
      const dropRes = Grid.dropItemAtRobot();
      if (!dropRes.ok) {
        notifyToast('warning', `DROP blocked: ${dropRes.reason}`, 'drop-blocked', 1200);
        log(`DROP → blocked: ${dropRes.reason}`, 'warn');
        return;
      }
      isHolding = false;
      Grid.setCarrying(false);
      cmdCount++;
      document.getElementById('stat-cmds').textContent = cmdCount;
      playMoveAudio();
      log('DROP → item placed', 'ok');
      notifyToast('success', 'Item dropped!', 'drop-success', 800);
      commandBuffer.push(cmd);
      return;
    }

    // Accumulate command in buffer
    commandBuffer.push(cmd);
    log(`${cmd} → added to sequence`, 'dim');
    
    // Execute immediately for visual feedback
    await executeSingleCommand(cmd);
  }

  // ── Logger ─────────────────────────────────────
  function log(msg, type = 'ok') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
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
      <p class="text-sm font-semibold">${style.label} - ${message}</p>
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

  function updateAudioToggleUI() {
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
  }
})();