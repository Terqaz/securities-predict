import * as fs from 'fs';

import CONFIG from "../app-config";
import MOEX_CLIENT from "../clients/moex-client";
import { CANDLE_INDEX_BEGIN, Candle, SecuritiesCandles } from "../types";
import { readJsonFile, writeJsonFile } from "../utils";

export async function getDaySecuritiesCandles(dateFrom: Date = undefined, reload = false): Promise<SecuritiesCandles> {
    if (!fs.existsSync(CONFIG.cacheFilepaths.securitiesCandles.day) || reload) {
        if (reload) {
            console.log(`Обновление кэша свеч...`);
        }
        const now = new Date();
        const yesterdayDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1);

        console.log('Загрузка свеч...');

        return MOEX_CLIENT.securitiesIds('stock', 'shares')
            .then((securityIds: string[]) => {
                const promises = securityIds.map((securityId: string) => {
                    return new Promise<[string, Candle[]]>(async (resolve, reject) => {
                        let allCandles: Candle[] = [];

                        let candlesBatch: Candle[];
                        do {
                            try {
                                candlesBatch = await MOEX_CLIENT.dayCandles('stock', 'shares', securityId, dateFrom)
                                    .then((response): Candle[] => response.data.candles.data)
                                    .catch(error => {
                                        if (error.request) {
                                            console.error(error.request);
                                        }
                                        throw Error(error.message);
                                    })
                            } catch (error) {
                                console.log(`Ошибка при загрузке свеч ${securityId}: ${error.message}`);
                                reject(error);
                                break;
                            }

                            if (!candlesBatch.length) {
                                break;
                            }

                            console.log(`Для ${securityId} получено ${candlesBatch.length} свеч по ${candlesBatch[candlesBatch.length - 1][CANDLE_INDEX_BEGIN]}`);

                            allCandles = [...allCandles, ...candlesBatch];

                            if (candlesBatch.length < 500) {
                                break;
                            }

                            dateFrom = new Date(candlesBatch[candlesBatch.length - 1][CANDLE_INDEX_BEGIN]);
                            dateFrom.setUTCDate(dateFrom.getUTCDate() + 1);

                            // Если не получили данные до вчерашней свечи, то продолжаем
                        } while (dateFrom.getTime() < yesterdayDate.getTime());

                        console.log(`Для ${securityId} получены все свечи`);

                        resolve([securityId, allCandles]);
                    })
                });

                return Promise.allSettled(promises)
                    .then(results => {
                        const candlesData = {};
                        results.forEach(result => {
                            if (result.status === 'fulfilled') {
                                const [securityId, candles] = result.value;
                                candlesData[securityId] = candles;
                            }
                        })

                        console.log(`Сохранение свеч в кэш ${CONFIG.cacheFilepaths.securitiesCandles.day}...`);
                        writeJsonFile(CONFIG.cacheFilepaths.securitiesCandles.day, candlesData);
                        console.log('Свечи сохранены');

                        return candlesData;
                    });
            });
    }

    return new Promise((resolve, reject) => {
        console.log('Свечи будут загружены из кэша...');
        resolve(readJsonFile(CONFIG.cacheFilepaths.securitiesCandles.day));
    });
}

export async function getMonthSecuritiesCandles(reload = false): Promise<SecuritiesCandles> {
    if (!fs.existsSync(CONFIG.cacheFilepaths.securitiesCandles.month) || reload) {
        return MOEX_CLIENT.securitiesIds('stock', 'shares')
            .then((securityIds: string[]) => {
                const promises = securityIds.map((securityId: string) =>
                    MOEX_CLIENT.monthCandles('stock', 'shares', securityId)
                        .then(response => [securityId, response.data.candles.data])
                );

                const candlesData = {};
                return Promise.all(promises)
                    .then(securitiesCandles => {
                        securitiesCandles.forEach(([securityId, candles]) => {
                            candlesData[securityId] = candles;
                        });

                        writeJsonFile(CONFIG.cacheFilepaths.securitiesCandles.month, candlesData);

                        return candlesData;
                    });
            });
    }

    return new Promise((resolve, reject) => {
        resolve(readJsonFile(CONFIG.cacheFilepaths.securitiesCandles.month));
    });
}
