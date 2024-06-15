// todo сделать только загрузку свечек

import { FFT } from './service/fft/dsp'
import { getDaySecuritiesCandles, getMonthSecuritiesCandles } from "./service/moex-service";
import { CANDLE_INDEX_BEGIN, CANDLE_INDEX_CLOSE, CANDLE_INDEX_END, Candle, SecuritiesCandles } from "./types";

type SecuritiesCandlesArray = [string, Candle[]][];
const CANDLES_INDEX = 1;

type Dots = [number, number][];
type ProcessedData = {
    securityId: string,
    candles: Candle[],
    spectrum: Float64Array
};

printNormalizedSecuritiesData(getDaySecuritiesCandles())

/** Получить нормализованные тренды по ценным бумагам  */
async function printNormalizedSecuritiesData(candlesPromise: Promise<SecuritiesCandles>) {
    candlesPromise
        .then(toEntries)
        .then(candlesBySecurity => candlesBySecurity.filter(([securityId, _]) => ['SBER'].includes(securityId)))
        .then(keepLastPower2CandlesCount)
        .then(normalizeAllClosings)
        .then(processCandles)
        .then(printProcessedData);
}

/** Получить тренд по всему рынку. Нормализация в процессе необходима */
async function printStockData(candlesPromise: Promise<SecuritiesCandles>) {
    candlesPromise
        .then(toEntries)
        .then(keepLastPower2CandlesCount)
        .then(normalizeAllClosings)
        .then(candlesBySecurity => getStockTrendCandles(candlesBySecurity, 4096))
        .then(processCandles)
        .then(printProcessedData);
}

/** Получить тренды по ценным бумагам за вычетом графика рынка. Нормализация в процессе необходима */
async function printSecuritiesDataExcludeStock(candlesPromise: Promise<SecuritiesCandles>) {
    candlesPromise
        .then(toEntries)
        .then(keepLastPower2CandlesCount)
        .then(normalizeAllClosings)
        .then(candlesBySecurity => filterByMinCandlesCount(candlesBySecurity, 4096))
        .then(candlesBySecurity => {
            const processedCandlesBySecurity = processCandles(candlesBySecurity);
            const stockTrendCandles = getStockTrendCandles(candlesBySecurity, 4096);
            const processedStock = processCandles(stockTrendCandles)[0];

            processedCandlesBySecurity.forEach(({candles, spectrum}, i) => {
                // Вычитаем из графика ценной бумаги график рынка
                const newCandles = structuredClone(candles);
                newCandles.forEach((candle, i) =>
                    newCandles[i][CANDLE_INDEX_CLOSE] -= stockTrendCandles[0][CANDLES_INDEX][i][CANDLE_INDEX_CLOSE]
                )
                processedCandlesBySecurity[i].candles = newCandles;

                // Вычитаем из амплитуд ценной бумаги амплитуды рынка
                const newSpectrum = new Float64Array(spectrum);
                newSpectrum.map((amplitude, i) => amplitude - processedStock.spectrum[i])
                processedCandlesBySecurity[i].spectrum = newSpectrum;
            });

            return processedCandlesBySecurity;
        })
        .then(printProcessedData);
}

function toEntries(obj: object) {
    return Object.entries(obj);
}

function getStockTrendCandles(candlesBySecurity: SecuritiesCandlesArray, minCandlesCount: number): SecuritiesCandlesArray {
    candlesBySecurity = filterByMinCandlesCount(candlesBySecurity, minCandlesCount);
    const reducedCandles: Candle[] = structuredClone(candlesBySecurity[0][CANDLES_INDEX]);

    candlesBySecurity.forEach(([securityId, candles]) => {
        candles.forEach((candle, i) => reducedCandles[i][CANDLE_INDEX_CLOSE] += candle[CANDLE_INDEX_CLOSE]);
    });

    // printDotsChart(reducedCandles.map((candle, i) => [i, candle[CANDLE_INDEX_CLOSE]]));

    return [['ALL_256', normalizeClosings(reducedCandles)]];
}

/** Считаем что-либо по свечам */
function processCandles(candlesBySecurity: SecuritiesCandlesArray): ProcessedData[] {
    return filterByMinCandlesCount(candlesBySecurity, 32)
        .map(([securityId, candles]) => {
            const bufferSize = candles.length;
            console.log(`${securityId}, последние ${bufferSize} свечей с ${candles[0][CANDLE_INDEX_END]} по ${candles[bufferSize - 1][CANDLE_INDEX_END]}`);

            let closings = candles.map(candle => candle[1]);
            const fft = new FFT(bufferSize, 2 * 12 * 10);
            fft.forward(closings);
            var spectrum: Float64Array = fft.spectrum;

            return {
                securityId,
                candles,
                spectrum,
            }
        });
}

/** Выводим обработанные данные */
function printProcessedData(candlesData: ProcessedData[]): void {
    candlesData
        .map(({ securityId, candles, spectrum }) => {
            const bufferSize = candles.length;
            const amplitudesSum = spectrum.reduce((a, b) => a + Math.abs(b));
            const amplitudesAvg = amplitudesSum / bufferSize;

            const approximationDotsChart: Dots = [[0, spectrum[0]]];
            spectrum.slice(1).forEach((amplitude, frequency) => {
                // if (amplitude > 2 * amplitudesAvg) {
                if (Math.abs(amplitude) / amplitudesSum >= 0.01) {
                    // Не добавляем слабые частоты
                    approximationDotsChart.push([frequency, amplitude]);
                }
            });

            return {
                securityId,
                candles,
                spectrum,
                approximationDotsChart
            };
        })
        .sort((a, b) => {
            if (b.candles.length !== a.candles.length) {
                return a.candles.length - b.candles.length
            }

            return b.approximationDotsChart.length - a.approximationDotsChart.length;
        })
        .forEach(({ securityId, candles, spectrum, approximationDotsChart }) => {
            console.log();
            console.log(`${securityId} ${'-'.repeat(20)}`);
            console.log();

            console.log('График');
            printDotsChart(candles.map((candle, i) => [i, candle[CANDLE_INDEX_CLOSE]]));
            console.log();

            console.log('Частоты');
            const frequenciesDotsChart = [];
            spectrum.forEach((x, i) => frequenciesDotsChart.push([i, x]))
            printDotsChart(frequenciesDotsChart);
            console.log();

            console.log('Аппроксимация графика');
            const approximationChart = [`${approximationDotsChart[0][CANDLES_INDEX]}`];
            approximationDotsChart.slice(1).forEach(([frequency, amplitude]) => {
                approximationChart.push(`${amplitude}*(cos(${2 * Math.PI / (frequency + 1)}*x)+sin(${2 * Math.PI / (frequency + 1)}*x))`);
            });
            console.log(approximationChart.join('+'));
        });
}

function keepLastPower2CandlesCount(candlesBySecurity: SecuritiesCandlesArray): SecuritiesCandlesArray {
    return candlesBySecurity.map(([securityId, candles]) => {
        const closestPower2Count = 2 ** Math.floor(Math.log2(candles.length));
        const start = candles.length - closestPower2Count;
        const end = candles.length;
        return [securityId, candles.slice(start, end)];
    });
}

function normalizeAllClosings(candlesBySecurity: SecuritiesCandlesArray): SecuritiesCandlesArray {
    return candlesBySecurity
        .map(([securityId, candles]) => [securityId, normalizeClosings(candles)]);
}

function normalizeClosings(candles: Candle[]): Candle[] {
    let closingsSum = 0;
    candles.forEach(candle => closingsSum += Math.abs(candle[CANDLE_INDEX_CLOSE]));

    const normalizedCandles = structuredClone(candles);
    normalizedCandles.forEach((candle, i) => normalizedCandles[i][CANDLE_INDEX_CLOSE] /= closingsSum);
    return normalizedCandles;
}

function filterByMinCandlesCount(candlesBySecurity: SecuritiesCandlesArray, minCandlesCount: number): SecuritiesCandlesArray {
    return candlesBySecurity
        .filter(([securityId, candles]) => {
            if (candles.length < minCandlesCount) {
                console.log(`График ${securityId} пропущен. Кол-во свечей ${candles.length} < ${minCandlesCount}`);
            }

            return candles.length >= minCandlesCount;
        });
}

function printDotsChart(dots: [number, number][]) {
    console.log('[' + dots.map(([x, y]) => `(${x},${y})`).join(',') + ']')
}