const API = (() => {
  const API_BASE_URL = 'http://localhost:8080/api/robot';
  
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

    console.log('API: Sending simulation request:', commands);

    try {
      const response = await fetch(`${API_BASE_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands })
      });

      console.log('API: Response status:', response.status);

      if (!response.ok) {
        return { success: false, steps: [], message: 'ERR: Simulation failed.' };
      }

      const result = await response.json();
      console.log('API: Simulation result:', result);
      return { success: true, steps: result.steps, finalState: result.finalState, valid: result.valid };
    } catch (error) {
      console.error('API: Simulation error:', error);
      return { success: false, steps: [], message: 'ERR: Backend connection failed.' };
    }
  }

  async function getAlphabet() {
    try {
      const response = await fetch(`${API_BASE_URL}/alphabet`);
      if (!response.ok) return {};
      const result = await response.json();
      return result.commands || {};
    } catch {
      return {};
    }
  }

  return { sendCommands, simulateCommands, getAlphabet, VALID };
})();
