const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function runScript(context, fileName) {
    const filePath = path.join(repoRoot, fileName);
    vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, {
        filename: filePath,
    });
}

function createGlickoContext(initialState = {}) {
    const state = {
        players: initialState.players || {},
        games: initialState.games || [],
        seasonStats: {},
        seasonSettings: { seasonStartDate: null },
    };
    const context = vm.createContext({
        console,
        alert: () => {},
        GlickoStorage: {
            getPlayers: () => state.players,
            getGames: () => state.games,
            getSeasonStats: () => state.seasonStats,
            getSeasonSettings: () => state.seasonSettings,
            savePlayers: (players) => {
                state.players = players;
            },
            saveGames: (games) => {
                state.games = games;
            },
            saveSeasonStats: (stats) => {
                state.seasonStats = stats;
            },
            saveSeasonSettings: (settings) => {
                state.seasonSettings = settings;
            },
        },
    });
    context.window = context;
    runScript(context, 'glicko-math.js');
    return { context, state };
}

test('ожидание результата учитывает RD соперника, а не RD текущего игрока', () => {
    const { context } = createGlickoContext();
    const currentTime = Date.parse('2026-01-01');

    const result = context.GlickoMath.updateRatingExact(
        { rating: 1600, rd: 30, games: 0, lastUpdate: currentTime },
        { rating: 1500, rd: 200, games: 0, lastUpdate: currentTime },
        1,
        currentTime
    );

    const expectedWithOpponentRD = context.GlickoMath.expectedScore(1600, 1500, 200);
    assert.equal(result.expectedScore, expectedWithOpponentRD);
});

test('добавление партии даёт те же изменения рейтинга, что и полный пересчёт', () => {
    const { context, state } = createGlickoContext({
        players: {
            A: { rating: 1500, rd: 200, games: 0, volatility: '0.0', lastUpdate: 0 },
            B: { rating: 1500, rd: 200, games: 0, volatility: '0.0', lastUpdate: 0 },
        },
    });

    const added = context.GlickoMath.addSwissTournamentToGlicko(
        [{ player1: 'A', player2: 'B', result1: 'win', result2: 'loss' }],
        '2026-01-01'
    );
    assert.equal(added, true);

    const addedChanges = {
        player1: state.games[0].ratingChange1,
        player2: state.games[0].ratingChange2,
    };

    context.GlickoMath.recalculateAllRatings();

    assert.deepEqual(addedChanges, {
        player1: state.games[0].ratingChange1,
        player2: state.games[0].ratingChange2,
    });
});

test('незавершённый матч швейцарки не отправляется в рейтинг как ничья', () => {
    const calls = [];
    const alerts = [];
    const localStorageData = new Map([
        [
            'glickoPlayers',
            JSON.stringify({
                A: { rating: 1500, rd: 200 },
                B: { rating: 1500, rd: 200 },
            }),
        ],
    ]);
    const context = vm.createContext({
        console,
        alert: (message) => alerts.push(message),
        localStorage: {
            getItem: (key) => localStorageData.get(key) || null,
            setItem: (key, value) => localStorageData.set(key, String(value)),
        },
    });
    context.window = context;
    context.GlickoMath = {
        addSwissTournamentToGlicko: (gamesData) => {
            calls.push(gamesData);
            return true;
        },
    };
    runScript(context, 'swiss-core.js');

    const result = context.SwissCore.submitTournamentToGlickoSystem(
        {
            players: [
                { id: 1, name: 'A' },
                { id: 2, name: 'B' },
            ],
            rounds: [
                {
                    matches: [{ p1Id: 1, p2Id: 2, completed: false, result: null }],
                },
            ],
        },
        '2026-01-01'
    );

    assert.equal(result, false);
    assert.equal(calls.length, 0);
    assert.equal(alerts.length, 1);
});
