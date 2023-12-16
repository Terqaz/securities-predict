#!/usr/bin/env node


import * as fs from 'fs';
import { compare, floor, matrix } from 'mathjs';
import CONFIG from './app-config';
import { SecuritiesCandles, NormalizationResult, NormalizedSecuritiesCandles, CANDLE_INDEX_BEGIN, CANDLE_INDEX_END, CANDLE_INDEX_CLOSE } from './types';
import { MOEX_CLIENT } from './clients/moex-client';
import { ExchangeSimulator } from './exchange/exchange-simulator';
import { Brain } from './bot/brain';
import { ExchangeBot } from './bot/bot';

getNormalizedCandles()
    .then((normalizationResult: NormalizationResult) => {
        const startSynapsesFilepath = process.argv[2] || null;
        
        const GENERATIONS_COUNT = 100;
        const DATA_SIGNALS_COUNT = 20;
        const LAYERS_NEURONS_COUNTS = [30, 50, 30];
        const BOTS_COUNT = 5;
        const MAX_SESSIONS_WITHOUT_ACTION = 12;
        const PROPER_START_TIME = 1025481600;
        let mutationRate = 0.01;

        const exchangeSimulator = new ExchangeSimulator(
            normalizationResult.candles,
            normalizationResult.normalizationContext,
            3600 * 24,
            true
        );

        let brain: Brain;
        if (!startSynapsesFilepath) {
            brain = Brain.createRandom(DATA_SIGNALS_COUNT, LAYERS_NEURONS_COUNTS);
        } else {
            brain = Brain.fromFileData(readJsonFile(startSynapsesFilepath).brain);
        }
        let startTime: number;
        let endTime: number;
        for (let generation = 0; generation < GENERATIONS_COUNT; generation++) {
            console.log();
            console.log(`Generation: ${generation}`);
            console.log(`Mutation rate: ${mutationRate}`);

            startTime = (floor(Math.random() * 3600 * 24 * 365 * 20) + 1025481600);
            endTime = startTime + 3600 * 24 * (floor(Math.random() * 150) + 50);
            const startMoneyAmount = (floor(Math.random() * 45000) + 5000);

            let bots: ExchangeBot[] = [];
            for (let i = 0; i < BOTS_COUNT; i++) {
                bots.push(new ExchangeBot(brain.mutate(mutationRate)))
            }

            const result = exchangeSimulator.simulate(
                bots,
                startMoneyAmount,
                MAX_SESSIONS_WITHOUT_ACTION,
                startTime,
                endTime
            );
            const botСurrencyAmounts = result.botСurrencyAmounts;
            console.log();

            botСurrencyAmounts.forEach((amount, i) =>
                console.log(`Кол-во активов в валюте у бота ${i} изменилось на: ${amount - startMoneyAmount}`));

            const mostRichBotIndex = botСurrencyAmounts.reduce((maxIndex, amount, index, amounts) =>
                amount > amounts[maxIndex] ? index : maxIndex, 0);

            if (compare(botСurrencyAmounts[mostRichBotIndex], startMoneyAmount) === 1) {
                saveSimulationResult(bots[mostRichBotIndex], botСurrencyAmounts[mostRichBotIndex] / startMoneyAmount, startTime, endTime);
                brain = bots[mostRichBotIndex].getBrain();

                mutationRate -= 0.0002;
                if (mutationRate <= 0) {
                    console.log('Неудачные параметры эволюции. Мутаций стало слишком мало');
                    break;
                }
            } else {
                console.log('Ни один бот не стал богаче');
                brain = Brain.createRandom(DATA_SIGNALS_COUNT, LAYERS_NEURONS_COUNTS);

                mutationRate += 0.002;
                if (mutationRate > 0.7) {
                    console.log('Неудачные параметры эволюции. Мутаций стало слишком много');
                    break;
                }
            }

            if (!result.securitiesOutOfSale) {
                startTime = result.endTime;
            } else {
                console.log('Больше нет данных по ценным бумагам. Сброс начального времени');
                startTime = PROPER_START_TIME;
            }
        }
    });

async function getNormalizedCandles(): Promise<NormalizationResult> {
    if (!fs.existsSync(CONFIG.cache.securitiesCandlesNormalized)) {
        return getSecuritiesCandles()
            .then(securitiesCandles => normalizeCandles(securitiesCandles))
            .then(result => {
                writeJsonFile(CONFIG.cache.securitiesCandlesNormalized, result);

                return result;
            });
    }

    return new Promise((resolve, reject) => {
        resolve(readJsonFile(CONFIG.cache.securitiesCandlesNormalized));
    });
}

async function getSecuritiesCandles(): Promise<SecuritiesCandles> {
    if (!fs.existsSync(CONFIG.cache.securitiesCandles)) {
        return MOEX_CLIENT.securitiesIds('stock', 'shares')
            .then(secIds => {
                const promises = secIds.map((secId: string) =>
                    MOEX_CLIENT.candles31('stock', 'shares', secId)
                        .then(response => [secId, response.data.candles.data])
                );

                const candlesData = {};

                return Promise.all(promises)
                    .then(securitiesCandles => {
                        securitiesCandles.forEach(([secId, candles]) => {
                            candlesData[secId] = candles;
                        });

                        writeJsonFile(CONFIG.cache.securitiesCandles, candlesData);

                        return candlesData;
                    });
            });
    }

    return new Promise((resolve, reject) => {
        resolve(readJsonFile(CONFIG.cache.securitiesCandles));
    });
}

function normalizeCandles(securitiesCandles: SecuritiesCandles): NormalizationResult {
    const securitiesIds: string[] = Object.keys(securitiesCandles).filter((securityId) => {
        const candles = securitiesCandles[securityId];

        return candles.some((candle) =>
            candle[CANDLE_INDEX_CLOSE] <= 400_000
        )
    });
    console.log('Убраны акции, которые когда-либо были дороже 400000 руб');
    console.log(`Фильтр прошли ${securitiesIds.length} из ${Object.keys(securitiesCandles).length} акций`);

    // Маппим данные из API
    securitiesIds.forEach((securityId) =>
        securitiesCandles[securityId].forEach((candle) => {
            /** @ts-ignore-next-line */
            candle[CANDLE_INDEX_BEGIN] = (Date.parse(candle[5].replace(' ', 'T')) / 1000) >> 0;
            /** @ts-ignore-next-line */
            candle[CANDLE_INDEX_END] = (Date.parse(candle[6].replace(' ', 'T')) / 1000) >> 0;
        })
    );

    securitiesIds.forEach((securityId) => {
        const candles = securitiesCandles[securityId];

        const skipCount = candles.findIndex((candle) =>
            /** @ts-ignore-next-line */
            candle[CANDLE_INDEX_END] >= ((+new Date(2000, 1, 1) / 1000) >> 0)
        );
        if (skipCount > 0) {
            candles.splice(0, skipCount);
        }
    });
    console.log('Убраны свечи до 01.01.2000');

    const securityIdsMap: string[] = new Array(securitiesIds.length);
    let normalizedCandles: NormalizedSecuritiesCandles = new Array(securitiesIds.length);
    securitiesIds.forEach((securityId, securityIndex) => {
        securityIdsMap[securityIndex] = securityId;
        /** @ts-ignore-next-line */
        normalizedCandles[securityIndex] = securitiesCandles[securityId];
    });

    return {
        candles: normalizedCandles,
        normalizationContext: {
            securityIdsMap
        }
    };
}

function saveSimulationResult(bot: ExchangeBot, efficiency: number, startTime: number, endTime: number): void {
    const fileName = `${new Date().toISOString()}.json`
    writeJsonFile(`${CONFIG.simulationResultsDir}/${fileName}`, {
        efficiency,
        startTime,
        endTime,
        securities: Object.fromEntries(bot.getSecurities()),
        brain: bot.getBrain().getSynapses(),
    });
}

function writeJsonFile(path: string, data: any): void {
    if (!fs.existsSync(CONFIG.simulationResultsDir)) {
        fs.mkdirSync(CONFIG.simulationResultsDir);
    }
    fs.writeFileSync(path, JSON.stringify(data))
}
 
function readJsonFile(path) {
    return JSON.parse(fs.readFileSync(path).toString())
}