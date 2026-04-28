const Grid = (() => {
  const ROWS = 8;
  const COLS = 8;
  const BASE_MOVE_MS = 240;
  const MAX_TRACK_POINTS = 500;
  const ORIGIN_ROW = 7;
  const ORIGIN_COL = 0;

  let robotRow = ORIGIN_ROW;
  let robotCol = ORIGIN_COL;
  let trail = [{ row: ORIGIN_ROW, col: ORIGIN_COL, moveIndex: 1, eventType: 'origin' }];
  let nextMoveIndex = 2;
  let lastEnergyLevel = 3;
  let direction = 'NORTH';
  let stepCount = 0;
  let carrying = false;
  let placedItem = null;
  let cellEffect = null;
  let animator = null;
  let gridContainer = null;
  let trailSvg = null;
  let isTrailTrackingEnabled = false;

  const DIR_ASSET = {
    NORTH: 'assets/up.png',
    SOUTH: 'assets/down.png',
    EAST: 'assets/right.png',
    WEST: 'assets/left.png',
  };

  function init() {
    const container = document.getElementById('grid-container');
    container.innerHTML = '';
    gridContainer = container;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell w-full aspect-square bg-card border border-border rounded-[4px] flex items-center justify-center relative min-w-0';
        cell.dataset.row = r;
        cell.dataset.col = c;

        // Subtle coord label
        const label = document.createElement('span');
        label.className = 'absolute bottom-[3px] right-[4px] text-[10px] font-mono text-neutral-700 leading-none select-none';
        label.textContent = `${c},${ROWS - 1 - r}`;
        cell.appendChild(label);

        container.appendChild(cell);
      }
    }

    trailSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    trailSvg.setAttribute('aria-hidden', 'true');
    trailSvg.style.position = 'absolute';
    trailSvg.style.inset = '0';
    trailSvg.style.width = '100%';
    trailSvg.style.height = '100%';
    trailSvg.style.pointerEvents = 'none';
    trailSvg.style.zIndex = '3';
    container.appendChild(trailSvg);

    if (typeof RobotAnimator !== 'undefined' && RobotAnimator.Animator) {
      animator = new RobotAnimator.Animator();
      animator.init({
        container,
        rows: ROWS,
        cols: COLS,
        row: robotRow,
        col: robotCol,
        heading: direction,
        robotAsset: DIR_ASSET.NORTH,
      });
      animator.setCarrying(carrying);
    }

    _render();
  }

  function _getCell(r, c) {
    return document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
  }

  function _getCellCenter(r, c) {
    if (!gridContainer) return null;
    const cell = _getCell(r, c);
    if (!cell) return null;
    const containerRect = gridContainer.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    return {
      x: cellRect.left - containerRect.left + cellRect.width / 2,
      y: cellRect.top - containerRect.top + cellRect.height / 2,
    };
  }

  function _renderTrailPath() {
    const eventPalette = {
      origin: { stroke: '#2563eb', text: '#1d4ed8' },
      move: { stroke: '#2563eb', text: '#1d4ed8' },
      turn: { stroke: '#dc2626', text: '#b91c1c' },
      recharge: { stroke: '#059669', text: '#047857' },
      state: { stroke: '#d97706', text: '#b45309' },
    };

    if (!trailSvg || !gridContainer) return;
    trailSvg.innerHTML = '';
    if (!isTrailTrackingEnabled) return;

    const width = gridContainer.clientWidth;
    const height = gridContainer.clientHeight;
    trailSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const rawPath = trail;
    if (rawPath.length < 2) return;

    const points = [];
    rawPath
      .filter(point => point.eventType === 'origin' || point.eventType === 'move')
      .forEach(point => {
      const center = _getCellCenter(point.row, point.col);
      if (!center) return;
      const prev = points[points.length - 1];
      if (prev && prev.row === point.row && prev.col === point.col) return;
      points.push({ ...center, row: point.row, col: point.col, moveIndex: point.moveIndex });
      });

    if (points.length >= 2) {
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', '#3b82f6');
      polyline.setAttribute('stroke-width', '3');
      polyline.setAttribute('stroke-linecap', 'round');
      polyline.setAttribute('stroke-linejoin', 'round');
      polyline.setAttribute('opacity', '0.9');
      trailSvg.appendChild(polyline);
    }

    const pointLabels = new Map();
    rawPath.forEach(point => {
      const stepNumber = point.moveIndex;
      const pointKey = `${point.row},${point.col}`;
      if (!pointLabels.has(pointKey)) {
        const center = _getCellCenter(point.row, point.col);
        if (!center) return;
        pointLabels.set(pointKey, { point: { ...center, row: point.row, col: point.col }, steps: [] });
      }
      const cellData = pointLabels.get(pointKey);
      if (cellData) {
        cellData.steps.push({ moveIndex: stepNumber, eventType: point.eventType || 'move' });
      }
    });

    pointLabels.forEach(({ point, steps }) => {
      const isCurrentRobotCell = point.row === robotRow && point.col === robotCol;
      const markerSteps = steps.length <= 3 ? steps : steps.slice(-3);

      markerSteps.forEach((stepInfo, stepIdx) => {
        const stepNumber = stepInfo.moveIndex;
        const palette = eventPalette[stepInfo.eventType] || eventPalette.move;
        let markerX = point.x;
        let markerY = point.y;

        if (markerSteps.length === 2) {
          if (isCurrentRobotCell) {
            // Keep markers away from robot icon on current cell.
            markerX = point.x + (stepIdx === 0 ? -12 : 12);
            markerY = point.y + 12;
          } else {
            // Stable placement for revisit markers.
            markerX = point.x + (stepIdx === 0 ? -12 : 12);
            markerY = point.y - 12;
          }
        } else if (markerSteps.length === 3) {
          const xOffsets = [-14, 0, 14];
          if (isCurrentRobotCell) {
            markerX = point.x + xOffsets[stepIdx];
            markerY = point.y + 12;
          } else {
            markerX = point.x + xOffsets[stepIdx];
            markerY = point.y - 12;
          }
        } else if (isCurrentRobotCell) {
          markerX = point.x + 12;
          markerY = point.y - 12;
        }

        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        marker.setAttribute('cx', String(markerX));
        marker.setAttribute('cy', String(markerY));
        marker.setAttribute('r', '7');
        marker.setAttribute('fill', '#ffffff');
        marker.setAttribute('stroke', palette.stroke);
        marker.setAttribute('stroke-width', '2');
        marker.setAttribute('opacity', '0.96');
        trailSvg.appendChild(marker);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(markerX));
        label.setAttribute('y', String(markerY + 1));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('font-size', stepNumber > 99 ? '6' : '8');
        label.setAttribute('font-family', 'JetBrains Mono, monospace');
        label.setAttribute('font-weight', '700');
        label.setAttribute('fill', palette.text);
        label.textContent = String(stepNumber);
        trailSvg.appendChild(label);
      });
    });
  }

  function _render() {
    // Clear all dynamic states
    document.querySelectorAll('.cell').forEach(cell => {
      cell.classList.remove(
        'robot-cell',
        'border-blue-500'
      );
      // Remove dynamic children (icon / dot), keep label
      const item = cell.querySelector('.placed-item-icon');
      const fx = cell.querySelector('.item-pick-burst');
      if (item) item.remove();
      if (fx) fx.remove();
    });

    // Render placed item first so robot can appear above it.
    if (placedItem) {
      const itemCell = _getCell(placedItem.row, placedItem.col);
      if (itemCell) {
        const itemIcon = document.createElement('img');
        itemIcon.src = 'assets/item.png';
        itemIcon.alt = 'Placed item';
        const sharedWithRobot = placedItem.row === robotRow && placedItem.col === robotCol;
        itemIcon.className = sharedWithRobot
          ? 'placed-item-icon absolute bottom-1 right-1 w-6 h-6 md:w-7 md:h-7 object-contain opacity-95 drop-shadow'
          : 'placed-item-icon w-10 h-10 md:w-14 md:h-14 object-contain opacity-95';
        itemIcon.style.position = sharedWithRobot ? 'absolute' : 'relative';
        itemIcon.style.zIndex = '6';
        if (cellEffect && cellEffect.type === 'drop' && cellEffect.row === placedItem.row && cellEffect.col === placedItem.col) {
          itemIcon.classList.add('item-drop-in');
        }
        itemCell.appendChild(itemIcon);
      }
    }

    if (cellEffect && cellEffect.type === 'pick') {
      const fxCell = _getCell(cellEffect.row, cellEffect.col);
      if (fxCell) {
        const burst = document.createElement('span');
        burst.className = 'item-pick-burst';
        fxCell.appendChild(burst);
      }
    }

    _renderTrailPath();

    // Render robot
    const robotCell = _getCell(robotRow, robotCol);
    if (robotCell) {
      robotCell.classList.add('robot-cell', 'border-blue-500');
      robotCell.style.boxShadow = '0 0 0 1px rgba(37,99,235,0.15)';
    }

    // Update HUD
    document.getElementById('coord-x').textContent = robotCol;
    document.getElementById('coord-y').textContent = ROWS - 1 - robotRow;
    document.getElementById('coord-dir').textContent = direction;
    document.getElementById('coord-steps').textContent = stepCount;
  }

  function getMoveDurationMs(energyLevel = 3) {
    if (energyLevel <= 1) return BASE_MOVE_MS + 60;
    if (energyLevel === 2) return BASE_MOVE_MS + 20;
    return BASE_MOVE_MS;
  }

  async function _moveTo(row, col, dir, energyLevel = 3) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;

    const fromRow = robotRow;
    const fromCol = robotCol;
    const nextDirection = (dir && ['NORTH', 'SOUTH', 'EAST', 'WEST'].includes(dir.toUpperCase()))
      ? dir.toUpperCase()
      : direction;

    if (animator) {
      animator.setEnergy(Math.max(0, Math.min(1, energyLevel / 3)));
      await animator.animateTo({
        row,
        col,
        heading: nextDirection,
        durationMs: getMoveDurationMs(energyLevel),
      });
    }

    if (!trail.length) {
      trail.push({ row: ORIGIN_ROW, col: ORIGIN_COL, moveIndex: 1, eventType: 'origin' });
      nextMoveIndex = 2;
      lastEnergyLevel = 3;
    }

    const moved = row !== fromRow || col !== fromCol;
    const turnedOnly = !moved && nextDirection !== direction;
    const recharged = !moved && energyLevel > lastEnergyLevel;
    const eventType = moved ? 'move' : (recharged ? 'recharge' : (turnedOnly ? 'turn' : 'state'));

    trail.push({ row, col, moveIndex: nextMoveIndex, eventType });
    nextMoveIndex += 1;
    if (trail.length > MAX_TRACK_POINTS) {
      trail.shift();
    }

    robotRow = row;
    robotCol = col;
    direction = nextDirection;
    lastEnergyLevel = energyLevel;
    stepCount++;
    _render();

    return true;
  }

  async function setPosition(x, y, dir, energyLevel = 3) {
    const row = ROWS - 1 - y;
    const col = x;

    return _moveTo(row, col, dir, energyLevel);
  }

  async function move(row, col, dir, energyLevel = 3) {
    return _moveTo(row, col, dir, energyLevel);
  }

  function turn(newDir) {
    if (!newDir || newDir === direction) return false;
    direction = newDir;
    _render();
    return true;
  }

  function reset() {
    robotRow = ORIGIN_ROW;
    robotCol = ORIGIN_COL;
    direction = 'NORTH';
    trail = [{ row: ORIGIN_ROW, col: ORIGIN_COL, moveIndex: 1, eventType: 'origin' }];
    nextMoveIndex = 2;
    lastEnergyLevel = 3;
    stepCount = 0;
    carrying = false;
    placedItem = null;
    cellEffect = null;
    _render();
    if (animator) {
      animator.setCarrying(false);
      animator.setEnergy(1);
      animator.renderAt(robotRow, robotCol, 0);
    }
  }

  async function returnToDefault() {
    const targetRow = ORIGIN_ROW;
    const targetCol = ORIGIN_COL;
    const targetDir = 'NORTH';

    if (animator) {
      await animator.animateTo({
        row: targetRow,
        col: targetCol,
        heading: targetDir,
        durationMs: getMoveDurationMs(3),
      });
    }

    robotRow = targetRow;
    robotCol = targetCol;
    direction = targetDir;
    trail = [{ row: ORIGIN_ROW, col: ORIGIN_COL, moveIndex: 1, eventType: 'origin' }];
    nextMoveIndex = 2;
    lastEnergyLevel = 3;
    stepCount = 0;
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

    cellEffect = { type: 'pick', row: robotRow, col: robotCol };
    placedItem = null;
    _render();
    window.setTimeout(() => {
      if (cellEffect && cellEffect.type === 'pick') {
        cellEffect = null;
        _render();
      }
    }, 300);
    return { ok: true };
  }

  function dropItemAtRobot() {
    if (placedItem) {
      return { ok: false, reason: 'Grid already has an item. Pick or move it first.' };
    }

    placedItem = { row: robotRow, col: robotCol };
    cellEffect = { type: 'drop', row: robotRow, col: robotCol };
    _render();
    window.setTimeout(() => {
      if (cellEffect && cellEffect.type === 'drop') {
        cellEffect = null;
        _render();
      }
    }, 320);
    return { ok: true };
  }

  function getPosition() {
    return { row: robotRow, col: robotCol, direction, steps: stepCount };
  }

  function setCarrying(value) {
    carrying = Boolean(value);
    _render();
    if (animator) animator.setCarrying(carrying);
  }

  function isCarrying() {
    return carrying;
  }

  async function playPickAnimation() {
    if (animator) await animator.playPick();
  }

  async function playDropAnimation() {
    if (animator) await animator.playDrop();
  }

  async function playRechargeAnimation() {
    if (animator) await animator.playRecharge();
  }

  async function playErrorAnimation() {
    if (animator) await animator.playError();
  }

  function updateEnergyFx(energyLevel) {
    if (!animator) return;
    animator.setEnergy(Math.max(0, Math.min(1, energyLevel / 3)));
  }

  function setTrailTrackingEnabled(enabled) {
    isTrailTrackingEnabled = Boolean(enabled);
    _render();
  }

  function getTrailTrackingEnabled() {
    return isTrailTrackingEnabled;
  }

  return {
    init,
    move,
    turn,
    reset,
    getPosition,
    setPosition,
    setCarrying,
    isCarrying,
    placeItem,
    pickItemAtRobot,
    dropItemAtRobot,
    returnToDefault,
    playPickAnimation,
    playDropAnimation,
    playRechargeAnimation,
    playErrorAnimation,
    updateEnergyFx,
    setTrailTrackingEnabled,
    getTrailTrackingEnabled,
  };
})();