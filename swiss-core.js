// ==================== ШВЕЙЦАРСКАЯ СИСТЕМА - ЯДРО ====================

const POINTS_WIN = 3,
    POINTS_DRAW = 1,
    POINTS_LOSS = 0;
const BYE_PLAYER_NAME = 'Баев Бай';

class Tournament {
    constructor(id, name, maxRounds = 3) {
        this.id = id;
        this.name = name;
        this.maxRounds = maxRounds;
        this.players = [];
        this.rounds = [];
        this.currentRound = 0;
        this.nextPlayerId = 1;
        this.submittedToGlicko = false;
        this.submissionDate = null;
        this.createdAt = new Date().toISOString();
    }
}

let allTournaments = [];
let currentTournamentId = null;

// Хранилище
function saveSwissToLocal() {
    localStorage.setItem('swiss_tournaments_v9', JSON.stringify(allTournaments));
    localStorage.setItem('swiss_current_id_v9', currentTournamentId);
}

function loadSwissFromLocal() {
    const stored = localStorage.getItem('swiss_tournaments_v9');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            allTournaments = parsed.map((t) => {
                const tourney = new Tournament(t.id, t.name, t.maxRounds || 3);
                tourney.players = t.players || [];
                tourney.rounds = t.rounds || [];
                tourney.currentRound = t.currentRound || 0;
                tourney.nextPlayerId = t.nextPlayerId || 1;
                tourney.submittedToGlicko = t.submittedToGlicko || false;
                tourney.submissionDate = t.submissionDate || null;
                tourney.createdAt = t.createdAt || new Date().toISOString();
                return tourney;
            });
        } catch (e) {
            console.error('Error loading tournaments:', e);
        }
    }
    const savedId = localStorage.getItem('swiss_current_id_v9');
    if (savedId && allTournaments.some((t) => t.id == savedId))
        currentTournamentId = parseInt(savedId);
    if (!allTournaments.length) createNewTournament();
    if (!currentTournamentId && allTournaments.length)
        currentTournamentId = allTournaments[0].id;
}

// Геттеры и сеттеры для доступа из UI
function getAllTournaments() {
    return allTournaments;
}

function setAllTournaments(data) {
    allTournaments = data;
}

function getCurrentTournament() {
    return allTournaments.find((t) => t.id == currentTournamentId);
}

function getCurrentTournamentId() {
    return currentTournamentId;
}

function setCurrentTournamentId(id) {
    currentTournamentId = id;
}

function createNewTournament() {
    const maxRoundsInput = document.getElementById('maxRoundsInput');
    const newId = Date.now();
    const defaultName = `Турнир ${new Date().toLocaleDateString()} ${new Date()
        .toLocaleTimeString()
        .slice(0, 5)}`;
    const newTourney = new Tournament(
        newId,
        defaultName,
        parseInt(maxRoundsInput?.value) || 3
    );
    allTournaments.push(newTourney);
    currentTournamentId = newId;

    if (typeof window.activeTournamentIds !== 'undefined' && window.activeTournamentIds) {
        window.activeTournamentIds.add(newId);
        if (window.archivedTournamentIds) window.archivedTournamentIds.delete(newId);
        if (typeof window.saveTournamentStatuses === 'function')
            window.saveTournamentStatuses();
    }

    saveSwissToLocal();
}

// Логика пар
function getPlayedOpponents(t, playerId) {
    const opponents = new Set();
    t.rounds.forEach((round) => {
        round.matches.forEach((match) => {
            if (match.completed) {
                if (match.p1Id === playerId) opponents.add(match.p2Id);
                if (match.p2Id === playerId) opponents.add(match.p1Id);
            }
        });
    });
    return opponents;
}

function canPlayTogether(t, id1, id2) {
    if (id1 === id2) return false;
    return !getPlayedOpponents(t, id1).has(id2);
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function generatePairings(t, shuffleGroups = true) {
    let players = [...t.players];
    const byePlayer = players.find((p) => p.name === BYE_PLAYER_NAME);
    let realPlayers = players.filter((p) => p.name !== BYE_PLAYER_NAME);
    if (realPlayers.length < 2) return [];

    if (byePlayer && realPlayers.length % 2 !== 0) {
        const playedWithBye = getPlayedOpponents(t, byePlayer.id);
        let availableForBye = realPlayers.filter((p) => !playedWithBye.has(p.id));
        if (availableForBye.length === 0) availableForBye = realPlayers;
        const randomIndex = Math.floor(Math.random() * availableForBye.length);
        const targetPlayer = availableForBye[randomIndex];
        if (targetPlayer) {
            const pairings = [{ p1Id: targetPlayer.id, p2Id: byePlayer.id }];
            const remaining = realPlayers.filter((p) => p.id !== targetPlayer.id);
            const remainingPairs = generatePairsWithoutBye(t, remaining, shuffleGroups);
            return [...pairings, ...remainingPairs];
        }
    }
    return generatePairsWithoutBye(t, realPlayers, shuffleGroups);
}

function generatePairsWithoutBye(t, players, shuffleGroups = true) {
    if (players.length % 2 !== 0) return [];
    if (players.length === 0) return [];
    if (players.length === 2) {
        return canPlayTogether(t, players[0].id, players[1].id)
            ? [{ p1Id: players[0].id, p2Id: players[1].id }]
            : [];
    }

    let groups = new Map();
    players.forEach((p) => {
        const pts = p.points;
        if (!groups.has(pts)) groups.set(pts, []);
        groups.get(pts).push(p);
    });
    let sortedGroups = Array.from(groups.keys()).sort((a, b) => b - a);
    let allPlayers = [];
    sortedGroups.forEach((pts) => {
        let group = groups.get(pts);
        if (shuffleGroups) shuffleArray(group);
        allPlayers.push(...group);
    });
    if (shuffleGroups) shuffleArray(allPlayers);

    let bestPairs = null,
        bestScore = -1;
    for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt > 0) shuffleArray(allPlayers);
        const pairs = findValidPairings(t, allPlayers);
        if (pairs) {
            let score = pairs.reduce((sum, pair) => {
                const p1 = allPlayers.find((p) => p.id === pair.p1Id),
                    p2 = allPlayers.find((p) => p.id === pair.p2Id);
                return sum + Math.abs((p1?.points || 0) - (p2?.points || 0));
            }, 0);
            if (bestPairs === null || score < bestScore) {
                bestPairs = pairs;
                bestScore = score;
            }
        }
    }
    return bestPairs || [];
}

function findValidPairings(t, players) {
    if (players.length % 2 !== 0) return null;
    if (players.length === 0) return [];
    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            if (canPlayTogether(t, players[i].id, players[j].id)) {
                const remaining = players.filter((_, idx) => idx !== i && idx !== j);
                const subResult = findValidPairings(t, remaining);
                if (subResult !== null)
                    return [{ p1Id: players[i].id, p2Id: players[j].id }, ...subResult];
            }
        }
    }
    return null;
}

// Расчет статистики
function recalcAllStats(t) {
    if (!t) return;

    // Инициализация всех игроков
    t.players.forEach((p) => {
        p.points = p.points || 0;
        p.buchholz = p.buchholz || 0;
        p.opponents = p.opponents || [];
        p.wins = p.wins || 0;
        p.draws = p.draws || 0;
        p.matchesCount = p.matchesCount || 0;
        p.medvedev = p.medvedev || 0;
    });

    // Сброс перед пересчетом
    t.players.forEach((p) => {
        p.points = 0;
        p.buchholz = 0;
        p.opponents = [];
        p.wins = 0;
        p.draws = 0;
        p.matchesCount = 0;
        p.medvedev = 0;
    });

    // Подсчет очков
    t.rounds.forEach((round) => {
        round.matches.forEach((match) => {
            if (!match.completed) return;

            const p1 = t.players.find((p) => p.id === match.p1Id);
            const p2 = t.players.find((p) => p.id === match.p2Id);
            if (!p1 || !p2) return;

            // Запись соперников
            if (!p1.opponents.includes(p2.id)) p1.opponents.push(p2.id);
            if (!p2.opponents.includes(p1.id)) p2.opponents.push(p1.id);

            p1.matchesCount++;
            p2.matchesCount++;

            // Начисление очков
            if (p1.name === BYE_PLAYER_NAME) {
                p2.points += POINTS_WIN;
                p2.wins++;
            } else if (p2.name === BYE_PLAYER_NAME) {
                p1.points += POINTS_WIN;
                p1.wins++;
            } else if (match.result === 'win') {
                p1.points += POINTS_WIN;
                p2.points += POINTS_LOSS;
                p1.wins++;
            } else if (match.result === 'loss') {
                p1.points += POINTS_LOSS;
                p2.points += POINTS_WIN;
                p2.wins++;
            } else if (match.result === 'draw') {
                p1.points += POINTS_DRAW;
                p2.points += POINTS_DRAW;
                p1.draws++;
                p2.draws++;
            }
        });
    });

    // Подсчет Бухгольца
    t.players.forEach((p) => {
        p.buchholz = p.opponents.reduce((sum, oid) => {
            const opponent = t.players.find((op) => op.id === oid);
            return sum + (opponent ? opponent.points : 0);
        }, 0);
    });

    // Подсчет Медведева (усеченный Бухгольц - без худшего соперника)
    t.players.forEach((p) => {
        if (p.opponents.length > 0) {
            const oppScores = p.opponents
                .map((oid) => {
                    const opponent = t.players.find((op) => op.id === oid);
                    return opponent ? opponent.points : 0;
                })
                .sort((a, b) => a - b);

            let sum = oppScores.reduce((a, b) => a + b, 0);
            if (oppScores.length > 0) sum -= oppScores[0]; // Убираем худшего соперника
            p.medvedev = sum;
        } else {
            p.medvedev = 0;
        }
    });
}

function calculateMedvedev(t) {
    t.players.forEach((p) => {
        if (p.opponents.length) {
            const oppScores = p.opponents
                .map((oid) => t.players.find((op) => op.id === oid)?.points || 0)
                .sort((a, b) => a - b);
            let sum = oppScores.reduce((a, b) => a + b, 0);
            if (oppScores.length) sum -= oppScores[0];
            p.medvedev = sum;
        } else p.medvedev = 0;
    });
}

function sortPlayers(players) {
    return [...players].sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.medvedev !== b.medvedev) return b.medvedev - a.medvedev;
        if (a.buchholz !== b.buchholz) return b.buchholz - a.buchholz;
        if (a.wins !== b.wins) return b.wins - a.wins;
        return b.draws - a.draws;
    });
}

// Управление игроками
function addPlayerToTournament(t, name) {
    if (!t) {
        createNewTournament();
        t = getCurrentTournament();
    }
    if (t.submittedToGlicko) {
        alert('Турнир уже засчитан');
        return false;
    }
    if (!name || !name.trim()) {
        alert('Введите имя');
        return false;
    }
    if (name.trim() === BYE_PLAYER_NAME) {
        alert(`Имя "${BYE_PLAYER_NAME}" зарезервировано`);
        return false;
    }
    if (t.players.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())) {
        alert('Игрок уже есть');
        return false;
    }
    t.players.push({
        id: t.nextPlayerId++,
        name: name.trim(),
        points: 0,
        buchholz: 0,
        medvedev: 0,
        opponents: [],
        wins: 0,
        draws: 0,
        matchesCount: 0,
    });
    recalcAllStats(t);
    saveSwissToLocal();
    return true;
}

function removePlayerFromTournament(t, playerId) {
    if (!t || t.submittedToGlicko) {
        alert('Турнир уже засчитан');
        return;
    }
    t.players = t.players.filter((p) => p.id !== playerId);
    t.rounds.forEach((round) => {
        round.matches = round.matches.filter(
            (m) => m.p1Id !== playerId && m.p2Id !== playerId
        );
    });
    recalcAllStats(t);
    saveSwissToLocal();
}

function renamePlayerInTournament(t, playerId, newName) {
    if (!t || t.submittedToGlicko) return;
    const p = t.players.find((p) => p.id === playerId);
    if (
        p &&
        p.name !== BYE_PLAYER_NAME &&
        newName?.trim() &&
        newName.trim() !== BYE_PLAYER_NAME
    ) {
        p.name = newName.trim();
        saveSwissToLocal();
    }
}

// Функция добавления BYE-игрока
function addByePlayerToTournament(t) {
    console.log('addByePlayerToTournament called', t);
    if (!t) {
        console.log('No tournament, creating new');
        createNewTournament();
        t = getCurrentTournament();
    }
    if (t.submittedToGlicko) {
        alert('Турнир уже засчитан, нельзя добавить BYE-игрока');
        return false;
    }
    if (t.players.some((p) => p.name === BYE_PLAYER_NAME)) {
        alert('BYE-игрок уже есть в турнире');
        return false;
    }
    t.players.push({
        id: t.nextPlayerId++,
        name: BYE_PLAYER_NAME,
        points: 0,
        buchholz: 0,
        medvedev: 0,
        opponents: [],
        wins: 0,
        draws: 0,
        matchesCount: 0,
        isByePlayer: true,
    });
    saveSwissToLocal();
    console.log('BYE player added successfully');
    return true;
}

// Создание тура
function createNextRound(t) {
    if (!t || t.submittedToGlicko) {
        alert(t?.submittedToGlicko ? 'Турнир уже засчитан' : 'Нет турнира');
        return false;
    }
    if (t.currentRound >= t.maxRounds) {
        alert(`Турнир завершён (${t.maxRounds} туров)`);
        return false;
    }
    const realPlayers = t.players.filter((p) => p.name !== BYE_PLAYER_NAME);
    if (realPlayers.length < 2) {
        alert('Минимум 2 игрока');
        return false;
    }
    const pairings = generatePairings(t, true);
    if (!pairings || pairings.length === 0) {
        const hasBye = t.players.some((p) => p.name === BYE_PLAYER_NAME);
        if (
            !hasBye &&
            realPlayers.length >= 2 &&
            confirm('⚠️ Невозможно создать пары без повторов. Добавить "Баев Бай"?')
        ) {
            addByePlayerToTournament(t);
            return createNextRound(t);
        }
        alert('Не удалось создать пары. Проверьте повторные встречи.');
        return false;
    }
    const matches = pairings.map((pair) => ({
        p1Id: pair.p1Id,
        p2Id: pair.p2Id,
        completed: false,
        result: null,
    }));
    t.rounds.push({ roundNumber: t.currentRound + 1, matches });
    t.currentRound++;
    recalcAllStats(t);
    saveSwissToLocal();
    return true;
}

function setMatchResult(t, roundIdx, matchIdx, result) {
    if (!t || t.submittedToGlicko) {
        alert('Турнир уже засчитан');
        return;
    }
    const round = t.rounds[roundIdx];
    if (!round) return;
    const match = round.matches[matchIdx];
    if (match.completed) return;
    match.completed = true;
    match.result = result;
    recalcAllStats(t);
    saveSwissToLocal();
}

// Засчитывание в Глико
function submitTournamentToGlickoSystem(t, tournamentDate) {
    const playersJson = localStorage.getItem('glickoPlayers');
    if (!playersJson) {
        alert('❌ Система Глико не инициализирована');
        return false;
    }

    const gamesData = [];
    const byeGamesData = [];
    const missing = new Set();

    t.rounds.forEach((round) => {
        round.matches.forEach((match) => {
            const p1 = t.players.find((p) => p.id === match.p1Id);
            const p2 = t.players.find((p) => p.id === match.p2Id);

            if (p1?.name === BYE_PLAYER_NAME || p2?.name === BYE_PLAYER_NAME) {
                const winner = p1?.name === BYE_PLAYER_NAME ? p2?.name : p1?.name;
                if (winner && winner !== BYE_PLAYER_NAME) {
                    if (!JSON.parse(playersJson)[winner]) missing.add(winner);
                    byeGamesData.push({ playerName: winner });
                }
                return;
            }

            if (p1 && p2 && p1.name !== BYE_PLAYER_NAME && p2.name !== BYE_PLAYER_NAME) {
                if (!JSON.parse(playersJson)[p1.name]) missing.add(p1.name);
                if (!JSON.parse(playersJson)[p2.name]) missing.add(p2.name);
                let r1, r2;
                if (match.result === 'win') {
                    r1 = 'win';
                    r2 = 'loss';
                } else if (match.result === 'loss') {
                    r1 = 'loss';
                    r2 = 'win';
                } else {
                    r1 = 'draw';
                    r2 = 'draw';
                }
                gamesData.push({
                    player1: p1.name,
                    player2: p2.name,
                    result1: r1,
                    result2: r2,
                });
            }
        });
    });

    if (gamesData.length === 0 && byeGamesData.length === 0) {
        alert('Нет игр для засчитывания');
        return false;
    }

    if (missing.size) {
        alert(`❌ Игроки не найдены в Глико:\n${[...missing].join('\n')}`);
        return false;
    }

    let success = true;
    let addedGamesCount = 0;
    let addedByeCount = 0;

    if (
        gamesData.length > 0 &&
        typeof window.GlickoMath?.addSwissTournamentToGlicko === 'function'
    ) {
        const result = window.GlickoMath.addSwissTournamentToGlicko(
            gamesData,
            tournamentDate
        );
        if (result) addedGamesCount = gamesData.length;
        else success = false;
    } else if (gamesData.length > 0) {
        console.error('GlickoMath.addSwissTournamentToGlicko not found');
        success = false;
    }

    for (const byeGame of byeGamesData) {
        if (typeof window.GlickoMath?.addByeGameToGlicko === 'function') {
            const result = window.GlickoMath.addByeGameToGlicko(
                byeGame.playerName,
                tournamentDate
            );
            if (result) addedByeCount++;
            else success = false;
        } else {
            console.error('GlickoMath.addByeGameToGlicko not found');
            success = false;
        }
    }

    if (success) {
        t.submittedToGlicko = true;
        t.submissionDate = new Date().toISOString();
        saveSwissToLocal();
        if (typeof window.archiveTournament === 'function') {
            window.archiveTournament(t.id);
        }
        alert(
            `✅ Турнир засчитан!\nОбычных игр: ${addedGamesCount}\nBYE-игр: ${addedByeCount}`
        );
    }

    return success;
}

// Экспорт в глобальный объект
window.SwissCore = {
    BYE_PLAYER_NAME,
    POINTS_WIN,
    POINTS_DRAW,
    POINTS_LOSS,
    Tournament,
    getAllTournaments,
    setAllTournaments,
    getCurrentTournament,
    getCurrentTournamentId,
    setCurrentTournamentId,
    saveSwissToLocal,
    loadSwissFromLocal,
    createNewTournament,
    getPlayedOpponents,
    canPlayTogether,
    generatePairings,
    recalcAllStats,
    calculateMedvedev,
    sortPlayers,
    addPlayerToTournament,
    removePlayerFromTournament,
    renamePlayerInTournament,
    addByePlayerToTournament,
    createNextRound,
    setMatchResult,
    submitTournamentToGlickoSystem,
    shuffleArray,
};
