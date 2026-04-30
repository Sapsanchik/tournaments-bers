// ==================== ШВЕЙЦАРСКАЯ СИСТЕМА - ИНТЕРФЕЙС ====================

let manualPairingMode = false;
let selectedForPairing = [];
let glickoPlayersList = [];

// Статусы турниров для архивации
let activeTournamentIds = new Set();
let archivedTournamentIds = new Set();
let sectionStates = { activeSection: true, archivedSection: false };

function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Загрузка статусов турниров
function loadTournamentStatuses() {
    const stored = localStorage.getItem('swiss_tournament_statuses_v2');
    if (stored) {
        try {
            const statuses = JSON.parse(stored);
            activeTournamentIds = new Set(statuses.active || []);
            archivedTournamentIds = new Set(statuses.archived || []);
        } catch (e) {}
    }
}

function saveTournamentStatuses() {
    localStorage.setItem(
        'swiss_tournament_statuses_v2',
        JSON.stringify({
            active: Array.from(activeTournamentIds),
            archived: Array.from(archivedTournamentIds),
        })
    );
}

function isTournamentArchived(tournamentId) {
    return archivedTournamentIds.has(tournamentId);
}

function archiveTournament(tournamentId) {
    if (archivedTournamentIds.has(tournamentId)) return;
    activeTournamentIds.delete(tournamentId);
    archivedTournamentIds.add(tournamentId);
    saveTournamentStatuses();
    renderTournamentList();
}

function unarchiveTournament(tournamentId) {
    if (!archivedTournamentIds.has(tournamentId)) return;
    archivedTournamentIds.delete(tournamentId);
    activeTournamentIds.add(tournamentId);
    saveTournamentStatuses();
    renderTournamentList();
}

function archiveAllCompleted() {
    const allTournaments = window.SwissCore.getAllTournaments
        ? window.SwissCore.getAllTournaments()
        : [];
    allTournaments.forEach((t) => {
        if (t.submittedToGlicko && !archivedTournamentIds.has(t.id)) {
            archivedTournamentIds.add(t.id);
            activeTournamentIds.delete(t.id);
        }
    });
    saveTournamentStatuses();
    renderAll();
}

function unarchiveAll() {
    archivedTournamentIds.clear();
    const allTournaments = window.SwissCore.getAllTournaments
        ? window.SwissCore.getAllTournaments()
        : [];
    allTournaments.forEach((t) => {
        activeTournamentIds.add(t.id);
    });
    saveTournamentStatuses();
    renderAll();
}

function deleteAllArchived() {
    if (!confirm('Удалить все архивные турниры? Это действие нельзя отменить.')) return;
    const allTournaments = window.SwissCore.getAllTournaments
        ? window.SwissCore.getAllTournaments()
        : [];
    const newTournaments = allTournaments.filter((t) => !archivedTournamentIds.has(t.id));
    if (newTournaments.length === 0 && allTournaments.length > 0) {
        if (confirm('Все турниры будут удалены. Создать новый турнир?')) {
            window.SwissCore.setAllTournaments([]);
            window.SwissCore.createNewTournament();
        } else {
            window.SwissCore.setAllTournaments(newTournaments);
        }
    } else {
        window.SwissCore.setAllTournaments(newTournaments);
    }
    archivedTournamentIds.clear();
    saveTournamentStatuses();
    renderAll();
}

function cleanupOldTournaments(daysOld = 30) {
    const cutoffDate = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    const allTournaments = window.SwissCore.getAllTournaments
        ? window.SwissCore.getAllTournaments()
        : [];
    const toDelete = allTournaments.filter((t) => {
        const tourneyDate = new Date(
            t.createdAt || t.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '1970-01-01'
        ).getTime();
        return tourneyDate < cutoffDate && t.submittedToGlicko;
    });

    if (toDelete.length === 0) {
        alert(`Нет турниров старше ${daysOld} дней`);
        return;
    }

    if (
        confirm(`Найдено ${toDelete.length} турниров старше ${daysOld} дней. Удалить их?`)
    ) {
        const newTournaments = allTournaments.filter((t) => !toDelete.includes(t));
        window.SwissCore.setAllTournaments(newTournaments);
        window.SwissCore.saveSwissToLocal();
        renderAll();
        alert(`Удалено ${toDelete.length} старых турниров`);
    }
}

function toggleSection(sectionName) {
    const content = document.getElementById(`${sectionName}Content`);
    const icon = document.getElementById(`${sectionName}Icon`);

    if (sectionStates[sectionName]) {
        content.classList.add('collapsed');
        icon.classList.add('collapsed');
        sectionStates[sectionName] = false;
    } else {
        content.classList.remove('collapsed');
        icon.classList.remove('collapsed');
        sectionStates[sectionName] = true;
    }

    localStorage.setItem('swiss_section_states_v2', JSON.stringify(sectionStates));
}

function loadSectionStates() {
    const stored = localStorage.getItem('swiss_section_states_v2');
    if (stored) {
        try {
            const states = JSON.parse(stored);
            sectionStates = { ...sectionStates, ...states };

            for (const [section, isOpen] of Object.entries(sectionStates)) {
                const content = document.getElementById(`${section}Content`);
                const icon = document.getElementById(`${section}Icon`);
                if (content && icon) {
                    if (!isOpen) {
                        content.classList.add('collapsed');
                        icon.classList.add('collapsed');
                    } else {
                        content.classList.remove('collapsed');
                        icon.classList.remove('collapsed');
                    }
                }
            }
        } catch (e) {}
    }
}

// Загрузка игроков из Глико
function loadPlayersFromGlicko() {
    if (typeof GlickoStorage !== 'undefined' && GlickoStorage.getPlayersAsArray) {
        const players = GlickoStorage.getPlayersAsArray();
        glickoPlayersList = players.filter((p) => p.name !== 'Баев Бай');
        const select = document.getElementById('playerSelectFromDB');
        if (select) {
            select.innerHTML =
                '<option value="">-- Выберите игрока --</option>' +
                glickoPlayersList
                    .map(
                        (p) =>
                            `<option value="${escapeHtml(p.name)}">${escapeHtml(
                                p.name
                            )} (рейтинг: ${Math.round(p.rating)})</option>`
                    )
                    .join('');
        }
        const syncStatus = document.getElementById('syncStatus');
        if (syncStatus) syncStatus.innerHTML = `✅ Синхр. (${glickoPlayersList.length})`;
        return glickoPlayersList;
    }

    try {
        const playersJson = localStorage.getItem('glickoPlayers');
        if (playersJson) {
            const players = JSON.parse(playersJson);
            const activePlayers = Object.entries(players)
                .filter(([_, data]) => data.status !== 'inactive')
                .map(([name, data]) => ({
                    name: name,
                    rating: data.rating,
                    rd: data.rd,
                }));
            glickoPlayersList = activePlayers.filter((p) => p.name !== 'Баев Бай');
            const select = document.getElementById('playerSelectFromDB');
            if (select) {
                select.innerHTML =
                    '<option value="">-- Выберите игрока --</option>' +
                    glickoPlayersList
                        .map(
                            (p) =>
                                `<option value="${escapeHtml(p.name)}">${escapeHtml(
                                    p.name
                                )} (рейтинг: ${Math.round(p.rating)})</option>`
                        )
                        .join('');
            }
            const syncStatus = document.getElementById('syncStatus');
            if (syncStatus)
                syncStatus.innerHTML = `✅ Синхр. (${glickoPlayersList.length})`;
            return glickoPlayersList;
        }
    } catch (e) {
        console.error('Ошибка загрузки из localStorage:', e);
    }

    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus)
        syncStatus.innerHTML = `⚠️ Глико не найден. Откройте index.html сначала.`;
    return [];
}

function syncPlayersFromGlicko() {
    const t = window.SwissCore.getCurrentTournament();
    if (!t || t.submittedToGlicko) {
        alert('Турнир уже засчитан');
        return;
    }
    const glickoPlayers = loadPlayersFromGlicko();
    let added = 0;
    glickoPlayers.forEach((gp) => {
        if (!t.players.some((p) => p.name.toLowerCase() === gp.name.toLowerCase())) {
            window.SwissCore.addPlayerToTournament(t, gp.name);
            added++;
        }
    });
    alert(added ? `Добавлено ${added} игроков из Глико` : 'Все игроки уже в турнире');
    renderAll();
}

// Рендер функций
function renderTournamentList() {
    const activeContainer = document.getElementById('activeTournamentList');
    const archivedContainer = document.getElementById('archivedTournamentList');
    const activeCountSpan = document.getElementById('activeCount');
    const archivedCountSpan = document.getElementById('archivedCount');

    if (!activeContainer) return;

    const allTournaments = window.SwissCore.getAllTournaments
        ? window.SwissCore.getAllTournaments()
        : [];
    const activeTournaments = allTournaments.filter(
        (t) => !archivedTournamentIds.has(t.id)
    );
    const archivedTournaments = allTournaments.filter((t) =>
        archivedTournamentIds.has(t.id)
    );

    if (activeCountSpan) activeCountSpan.textContent = activeTournaments.length;
    if (archivedCountSpan) archivedCountSpan.textContent = archivedTournaments.length;

    const currentId = window.SwissCore.getCurrentTournamentId
        ? window.SwissCore.getCurrentTournamentId()
        : null;

    if (activeTournaments.length === 0) {
        activeContainer.innerHTML =
            '<div style="color:gray; padding: 8px;">Нет активных турниров. Создайте новый.</div>';
    } else {
        activeContainer.innerHTML = activeTournaments
            .map(
                (t) => `
            <div class="tournament-tab ${currentId === t.id ? 'active' : ''} ${
                    t.submittedToGlicko ? 'submitted' : ''
                }" 
                 onclick="window.switchTournament(${t.id})">
                <span>📋 ${escapeHtml(t.name)} (${t.currentRound}/${t.maxRounds})</span>
                <button class="delete-tournament-icon" onclick="event.stopPropagation(); window.renameTournamentPrompt(${
                    t.id
                })">✏️</button>
                ${
                    t.submittedToGlicko
                        ? `<button class="delete-tournament-icon" onclick="event.stopPropagation(); window.archiveTournament(${t.id})" title="В архив">📦</button>`
                        : ''
                }
                <button class="delete-tournament-icon" onclick="event.stopPropagation(); window.deleteTournamentConfirm(${
                    t.id
                })">🗑</button>
            </div>
        `
            )
            .join('');
    }

    if (archivedTournaments.length === 0) {
        archivedContainer.innerHTML =
            '<div style="color:gray; padding: 8px;">Нет архивных турниров</div>';
    } else {
        archivedContainer.innerHTML = archivedTournaments
            .map(
                (t) => `
            <div class="tournament-tab ${currentId === t.id ? 'active' : ''} ${
                    t.submittedToGlicko ? 'submitted' : ''
                }" 
                 onclick="window.switchTournament(${t.id})">
                <span>📦 ${escapeHtml(t.name)} (${t.currentRound}/${t.maxRounds})</span>
                <button class="delete-tournament-icon" onclick="event.stopPropagation(); window.unarchiveTournament(${
                    t.id
                })" title="Восстановить">📤</button>
                <button class="delete-tournament-icon" onclick="event.stopPropagation(); window.renameTournamentPrompt(${
                    t.id
                })">✏️</button>
                <button class="delete-tournament-icon" onclick="event.stopPropagation(); window.deleteTournamentConfirm(${
                    t.id
                })">🗑</button>
            </div>
        `
            )
            .join('');
    }
}

function renderPlayers() {
    const t = window.SwissCore.getCurrentTournament();
    if (!t || !t.players.length) {
        document.getElementById('playersContainer').innerHTML =
            '<div style="color:gray;">➕ Добавьте игроков</div>';
        return;
    }
    if (manualPairingMode) {
        renderManualPairingMode(t);
        return;
    }

    const BYE_NAME = 'Баев Бай';
    document.getElementById('playersContainer').innerHTML = t.players
        .map(
            (p) => `
        <div class="player-card ${p.name === BYE_NAME ? 'bye-player' : ''}">
            <span class="player-name" data-id="${p.id}">${
                p.name === BYE_NAME ? '👤 ' : '✏️ '
            }${escapeHtml(p.name)}${
                p.name === BYE_NAME ? '<span class="bye-badge">BYE</span>' : ''
            }</span>
            <span>${p.points.toFixed(1)} оч</span>
            <button class="btn-icon" data-id="${p.id}" style="background:#fff0ed;" ${
                t.submittedToGlicko ? 'disabled' : ''
            }>🗑</button>
        </div>
    `
        )
        .join('');

    document.querySelectorAll('.player-name').forEach((el) => {
        el.addEventListener('click', () => {
            const id = parseInt(el.dataset.id);
            const p = t.players.find((pl) => pl.id === id);
            if (p && p.name !== BYE_NAME) {
                const newName = prompt('Новое имя', p.name);
                if (newName) window.SwissCore.renamePlayerInTournament(t, id, newName);
                renderAll();
            } else if (p && p.name === BYE_NAME) {
                alert('Нельзя переименовать BYE-игрока');
            }
        });
    });

    document.querySelectorAll('#playersContainer .btn-icon').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            if (confirm('Удалить игрока?')) {
                window.SwissCore.removePlayerFromTournament(t, id);
                renderAll();
            }
        });
    });

    showPlayerCountWarning(t);
}

function showPlayerCountWarning(t) {
    const BYE_NAME = 'Баев Бай';
    const realCount = t.players.filter((p) => p.name !== BYE_NAME).length;
    const hasBye = t.players.some((p) => p.name === BYE_NAME);
    const warn = document.getElementById('playerCountWarning');
    if (realCount % 2 !== 0 && realCount > 0 && !t.submittedToGlicko) {
        warn.style.display = 'block';
        warn.innerHTML = `⚠️ Нечётное количество игроков (${realCount}). ${
            !hasBye
                ? 'Нажмите "Добавить Баев Бай" или добавьте ещё игрока.'
                : 'Баев Бай уже добавлен.'
        }`;
    } else {
        warn.style.display = 'none';
    }
}

function renderManualPairingMode(t) {
    const BYE_NAME = 'Баев Бай';
    const realPlayers = t.players.filter((p) => p.name !== BYE_NAME);
    const byePlayer = t.players.find((p) => p.name === BYE_NAME);
    let html =
        '<div style="margin-bottom:10px;"><strong>✋ Ручное формирование пар</strong><br>Нажмите на двух игроков → создание пары</div>';
    html += '<div class="players-grid" id="manualPlayersGrid">';
    [...realPlayers, ...(byePlayer ? [byePlayer] : [])].forEach((p) => {
        const isSelected = selectedForPairing.includes(p.id);
        html += `<div class="player-card ${isSelected ? 'selected-for-pairing' : ''} ${
            p.name === BYE_NAME ? 'bye-player' : ''
        }" data-id="${p.id}" style="cursor:pointer">${escapeHtml(p.name)}${
            p.name === BYE_NAME ? ' <span class="bye-badge">BYE</span>' : ''
        } (${p.points.toFixed(1)} оч)</div>`;
    });
    html += '</div><div style="margin-top:10px; display:flex; gap:8px;">';
    html += `<button id="randomByeManualBtn" class="warning">🎲 Случайный BYE</button>`;
    html += `<button id="clearPairingBtn" class="secondary">Очистить</button>`;
    html += `<button id="createPairingsBtn" class="primary" ${
        selectedForPairing.length % 2 !== 0 ? 'disabled' : ''
    }>Создать пары (${Math.floor(selectedForPairing.length / 2)})</button>`;
    html += `<button id="exitManualBtn" class="danger">Выход</button></div>`;
    document.getElementById('playersContainer').innerHTML = html;

    document.querySelectorAll('#manualPlayersGrid .player-card').forEach((el) => {
        el.addEventListener('click', () =>
            togglePlayerSelection(parseInt(el.dataset.id))
        );
    });

    const randomByeBtn = document.getElementById('randomByeManualBtn');
    if (randomByeBtn) randomByeBtn.addEventListener('click', () => randomByeSelection(t));

    const clearBtn = document.getElementById('clearPairingBtn');
    if (clearBtn)
        clearBtn.addEventListener('click', () => {
            selectedForPairing = [];
            renderPlayers();
        });

    const createBtn = document.getElementById('createPairingsBtn');
    if (createBtn) createBtn.addEventListener('click', () => createManualPairings(t));

    const exitBtn = document.getElementById('exitManualBtn');
    if (exitBtn)
        exitBtn.addEventListener('click', () => {
            manualPairingMode = false;
            selectedForPairing = [];
            renderAll();
        });
}

function togglePlayerSelection(id) {
    const idx = selectedForPairing.indexOf(id);
    if (idx === -1) selectedForPairing.push(id);
    else selectedForPairing.splice(idx, 1);
    renderPlayers();
}

function randomByeSelection(t) {
    const BYE_NAME = 'Баев Бай';
    const realPlayers = t.players.filter(
        (p) => p.name !== BYE_NAME && !selectedForPairing.includes(p.id)
    );
    if (!realPlayers.length) {
        alert('Нет доступных игроков');
        return;
    }
    const randomPlayer = realPlayers[Math.floor(Math.random() * realPlayers.length)];
    const byePlayer = t.players.find((p) => p.name === BYE_NAME);
    if (byePlayer) {
        selectedForPairing.push(randomPlayer.id, byePlayer.id);
        renderPlayers();
    } else {
        alert('Сначала добавьте "Баев Бай"');
    }
}

function createManualPairings(t) {
    if (selectedForPairing.length % 2 !== 0) {
        alert('Чётное количество игроков');
        return;
    }
    const pairings = [];
    for (let i = 0; i < selectedForPairing.length; i += 2) {
        const p1Id = selectedForPairing[i],
            p2Id = selectedForPairing[i + 1];
        if (!window.SwissCore.canPlayTogether(t, p1Id, p2Id)) {
            const p1 = t.players.find((p) => p.id === p1Id),
                p2 = t.players.find((p) => p.id === p2Id);
            alert(`Игроки ${p1?.name} и ${p2?.name} уже встречались!`);
            return;
        }
        pairings.push({ p1Id, p2Id });
    }
    t.rounds.push({
        roundNumber: t.currentRound + 1,
        matches: pairings.map((p) => ({
            p1Id: p.p1Id,
            p2Id: p.p2Id,
            completed: false,
            result: null,
        })),
    });
    t.currentRound++;
    window.SwissCore.recalcAllStats(t);
    window.SwissCore.saveSwissToLocal();
    manualPairingMode = false;
    selectedForPairing = [];
    renderAll();
    alert(`✅ Создан тур ${t.currentRound}`);
}

function renderStandings() {
    const t = window.SwissCore.getCurrentTournament();
    if (!t || !t.players.length) {
        document.getElementById('standingsBody').innerHTML =
            '<tr><td colspan="7">Нет игроков</td></tr>';
        return;
    }

    // Пересчитываем статистику перед отображением
    window.SwissCore.recalcAllStats(t);

    // Сортируем игроков
    const sorted = [...t.players].sort((a, b) => {
        // Очки (по убыванию)
        if (a.points !== b.points) return b.points - a.points;
        // Медведев (по убыванию)
        if ((a.medvedev || 0) !== (b.medvedev || 0))
            return (b.medvedev || 0) - (a.medvedev || 0);
        // Бухгольц (по убыванию)
        if ((a.buchholz || 0) !== (b.buchholz || 0))
            return (b.buchholz || 0) - (a.buchholz || 0);
        // Победы (по убыванию)
        if (a.wins !== b.wins) return b.wins - a.wins;
        // Ничьи (по убыванию)
        return b.draws - a.draws;
    });

    const BYE_NAME = 'Баев Бай';

    document.getElementById('standingsBody').innerHTML = sorted
        .map((p, idx) => {
            // Безопасное получение значений с защитой от undefined/null
            const points =
                p.points !== undefined && p.points !== null ? p.points.toFixed(1) : '0.0';
            const wins = p.wins || 0;
            const draws = p.draws || 0;
            const buchholz =
                p.buchholz !== undefined && p.buchholz !== null
                    ? p.buchholz.toFixed(1)
                    : '0.0';
            const medvedev =
                p.medvedev !== undefined && p.medvedev !== null
                    ? p.medvedev.toFixed(1)
                    : '0.0';

            return `
            <tr style="${
                p.name === BYE_NAME
                    ? 'background:#fff8e1; opacity:0.8'
                    : idx === 0
                    ? 'background:#e8f5e9'
                    : idx === 1
                    ? 'background:#e3f2fd'
                    : idx === 2
                    ? 'background:#fff3e0'
                    : ''
            }">
                <td><strong>${idx + 1}</strong></td>
                <td><strong>${escapeHtml(p.name)}${
                p.name === BYE_NAME ? ' <span class="bye-badge">BYE</span>' : ''
            }</strong></td>
                <td>${points}</td>
                <td>${wins}</td>
                <td>${draws}</td>
                <td>${buchholz}</td>
                <td>${medvedev}</td>
            </tr>
        `;
        })
        .join('');

    const roundsInfo = document.getElementById('roundsInfo');
    if (roundsInfo) roundsInfo.innerHTML = `(${t.currentRound}/${t.maxRounds} туров)`;

    const tournamentName = document.getElementById('tournamentName');
    if (tournamentName) tournamentName.innerHTML = `"${escapeHtml(t.name)}"`;
}

function renderRounds() {
    const t = window.SwissCore.getCurrentTournament();
    if (!t || !t.rounds.length) {
        document.getElementById('roundsHistory').innerHTML =
            '<div class="info-note">Туров пока нет. Нажмите «Следующий тур».</div>';
        return;
    }

    const BYE_NAME = 'Баев Бай';
    let html = '';
    t.rounds.forEach((round, rIdx) => {
        html += `<div class="round-compact"><div class="round-title-compact">🏅 Тур ${round.roundNumber}</div><div class="matches-grid">`;
        round.matches.forEach((match, mIdx) => {
            const p1 = t.players.find((p) => p.id === match.p1Id);
            const p2 = t.players.find((p) => p.id === match.p2Id);
            const isBye = p1?.name === BYE_NAME || p2?.name === BYE_NAME;
            html += `<div class="match-compact ${isBye ? 'bye-match' : ''}">
                        <div class="match-players-compact">${escapeHtml(
                            p1?.name
                        )} 🆚 ${escapeHtml(p2?.name)}</div>
                        <div class="match-actions">`;
            if (!match.completed && !t.submittedToGlicko) {
                if (isBye) {
                    html += `<button class="btn-icon win-small" data-round="${rIdx}" data-match="${mIdx}" data-result="win">✅ Победа (+3 очка, +5 рейтинга)</button>`;
                } else {
                    html += `<button class="btn-icon win-small" data-round="${rIdx}" data-match="${mIdx}" data-result="win">🏆 ${p1?.name}</button>
                             <button class="btn-icon draw-small" data-round="${rIdx}" data-match="${mIdx}" data-result="draw">🤝 Ничья</button>
                             <button class="btn-icon loss-small" data-round="${rIdx}" data-match="${mIdx}" data-result="loss">🏆 ${p2?.name}</button>`;
                }
            } else {
                let resultText = '';
                if (isBye) {
                    resultText = `✅ ${
                        p1?.name === BYE_NAME ? p2?.name : p1?.name
                    } (BYE)`;
                } else if (match.result === 'win') {
                    resultText = `✅ ${p1?.name}`;
                } else if (match.result === 'loss') {
                    resultText = `✅ ${p2?.name}`;
                } else {
                    resultText = '🤝 Ничья';
                }
                html += `<span class="result-badge ${
                    isBye ? 'bye-win' : ''
                }">${resultText}</span>`;
                if (!t.submittedToGlicko) {
                    html += `<button class="btn-icon warning" data-edit="${rIdx}_${mIdx}">✎ Изм.</button>`;
                }
            }
            html += `</div></div>`;
        });
        html += `</div></div>`;
    });
    document.getElementById('roundsHistory').innerHTML = html;

    document.querySelectorAll('[data-result]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const r = parseInt(btn.dataset.round);
            const m = parseInt(btn.dataset.match);
            const res = btn.dataset.result;
            window.SwissCore.setMatchResult(t, r, m, res);
            renderAll();
        });
    });

    document.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const [r, m] = btn.dataset.edit.split('_').map(Number);
            const newRes = prompt('Результат (win/draw/loss):', 'draw');
            if (newRes && ['win', 'draw', 'loss'].includes(newRes)) {
                window.SwissCore.setMatchResult(t, r, m, newRes);
                renderAll();
            }
        });
    });
}

function updateSubmissionStatus() {
    const t = window.SwissCore.getCurrentTournament();
    const btn = document.getElementById('submitTournamentBtn');
    if (t?.submittedToGlicko) {
        if (btn) {
            btn.textContent = '✅ Засчитано';
            btn.disabled = true;
            btn.style.opacity = '0.6';
        }
    } else {
        if (btn) {
            btn.textContent = '📊 Засчитать в рейтинг Глико';
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }
}

function submitTournament() {
    const t = window.SwissCore.getCurrentTournament();
    if (!t) {
        alert('Нет турнира');
        return;
    }
    if (t.submittedToGlicko) {
        alert(`Уже засчитан ${new Date(t.submissionDate).toLocaleString()}`);
        return;
    }
    if (t.currentRound < t.maxRounds) {
        alert(`Турнир не завершён! ${t.currentRound}/${t.maxRounds} туров`);
        return;
    }

    let allCompleted = true;
    for (const round of t.rounds) {
        for (const match of round.matches) {
            if (!match.completed) allCompleted = false;
        }
    }
    if (!allCompleted) {
        alert('Не все матчи завершены!');
        return;
    }

    let tournamentDate = new Date().toISOString().split('T')[0];
    const userDate = prompt('Дата турнира (ГГГГ-ММ-ДД):', tournamentDate);
    if (userDate && userDate.match(/^\d{4}-\d{2}-\d{2}$/)) tournamentDate = userDate;

    const success = window.SwissCore.submitTournamentToGlickoSystem(t, tournamentDate);

    if (success) {
        updateSubmissionStatus();
        renderAll();
        alert(`✅ Турнир "${t.name}" засчитан в рейтинг Глико!`);
    } else {
        alert('❌ Ошибка при засчитывании турнира');
    }
}

function resetCurrentTournament() {
    const t = window.SwissCore.getCurrentTournament();
    if (t && confirm(`Сбросить "${t.name}"?`)) {
        t.players = [];
        t.rounds = [];
        t.currentRound = 0;
        t.nextPlayerId = 1;
        t.submittedToGlicko = false;
        t.submissionDate = null;
        window.SwissCore.saveSwissToLocal();
        renderAll();
        alert('Сброшено');
    }
}

function deleteCurrentTournament() {
    const t = window.SwissCore.getCurrentTournament();
    if (!t) return;
    const allTournaments = window.SwissCore.getAllTournaments
        ? window.SwissCore.getAllTournaments()
        : [];
    if (allTournaments.length <= 1) {
        if (confirm('Удалить и создать новый?')) {
            window.SwissCore.setAllTournaments([]);
            window.SwissCore.createNewTournament();
        }
        return;
    }
    if (confirm(`Удалить "${t.name}"?`)) {
        const newTournaments = allTournaments.filter((tt) => tt.id !== t.id);
        window.SwissCore.setAllTournaments(newTournaments);
        const newCurrentId = newTournaments[0]?.id || null;
        window.SwissCore.setCurrentTournamentId(newCurrentId);
        window.SwissCore.saveSwissToLocal();
        renderAll();
    }
}

function renameTournamentPrompt(id) {
    const allTournaments = window.SwissCore.getAllTournaments
        ? window.SwissCore.getAllTournaments()
        : [];
    const t = allTournaments.find((tt) => tt.id === id);
    if (t) {
        const newName = prompt('Название:', t.name);
        if (newName?.trim()) {
            t.name = newName.trim();
            window.SwissCore.saveSwissToLocal();
            renderAll();
        }
    }
}

function deleteTournamentConfirm(id) {
    const allTournaments = window.SwissCore.getAllTournaments
        ? window.SwissCore.getAllTournaments()
        : [];
    const t = allTournaments.find((tt) => tt.id === id);
    if (!t) return;
    if (allTournaments.length <= 1) {
        if (confirm('Удалить и создать новый?')) {
            window.SwissCore.setAllTournaments([]);
            window.SwissCore.createNewTournament();
        }
        return;
    }
    if (confirm(`Удалить "${t.name}"?`)) {
        const newTournaments = allTournaments.filter((tt) => tt.id !== id);
        window.SwissCore.setAllTournaments(newTournaments);
        const currentId = window.SwissCore.getCurrentTournamentId
            ? window.SwissCore.getCurrentTournamentId()
            : null;
        if (currentId === id) {
            const newCurrentId = newTournaments[0]?.id || null;
            window.SwissCore.setCurrentTournamentId(newCurrentId);
        }
        window.SwissCore.saveSwissToLocal();
        renderAll();
    }
}

function switchTournament(id) {
    window.SwissCore.setCurrentTournamentId(id);
    manualPairingMode = false;
    selectedForPairing = [];
    renderAll();
}

function renderAll() {
    renderTournamentList();
    renderPlayers();
    renderStandings();
    renderRounds();
    updateSubmissionStatus();
}

// Инициализация
function initSwiss() {
    console.log('initSwiss started');

    // Создаем недостающие методы в SwissCore если их нет
    if (window.SwissCore) {
        if (!window.SwissCore.getAllTournaments) {
            window.SwissCore.getAllTournaments = function () {
                return allTournaments || [];
            };
        }
        if (!window.SwissCore.setAllTournaments) {
            window.SwissCore.setAllTournaments = function (data) {
                allTournaments = data;
            };
        }
        if (!window.SwissCore.getCurrentTournamentId) {
            window.SwissCore.getCurrentTournamentId = function () {
                return currentTournamentId;
            };
        }
        if (!window.SwissCore.setCurrentTournamentId) {
            window.SwissCore.setCurrentTournamentId = function (id) {
                currentTournamentId = id;
            };
        }
    }

    window.SwissCore.loadSwissFromLocal();
    loadTournamentStatuses();
    loadSectionStates();
    loadPlayersFromGlicko();

    // Кнопка перехода в Глико
    const goToGlickoBtn = document.getElementById('goToGlickoBtn');
    if (goToGlickoBtn)
        goToGlickoBtn.onclick = () => (window.location.href = 'index.html');

    // Кнопка добавления игрока вручную
    const addPlayerBtn = document.getElementById('addPlayerBtn');
    if (addPlayerBtn) {
        addPlayerBtn.onclick = () => {
            const nameInput = document.getElementById('playerNameInput');
            if (nameInput) {
                window.SwissCore.addPlayerToTournament(
                    window.SwissCore.getCurrentTournament(),
                    nameInput.value
                );
                nameInput.value = '';
                renderAll();
            }
        };
    }

    // Кнопка добавления игрока из Глико
    const addFromDBBtn = document.getElementById('addFromDBBtn');
    if (addFromDBBtn) {
        addFromDBBtn.onclick = () => {
            const select = document.getElementById('playerSelectFromDB');
            const name = select ? select.value : '';
            if (name) {
                window.SwissCore.addPlayerToTournament(
                    window.SwissCore.getCurrentTournament(),
                    name
                );
                renderAll();
            }
        };
    }

    // Кнопка синхронизации из Глико
    const syncPlayersBtn = document.getElementById('syncPlayersBtn');
    if (syncPlayersBtn)
        syncPlayersBtn.onclick = () => {
            syncPlayersFromGlicko();
            renderAll();
        };

    // Кнопка следующего тура
    const nextRoundBtn = document.getElementById('nextRoundBtn');
    if (nextRoundBtn)
        nextRoundBtn.onclick = () => {
            window.SwissCore.createNextRound(window.SwissCore.getCurrentTournament());
            renderAll();
        };

    // Кнопка пережеребьевки
    const reshuffleBtn = document.getElementById('reshuffleBtn');
    if (reshuffleBtn) {
        reshuffleBtn.onclick = () => {
            const t = window.SwissCore.getCurrentTournament();
            if (t && !t.submittedToGlicko && t.currentRound > 0) {
                t.rounds.pop();
                t.currentRound--;
                window.SwissCore.recalcAllStats(t);
                window.SwissCore.createNextRound(t);
                window.SwissCore.saveSwissToLocal();
                renderAll();
            } else if (t && t.submittedToGlicko) {
                alert('Турнир уже засчитан, нельзя изменить');
            } else {
                alert('Нет тура для пережеребьёвки');
            }
        };
    }

    // Кнопка засчитывания турнира
    const submitTournamentBtn = document.getElementById('submitTournamentBtn');
    if (submitTournamentBtn) submitTournamentBtn.onclick = submitTournament;

    // Кнопка нового турнира
    const newTournamentBtn = document.getElementById('newTournamentBtn');
    if (newTournamentBtn)
        newTournamentBtn.onclick = () => {
            window.SwissCore.createNewTournament();
            renderAll();
        };

    // Кнопка сброса текущего турнира
    const resetCurrentTournamentBtn = document.getElementById(
        'resetCurrentTournamentBtn'
    );
    if (resetCurrentTournamentBtn)
        resetCurrentTournamentBtn.onclick = resetCurrentTournament;

    // Кнопка удаления текущего турнира
    const deleteCurrentTournamentBtn = document.getElementById(
        'deleteCurrentTournamentBtn'
    );
    if (deleteCurrentTournamentBtn)
        deleteCurrentTournamentBtn.onclick = deleteCurrentTournament;

    // ========== КНОПКА ДОБАВЛЕНИЯ BYE-ИГРОКА ==========
    const addByePlayerBtn = document.getElementById('addByePlayerBtn');
    if (addByePlayerBtn) {
        addByePlayerBtn.onclick = function () {
            console.log('Add Bye button clicked');
            let t = window.SwissCore.getCurrentTournament();
            if (!t) {
                console.log('No tournament, creating new');
                window.SwissCore.createNewTournament();
                t = window.SwissCore.getCurrentTournament();
            }
            const result = window.SwissCore.addByePlayerToTournament(t);
            console.log('Add Bye result:', result);
            if (result !== false) {
                renderAll();
                alert('👤 Игрок "Баев Бай" добавлен в турнир');
            }
        };
    } else {
        console.error('addByePlayerBtn not found in DOM');
    }

    // Кнопка ручных пар
    const manualPairingBtn = document.getElementById('manualPairingBtn');
    if (manualPairingBtn) {
        manualPairingBtn.onclick = () => {
            manualPairingMode = !manualPairingMode;
            selectedForPairing = [];
            renderAll();
        };
    }

    // Кнопка установки количества туров
    const setMaxRoundsBtn = document.getElementById('setMaxRoundsBtn');
    if (setMaxRoundsBtn) {
        setMaxRoundsBtn.onclick = () => {
            const t = window.SwissCore.getCurrentTournament();
            const maxRoundsInput = document.getElementById('maxRoundsInput');
            if (t && !t.submittedToGlicko) {
                t.maxRounds = parseInt(maxRoundsInput ? maxRoundsInput.value : '3') || 3;
                window.SwissCore.saveSwissToLocal();
                renderAll();
                alert(`Количество туров установлено: ${t.maxRounds}`);
            } else if (t && t.submittedToGlicko) {
                alert('Турнир уже засчитан, нельзя изменить количество туров');
            }
        };
    }

    // Кнопки архивации
    const archiveAllCompletedBtn = document.getElementById('archiveAllCompletedBtn');
    if (archiveAllCompletedBtn) archiveAllCompletedBtn.onclick = archiveAllCompleted;

    const cleanupOldTournamentsBtn = document.getElementById('cleanupOldTournamentsBtn');
    if (cleanupOldTournamentsBtn) {
        cleanupOldTournamentsBtn.onclick = () => {
            const days = prompt(
                'Удалить турниры старше скольки дней? (по умолчанию 30)',
                '30'
            );
            if (days !== null) cleanupOldTournaments(parseInt(days) || 30);
        };
    }

    const clearAllArchivedBtn = document.getElementById('clearAllArchivedBtn');
    if (clearAllArchivedBtn) clearAllArchivedBtn.onclick = deleteAllArchived;

    const unarchiveAllBtn = document.getElementById('unarchiveAllBtn');
    if (unarchiveAllBtn) unarchiveAllBtn.onclick = unarchiveAll;

    // Enter в поле ввода имени
    const playerNameInput = document.getElementById('playerNameInput');
    if (playerNameInput) {
        playerNameInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                window.SwissCore.addPlayerToTournament(
                    window.SwissCore.getCurrentTournament(),
                    playerNameInput.value
                );
                playerNameInput.value = '';
                renderAll();
            }
        };
    }

    renderAll();
    console.log('initSwiss finished');
}

// Глобальные функции для onclick
window.switchTournament = switchTournament;
window.renameTournamentPrompt = renameTournamentPrompt;
window.deleteTournamentConfirm = deleteTournamentConfirm;
window.archiveTournament = archiveTournament;
window.unarchiveTournament = unarchiveTournament;
window.toggleSection = toggleSection;
window.initSwiss = initSwiss;
window.activeTournamentIds = activeTournamentIds;
window.archivedTournamentIds = archivedTournamentIds;

// Экспорт для доступа из других скриптов
window.SwissUI = {
    manualPairingMode: () => manualPairingMode,
    selectedForPairing: () => selectedForPairing,
    renderAll,
    initSwiss,
    archiveTournament,
    unarchiveTournament,
    toggleSection,
};
