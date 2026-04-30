// ==================== ХРАНИЛИЩЕ ДАННЫХ ====================

const STORAGE_KEYS = {
    PLAYERS: 'glickoPlayers',
    GAMES: 'glickoGames',
    SEASON_STATS: 'glickoSeasonStats',
    SEASON_SETTINGS: 'glickoSeasonSettings',
};

// Базовые функции получения/сохранения данных
function getPlayers() {
    const players = localStorage.getItem(STORAGE_KEYS.PLAYERS);
    return players ? JSON.parse(players) : {};
}

function getGames() {
    const games = localStorage.getItem(STORAGE_KEYS.GAMES);
    return games ? JSON.parse(games) : [];
}

function getSeasonStats() {
    const stats = localStorage.getItem(STORAGE_KEYS.SEASON_STATS);
    return stats ? JSON.parse(stats) : {};
}

function getSeasonSettings() {
    const settings = localStorage.getItem(STORAGE_KEYS.SEASON_SETTINGS);
    return settings ? JSON.parse(settings) : { seasonStartDate: null };
}

function savePlayers(players) {
    localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
}

function saveGames(games) {
    localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
}

function saveSeasonStats(stats) {
    localStorage.setItem(STORAGE_KEYS.SEASON_STATS, JSON.stringify(stats));
}

function saveSeasonSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SEASON_SETTINGS, JSON.stringify(settings));
}

function getActivePlayers() {
    const players = getPlayers();
    const activePlayers = {};
    Object.entries(players).forEach(([name, data]) => {
        if (data.status !== 'inactive') {
            activePlayers[name] = data;
        }
    });
    return activePlayers;
}

function getPlayersAsArray() {
    const players = getActivePlayers();
    return Object.entries(players).map(([name, data]) => ({
        name: name,
        rating: data.rating,
        rd: data.rd,
        status: data.status,
    }));
}

// Экспорт для глобального доступа
window.GlickoStorage = {
    getPlayers,
    getGames,
    getSeasonStats,
    getSeasonSettings,
    savePlayers,
    saveGames,
    saveSeasonStats,
    saveSeasonSettings,
    getActivePlayers,
    getPlayersAsArray,
    STORAGE_KEYS,
};
