const RobotAnimator = (() => {
  const DIR_ANGLE = {
    NORTH: 0,
    EAST: 90,
    SOUTH: 180,
    WEST: 270,
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function shortestTurn(current, target) {
    return ((target - current + 540) % 360) - 180;
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  class Animator {
    constructor() {
      this.container = null;
      this.layer = null;
      this.sprite = null;
      this.shell = null;
      this.robotIcon = null;
      this.cargoDot = null;
      this.rows = 8;
      this.cols = 8;
      this.currentRow = 7;
      this.currentCol = 0;
      this.currentAngle = 0;
      this.idleEnabled = true;
      this.isAnimating = false;
      this.energyRatio = 1;
      this.boundResizeHandler = null;
    }

    init({ container, rows, cols, row, col, heading, robotAsset }) {
      this.container = container;
      this.rows = rows;
      this.cols = cols;
      this.currentRow = row;
      this.currentCol = col;
      this.currentAngle = DIR_ANGLE[heading] ?? 0;

      const style = window.getComputedStyle(this.container);
      if (style.position === 'static') {
        this.container.style.position = 'relative';
      }

      this.layer = document.createElement('div');
      this.layer.className = 'robot-layer';

      this.sprite = document.createElement('div');
      this.sprite.className = 'robot-sprite';

      this.shell = document.createElement('div');
      this.shell.className = 'robot-shell robot-idle';

      this.robotIcon = document.createElement('img');
      this.robotIcon.src = robotAsset;
      this.robotIcon.alt = 'Robot';

      this.cargoDot = document.createElement('span');
      this.cargoDot.className = 'robot-cargo-dot hidden';

      this.shell.appendChild(this.robotIcon);
      this.shell.appendChild(this.cargoDot);
      this.sprite.appendChild(this.shell);
      this.layer.appendChild(this.sprite);
      this.container.appendChild(this.layer);

      this.renderAt(this.currentRow, this.currentCol, this.currentAngle);
      this.setEnergy(1);

      // Re-anchor after layout settles (prevents first-load misplacement)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.renderAt(this.currentRow, this.currentCol, this.currentAngle);
        });
      });

      if (!this.boundResizeHandler) {
        this.boundResizeHandler = () => {
          if (!this.isAnimating) {
            this.renderAt(this.currentRow, this.currentCol, this.currentAngle);
          }
        };
        window.addEventListener('resize', this.boundResizeHandler);
      }
    }

    getCellCenter(row, col) {
      const cell = this.container.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      if (!cell) return null;
      const containerRect = this.container.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      return {
        x: cellRect.left - containerRect.left + cellRect.width / 2,
        y: cellRect.top - containerRect.top + cellRect.height / 2,
      };
    }

    renderAt(row, col, angle) {
      const center = this.getCellCenter(row, col);
      if (!center || !this.sprite) return;
      this.sprite.style.left = `${center.x}px`;
      this.sprite.style.top = `${center.y}px`;
      this.sprite.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    }

    setIdle(enabled) {
      this.idleEnabled = Boolean(enabled);
      if (!this.shell || this.isAnimating) return;
      this.shell.classList.toggle('robot-idle', this.idleEnabled);
    }

    setCarrying(carrying) {
      if (!this.cargoDot) return;
      this.cargoDot.classList.toggle('hidden', !carrying);
    }

    setEnergy(energyRatio) {
      this.energyRatio = clamp(energyRatio, 0, 1);
      if (!this.shell) return;
      const opacity = 0.62 + this.energyRatio * 0.38;
      const brightness = 0.78 + this.energyRatio * 0.22;
      this.shell.style.opacity = String(opacity);
      this.shell.style.filter = `brightness(${brightness})`;
    }

    async animateTo({ row, col, heading, durationMs }) {
      if (!this.sprite) return;
      this.isAnimating = true;
      this.shell.classList.remove('robot-idle');

      const from = this.getCellCenter(this.currentRow, this.currentCol);
      const to = this.getCellCenter(row, col);
      const targetBaseAngle = DIR_ANGLE[heading] ?? this.currentAngle;
      const turnDelta = shortestTurn(this.currentAngle, targetBaseAngle);
      const targetAngle = this.currentAngle + turnDelta;
      const moveDuration = clamp(durationMs, 200, 300);
      const start = performance.now();

      if (!from || !to) {
        this.currentRow = row;
        this.currentCol = col;
        this.currentAngle = targetBaseAngle;
        this.renderAt(row, col, this.currentAngle);
        this.isAnimating = false;
        this.shell.classList.toggle('robot-idle', this.idleEnabled);
        return;
      }

      await new Promise(resolve => {
        const frame = now => {
          const t = Math.min(1, (now - start) / moveDuration);
          const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
          const x = from.x + (to.x - from.x) * eased;
          const y = from.y + (to.y - from.y) * eased;
          const angle = this.currentAngle + turnDelta * eased;
          this.sprite.style.left = `${x}px`;
          this.sprite.style.top = `${y}px`;
          this.sprite.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
          if (t < 1) {
            requestAnimationFrame(frame);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(frame);
      });

      this.currentRow = row;
      this.currentCol = col;
      this.currentAngle = targetAngle;
      this.isAnimating = false;
      this.shell.classList.toggle('robot-idle', this.idleEnabled);
    }

    async playPick() {
      if (!this.shell) return;
      this.shell.classList.remove('robot-pick');
      // Force restart animation
      // eslint-disable-next-line no-unused-expressions
      this.shell.offsetWidth;
      this.shell.classList.add('robot-pick');
      await wait(320);
      this.shell.classList.remove('robot-pick');
    }

    async playDrop() {
      if (!this.shell) return;
      this.shell.classList.remove('robot-drop');
      // eslint-disable-next-line no-unused-expressions
      this.shell.offsetWidth;
      this.shell.classList.add('robot-drop');
      await wait(320);
      this.shell.classList.remove('robot-drop');
    }

    async playRecharge() {
      if (!this.shell) return;
      this.shell.classList.remove('robot-recharge');
      // eslint-disable-next-line no-unused-expressions
      this.shell.offsetWidth;
      this.shell.classList.add('robot-recharge');
      await wait(420);
      this.shell.classList.remove('robot-recharge');
    }

    async playError() {
      if (!this.shell) return;
      this.shell.classList.remove('robot-error', 'robot-error-flash');
      // eslint-disable-next-line no-unused-expressions
      this.shell.offsetWidth;
      this.shell.classList.add('robot-error', 'robot-error-flash');
      await wait(260);
      this.shell.classList.remove('robot-error', 'robot-error-flash');
    }
  }

  return { Animator };
})();
