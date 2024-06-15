#!/usr/bin/env node


import * as fs from 'fs';
import * as path from 'path';
import * as tf from '@tensorflow/tfjs-node-gpu';

import CONFIG from './app-config';
import { SecuritiesCandles, NormalizationResult, NormalizedSecuritiesCandles, CANDLE_INDEX_BEGIN, CANDLE_INDEX_END, CANDLE_INDEX_CLOSE } from './types';
import MOEX_CLIENT from './clients/moex-client';
import { ExchangeSimulator } from './exchange/exchange-simulator';
import { Brain } from './bot/brain';
import { ExchangeBot } from './bot/bot';
import { logExit, readJsonFile, writeJsonFile } from './utils';
import { getMonthSecuritiesCandles } from './service/moex-service';

let modelFilepath;
let simulationName;
for (let i = 2; i < process.argv.length; i++) {
    switch (process.argv[i]) {
        case "--model":
            modelFilepath = process.argv[++i];
            break;
        case "--simulation-name":
            simulationName = process.argv[++i];
            break;
    }
}

getNormalizedCandles()
    .then(async (normalizationResult: NormalizationResult) => {
        const STATE_SIGNALS_COUNT = 30;
        const BOTS_COUNT = 10;
        const MAX_SECURITIES_COUNT = 50;
        const MAX_SESSIONS_WITHOUT_ACTION = 4;
        const PROPER_START_TIME = 1025481600;

        const MUTATION_RATE_BIAS_BAD_SIMULATION = 0.02
        const MUTATION_RATE_BIAS_GOOD_SIMULATION = -0.005
        const MUTATION_RATE_MAX = 0.7;
        const MUTATION_BIAS = 0.5;
        let mutationRate = 0.15;

        const exchangeSimulator = new ExchangeSimulator(
            normalizationResult.candles,
            normalizationResult.normalizationContext,
            3600 * 24,
            true
        );

        let brain: Brain;
        if (!modelFilepath && !simulationName) {
            brain = Brain.createRandom(STATE_SIGNALS_COUNT);
            simulationName = simulationName || Math.floor(Math.random() * 10000);
        } else {
            const model = await loadModel(modelFilepath, simulationName);
            brain = Brain.createFromModel(model, STATE_SIGNALS_COUNT);
        }

        let startTime: number;
        let endTime: number;
        for (let generation = 0; ; generation++) {
            // Прибавляем к минимальному времени до 20 лет
            // startTime = (Math.floor(Math.random() * 3600 * 24 * 365 * 20) + 1025481600);
            startTime = (Math.floor(Math.random() * 3600 * 24 * 365 * 10) + 1025481600);
            // Прибавляем к начальному времени от 50 до 150 дней
            endTime = startTime + 3600 * 24 * (Math.floor(Math.random() * 150) + 50);
            const startMoneyAmount = (Math.floor(Math.random() * 45000) + 5000);

            console.log();
            console.log('Начальные данные симуляции:');
            console.log(`Название: ${simulationName}`);
            console.log(`Поколение: ${generation}`);
            console.log(`Шанс мутации: ${mutationRate}`);
            console.log(`Максимальное кол-во бумаг: ${MAX_SECURITIES_COUNT}`);
            console.log(`Время начала: ${startTime}`);
            console.log(`Время окончания: ${endTime}`);
            console.log(`Кол-во валюты: ${startMoneyAmount}`);

            let bots: ExchangeBot[] = [];
            for (let i = 0; i < BOTS_COUNT; i++) {
                bots.push(new ExchangeBot(brain).mutate(mutationRate, MUTATION_BIAS))
            }

            const result = exchangeSimulator.simulate(
                bots,
                startMoneyAmount,
                MAX_SECURITIES_COUNT,
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
            const mostEfficiency = botСurrencyAmounts[mostRichBotIndex] / startMoneyAmount;

            console.log();
            console.log(`Лучший бот: ${mostRichBotIndex}`);
            console.log(`Эффективность: ${mostEfficiency}`);

            if (botСurrencyAmounts[mostRichBotIndex] > startMoneyAmount) {
                await saveSimulationResult(simulationName, bots[mostRichBotIndex], mostEfficiency, startTime, endTime);
                brain = bots[mostRichBotIndex].brain;

                mutationRate += MUTATION_RATE_BIAS_GOOD_SIMULATION;
                if (mutationRate <= 0) {
                    console.log('Неудачные параметры эволюции. Мутаций стало слишком мало');
                    break;
                }
            } else {
                console.log('Ни один бот не стал богаче');
                brain = Brain.createRandom(STATE_SIGNALS_COUNT);

                mutationRate += MUTATION_RATE_BIAS_BAD_SIMULATION;
                if (mutationRate > MUTATION_RATE_MAX) {
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
    if (!fs.existsSync(CONFIG.cacheFilepaths.securitiesCandlesNormalized)) {
        return getMonthSecuritiesCandles()
            .then(securitiesCandles => normalizeCandles(securitiesCandles))
            .then(result => {
                writeJsonFile(CONFIG.cacheFilepaths.securitiesCandlesNormalized, result);

                return result;
            });
    }

    return new Promise((resolve, reject) => {
        resolve(readJsonFile(CONFIG.cacheFilepaths.securitiesCandlesNormalized));
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

async function saveSimulationResult(simulationName: number | string, bot: ExchangeBot, efficiency: number, startTime: number, endTime: number) {
    const simulationProgressDir = `${CONFIG.simulationResultsDir}/${simulationName}`;
    const modelName = `${simulationName}-${new Date().toISOString()}`;

    const progressFilepath = `${simulationProgressDir}/progress.json`;
    const progress: any[] = fs.existsSync(progressFilepath)
        ? readJsonFile(progressFilepath)
        : [];

    progress.push({
        modelName,
        efficiency,
        startTime,
        endTime,
        securities: Object.fromEntries(bot.getSecurities()),
    });
    writeJsonFile(progressFilepath, progress, true);

    await bot.brain.synapses.save(`file://${simulationProgressDir}/${modelName}`);
    console.log('Результат симуляции сохранен');
}

async function loadModel(filepath?: string, simulationName?: string | number): Promise<tf.LayersModel> {
    if (simulationName) {

        const simulationProgressDir = `${CONFIG.simulationResultsDir}/${simulationName}`;

        // Берем последнюю модель из папки результатов симуляции
        filepath = fs.readdirSync(simulationProgressDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
                const path = `${simulationProgressDir}/${dirent.name}`;

                return {
                    path: path,
                    birthtime: fs.statSync(path).birthtime
                };
            })
            .reduce((a, b) => a.birthtime > b.birthtime ? a : b)
            .path;

    }

    if (filepath) {
        console.log(`Будет использована модель ${filepath}`);
        return await tf.loadLayersModel(`file://${filepath}/model.json`);
    }

    throw new Error('Could not load model. Check args');
}
