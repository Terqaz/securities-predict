import $ from "jquery";
import axios from 'axios';

import { CANDLE_INDEX_CLOSE, Candle, SecuritiesCandles } from "./types";
import { SecurityData } from "./element/security-data";

export type SecuritiesCandlesArray = [string, Candle[]][];

async function init() {
    getNormalizedSecuritiesData(getDaySecuritiesCandles())
        .then(prepareToShow)
        .then(showProcessedData)
}

async function getDaySecuritiesCandles(): Promise<SecuritiesCandles> {
    return axios.get('candles/securities-candles-day.json')
        .then((response): SecuritiesCandles => {
            return response.data
        });
}

/** Получить нормализованные тренды по ценным бумагам  */
export async function getNormalizedSecuritiesData(candlesPromise: Promise<SecuritiesCandles>): Promise<SecuritiesCandlesArray> {
    return candlesPromise
        .then(toEntries)
        // .then(candlesBySecurity => candlesBySecurity.filter(([securityId, _]) => ['MOEX'].includes(securityId)))
        .then(candlesBySecurity => filterByMinCandlesCount(candlesBySecurity, 2 ** 8))
        .then(normalizeAllClosings);
}

/** Получить тренд по всему рынку. Нормализация в процессе необходима */
// export async function getStockData(candlesPromise: Promise<SecuritiesCandles>) {
//   return candlesPromise
//       .then(toEntries)
//       .then(keepLastPower2CandlesCount)
//       .then(normalizeAllClosings)
//       .then(candlesBySecurity => getStockTrendCandles(candlesBySecurity, 4096));
// }

/** Получить тренды по ценным бумагам за вычетом графика рынка. Нормализация в процессе необходима */
// export async function getSecuritiesDataExcludeStock(candlesPromise: Promise<SecuritiesCandles>) {
//     return candlesPromise
//         .then(toEntries)
//         .then(keepLastPower2CandlesCount)
//         .then(normalizeAllClosings)
//         .then(candlesBySecurity => filterByMinCandlesCount(candlesBySecurity, 4096))
//         .then(candlesBySecurity => {
//             const processedCandlesBySecurity = processCandles(candlesBySecurity);
//             const stockTrendCandles = getStockTrendCandles(candlesBySecurity, 4096);
//             const processedStock = processSecurityCandles(...stockTrendCandles[0]);

//             processedCandlesBySecurity.forEach(({ candles, spectrum }, i) => {
//                 // Вычитаем из графика ценной бумаги график рынка
//                 const newCandles = structuredClone(candles);
//                 newCandles.forEach((candle, i) =>
//                     newCandles[i][CANDLE_INDEX_CLOSE] -= stockTrendCandles[0][1][i][CANDLE_INDEX_CLOSE]
//                 )
//                 processedCandlesBySecurity[i].candles = newCandles;

//                 // Вычитаем из амплитуд ценной бумаги амплитуды рынка
//                 const newSpectrum = new Float64Array(spectrum);
//                 newSpectrum.map((amplitude, i) => amplitude - processedStock.spectrum[i])
//                 processedCandlesBySecurity[i].spectrum = newSpectrum;
//             });

//             return processedCandlesBySecurity;
//         });
// }

function normalizeAllClosings(candlesBySecurity: SecuritiesCandlesArray): SecuritiesCandlesArray {
    return candlesBySecurity
        .map(([securityId, candles]) => [securityId, normalizeClosings(candles)]);
}

function normalizeClosings(candles: Candle[]): Candle[] {
    const closingsMax = Math.max(...candles.map(candle => Math.abs(candle[CANDLE_INDEX_CLOSE])));

    const normalizedCandles = candles;
    // const normalizedCandles = structuredClone(candles);
    normalizedCandles.forEach((candle, i) => normalizedCandles[i][CANDLE_INDEX_CLOSE] /= closingsMax);
    
    return normalizedCandles;
}

function filterByMinCandlesCount(candlesBySecurity: SecuritiesCandlesArray, minCandlesCount: number): SecuritiesCandlesArray {
    return candlesBySecurity
        .filter(([securityId, candles]) => {
            // if (candles.length < minCandlesCount) {
            //     console.log(`График ${securityId} пропущен. Кол-во свечей ${candles.length} < ${minCandlesCount}`);
            // }

            return candles.length >= minCandlesCount;
        });
}

function toEntries(obj: object) {
    return Object.entries(obj);
}

// function getStockTrendCandles(candlesBySecurity: SecuritiesCandlesArray, minCandlesCount: number): SecuritiesCandlesArray {
//   candlesBySecurity = filterByMinCandlesCount(candlesBySecurity, minCandlesCount);
//   const reducedCandles: Candle[] = structuredClone(candlesBySecurity[0][1]);

//   candlesBySecurity.forEach(([securityId, candles]) => {
//       candles.forEach((candle, i) => reducedCandles[i][CANDLE_INDEX_CLOSE] += candle[CANDLE_INDEX_CLOSE]);
//   });

//   return [['STOCK_ALL', normalizeClosings(reducedCandles)]];
// }

function prepareToShow(candlesData: SecuritiesCandlesArray): SecuritiesCandlesArray {
    return candlesData
        // .map(({ securityId, candles, spectrum, fft }) => {
        //   const bufferSize = candles.length;
        //   const amplitudesSum = spectrum.reduce((a, b) => a + Math.abs(b));
        //   const avgAmplitude = amplitudesSum / bufferSize;

        //   const frequenciesDots: Dots = [];
        //   spectrum.forEach((x, i) => frequenciesDots.push([i, x]))

        //   return {
        //     securityId,
        //     candles,
        //     fft
        //   };
        // })
        .sort(([_, candles1], [_2, candles2]) => {
            return candles2.length - candles1.length
        });
}

/** Выводим обработанные данные */
function showProcessedData(securitiesCandles: SecuritiesCandlesArray): void {
    securitiesCandles
        .forEach(([securityId, candles]) => {
            const securityData = new SecurityData(securityId, candles);

            securityData.$body.appendTo($('#securities'));
        });
}

init();