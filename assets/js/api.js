const API = (() => {
  function getApiBaseUrl() {
    const runtimeOverride = window.API_BASE_URL
      || document.querySelector('meta[name="robot-api-base-url"]')?.content
      || localStorage.getItem('robotApiBaseUrl');

    if (runtimeOverride) {
      return runtimeOverride.replace(/\/$/, '');
    }

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocalhost) {
      return 'http://localhost:8080/api/robot';
    }

    return `${window.location.origin}/api/robot`;
  }

  const API_BASE_URL = getApiBaseUrl();
  
  const VALID = ['START', 'STOP', 'FORWARD', 'BACKWARD', 'LEFT', 'RIGHT', 'PICK', 'DROP', 'RECHARGE'];

  async function sendCommands(raw) {
    if (!raw || !raw.trim()) {
      return { success: false, commands: [], invalid: [], message: 'ERR: No input received.' };
    }

    const tokens = raw.trim().toUpperCase().split(/\s+/).filter(Boolean);
    const commands = [];
    const invalid = [];
    
    tokens.forEach(t => {
      VALID.includes(t) ? commands.push(t) : invalid.push(t);
    });

    if (!commands.length) {
      return { success: false, commands: [], invalid, message: `ERR: No valid commands — [${invalid.join(', ')}]` };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        return { 
          success: false, 
          commands: [], 
          invalid, 
          message: errorData?.message || 'ERR: Server validation failed.' 
        };
      }

      const result = await response.json();

      if (!result.valid) {
        return { 
          success: false, 
          commands: [], 
          invalid, 
          message: `ERR: Command at index ${result.errorIndex} rejected - ${result.errorMessage}` 
        };
      }

      return { success: true, commands, invalid, message: `ACK: ${commands.length} command(s) validated.` };
    } catch (error) {
      return { 
        success: false, 
        commands: [], 
        invalid, 
        message: 'ERR: Backend connection failed.' 
      };
    }
  }

  async function simulateCommands(raw) {
    if (!raw || !raw.trim()) {
      return { success: false, steps: [], message: 'ERR: No input received.' };
    }

    const tokens = raw.trim().toUpperCase().split(/\s+/).filter(Boolean);
    const commands = tokens.filter(t => VALID.includes(t));

    if (!commands.length) {
      return { success: false, steps: [], message: 'ERR: No valid commands.' };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands })
      });

      if (!response.ok) {
        return { success: false, steps: [], message: 'ERR: Simulation failed.' };
      }

      const result = await response.json();
      return { success: true, steps: result.steps, finalState: result.finalState, valid: result.valid };
    } catch (error) {
      return { success: false, steps: [], message: 'ERR: Backend connection failed.' };
    }
  }

  return { sendCommands, simulateCommands, VALID };
})();
