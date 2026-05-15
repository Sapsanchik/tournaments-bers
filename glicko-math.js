// ==================== МАТЕМАТИКА СИСТЕМЫ ГЛИКО ====================

const INITIAL_RATING = 1500;
const INITIAL_RD = 200;
const MIN_RD = 30;
const Q = Math.log(10) / 400;
const C = 15;
const BYE_RATING_BONUS = 5;

function g(RD) {
    return 1 / Math.sqrt(1 + (3 * Q * Q * RD * RD) / (Math.PI * Math.PI));
}

function expectedScore(rating, opponentRating, opponentRD) {
    return 1 / (1 + Math.pow(10, (-g(opponentRD) * (rating - opponentRating)) / 400));
}

function calculateCurrentRD(player, currentTime) {
    const daysSinceLastUpdate = Math.max(
        (currentTime - player.lastUpdate) / (1000 * 60 * 60 * 24),
        0
    );
    return Math.min(
        Math.sqrt(player.rd * player.rd + C * C * daysSinceLastUpdate),
        INITIAL_RD
    );
}

function calculateKFactor(player, opponent, result, expected) {
    let kFactor = 32;
    const surprise = Math.abs(result - expected);
    if (surprise > 0.7) {
        kFactor *= 1.5;
    } else if (surprise > 0.4) {
        kFactor *= 1.2;
    }
    if (player.rd < 100) {
        kFactor *= 0.7;
    } else if (player.rd < 150) {
        kFactor *= 0.8;
    }
    if (player.games > 30) {
        kFactor *= 0.6;
    } else if (player.games > 10) {
        kFactor *= 0.8;
    }
    return Math.min(kFactor, 50);
}

function updateRatingExact(player, opponent, result, currentTime) {
    const newRD = calculateCurrentRD(player, currentTime);
    const opponentRD = calculateCurrentRD(opponent, currentTime);
    const E = expectedScore(player.rating, opponent.rating, opponentRD);
    const kFactor = calculateKFactor(player, opponent, result, E);
    const dSquared = 1 / (Q * Q * g(opponentRD) * g(opponentRD) * E * (1 - E));
    const ratingChange = kFactor * (result - E);
    const limitedRatingChange = Math.max(Math.min(ratingChange, 100), -100);
    const newRating = player.rating + limitedRatingChange;
    const newRDAfterGame = Math.max(
        Math.sqrt(1 / (1 / (newRD * newRD) + 1 / dSquared)),
        MIN_RD
    );
    const volatility = (((player.rd - newRDAfterGame) / player.rd) * 100).toFixed(1);
    return {
        rating: newRating,
        rd: Math.round(newRDAfterGame),
        ratingChange: Math.round(limitedRatingChange),
        volatility: volatility,
        expectedScore: E,
        kFactor: kFactor,
        lastUpdate: currentTime,
        _exactRating: newRating,
    };
}

function updateRatingForByeExact(player, currentTime) {
    const daysSinceLastUpdate = Math.max(
        (currentTime - player.lastUpdate) / (1000 * 60 * 60 * 24),
        0
    );
    const rdBeforeGame = Math.min(
        Math.sqrt(player.rd * player.rd + C * C * daysSinceLastUpdate),
        INITIAL_RD
    );
    const ratingChange = BYE_RATING_BONUS;
    const newRating = player.rating + ratingChange;
    const newRDAfterGame = Math.max(rdBeforeGame * 0.95, MIN_RD);
    const volatility = (((player.rd - newRDAfterGame) / player.rd) * 100).toFixed(1);
    return {
        rating: newRating,
        rd: Math.round(newRDAfterGame),
        ratingChange: ratingChange,
        volatility: volatility,
        expectedScore: 1,
        kFactor: 10,
        lastUpdate: currentTime,
        _exactRating: newRating,
    };
}

function recalculateAllRatings() {
    const players = GlickoStorage.getPlayers();
    const games = GlickoStorage.getGames();

    Object.keys(players).forEach((playerName) => {
        players[playerName] = {
            rating: INITIAL_RATING,
            rd: INITIAL_RD,
            games: 0,
            volatility: '0.0',
            lastUpdate: 0,
            _exactRating: INITIAL_RATING,
            status: players[playerName].status || 'active',
        };
    });

    const sortedGames = [...games].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedGames.forEach((game) => {
        const currentTime = new Date(game.date).getTime();

        if (game.type === 'BYE') {
            const player = players[game.player1];
            if (player) {
                const updatedPlayer = updateRatingForByeExact(player, currentTime);
                players[game.player1] = {
                    ...player,
                    ...updatedPlayer,
                    games: player.games + 1,
                    lastUpdate: currentTime,
                };
                game.ratingChange1 = updatedPlayer.ratingChange;
                game.ratingChange2 = 0;
            }
        } else if (game.player2 && game.player2 !== 'BYE') {
            const player1 = players[game.player1];
            const player2 = players[game.player2];
            if (player1 && player2) {
                const resultMap = { win: 1, loss: 0, draw: 0.5 };
                const numResult1 = resultMap[game.result1];
                const numResult2 = resultMap[game.result2];

                const updatedPlayer1 = updateRatingExact(
                    player1,
                    player2,
                    numResult1,
                    currentTime
                );
                players[game.player1] = {
                    ...player1,
                    ...updatedPlayer1,
                    games: player1.games + 1,
                    lastUpdate: currentTime,
                };

                const updatedPlayer2 = updateRatingExact(
                    player2,
                    player1,
                    numResult2,
                    currentTime
                );
                players[game.player2] = {
                    ...player2,
                    ...updatedPlayer2,
                    games: player2.games + 1,
                    lastUpdate: currentTime,
                };

                game.ratingChange1 = updatedPlayer1.ratingChange;
                game.ratingChange2 = updatedPlayer2.ratingChange;
                game.expected1 = (updatedPlayer1.expectedScore * 100).toFixed(1);
                game.expected2 = (updatedPlayer2.expectedScore * 100).toFixed(1);
            }
        }
    });

    Object.keys(players).forEach((playerName) => {
        if (players[playerName]._exactRating !== undefined) {
            players[playerName].rating = Math.round(players[playerName]._exactRating);
            delete players[playerName]._exactRating;
        }
    });

    GlickoStorage.savePlayers(players);
    GlickoStorage.saveGames(games);
    recalculateSeasonStats();
    return players;
}

function recalculateSeasonStats() {
    const settings = GlickoStorage.getSeasonSettings();
    const games = GlickoStorage.getGames();
    const seasonStartDate = settings.seasonStartDate;

    const seasonStats = {};

    const filterGames = seasonStartDate
        ? games.filter(
              (game) =>
                  new Date(game.date).getTime() >= new Date(seasonStartDate).getTime()
          )
        : games;

    filterGames.forEach((game) => {
        if (game.type === 'BYE') {
            if (!seasonStats[game.player1]) {
                seasonStats[game.player1] = { games: 0, tournaments: [] };
            }
            seasonStats[game.player1].games++;
            if (!seasonStats[game.player1].tournaments.includes(game.date)) {
                seasonStats[game.player1].tournaments.push(game.date);
            }
        } else if (game.player2 && game.player2 !== 'BYE') {
            if (!seasonStats[game.player1]) {
                seasonStats[game.player1] = { games: 0, tournaments: [] };
            }
            seasonStats[game.player1].games++;
            if (!seasonStats[game.player1].tournaments.includes(game.date)) {
                seasonStats[game.player1].tournaments.push(game.date);
            }

            if (!seasonStats[game.player2]) {
                seasonStats[game.player2] = { games: 0, tournaments: [] };
            }
            seasonStats[game.player2].games++;
            if (!seasonStats[game.player2].tournaments.includes(game.date)) {
                seasonStats[game.player2].tournaments.push(game.date);
            }
        }
    });

    const players = GlickoStorage.getPlayers();
    Object.keys(players).forEach((playerName) => {
        if (!seasonStats[playerName]) {
            seasonStats[playerName] = { games: 0, tournaments: [] };
        }
    });

    GlickoStorage.saveSeasonStats(seasonStats);
}

function addSwissTournamentToGlicko(gamesData, tournamentDate) {
    const players = GlickoStorage.getPlayers();
    const existingGames = GlickoStorage.getGames();
    const currentTime = new Date(tournamentDate).getTime();
    const tempPlayers = JSON.parse(JSON.stringify(players));
    const newGames = [];

    for (const gameData of gamesData) {
        if (!tempPlayers[gameData.player1]) {
            alert(`Игрок не найден в системе Глико: ${gameData.player1}`);
            return false;
        }
        if (!tempPlayers[gameData.player2]) {
            alert(`Игрок не найден в системе Глико: ${gameData.player2}`);
            return false;
        }
    }

    for (const gameData of gamesData) {
        const { player1, player2, result1, result2 } = gameData;

        if (player1 === player2) {
            return false;
        }

        const resultMap = { win: 1, loss: 0, draw: 0.5 };
        const numResult1 = resultMap[result1];
        const numResult2 = resultMap[result2];
        const ratingDiff = Math.abs(
            tempPlayers[player1].rating - tempPlayers[player2].rating
        );
        const player1BeforeGame = { ...tempPlayers[player1] };
        const player2BeforeGame = { ...tempPlayers[player2] };

        const updatedPlayer1 = updateRatingExact(
            player1BeforeGame,
            player2BeforeGame,
            numResult1,
            currentTime
        );
        tempPlayers[player1] = {
            ...tempPlayers[player1],
            ...updatedPlayer1,
            games: tempPlayers[player1].games + 1,
            lastUpdate: currentTime,
        };

        const updatedPlayer2 = updateRatingExact(
            player2BeforeGame,
            player1BeforeGame,
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
            date: tournamentDate,
            type: 'Швейцарский турнир',
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

    GlickoStorage.savePlayers(tempPlayers);
    GlickoStorage.saveGames([...newGames, ...existingGames]);
    recalculateSeasonStats();
    return true;
}

function addByeGameToGlicko(playerName, gameDate) {
    const players = GlickoStorage.getPlayers();
    const existingGames = GlickoStorage.getGames();
    const currentTime = new Date(gameDate).getTime();

    if (!players[playerName]) {
        alert(`Игрок не найден: ${playerName}`);
        return false;
    }

    const tempPlayers = JSON.parse(JSON.stringify(players));

    const updatedPlayer = updateRatingForByeExact(tempPlayers[playerName], currentTime);
    tempPlayers[playerName] = {
        ...tempPlayers[playerName],
        ...updatedPlayer,
        games: tempPlayers[playerName].games + 1,
        lastUpdate: currentTime,
    };

    const newGame = {
        date: gameDate,
        type: 'BYE',
        player1: playerName,
        result1: 'win',
        player2: 'BYE',
        result2: 'loss',
        ratingChange1: updatedPlayer.ratingChange,
        ratingChange2: 0,
        ratingDiff: 0,
        expected1: '100.0',
        expected2: '0.0',
    };

    GlickoStorage.savePlayers(tempPlayers);
    GlickoStorage.saveGames([newGame, ...existingGames]);
    recalculateSeasonStats();
    return true;
}

window.GlickoMath = {
    INITIAL_RATING,
    INITIAL_RD,
    MIN_RD,
    BYE_RATING_BONUS,
    g,
    expectedScore,
    calculateKFactor,
    calculateCurrentRD,
    updateRatingExact,
    updateRatingForByeExact,
    recalculateAllRatings,
    recalculateSeasonStats,
    addSwissTournamentToGlicko,
    addByeGameToGlicko,
};
