// ==================== ПОЛЬЗОВАТЕЛЬСКИЙ ИНТЕРФЕЙС ГЛИКО ====================

let currentSort = { field: 'rating', order: 'desc' };
let currentTournamentDate = '';
let showInactivePlayers = false;

function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function getResultText(result) {
    const map = { win: 'Победа', loss: 'Поражение', draw: 'Ничья' };
    return map[result] || result;
}

// ==================== УПРАВЛЕНИЕ ИГРОКАМИ ====================
function addPlayer(name) {
    const players = GlickoStorage.getPlayers();
    if (players[name]) {
        alert('Игрок с таким именем уже существует!');
        return false;
    }
    players[name] = {
        rating: GlickoMath.INITIAL_RATING,
        rd: GlickoMath.INITIAL_RD,
        games: 0,
        volatility: '0.0',
        lastUpdate: Date.now(),
        status: 'active',
    };
    GlickoStorage.savePlayers(players);
    GlickoMath.recalculateSeasonStats();
    return true;
}

function togglePlayerStatus(playerName, isActive) {
    const players = GlickoStorage.getPlayers();
    if (players[playerName]) {
        players[playerName].status = isActive ? 'active' : 'inactive';
        GlickoStorage.savePlayers(players);
        displayPlayerList(showInactivePlayers);
        displayRating();
        populatePlayerSelects();
        const modal = document.getElementById('playerModal');
        if (
            modal.style.display === 'flex' &&
            document.getElementById('modalPlayerName').textContent === playerName
        ) {
            openPlayerModal(playerName);
        }
    }
}

function togglePlayerStatusPrompt(playerName, event) {
    if (event) event.stopPropagation();
    const players = GlickoStorage.getPlayers();
    const isCurrentlyActive = players[playerName]?.status !== 'inactive';
    const action = isCurrentlyActive ? 'деактивировать' : 'активировать';
    const message = isCurrentlyActive
        ? `Вы уверены, что хотите деактивировать игрока "${playerName}"?`
        : `Вы уверены, что хотите активировать игрока "${playerName}"?`;
    if (confirm(message)) {
        togglePlayerStatus(playerName, !isCurrentlyActive);
        alert(`Игрок "${playerName}" ${action}рован`);
    }
}

function deletePlayer(playerName = null) {
    if (!playerName) playerName = document.getElementById('editPlayerOriginalName').value;
    const players = GlickoStorage.getPlayers();
    const games = GlickoStorage.getGames();
    delete players[playerName];
    const updatedGames = games.filter(
        (game) => game.player1 !== playerName && game.player2 !== playerName
    );
    GlickoStorage.savePlayers(players);
    GlickoStorage.saveGames(updatedGames);
    GlickoMath.recalculateAllRatings();
    displayRating();
    displayHistory();
    displayPlayerList(showInactivePlayers);
    closeEditPlayerModal();
    alert(`Игрок "${playerName}" удален`);
}

function deletePlayerPrompt(playerName, event) {
    if (event) event.stopPropagation();
    if (
        confirm(
            `Удалить игрока "${playerName}"? Это также удалит все игры с его участием.`
        )
    ) {
        deletePlayer(playerName);
    }
}

// ==================== ОТОБРАЖЕНИЕ СПИСКА ИГРОКОВ ====================
function displayPlayerList(showInactive = false) {
    const players = showInactive
        ? GlickoStorage.getPlayers()
        : GlickoStorage.getActivePlayers();
    const seasonStats = GlickoStorage.getSeasonStats();
    const playerList = document.getElementById('playerList');

    playerList.innerHTML = '';

    if (Object.keys(players).length === 0) {
        playerList.innerHTML = '<p>Нет активных игроков</p>';
        return;
    }

    Object.entries(players).forEach(([name, data]) => {
        const playerStats = seasonStats[name] || { games: 0, tournaments: [] };
        const tournamentsCount = Array.isArray(playerStats.tournaments)
            ? playerStats.tournaments.length
            : 0;
        const isActive = data.status !== 'inactive';

        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.innerHTML = `
            <span onclick="openPlayerModal('${escapeHtml(
                name
            )}')" style="cursor: pointer; flex: 1;">${escapeHtml(name)}</span>
            <div style="display: flex; gap: 5px; align-items: center;">
                <span class="games-count">${playerStats.games} игр</span>
                <span class="tournaments-count">${tournamentsCount} турниров</span>
                <div class="player-actions">
                    <button class="player-action-btn status-btn ${
                        isActive ? 'warning' : 'success'
                    }" 
                            onclick="togglePlayerStatusPrompt('${escapeHtml(
                                name
                            )}', event)"
                            title="${isActive ? 'Деактивировать' : 'Активировать'}">
                        ${isActive ? '🔴' : '🟢'}
                    </button>
                    <button class="player-action-btn edit-btn" onclick="openEditPlayerModal('${escapeHtml(
                        name
                    )}', event)">✏️</button>
                    <button class="player-action-btn delete-btn" onclick="deletePlayerPrompt('${escapeHtml(
                        name
                    )}', event)">🗑️</button>
                </div>
            </div>
        `;
        playerList.appendChild(playerItem);
    });

    const seasonInfo = document.getElementById('seasonInfo');
    const settings = GlickoStorage.getSeasonSettings();
    if (seasonInfo) {
        if (settings.seasonStartDate) {
            seasonInfo.innerHTML = `Сезон учитывает игры с <strong>${new Date(
                settings.seasonStartDate
            ).toLocaleDateString('ru-RU')}</strong>`;
        } else {
            seasonInfo.innerHTML = 'Сезон учитывает все игры';
        }
    }
}

// ==================== ОТОБРАЖЕНИЕ РЕЙТИНГА ====================
function sortPlayers(players, sortBy, sortOrder) {
    const sortedPlayers = Object.entries(players);
    const seasonStats = GlickoStorage.getSeasonStats();
    switch (sortBy) {
        case 'rating':
            sortedPlayers.sort((a, b) => b[1].rating - a[1].rating);
            break;
        case 'games':
            sortedPlayers.sort(
                (a, b) =>
                    (seasonStats[b[0]]?.games || 0) - (seasonStats[a[0]]?.games || 0)
            );
            break;
        case 'tournaments':
            sortedPlayers.sort(
                (a, b) =>
                    (seasonStats[b[0]]?.tournaments?.length || 0) -
                    (seasonStats[a[0]]?.tournaments?.length || 0)
            );
            break;
        case 'name':
            sortedPlayers.sort((a, b) => a[0].localeCompare(b[0]));
            break;
        case 'rd':
            sortedPlayers.sort((a, b) => a[1].rd - b[1].rd);
            break;
        default:
            sortedPlayers.sort((a, b) => b[1].rating - a[1].rating);
    }
    if (sortOrder === 'asc') sortedPlayers.reverse();
    return sortedPlayers;
}

function displayRating() {
    const players = GlickoStorage.getActivePlayers();
    const seasonStats = GlickoStorage.getSeasonStats();
    const ratingBody = document.getElementById('ratingBody');
    ratingBody.innerHTML = '';
    if (Object.keys(players).length === 0) {
        ratingBody.innerHTML =
            '<tr><td colspan="7" style="text-align: center;">Нет активных игроков</td></tr>';
        return;
    }
    const sortBy = document.getElementById('sortBy').value;
    const sortOrder = document.getElementById('sortOrder').value;
    currentSort = { field: sortBy, order: sortOrder };
    const sortedPlayers = sortPlayers(players, sortBy, sortOrder);
    sortedPlayers.forEach(([name, data], index) => {
        const playerStats = seasonStats[name] || { games: 0, tournaments: [] };
        const tournamentsCount = Array.isArray(playerStats.tournaments)
            ? playerStats.tournaments.length
            : 0;
        let lastUpdate =
            data.lastUpdate && data.lastUpdate > 0
                ? new Date(data.lastUpdate).toLocaleDateString('ru-RU')
                : 'Никогда';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="position-number">${index + 1}</td>
            <td><span onclick="openPlayerModal('${escapeHtml(
                name
            )}')" style="cursor: pointer; font-weight: 600;">${escapeHtml(
            name
        )}</span></td>
            <td class="rating">${Math.round(data.rating)}</td>
            <td><span class="rd-value">${data.rd}</span></td>
            <td>${playerStats.games}</td>
            <td>${tournamentsCount}</td>
            <td>${lastUpdate}</td>
        `;
        ratingBody.appendChild(row);
    });
    updateSortHeaders();
}

function updateSortHeaders() {
    const headers = document.querySelectorAll('th[data-sort]');
    headers.forEach((header) => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (header.dataset.sort === currentSort.field) {
            header.classList.add(`sort-${currentSort.order}`);
        }
    });
}

function setupSorting() {
    document.querySelectorAll('th[data-sort]').forEach((header) => {
        header.addEventListener('click', () => {
            const field = header.dataset.sort;
            let order = 'desc';
            if (currentSort.field === field)
                order = currentSort.order === 'desc' ? 'asc' : 'desc';
            document.getElementById('sortBy').value = field;
            document.getElementById('sortOrder').value = order;
            displayRating();
        });
    });
    document.getElementById('sortBy').addEventListener('change', displayRating);
    document.getElementById('sortOrder').addEventListener('change', displayRating);
}

// ==================== ИСТОРИЯ ИГР ====================
function displayHistory() {
    const games = GlickoStorage.getGames();
    const historyBody = document.getElementById('historyBody');
    historyBody.innerHTML = '';
    if (games.length === 0) {
        historyBody.innerHTML =
            '<tr><td colspan="8" style="text-align: center;">Нет истории игр</td></tr>';
        return;
    }
    games.forEach((game, index) => {
        const row = document.createElement('tr');
        const typeClass = game.type === 'BYE' ? 'warning-text' : '';
        const typeBadge = game.type === 'BYE' ? 'badge-bye' : 'badge-regular';
        const result1Class =
            game.result1 === 'win'
                ? 'positive'
                : game.result1 === 'loss'
                ? 'negative'
                : '';
        const result2Class =
            game.result2 === 'win'
                ? 'positive'
                : game.result2 === 'loss'
                ? 'negative'
                : '';
        const change1 =
            game.ratingChange1 > 0 ? `+${game.ratingChange1}` : game.ratingChange1;
        const change2 =
            game.ratingChange2 > 0 ? `+${game.ratingChange2}` : game.ratingChange2;
        const change1Class =
            game.ratingChange1 > 0
                ? 'positive'
                : game.ratingChange1 < 0
                ? 'negative'
                : '';
        const change2Class =
            game.ratingChange2 > 0
                ? 'positive'
                : game.ratingChange2 < 0
                ? 'negative'
                : '';
        row.innerHTML = `
            <td>${game.date}</td>
            <td><span class="${typeClass} game-type-badge ${typeBadge}">${
            game.type
        }</span></td>
            <td><span onclick="openPlayerModal('${escapeHtml(
                game.player1
            )}')" style="cursor: pointer;">${escapeHtml(game.player1)}</span></td>
            <td class="${result1Class}">${getResultText(game.result1)}</td>
            <td>${
                game.player2
                    ? `<span onclick="openPlayerModal('${escapeHtml(
                          game.player2
                      )}')" style="cursor: pointer;">${escapeHtml(game.player2)}</span>`
                    : '-'
            }</td>
            <td class="${result2Class}">${getResultText(game.result2)}</td>
            <td><span class="${change1Class}">${game.player1}: ${change1}</span>${
            game.player2
                ? `<br><span class="${change2Class}">${game.player2}: ${change2}</span>`
                : ''
        }</td>
            <td><div class="history-actions"><button class="game-action-btn edit-btn" onclick="openEditGameModal(${index})">✏️</button><button class="game-action-btn delete-btn" onclick="deleteGame(${index})">🗑️</button></div></td>
        `;
        historyBody.appendChild(row);
    });
}

function deleteGame(gameIndex) {
    if (!confirm('Вы уверены, что хотите удалить эту игру?')) return;
    const games = GlickoStorage.getGames();
    games.splice(gameIndex, 1);
    GlickoStorage.saveGames(games);
    GlickoMath.recalculateAllRatings();
    displayRating();
    displayHistory();
    displayPlayerList(showInactivePlayers);
    alert('Игра удалена');
}

// ==================== ДОБАВЛЕНИЕ ИГР ====================
function createGameEntry(index) {
    const gameEntry = document.createElement('div');
    gameEntry.className = 'game-entry';
    gameEntry.innerHTML = `
        <div class="game-header">
            <span class="game-number">Игра ${
                index + 1
            } <span class="game-type-badge badge-regular">ОБЫЧНАЯ</span></span>
            <button type="button" class="remove-game" onclick="removeGame(this)">× Удалить</button>
        </div>
        <div class="form-row">
            <select class="player1-select" required>
                <option value="">Выберите игрока 1</option>
            </select>
            <select class="player1-result" required>
                <option value="win">Победа</option>
                <option value="loss">Поражение</option>
                <option value="draw">Ничья</option>
            </select>
        </div>
        <div class="form-row">
            <select class="player2-select" required>
                <option value="">Выберите игрока 2</option>
            </select>
            <select class="player2-result" required>
                <option value="win">Победа</option>
                <option value="loss">Поражение</option>
                <option value="draw">Ничья</option>
            </select>
        </div>
        <div class="result-validation-warning" style="color: #e74c3c; font-size: 0.7rem; margin-top: 5px; display: none;">
            ⚠️ Некорректная пара результатов!
        </div>`;

    const player1Result = gameEntry.querySelector('.player1-result');
    const player2Result = gameEntry.querySelector('.player2-result');
    const warningSpan = gameEntry.querySelector('.result-validation-warning');

    function validateResults() {
        const r1 = player1Result.value;
        const r2 = player2Result.value;

        if ((r1 === 'win' && r2 === 'win') || (r1 === 'loss' && r2 === 'loss')) {
            warningSpan.style.display = 'block';
            warningSpan.textContent =
                '⚠️ Оба игрока не могут одновременно победить или проиграть!';
        } else if (r1 === 'win' && r2 !== 'loss') {
            warningSpan.style.display = 'block';
            warningSpan.textContent = '⚠️ Если первый победил, второй должен проиграть!';
        } else if (r1 === 'loss' && r2 !== 'win') {
            warningSpan.style.display = 'block';
            warningSpan.textContent = '⚠️ Если первый проиграл, второй должен победить!';
        } else if (r1 === 'draw' && r2 !== 'draw') {
            warningSpan.style.display = 'block';
            warningSpan.textContent = '⚠️ При ничьей оба результата должны быть "ничья"!';
        } else {
            warningSpan.style.display = 'none';
        }
    }

    player1Result.addEventListener('change', validateResults);
    player2Result.addEventListener('change', validateResults);

    populateGameSelects(gameEntry);
    return gameEntry;
}

function createByeGameEntry(index) {
    const gameEntry = document.createElement('div');
    gameEntry.className = 'game-entry';
    gameEntry.innerHTML = `
        <div class="game-header">
            <span class="game-number">Игра ${
                index + 1
            } <span class="game-type-badge badge-bye">BYE</span></span>
            <button type="button" class="remove-game" onclick="removeGame(this)">× Удалить</button>
        </div>
        <div class="bye-section">
            <div class="bye-checkbox">
                <input type="checkbox" class="is-bye-checkbox" checked disabled>
                <label>Это BYE (игра без соперника)</label>
            </div>
            <div class="form-row">
                <select class="player1-select" required>
                    <option value="">Выберите игрока</option>
                </select>
                <select class="player1-result" required disabled>
                    <option value="win" selected>Победа (автоматически)</option>
                </select>
            </div>
            <div class="bye-info">
                Игрок получает автоматическую победу с минимальным изменением рейтинга (+5 очков)
            </div>
        </div>`;
    populateGameSelects(gameEntry);
    return gameEntry;
}

function populateGameSelects(gameElement) {
    const players = GlickoStorage.getActivePlayers();
    const player1Select = gameElement.querySelector('.player1-select');
    const player2Select = gameElement.querySelector('.player2-select');
    if (player1Select) {
        player1Select.innerHTML = '<option value="">Выберите игрока 1</option>';
        Object.keys(players).forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            player1Select.appendChild(option);
        });
    }
    if (player2Select) {
        player2Select.innerHTML = '<option value="">Выберите игрока 2</option>';
        Object.keys(players).forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            player2Select.appendChild(option);
        });
    }
}

function populatePlayerSelects() {
    const players = GlickoStorage.getActivePlayers();
    const gameEntries = document.querySelectorAll('.game-entry');
    gameEntries.forEach((entry) => {
        populateGameSelects(entry);
    });
    const editPlayer1Select = document.getElementById('editPlayer1Select');
    const editPlayer2Select = document.getElementById('editPlayer2Select');
    if (editPlayer1Select) {
        editPlayer1Select.innerHTML = '<option value="">Выберите игрока 1</option>';
        editPlayer2Select.innerHTML = '<option value="">Выберите игрока 2</option>';
        Object.keys(players).forEach((name) => {
            const option1 = document.createElement('option');
            option1.value = name;
            option1.textContent = name;
            editPlayer1Select.appendChild(option1);
            const option2 = document.createElement('option');
            option2.value = name;
            option2.textContent = name;
            editPlayer2Select.appendChild(option2);
        });
    }
}

function removeGame(button) {
    const gameEntry = button.closest('.game-entry');
    gameEntry.remove();
    updateGameNumbers();
}

function updateGameNumbers() {
    const gameEntries = document.querySelectorAll('.game-entry');
    gameEntries.forEach((entry, index) => {
        const gameNumber = entry.querySelector('.game-number');
        if (gameNumber) {
            const badge = gameNumber.querySelector('.game-type-badge');
            if (badge) {
                gameNumber.innerHTML = `Игра ${index + 1} ${badge.outerHTML}`;
            } else {
                gameNumber.innerHTML = `Игра ${index + 1}`;
            }
        }
    });
}

function addGameToForm(isBye = false) {
    const gamesContainer = document.getElementById('gamesContainer');
    const gameCount = gamesContainer.children.length;
    if (gameCount >= 10) {
        alert('Максимальное количество игр - 10');
        return;
    }
    const newGame = isBye ? createByeGameEntry(gameCount) : createGameEntry(gameCount);
    gamesContainer.appendChild(newGame);
}

function clearAllGames() {
    const gamesContainer = document.getElementById('gamesContainer');
    gamesContainer.innerHTML = '';
}

function isByeGame(gameElement) {
    return gameElement.querySelector('.is-bye-checkbox') !== null;
}

function addGames(date, gamesData) {
    const players = JSON.parse(JSON.stringify(GlickoStorage.getPlayers()));
    const games = GlickoStorage.getGames();
    const currentTime = new Date(date).getTime();
    const tempPlayers = JSON.parse(JSON.stringify(players));
    const newGames = [];

    for (const gameData of gamesData) {
        const { player1, player2, result1, result2, isBye } = gameData;

        if (!tempPlayers[player1]) {
            alert(`Игрок не найден: ${player1}`);
            return false;
        }

        if (isBye) {
            const updatedPlayer = GlickoMath.updateRatingForByeExact(
                tempPlayers[player1],
                currentTime
            );
            tempPlayers[player1] = {
                ...tempPlayers[player1],
                ...updatedPlayer,
                games: tempPlayers[player1].games + 1,
                lastUpdate: currentTime,
            };
            newGames.push({
                date: date,
                type: 'BYE',
                player1: player1,
                result1: 'win',
                player2: 'BYE',
                result2: 'loss',
                ratingChange1: updatedPlayer.ratingChange,
                ratingChange2: 0,
                ratingDiff: 0,
                expected1: '100.0',
                expected2: '0.0',
            });
        } else {
            if (!tempPlayers[player2]) {
                alert(`Игрок не найден: ${player2}`);
                return false;
            }
            if (player1 === player2) {
                alert('Нельзя играть с самим собой');
                return false;
            }

            // Проверка корректности результатов
            if (
                (result1 === 'win' && result2 === 'win') ||
                (result1 === 'loss' && result2 === 'loss')
            ) {
                alert(`Ошибка: оба игрока не могут одновременно победить или проиграть`);
                return false;
            }

            if (result1 === 'win' && result2 !== 'loss') {
                alert(`Ошибка: если ${player1} победил, то ${player2} должен проиграть`);
                return false;
            }
            if (result1 === 'loss' && result2 !== 'win') {
                alert(`Ошибка: если ${player1} проиграл, то ${player2} должен победить`);
                return false;
            }
            if (result1 === 'draw' && result2 !== 'draw') {
                alert(`Ошибка: при ничьей оба результата должны быть "ничья"`);
                return false;
            }

            const resultMap = { win: 1, loss: 0, draw: 0.5 };
            const numResult1 = resultMap[result1];
            const numResult2 = resultMap[result2];
            const ratingDiff = Math.abs(
                tempPlayers[player1].rating - tempPlayers[player2].rating
            );

            const updatedPlayer1 = GlickoMath.updateRatingExact(
                tempPlayers[player1],
                tempPlayers[player2],
                numResult1,
                currentTime
            );
            tempPlayers[player1] = {
                ...tempPlayers[player1],
                ...updatedPlayer1,
                games: tempPlayers[player1].games + 1,
                lastUpdate: currentTime,
            };

            const updatedPlayer2 = GlickoMath.updateRatingExact(
                tempPlayers[player2],
                tempPlayers[player1],
                numResult2,
                currentTime
            );
            tempPlayers[player2] = {
                ...tempPlayers[player2],
                ...updatedPlayer2,
                games: tempPlayers[player2].games + 1,
                lastUpdate: currentTime,
            };

            newGames.push({
                date: date,
                type: 'Обычная',
                player1: player1,
                player2: player2,
                result1: result1,
                result2: result2,
                ratingChange1: updatedPlayer1.ratingChange,
                ratingChange2: updatedPlayer2.ratingChange,
                ratingDiff: ratingDiff,
                expected1: (updatedPlayer1.expectedScore * 100).toFixed(1),
                expected2: (updatedPlayer2.expectedScore * 100).toFixed(1),
            });
        }
    }

    GlickoStorage.savePlayers(tempPlayers);
    GlickoStorage.saveGames([...newGames, ...games]);
    GlickoMath.recalculateSeasonStats();
    return true;
}

// ==================== СТАТИСТИКА ИГРОКА ====================
function openPlayerModal(playerName) {
    const players = GlickoStorage.getPlayers();
    const games = GlickoStorage.getGames();
    const seasonStats = GlickoStorage.getSeasonStats();
    const player = players[playerName];
    if (!player) return;

    const playerStats = seasonStats[playerName] || { games: 0, tournaments: [] };
    const tournamentsCount = Array.isArray(playerStats.tournaments)
        ? playerStats.tournaments.length
        : 0;
    const avgGamesPerTournament =
        tournamentsCount > 0 ? (playerStats.games / tournamentsCount).toFixed(1) : 0;
    const roundedRating = Math.round(player.rating);

    document.getElementById('modalPlayerName').textContent = playerName;
    document.getElementById('modalPlayerRating').textContent = roundedRating;
    document.getElementById('modalPlayerRD').textContent = player.rd;
    document.getElementById('modalTotalGames').textContent = playerStats.games;
    document.getElementById('modalTournamentsCount').textContent = tournamentsCount;
    document.getElementById('modalAvgGamesPerTournament').textContent =
        avgGamesPerTournament;

    const playerGames = games.filter(
        (game) => game.player1 === playerName || game.player2 === playerName
    );
    let wins = 0,
        losses = 0,
        draws = 0,
        totalPlayerGames = 0;

    playerGames.forEach((game) => {
        if (game.player1 === playerName) {
            totalPlayerGames++;
            if (game.result1 === 'win') wins++;
            else if (game.result1 === 'loss') losses++;
            else if (game.result1 === 'draw') draws++;
        } else if (game.player2 === playerName) {
            totalPlayerGames++;
            if (game.result2 === 'win') wins++;
            else if (game.result2 === 'loss') losses++;
            else if (game.result2 === 'draw') draws++;
        }
    });

    document.getElementById('resetGamesCount').textContent = playerStats.games;
    document.getElementById('resetTournamentsCount').textContent = tournamentsCount;

    displayWinChart(playerName, wins, losses, draws, totalPlayerGames);
    displayTournamentStats(playerName, games);
    displayOpponentStats(playerName, games);

    document.getElementById('playerModal').style.display = 'flex';
}

function closePlayerModal() {
    document.getElementById('playerModal').style.display = 'none';
}

function displayWinChart(playerName, wins, losses, draws, totalGames) {
    const statsTab = document.getElementById('stats-tab');
    const oldChart = document.getElementById('winStatsChart');
    if (oldChart) oldChart.remove();

    if (totalGames === 0) {
        const noGamesMsg = document.createElement('div');
        noGamesMsg.className = 'no-tournaments';
        noGamesMsg.style.textAlign = 'center';
        noGamesMsg.style.margin = '20px 0';
        noGamesMsg.textContent = 'Нет данных об играх';
        const seasonResetSection = document.querySelector('.season-reset-section');
        if (seasonResetSection) {
            statsTab.insertBefore(noGamesMsg, seasonResetSection);
        }
        return;
    }

    const winPercent = Math.round((wins / totalGames) * 100);
    const lossPercent = Math.round((losses / totalGames) * 100);
    const drawPercent = Math.round((draws / totalGames) * 100);

    const winStatsContainer = document.createElement('div');
    winStatsContainer.id = 'winStatsChart';
    winStatsContainer.className = 'win-stats';
    winStatsContainer.innerHTML = `
        <div class="win-chart-container">
            <div class="win-chart" style="--win-percent: ${winPercent}; --loss-percent: ${lossPercent}; --draw-percent: ${drawPercent};">
                <div class="win-chart-inner">
                    <div class="win-chart-total">${totalGames}</div>
                    <div class="win-chart-label">всего игр</div>
                </div>
            </div>
        </div>
        <div class="win-legend">
            <div class="legend-item">
                <div class="legend-color win"></div>
                <div class="legend-info">
                    <span>Победы</span>
                    <div>
                        <span class="legend-value">${wins}</span>
                        <span class="legend-percent">(${winPercent}%)</span>
                    </div>
                </div>
            </div>
            <div class="legend-item">
                <div class="legend-color loss"></div>
                <div class="legend-info">
                    <span>Поражения</span>
                    <div>
                        <span class="legend-value">${losses}</span>
                        <span class="legend-percent">(${lossPercent}%)</span>
                    </div>
                </div>
            </div>
            <div class="legend-item">
                <div class="legend-color draw"></div>
                <div class="legend-info">
                    <span>Ничьи</span>
                    <div>
                        <span class="legend-value">${draws}</span>
                        <span class="legend-percent">(${drawPercent}%)</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const playerStats = document.querySelector('.player-stats');
    if (playerStats && playerStats.nextSibling) {
        statsTab.insertBefore(winStatsContainer, playerStats.nextSibling);
    }
}

function displayTournamentStats(playerName, games) {
    const tournamentStatsContainer = document.getElementById('tournamentStats');
    tournamentStatsContainer.innerHTML = '';

    const tournaments = {};

    games.forEach((game) => {
        if (game.player1 === playerName || game.player2 === playerName) {
            const date = game.date;
            if (!tournaments[date]) tournaments[date] = [];
            tournaments[date].push(game);
        }
    });

    if (Object.keys(tournaments).length === 0) {
        tournamentStatsContainer.innerHTML =
            '<div class="no-tournaments">Нет данных о турнирах</div>';
        return;
    }

    const sortedTournaments = Object.entries(tournaments).sort(
        (a, b) => new Date(b[0]) - new Date(a[0])
    );

    sortedTournaments.forEach(([date, tournamentGames]) => {
        const tournamentRow = document.createElement('div');
        tournamentRow.className = 'tournament-row';
        tournamentRow.onclick = () => openTournamentModal(date);

        let wins = 0,
            losses = 0,
            draws = 0,
            ratingChange = 0;

        tournamentGames.forEach((game) => {
            if (game.player1 === playerName) {
                if (game.result1 === 'win') wins++;
                else if (game.result1 === 'loss') losses++;
                else if (game.result1 === 'draw') draws++;
                ratingChange += game.ratingChange1 || 0;
            } else if (game.player2 === playerName) {
                if (game.result2 === 'win') wins++;
                else if (game.result2 === 'loss') losses++;
                else if (game.result2 === 'draw') draws++;
                ratingChange += game.ratingChange2 || 0;
            }
        });

        const totalGames = wins + losses + draws;
        const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

        tournamentRow.innerHTML = `
            <div class="tournament-header">
                <span>Турнир ${date}</span>
                <span>${totalGames} игр</span>
            </div>
            <div class="tournament-games">
                <div class="game-result">
                    <div class="result-item">
                        <div class="result-value win-result">${wins}</div>
                        <div class="result-label">Побед</div>
                    </div>
                    <div class="result-item">
                        <div class="result-value loss-result">${losses}</div>
                        <div class="result-label">Поражений</div>
                    </div>
                    <div class="result-item">
                        <div class="result-value draw-result">${draws}</div>
                        <div class="result-label">Ничьих</div>
                    </div>
                    <div class="result-item">
                        <div class="result-value ${
                            ratingChange >= 0 ? 'win-result' : 'loss-result'
                        }">${ratingChange > 0 ? '+' : ''}${ratingChange}</div>
                        <div class="result-label">Изменение рейтинга</div>
                    </div>
                    <div class="result-item">
                        <div class="result-value">${winRate}%</div>
                        <div class="result-label">Процент побед</div>
                    </div>
                </div>
            </div>
        `;
        tournamentStatsContainer.appendChild(tournamentRow);
    });
}

function displayOpponentStats(playerName, games) {
    const opponentStatsContainer = document.getElementById('opponentStats');
    opponentStatsContainer.innerHTML = '';

    const opponentStats = {};

    games.forEach((game) => {
        let opponent, result;
        if (game.player1 === playerName) {
            opponent = game.player2;
            result = game.result1;
        } else if (game.player2 === playerName) {
            opponent = game.player1;
            result = game.result2;
        } else return;

        if (opponent === 'BYE') return;

        if (!opponentStats[opponent])
            opponentStats[opponent] = { wins: 0, losses: 0, draws: 0 };

        if (result === 'win') opponentStats[opponent].wins++;
        else if (result === 'loss') opponentStats[opponent].losses++;
        else if (result === 'draw') opponentStats[opponent].draws++;
    });

    if (Object.keys(opponentStats).length === 0) {
        opponentStatsContainer.innerHTML =
            '<div class="no-opponents">Нет данных о играх с другими игроками</div>';
        return;
    }

    Object.entries(opponentStats).forEach(([opponent, stats]) => {
        const totalGames = stats.wins + stats.losses + stats.draws;
        const row = document.createElement('div');
        row.className = 'opponent-row';
        row.innerHTML = `
            <div class="opponent-name">${escapeHtml(opponent)}</div>
            <div class="opponent-record">
                <div class="record-item">
                    <div class="record-value win-record">${stats.wins}</div>
                    <div class="record-label">Побед</div>
                </div>
                <div class="record-item">
                    <div class="record-value loss-record">${stats.losses}</div>
                    <div class="record-label">Поражений</div>
                </div>
                <div class="record-item">
                    <div class="record-value draw-record">${stats.draws}</div>
                    <div class="record-label">Ничьих</div>
                </div>
                <div class="record-item">
                    <div class="record-value">${totalGames}</div>
                    <div class="record-label">Всего</div>
                </div>
            </div>
        `;
        opponentStatsContainer.appendChild(row);
    });
}

// ==================== МОДАЛЬНЫЕ ОКНА ТУРНИРОВ ====================
function openTournamentModal(date) {
    const games = GlickoStorage.getGames();
    const tournamentGames = games.filter((game) => game.date === date);
    currentTournamentDate = date;

    document.getElementById('tournamentModalTitle').textContent = `Турнир ${date}`;
    document.getElementById('editTournamentDate').value = date;

    const gamesList = document.getElementById('tournamentGamesList');
    gamesList.innerHTML = '';

    if (tournamentGames.length === 0) {
        gamesList.innerHTML = '<div class="no-tournaments">Нет игр в этом турнире</div>';
    } else {
        tournamentGames.forEach((game, index) => {
            const gameItem = document.createElement('div');
            gameItem.className = 'tournament-game-item';
            const globalIndex = games.findIndex((g) => g === game);

            if (game.type === 'BYE') {
                gameItem.innerHTML = `
                    <div class="tournament-game-players">
                        <span><strong>${escapeHtml(game.player1)}</strong> vs BYE</span>
                    </div>
                    <div class="tournament-game-result">
                        <span class="positive">Победа ${escapeHtml(game.player1)}</span>
                    </div>
                    <div class="tournament-game-actions">
                        <button class="game-action-btn edit-btn" onclick="openEditGameModal(${globalIndex})">✏️</button>
                        <button class="game-action-btn delete-btn" onclick="deleteGameFromTournament(${globalIndex})">🗑️</button>
                    </div>
                `;
            } else {
                const result1Class =
                    game.result1 === 'win'
                        ? 'positive'
                        : game.result1 === 'loss'
                        ? 'negative'
                        : '';
                const result2Class =
                    game.result2 === 'win'
                        ? 'positive'
                        : game.result2 === 'loss'
                        ? 'negative'
                        : '';

                gameItem.innerHTML = `
                    <div class="tournament-game-players">
                        <span><strong>${escapeHtml(
                            game.player1
                        )}</strong> vs <strong>${escapeHtml(game.player2)}</strong></span>
                    </div>
                    <div class="tournament-game-result">
                        <span class="${result1Class}">${getResultText(
                    game.result1
                )}</span>
                        <span> - </span>
                        <span class="${result2Class}">${getResultText(
                    game.result2
                )}</span>
                    </div>
                    <div class="tournament-game-actions">
                        <button class="game-action-btn edit-btn" onclick="openEditGameModal(${globalIndex})">✏️</button>
                        <button class="game-action-btn delete-btn" onclick="deleteGameFromTournament(${globalIndex})">🗑️</button>
                    </div>
                `;
            }
            gamesList.appendChild(gameItem);
        });
    }

    document.getElementById('tournamentModal').style.display = 'flex';
}

function closeTournamentModal() {
    document.getElementById('tournamentModal').style.display = 'none';
    currentTournamentDate = '';
}

function updateTournamentDate() {
    const oldDate = currentTournamentDate;
    const newDate = document.getElementById('editTournamentDate').value;

    if (!newDate) {
        alert('Пожалуйста, введите дату');
        return;
    }

    if (oldDate === newDate) {
        alert('Дата не изменилась');
        return;
    }

    const games = GlickoStorage.getGames();
    let updated = false;

    games.forEach((game) => {
        if (game.date === oldDate) {
            game.date = newDate;
            updated = true;
        }
    });

    if (updated) {
        GlickoStorage.saveGames(games);
        GlickoMath.recalculateAllRatings();
        displayRating();
        displayHistory();
        displayPlayerList(showInactivePlayers);
        closeTournamentModal();
        alert(`Дата турнира изменена с ${oldDate} на ${newDate}`);
    }
}

function deleteGameFromTournament(globalIndex) {
    if (!confirm('Вы уверены, что хотите удалить эту игру?')) return;

    const games = GlickoStorage.getGames();
    if (globalIndex >= 0 && globalIndex < games.length) {
        const gameToDelete = games[globalIndex];
        games.splice(globalIndex, 1);
        GlickoStorage.saveGames(games);
        GlickoMath.recalculateAllRatings();

        if (currentTournamentDate) openTournamentModal(currentTournamentDate);

        const modalPlayerName = document.getElementById('modalPlayerName').textContent;
        if (
            document.getElementById('playerModal').style.display === 'flex' &&
            (modalPlayerName === gameToDelete.player1 ||
                modalPlayerName === gameToDelete.player2)
        ) {
            openPlayerModal(modalPlayerName);
        }

        displayRating();
        displayHistory();
        displayPlayerList(showInactivePlayers);
        alert('Игра удалена');
    }
}

function recalculateTournament() {
    if (!currentTournamentDate) return;

    if (confirm(`Пересчитать все рейтинги для турнира ${currentTournamentDate}?`)) {
        GlickoMath.recalculateAllRatings();
        closeTournamentModal();
        alert('Турнир пересчитан');
    }
}

function deleteTournament() {
    if (!currentTournamentDate) return;

    if (confirm(`Вы уверены, что хотите удалить весь турнир ${currentTournamentDate}?`)) {
        const games = GlickoStorage.getGames();
        const updatedGames = games.filter((game) => game.date !== currentTournamentDate);
        GlickoStorage.saveGames(updatedGames);
        GlickoMath.recalculateAllRatings();
        closeTournamentModal();
        displayRating();
        displayHistory();
        displayPlayerList(showInactivePlayers);
        alert(`Турнир ${currentTournamentDate} удален`);
    }
}

// ==================== РЕДАКТИРОВАНИЕ ====================
function openEditGameModal(gameIndex) {
    const games = GlickoStorage.getGames();
    const game = games[gameIndex];
    if (!game) return;

    document.getElementById('editGameIndex').value = gameIndex;
    document.getElementById('editGameDate').value = game.date;

    const player1Select = document.getElementById('editPlayer1Select');
    const player2Select = document.getElementById('editPlayer2Select');
    const player1Result = document.getElementById('editPlayer1Result');
    const player2Result = document.getElementById('editPlayer2Result');

    player1Select.value = game.player1;
    player1Result.value = game.result1;

    if (game.type === 'BYE') {
        player2Select.value = '';
        player2Result.value = 'loss';
        player2Select.disabled = true;
        player2Result.disabled = true;
    } else {
        player2Select.value = game.player2;
        player2Result.value = game.result2;
        player2Select.disabled = false;
        player2Result.disabled = false;
    }

    if (document.getElementById('tournamentModal').style.display === 'flex') {
        document.getElementById('tournamentModal').style.display = 'none';
    }

    const editModal = document.getElementById('editGameModal');
    editModal.style.display = 'flex';
    editModal.style.zIndex = '1002';
}

function closeEditGameModal() {
    const editModal = document.getElementById('editGameModal');
    editModal.style.display = 'none';
    editModal.style.zIndex = '1001';

    if (currentTournamentDate)
        setTimeout(() => openTournamentModal(currentTournamentDate), 100);
}

function openEditPlayerModal(playerName, event) {
    if (event) event.stopPropagation();

    const players = GlickoStorage.getPlayers();
    const player = players[playerName];
    if (!player) return;

    const roundedRating = Math.round(player.rating);

    document.getElementById('editPlayerOriginalName').value = playerName;
    document.getElementById('editPlayerName').value = playerName;
    document.getElementById('editPlayerRating').value = roundedRating;
    document.getElementById('editPlayerRD').value = player.rd;

    document.getElementById('editPlayerModal').style.display = 'flex';
}

function closeEditPlayerModal() {
    document.getElementById('editPlayerModal').style.display = 'none';
}

function resetPlayerSeason(playerName = null) {
    if (!playerName) playerName = document.getElementById('modalPlayerName').textContent;

    const seasonStats = GlickoStorage.getSeasonStats();
    if (seasonStats[playerName]) {
        seasonStats[playerName] = { games: 0, tournaments: [] };
        GlickoStorage.saveSeasonStats(seasonStats);
    }

    displayPlayerList(showInactivePlayers);
    displayRating();

    if (document.getElementById('playerModal').style.display === 'flex') {
        openPlayerModal(playerName);
    }

    alert(`Сезонная статистика игрока "${playerName}" сброшена`);
}

function resetSeason() {
    const datePickerModal = document.getElementById('seasonDatePickerModal');
    const dateInput = document.getElementById('seasonResetDate');
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    datePickerModal.style.display = 'flex';
}

function confirmSeasonReset() {
    const resetDate = document.getElementById('seasonResetDate').value;

    if (!resetDate) {
        alert('Пожалуйста, выберите дату начала сезона');
        return;
    }

    if (
        confirm(
            `Сбросить сезон и учитывать игры с ${new Date(resetDate).toLocaleDateString(
                'ru-RU'
            )}?`
        )
    ) {
        const settings = GlickoStorage.getSeasonSettings();
        settings.seasonStartDate = resetDate;
        GlickoStorage.saveSeasonSettings(settings);
        GlickoMath.recalculateSeasonStats();
        displayPlayerList(showInactivePlayers);
        displayRating();
        displayHistory();
        document.getElementById('seasonDatePickerModal').style.display = 'none';
        alert(
            `Сезон сброшен. Учитываются игры с ${new Date(resetDate).toLocaleDateString(
                'ru-RU'
            )}`
        );
    }
}

function cancelSeasonReset() {
    document.getElementById('seasonDatePickerModal').style.display = 'none';
}

function switchTab(tabId, event) {
    document
        .querySelectorAll('.tab-content')
        .forEach((tab) => tab.classList.remove('active'));
    document
        .querySelectorAll('.tab-button')
        .forEach((btn) => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

// Экспорт глобальных функций
window.GlickoUI = {
    displayPlayerList,
    displayRating,
    displayHistory,
    populatePlayerSelects,
    addGameToForm,
    clearAllGames,
    addGames,
    addPlayer,
    deleteGame,
    deletePlayer,
    deletePlayerPrompt,
    openPlayerModal,
    closePlayerModal,
    openEditGameModal,
    closeEditGameModal,
    openEditPlayerModal,
    closeEditPlayerModal,
    resetPlayerSeason,
    resetSeason,
    confirmSeasonReset,
    cancelSeasonReset,
    switchTab,
    togglePlayerStatusPrompt,
    removeGame,
    updateTournamentDate,
    recalculateTournament,
    deleteTournament,
    closeTournamentModal,
    setupSorting,
};

window.openPlayerModal = openPlayerModal;
window.closePlayerModal = closePlayerModal;
window.openEditGameModal = openEditGameModal;
window.closeEditGameModal = closeEditGameModal;
window.openEditPlayerModal = openEditPlayerModal;
window.closeEditPlayerModal = closeEditPlayerModal;
window.deletePlayerPrompt = deletePlayerPrompt;
window.deleteGame = deleteGame;
window.resetPlayerSeason = resetPlayerSeason;
window.resetSeason = resetSeason;
window.confirmSeasonReset = confirmSeasonReset;
window.cancelSeasonReset = cancelSeasonReset;
window.updateTournamentDate = updateTournamentDate;
window.recalculateTournament = recalculateTournament;
window.deleteTournament = deleteTournament;
window.closeTournamentModal = closeTournamentModal;
window.switchTab = switchTab;
window.togglePlayerStatusPrompt = togglePlayerStatusPrompt;
window.removeGame = removeGame;
