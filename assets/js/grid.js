const Grid = (() => {
  const ROWS = 8;
  const COLS = 8;

  let robotRow = 7;
  let robotCol = 0;
  let trail = [];
  let direction = 'NORTH';
  let stepCount = 0;
  let carrying = false;
  let placedItem = null;

  const DIR_ASSET = {
    NORTH: 'assets/up.png',
    SOUTH: 'assets/down.png',
    EAST: 'assets/right.png',
    WEST: 'assets/left.png',
  };

  function init() {
    const container = document.getElementById('grid-container');
    container.innerHTML = '';

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell w-full aspect-square bg-card border border-border rounded-[4px] flex items-center justify-center relative min-w-0';
        cell.dataset.row = r;
        cell.dataset.col = c;

        // Subtle coord label
        const label = document.createElement('span');
        label.className = 'absolute bottom-[3px] right-[4px] text-[8px] font-mono text-neutral-800 leading-none select-none';
        label.textContent = `${c},${ROWS - 1 - r}`;
        cell.appendChild(label);

        container.appendChild(cell);
      }
    }

    _render();
  }

  function _getCell(r, c) {
    return document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
  }

  function _render() {
    // Clear all dynamic states
    document.querySelectorAll('.cell').forEach(cell => {
      cell.classList.remove(
        'robot', 'trail',
        'bg-[#0c1e42]', 'border-blue-500', 'bg-[#0E1829]', 'border-[#1a2d4a]'
      );
      // Remove dynamic children (icon / dot), keep label
      const icon = cell.querySelector('.robot-icon');
      const dot  = cell.querySelector('.trail-dot');
      const cargo = cell.querySelector('.robot-cargo');
      const item = cell.querySelector('.placed-item-icon');
      if (icon) icon.remove();
      if (dot)  dot.remove();
      if (cargo) cargo.remove();
      if (item) item.remove();
    });

    // Render placed item first so robot can appear above it.
    if (placedItem) {
      const itemCell = _getCell(placedItem.row, placedItem.col);
      if (itemCell) {
        const itemIcon = document.createElement('img');
        itemIcon.src = 'assets/item.png';
        itemIcon.alt = 'Placed item';
        itemIcon.className = 'placed-item-icon w-8 h-8 md:w-11 md:h-11 object-contain opacity-95';
        itemCell.appendChild(itemIcon);
      }
    }

    // Render trail
    trail.forEach(({ row, col }) => {
      if (row === robotRow && col === robotCol) return;
      const cell = _getCell(row, col);
      if (!cell) return;
      cell.classList.add('trail', 'bg-[#0E1829]', 'border-[#1a2d4a]');
      const dot = document.createElement('span');
      dot.className = 'trail-dot w-1.5 h-1.5 rounded-full bg-blue-500/40';
      cell.appendChild(dot);
    });

    // Render robot
    const robotCell = _getCell(robotRow, robotCol);
    if (robotCell) {
      robotCell.classList.add('robot', 'border-blue-500');
      robotCell.style.boxShadow = '0 0 0 1px rgba(37,99,235,0.15)';
        const icon = document.createElement('img');
        icon.src = DIR_ASSET[direction] || DIR_ASSET.NORTH;
        icon.alt = `${direction} Robot`;
        icon.className = 'robot-icon w-6 h-6 md:w-10 md:h-10 object-contain drop-shadow';
        icon.style.filter = 'drop-shadow(0 0 4px rgba(96,165,250,0.7))';
        robotCell.appendChild(icon);

      if (carrying) {
        const cargo = document.createElement('span');
        cargo.className = 'robot-cargo absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white';
        cargo.title = 'Holding object';
        robotCell.appendChild(cargo);
      }
    }

    // Update HUD
    document.getElementById('coord-x').textContent = robotCol;
    document.getElementById('coord-y').textContent = ROWS - 1 - robotRow;
    document.getElementById('coord-dir').textContent = direction;
    document.getElementById('coord-steps').textContent = stepCount;
  }

  function move(newRow, newCol, newDir) {
    if (newRow < 0 || newRow >= ROWS || newCol < 0 || newCol >= COLS) return false;

    const alreadyTrailed = trail.some(p => p.row === robotRow && p.col === robotCol);
    if (!alreadyTrailed) trail.push({ row: robotRow, col: robotCol });
    if (trail.length > 24) trail.shift();

    robotRow = newRow;
    robotCol = newCol;
    if (newDir) direction = newDir;
    stepCount++;

    _render();
    return true;
  }

  function reset() {
    robotRow = 7;
    robotCol = 0;
    direction = 'NORTH';
    trail = [];
    stepCount = 0;
    carrying = false;
    placedItem = null;
    _render();
  }

  function placeItem(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return { ok: false, reason: 'Coordinates must be integers.' };
    }
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) {
      return { ok: false, reason: 'Coordinates must be between 0 and 7.' };
    }

    const row = ROWS - 1 - y;
    const col = x;

    if (row === robotRow && col === robotCol) {
      return { ok: false, reason: 'Cannot place item on the robot position.' };
    }

    placedItem = { row, col };
    _render();
    return { ok: true };
  }

  function pickItemAtRobot() {
    if (!placedItem) {
      return { ok: false, reason: 'No item on grid to pick.' };
    }
    if (placedItem.row !== robotRow || placedItem.col !== robotCol) {
      return { ok: false, reason: 'Move robot onto the item to pick it.' };
    }

    placedItem = null;
    _render();
    return { ok: true };
  }

  function dropItemAtRobot() {
    if (placedItem) {
      return { ok: false, reason: 'Grid already has an item. Pick or move it first.' };
    }

    placedItem = { row: robotRow, col: robotCol };
    _render();
    return { ok: true };
  }

  function getPosition() {
    return { row: robotRow, col: robotCol, direction, steps: stepCount };
  }

  function setCarrying(value) {
    carrying = Boolean(value);
    _render();
  }

  function isCarrying() {
    return carrying;
  }

  return { init, move, reset, getPosition, setCarrying, isCarrying, placeItem, pickItemAtRobot, dropItemAtRobot };
})();