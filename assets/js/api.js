const API = (() => {
  const VALID = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'START', 'STOP', 'PICK', 'DROP', 'RECHARGE', 'RESET', 'END'];

  function _delay() {
    return new Promise(r => setTimeout(r, 80 + Math.random() * 160));
  }

  function _parse(raw) {
    const tokens = raw.trim().toUpperCase().split(/\s+/).filter(Boolean);
    const commands = [], invalid = [];
    tokens.forEach(t => (VALID.includes(t) ? commands : invalid).push(t));
    return { commands, invalid };
  }

  async function sendCommands(raw) {
    await _delay();

    if (!raw || !raw.trim()) {
      return { success: false, commands: [], invalid: [], message: 'ERR: No input received.' };
    }

    const { commands, invalid } = _parse(raw);

    if (!commands.length) {
      return { success: false, commands: [], invalid, message: `ERR: No valid commands — [${invalid.join(', ')}]` };
    }

    // Simulate occasional timeout (~6%)
    if (Math.random() < 0.06) {
      return { success: false, commands: [], invalid: [], message: 'ERR: Server timeout. Please retry.' };
    }

    return {
      success: true,
      commands,
      invalid,
      message: `ACK: ${commands.length} command(s) queued.`,
    };
  }

  return { sendCommands, VALID };
})();