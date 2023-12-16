const CONFIG = {
    clients: {
        moex: {
            baseUrl: 'http://iss.moex.com'
        } 
    },
    cache: {
        securitiesCandles: 'securities-candles.json',
        securitiesCandlesNormalized: 'securities-candles-normalized.json'
    },
    simulationResultsDir: './results'
};

for (const pathName in CONFIG.cache) {
    CONFIG.cache[pathName] = './cache/' + CONFIG.cache[pathName];
}

export default CONFIG;