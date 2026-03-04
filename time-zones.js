const MAX_TIMEZONES = 5;
const baseTimeZoneIndex = 0;

let AVAILABLE_CITIES = [];
let timeZones = [];
const timeInputs = [];
let isManualAdjustment = false;
let use12HourFormat = true;

async function loadAvailableCities() {
  try {
    const res = await fetch('cityMap.json');
    if (!res.ok) throw new Error('failed to load cityMap.json');
    const data = await res.json();
    if (Array.isArray(data)) {
      const unique = new Map();
      for (const entry of data) {
        if (!entry || !entry.timezone || !entry.country) continue;
        if (entry.country === 'Israel') continue;
        const baseName = entry.city_ascii || entry.city;
        if (!baseName) continue;
        const name = `${baseName}, ${entry.country}`;
        const key = `${name}|${entry.timezone}`;
        if (!unique.has(key)) {
          unique.set(key, { city: name, timezone: entry.timezone });
        }
      }
      AVAILABLE_CITIES = Array.from(unique.values()).sort((a, b) =>
        a.city.localeCompare(b.city, 'en')
      );
      return;
    }
  } catch (e) {
    console.error('Failed to load cityMap.json, falling back to timezones.json or minimal list', e);
  }

  try {
    const res = await fetch('timezones.json');
    if (!res.ok) throw new Error('failed to load timezones');
    const data = await res.json();
    if (Array.isArray(data)) {
      AVAILABLE_CITIES = data.slice().sort((a, b) => a.city.localeCompare(b.city, 'en'));
      return;
    }
  } catch (e) {
    console.error('Failed to load timezones.json, falling back to minimal list', e);
  }

  AVAILABLE_CITIES = [
    { city: 'Damascus, Syria', timezone: 'Asia/Damascus' },
    { city: 'Berlin, Germany', timezone: 'Europe/Berlin' },
    { city: 'Montreal, Canada', timezone: 'America/Toronto' }
  ];
}

const URL_PARAM_CITIES = 'cities';

function normalizeCityName(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .trim();
}

function getCitiesFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(URL_PARAM_CITIES);
  if (!raw) return [];
  const names = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const result = [];
  const seen = new Set();
  for (const name of names) {
    if (result.length >= MAX_TIMEZONES) break;
    const key = normalizeCityName(name);
    if (seen.has(key)) continue;
    const c = AVAILABLE_CITIES.find(
      (x) => normalizeCityName(x.city) === key
    );
    if (c) {
      result.push({ city: c.city, timezone: c.timezone });
      seen.add(key);
    }
  }
  return result;
}

function updateUrlFromCities() {
  const value = timeZones.map((t) => t.city).join('|');
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(URL_PARAM_CITIES, value);
  else params.delete(URL_PARAM_CITIES);
  const search = params.toString() ? '?' + params.toString() : '';
  const url = window.location.pathname + search + (window.location.hash || '');
  window.history.replaceState(null, '', url);
}

function pickBaseCity() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === 'America/Toronto') {
      return { city: 'Montreal, Canada', timezone: 'America/Toronto' };
    }
    const match = AVAILABLE_CITIES.find(c => c.timezone === tz);
    if (match) return match;
  } catch (e) {}
  // Fallback: Damascus
  const damascus = AVAILABLE_CITIES.find(c => c.timezone === 'Asia/Damascus');
  return damascus || { city: 'Damascus, Syria', timezone: 'Asia/Damascus' };
}

function getTimeInTimezone(timezone) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const timeObj = {};
  parts.forEach(part => {
    if (part.type !== 'literal') {
      timeObj[part.type] = part.value;
    }
  });

  const dateStr = `${timeObj.year}-${timeObj.month}-${timeObj.day}T${timeObj.hour}:${timeObj.minute}:${timeObj.second}`;
  return new Date(dateStr);
}

function convertTimeBetweenTimezones(timeString, sourceTimezone, targetTimezone) {
  const now = new Date();
  const sourceFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: sourceTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const sourceParts = sourceFormatter.formatToParts(now);
  const sourceDateObj = {};
  sourceParts.forEach(part => {
    if (part.type !== 'literal') {
      sourceDateObj[part.type] = part.value;
    }
  });

  const [hours, minutes, seconds = '00'] = timeString.split(':');
  const desiredHour = parseInt(hours, 10);
  const desiredMinute = parseInt(minutes, 10);
  const desiredSecond = parseInt(seconds, 10);

  const dateStr = `${sourceDateObj.year}-${sourceDateObj.month}-${sourceDateObj.day}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}Z`;
  let utcTimestamp = new Date(dateStr).getTime();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: sourceTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  for (let i = 0; i < 10; i++) {
    const testDate = new Date(utcTimestamp);
    const parts = formatter.formatToParts(testDate);
    const actualTime = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        actualTime[part.type] = part.value;
      }
    });

    const actualHour = parseInt(actualTime.hour, 10);
    const actualMinute = parseInt(actualTime.minute, 10);
    const actualSecond = parseInt(actualTime.second, 10);

    if (actualHour === desiredHour && actualMinute === desiredMinute && actualSecond === desiredSecond) {
      break;
    }

    const hourDiff = desiredHour - actualHour;
    const minuteDiff = desiredMinute - actualMinute;
    const secondDiff = desiredSecond - actualSecond;
    const totalDiffMs = (hourDiff * 3600 + minuteDiff * 60 + secondDiff) * 1000;
    utcTimestamp += totalDiffMs;
  }

  const targetDate = new Date(utcTimestamp);
  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const targetParts = targetFormatter.formatToParts(targetDate);
  const targetTime = {};
  targetParts.forEach(part => {
    if (part.type !== 'literal') {
      targetTime[part.type] = part.value;
    }
  });

  const targetDateStr = `${targetTime.year}-${targetTime.month}-${targetTime.day}T${targetTime.hour}:${targetTime.minute}:${targetTime.second}`;
  return new Date(targetDateStr);
}

function formatTime(date) {
  if (use12HourFormat) {
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours || 12;
    return `${hours}:${minutes} ${ampm}`;
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatTimeForInput(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateLabel(date, baseDate) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((d - b) / dayMs);

  const options = { month: 'short', day: 'numeric' };
  const dateStr = date.toLocaleDateString('en-US', options);

  let prefix;
  if (diffDays === 0) prefix = 'Today';
  else if (diffDays === 1) prefix = 'Tomorrow';
  else if (diffDays === -1) prefix = 'Yesterday';
  else if (diffDays > 1) prefix = `+${diffDays} days`;
  else prefix = `${diffDays} days`;

  return `${prefix}, ${dateStr}`;
}

function formatOffsetLabel(cityDate, baseDate) {
  const diffMs = cityDate.getTime() - baseDate.getTime();
  const diffHours = diffMs / 3600000;
  const rounded = Math.round(diffHours * 2) / 2; // nearest 30 minutes
  if (Math.abs(rounded) < 0.01) return '';
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}h from your time`;
}

function updateDateIndicator(index, dateForCity, baseDate) {
  const el = document.getElementById(`date-indicator-${index}`);
  if (!el) return;
  el.textContent = formatDateLabel(dateForCity, baseDate);
}

function updateTimeDisplay(index, date) {
  const el = document.getElementById(`time-display-${index}`);
  if (!el) return;
  el.textContent = formatTime(date);
}

function updateOffsetLabel(index, cityDate, baseDate) {
  const el = document.getElementById(`offset-${index}`);
  if (!el) return;
  el.textContent = formatOffsetLabel(cityDate, baseDate);
}

function updateDayNight(index, date) {
  const el = document.getElementById(`daynight-${index}`);
  if (!el) return;
  const hour = date.getHours();
  const isNight = hour < 6 || hour >= 18;
  el.textContent = isNight ? 'NIGHT' : 'DAY';
  el.classList.toggle('daynight--night', isNight);
  el.classList.toggle('daynight--day', !isNight);
}

function getDisplayDate(index) {
  const tz = timeZones[index];
  if (!tz) return new Date();
  if (isManualAdjustment && timeInputs[index] && timeInputs[index].value) {
    const [h, m] = timeInputs[index].value.split(':');
    const current = getTimeInTimezone(tz.timezone);
    const d = new Date();
    d.setHours(parseInt(h, 10), parseInt(m, 10), current.getSeconds(), 0);
    return d;
  }
  return getTimeInTimezone(tz.timezone);
}

function updateClock(index, date) {
  const cx = 50;
  const cy = 50;
  const h = (date.getHours() % 12) * 30 + date.getMinutes() * 0.5 + date.getSeconds() / 120;
  const m = date.getMinutes() * 6 + date.getSeconds() * 0.1;
  const s = date.getSeconds() * 6;
  const hourEl = document.getElementById(`clock-${index}-hour`);
  const minEl = document.getElementById(`clock-${index}-min`);
  const secEl = document.getElementById(`clock-${index}-sec`);
  if (hourEl) hourEl.setAttribute('transform', `rotate(${h} ${cx} ${cy})`);
  if (minEl) minEl.setAttribute('transform', `rotate(${m} ${cx} ${cy})`);
  if (secEl) secEl.setAttribute('transform', `rotate(${s} ${cx} ${cy})`);
}

function clockSvg(idPrefix) {
  const numberR = 40;
  const hourLabels = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h, i) => {
    const angle = i * 30;
    return `<g class="clock-hour-wrap" transform="translate(50,50) rotate(${angle}) translate(0,-${numberR}) rotate(${-angle})"><text class="clock-hour-label" x="0" y="0" text-anchor="middle" dominant-baseline="middle">${h}</text></g>`;
  }).join('');
  return `
<svg class="clock-face" viewBox="0 0 100 100" aria-hidden="true">
  <circle class="clock-circle" cx="50" cy="50" r="48"/>
  ${hourLabels}
  <line id="${idPrefix}-hour" class="clock-hand clock-hand-hour" x1="50" y1="50" x2="50" y2="26" transform="rotate(0 50 50)"/>
  <line id="${idPrefix}-min" class="clock-hand clock-hand-min" x1="50" y1="50" x2="50" y2="18" transform="rotate(0 50 50)"/>
  <line id="${idPrefix}-sec" class="clock-hand clock-hand-sec" x1="50" y1="50" x2="50" y2="14" transform="rotate(0 50 50)"/>
  <circle class="clock-center" cx="50" cy="50" r="2.4"/>
</svg>`;
}

let draggingClockIndex = null;

function timeFromClockEvent(evt, index) {
  const el = evt.currentTarget;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = ((evt.clientX - rect.left) / rect.width) * 100;
  const y = ((evt.clientY - rect.top) / rect.height) * 100;
  const dx = x - 50;
  const dy = y - 50;
  let deg = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
  if (deg < 0) deg += 360;
  return deg;
}

function setupClockDragging(clockEl, index) {
  const wrap = clockEl.closest('.clock-wrap');
  const card = clockEl.closest('.time-zone');
  let dragAngleOffset = 0;

  function applyAngleToTime(i, deg) {
    let a = deg;
    if (Number.isNaN(a)) return;
    while (a < 0) a += 360;
    while (a >= 360) a -= 360;
    const totalMinutes = Math.round((a / 360) * 24 * 60);
    const clamped = Math.max(0, Math.min(24 * 60 - 1, totalMinutes));
    const hours = Math.floor(clamped / 60);
    const minutes = clamped % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const t = `${hh}:${mm}`;
    if (timeInputs[i]) {
      timeInputs[i].value = t;
      handleTimeChange(i);
    }
  }

  const startDrag = (evt) => {
    const pointerDeg = timeFromClockEvent(evt, index);
    if (pointerDeg == null) return;
    draggingClockIndex = index;
    if (wrap) wrap.classList.add('clock-wrap--dragging');
    if (card) card.classList.add('time-zone--active');
    const current = getDisplayDate(index);
    const currentDeg = ((current.getHours() * 60 + current.getMinutes()) / (24 * 60)) * 360;
    dragAngleOffset = currentDeg - pointerDeg;
    applyAngleToTime(index, pointerDeg + dragAngleOffset);
    clockEl.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  };

  const moveDrag = (evt) => {
    if (draggingClockIndex !== index) return;
    const pointerDeg = timeFromClockEvent(evt, index);
    if (pointerDeg == null) return;
    applyAngleToTime(index, pointerDeg + dragAngleOffset);
    evt.preventDefault();
  };

  const endDrag = (evt) => {
    draggingClockIndex = null;
    if (wrap) wrap.classList.remove('clock-wrap--dragging');
    if (card) card.classList.remove('time-zone--active');
    if (evt && evt.pointerId && clockEl.hasPointerCapture(evt.pointerId)) {
      clockEl.releasePointerCapture(evt.pointerId);
    }
  };

  clockEl.addEventListener('pointerdown', startDrag);
  clockEl.addEventListener('pointermove', moveDrag);
  clockEl.addEventListener('pointerup', endDrag);
  clockEl.addEventListener('pointerleave', endDrag);

  clockEl.setAttribute('tabindex', '0');
  clockEl.addEventListener('keydown', (evt) => {
    const key = evt.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;
    evt.preventDefault();
    const input = timeInputs[index];
    if (!input) return;
    const [hStr, mStr] = (input.value || '00:00').split(':');
    let minutesTotal = parseInt(hStr || '0', 10) * 60 + parseInt(mStr || '0', 10);
    let delta = 0;
    if (key === 'ArrowLeft') delta = -15;
    if (key === 'ArrowRight') delta = 15;
    if (key === 'ArrowUp') delta = 60;
    if (key === 'ArrowDown') delta = -60;
    minutesTotal = (minutesTotal + delta + 24 * 60) % (24 * 60);
    const newH = String(Math.floor(minutesTotal / 60)).padStart(2, '0');
    const newM = String(minutesTotal % 60).padStart(2, '0');
    input.value = `${newH}:${newM}`;
    handleTimeChange(index);
  });
}

function updateAllTimes() {
  if (isManualAdjustment) {
    timeZones.forEach((tz, index) => {
      const timeInput = timeInputs[index];
      if (timeInput && timeInput.value) {
        const currentTime = getTimeInTimezone(tz.timezone);
        const seconds = currentTime.getSeconds();
        const [hours, minutes] = timeInput.value.split(':');
        const tempDate = new Date();
        tempDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), seconds, 0);
        updateTimeDisplay(index, tempDate);
        updateDayNight(index, tempDate);
        // In manual mode, the relative offset doesn't change, so we can skip updating offset here.
        updateClock(index, tempDate);
      }
    });
  } else {
    const baseTime = getTimeInTimezone(timeZones[baseTimeZoneIndex].timezone);
    timeZones.forEach((tz, index) => {
      const currentTime = getTimeInTimezone(tz.timezone);
      const timeInput = timeInputs[index];

      if (timeInput) {
        timeInput.value = formatTimeForInput(currentTime);
      }
      updateTimeDisplay(index, currentTime);
      updateDateIndicator(index, currentTime, baseTime);
      updateOffsetLabel(index, currentTime, baseTime);
      updateDayNight(index, currentTime);
      updateClock(index, currentTime);
    });
  }
}

function handleTimeChange(changedIndex) {
  isManualAdjustment = true;
  updateResetButtonVisibility();
  updateOffsetVisibility();

  const changedInput = timeInputs[changedIndex];
  const newTime = changedInput.value;
  if (!newTime) return;

  const sourceTimezone = timeZones[changedIndex].timezone;
  const baseLabelDate = convertTimeBetweenTimezones(
    newTime + ':00',
    sourceTimezone,
    timeZones[baseTimeZoneIndex].timezone
  );

  timeZones.forEach((tz, index) => {
    if (index === changedIndex) {
      const selfDate = convertTimeBetweenTimezones(
        newTime + ':00',
        sourceTimezone,
        tz.timezone
      );
      updateTimeDisplay(index, selfDate);
      updateDateIndicator(index, selfDate, baseLabelDate);
      updateOffsetLabel(index, selfDate, baseLabelDate);
      updateDayNight(index, selfDate);
      updateClock(index, selfDate);
    } else {
      const convertedTime = convertTimeBetweenTimezones(
        newTime + ':00',
        sourceTimezone,
        tz.timezone
      );
      const timeInput = timeInputs[index];
      if (timeInput) {
        timeInput.value = formatTimeForInput(convertedTime);
      }
      updateTimeDisplay(index, convertedTime);
      updateDateIndicator(index, convertedTime, baseLabelDate);
      updateOffsetLabel(index, convertedTime, baseLabelDate);
      updateDayNight(index, convertedTime);
      updateClock(index, convertedTime);
    }
  });
}

function setAsMyTime(index) {
  if (index === baseTimeZoneIndex || index < 0 || index >= timeZones.length) return;
  const t = timeZones.splice(index, 1)[0];
  timeZones.unshift(t);
  reRender();
  updateUrlFromCities();
}

function removeTimezone(index) {
  if (index === baseTimeZoneIndex) return;
  if (timeZones.length <= 1) return;
  timeZones.splice(index, 1);
  reRender();
  updateUrlFromCities();
}

function addTimezone(optionValue) {
  const idx = parseInt(optionValue, 10);
  if (Number.isNaN(idx) || !AVAILABLE_CITIES[idx]) return;
  const c = AVAILABLE_CITIES[idx];
  const already = timeZones.some(t => t.timezone === c.timezone || t.city === c.city);
  if (already || timeZones.length >= MAX_TIMEZONES) return;
  timeZones.push({ city: c.city, timezone: c.timezone });
  reRender();
  updateUrlFromCities();
}

function refreshAddSelect() {
  const row = document.getElementById('add-timezone-row');
  const select = document.getElementById('add-timezone-select');
  if (!row || !select) return;
  const inUse = new Set(timeZones.map(t => t.timezone));
  const canAdd = timeZones.length < MAX_TIMEZONES;
  row.classList.toggle('hidden', !canAdd);
  select.innerHTML = '<option value="">Add a city…</option>';
  const choices = AVAILABLE_CITIES
    .map((c, index) => ({ ...c, index }))
    .filter((c) => !inUse.has(c.timezone))
    .sort((a, b) => a.city.localeCompare(b.city, 'en'));

  choices.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = String(c.index);
    opt.textContent = c.city;
    select.appendChild(opt);
  });
}

function createTimeZoneElements() {
  const container = document.getElementById('time-zones-container');
  const baseTime = getTimeInTimezone(timeZones[baseTimeZoneIndex].timezone);

  timeZones.forEach((tz, index) => {
    const timeZoneDiv = document.createElement('div');
    timeZoneDiv.className = 'time-zone';
    const currentTime = getTimeInTimezone(tz.timezone);
    const dateLabel = formatDateLabel(currentTime, baseTime);
    const canRemove = timeZones.length > 1 && index !== baseTimeZoneIndex;
    const isBase = index === baseTimeZoneIndex;

    timeZoneDiv.innerHTML = `
      <div class="time-zone-main">
        <div class="time-zone-left">
          <div class="clock-wrap" data-index="${index}">${clockSvg('clock-' + index)}</div>
          <div class="manual-row">
            <span class="manual-label">Set manually</span>
            <input type="time" id="time-input-${index}" class="time-input" value="${formatTimeForInput(currentTime)}">
          </div>
        </div>
        <div class="time-zone-body">
          <div class="time-zone-header">
            <div class="city-name">${tz.city}${isBase ? ' <span class="base-pill">Your time</span>' : ''}</div>
            <div class="time-zone-header-right">
              ${!isBase ? `<button type="button" class="set-base-btn" data-index="${index}" aria-label="Set ${tz.city} as your time">Set as my time</button>` : ''}
            </div>
            ${canRemove ? `<button type="button" class="remove-timezone-btn" data-index="${index}" aria-label="Remove ${tz.city}">×</button>` : ''}
          </div>
          <div class="time-block">
            <div class="time-row">
              <div class="time-display" id="time-display-${index}">${formatTime(currentTime)}</div>
              <span class="daynight daynight--day" id="daynight-${index}">Day</span>
            </div>
            <div class="date-indicator" id="date-indicator-${index}">${dateLabel}</div>
          </div>
        </div>
      </div>
      <span class="offset-label" id="offset-${index}">${formatOffsetLabel(currentTime, baseTime)}</span>
    `;

    container.appendChild(timeZoneDiv);

    const timeInput = document.getElementById(`time-input-${index}`);
    timeInputs.push(timeInput);
    timeInput.addEventListener('change', () => handleTimeChange(index));

    const removeBtn = timeZoneDiv.querySelector('.remove-timezone-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => removeTimezone(index));
    }
    const setBaseBtn = timeZoneDiv.querySelector('.set-base-btn');
    if (setBaseBtn) {
      setBaseBtn.addEventListener('click', () => setAsMyTime(index));
    }

    const clockEl = timeZoneDiv.querySelector('.clock-face');
    if (clockEl) {
      setupClockDragging(clockEl, index);
    }

    const timeDisplay = document.getElementById(`time-display-${index}`);
    if (timeDisplay && timeInput) {
      timeDisplay.addEventListener('click', () => {
        timeInput.focus();
        if (typeof timeInput.showPicker === 'function') {
          timeInput.showPicker();
        }
      });
    }

    updateClock(index, getDisplayDate(index));
  });
}

function reRender() {
  const container = document.getElementById('time-zones-container');
  container.innerHTML = '';
  timeInputs.length = 0;
  createTimeZoneElements();
  refreshAddSelect();
  updateResetButtonVisibility();
  updateOffsetVisibility();
}

function updateResetButtonVisibility() {
  const btn = document.getElementById('now-button');
  if (btn) btn.classList.toggle('hidden', !isManualAdjustment);
}

function updateOffsetVisibility() {
  timeZones.forEach((_, index) => {
    const el = document.getElementById(`offset-${index}`);
    if (el) el.classList.toggle('hidden', isManualAdjustment);
  });
}

function resetToNow() {
  isManualAdjustment = false;
  updateResetButtonVisibility();
  updateOffsetVisibility();
  const baseTime = getTimeInTimezone(timeZones[baseTimeZoneIndex].timezone);
  timeZones.forEach((tz, index) => {
    const currentTime = getTimeInTimezone(tz.timezone);
    const timeInput = timeInputs[index];
    if (timeInput) {
      timeInput.value = formatTimeForInput(currentTime);
    }
    updateTimeDisplay(index, currentTime);
    updateDateIndicator(index, currentTime, baseTime);
    updateOffsetLabel(index, currentTime, baseTime);
    updateDayNight(index, currentTime);
    updateClock(index, currentTime);
  });
}

function updateFormat() {
  const toggle = document.getElementById('format-toggle');
  use12HourFormat = !!(toggle && toggle.checked);
  timeZones.forEach((tz, index) => {
    const date = getDisplayDate(index);
    updateTimeDisplay(index, date);
    updateDayNight(index, date);
    updateClock(index, date);
  });
}

function initTheme() {
  const saved = window.localStorage.getItem('wtz-theme');
  if (!saved) return;
  document.body.dataset.theme = saved;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.checked = saved === 'dark';
  }
}

function updateTheme() {
  const toggle = document.getElementById('theme-toggle');
  const isDark = !!(toggle && toggle.checked);
  const theme = isDark ? 'dark' : 'light';
  document.body.dataset.theme = theme;
  window.localStorage.setItem('wtz-theme', theme);
}

function applyInitialThemeFromBaseCity() {
  const saved = window.localStorage.getItem('wtz-theme');
  if (saved) return;
  const base = timeZones[baseTimeZoneIndex];
  if (!base) return;
  const baseTime = getTimeInTimezone(base.timezone);
  const hour = baseTime.getHours();
  const isNight = hour < 6 || hour >= 18;
  const theme = isNight ? 'dark' : 'light';
  document.body.dataset.theme = theme;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.checked = theme === 'dark';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadAvailableCities();

  const fromUrl = getCitiesFromUrl();
  if (fromUrl.length > 0) {
    timeZones.length = 0;
    timeZones.push(...fromUrl);
  }
  if (timeZones.length === 0) {
    timeZones.push(pickBaseCity());
  }

  applyInitialThemeFromBaseCity();

  createTimeZoneElements();
  refreshAddSelect();
  updateUrlFromCities();
  updateResetButtonVisibility();

  document.getElementById('format-toggle').addEventListener('change', updateFormat);
  document.getElementById('theme-toggle').addEventListener('change', updateTheme);
  document.getElementById('now-button').addEventListener('click', resetToNow);

  const sel = document.getElementById('add-timezone-select');
  if (sel) {
    sel.addEventListener('change', () => {
      const v = sel.value;
      if (v) {
        addTimezone(v);
        sel.value = '';
        refreshAddSelect();
      }
    });
  }

  setInterval(updateAllTimes, 1000);
  updateAllTimes();
});