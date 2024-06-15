const CONFIG = {
    clients: {
        moex: {
            baseUrl: 'http://iss.moex.com'
        }
    },
    cacheFilepaths: {
        securitiesCandles: {
            day: 'dist/candles/securities-candles-day.json',
            month: 'dist/candles/securities-candles-month.json',
        },
        securitiesCandlesNormalized: 'dist/candles/securities-candles-normalized.json'
    },
    simulationResultsDir: 'results'
};

export default CONFIG;