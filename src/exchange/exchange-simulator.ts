import { ExchangeBot } from '../bot/bot';
import { CANDLE_INDEX_CLOSE, CANDLE_INDEX_END, NormalizationContext, NormalizedSecuritiesCandles, NormalizedCandle } from '../types';
import { MAX_TIMESTAMP } from '../utils';

export type SecuritiesPrices = Map<number, number>;
export type CandlesMap = Map<number, NormalizedCandle[]>

export type SimulationResult = {
    bots: ExchangeBot[],
    botСurrencyAmounts: number[],
    endTime: number,
    securitiesOutOfSale: boolean
}

export class ExchangeSimulator {
    private readonly candles: NormalizedSecuritiesCandles;
    private readonly normalizationContext: NormalizationContext;
    private readonly timeStep: number;
    private readonly logging: boolean;

    public bots: ExchangeBot[];
    private readonly currentCandles: CandlesMap;
    private currentPrices: SecuritiesPrices;

    private readonly disabledSecurities: Set<number> = new Set();

    private startTime: number;
    private endTime: number;
    private currentTime = 0;

    private maxSessionsWithoutAction: number;
    private sessionsWithoutAction: number;
    private simulationStartRealTime?: Date;

    public constructor(
        candles: NormalizedSecuritiesCandles,
        normalizationContext: NormalizationContext,
        timeStep: number,
        logging = true
    ) {
        this.candles = candles;
        this.normalizationContext = normalizationContext;
        this.timeStep = timeStep;
        this.logging = logging;

        this.currentCandles = new Map();
        this.currentPrices = new Map();
    }

    private findProperStartTime(startTime: number) {
        let properStartTime = MAX_TIMESTAMP;

        this.candles.forEach((candles) => {
            const firstEndTime = candles[0][CANDLE_INDEX_END];

            if (firstEndTime < properStartTime) {
                properStartTime = firstEndTime;
            }
        });

        if (properStartTime > startTime) {
            console.warn(`Использовано минимально возможное начальное время: ${properStartTime}`);
            return properStartTime
        }

        return startTime;
    }

    public simulate(
        bots: ExchangeBot[],
        moneyAmount: number,
        maxSessionsWithoutAction: number,
        startTime = 0,
        endTime = MAX_TIMESTAMP,
    ): SimulationResult {
        this.sessionsWithoutAction = 0;
        this.maxSessionsWithoutAction = maxSessionsWithoutAction;

        this.startTime = this.findProperStartTime(startTime);
        this.endTime = endTime;
        this.currentTime = this.startTime;

        bots.forEach((bot) => bot.prepareTrading(moneyAmount, this.candles.length));
        this.bots = bots;

        this.simulationStartRealTime = new Date();
        this.log(`Симуляция запущена в ${this.currentTime}`);

        while (
            !this.isSecuritiesOutOfSale()
            && this.currentTime < this.endTime
        ) {
            this.organizeSession();
            this.log(`Торговая сессия завершена в ${this.currentTime}`);

            ++this.sessionsWithoutAction;
            if (this.sessionsWithoutAction >= this.maxSessionsWithoutAction) {
                this.log(`Количество сессий без действий стало ${this.maxSessionsWithoutAction}. Отмена симуляции...`)
                break;
            }
        }

        this.currentCandles.clear();
        this.disabledSecurities.clear();

        const prices = new Map(this.currentPrices);
        this.currentPrices.clear();

        this.log('Симуляция завершена');

        return {
            bots: this.bots,
            botСurrencyAmounts: this.bots.map(bot =>
                bot.getMoneyAmount() + bot.getSecuritiesCurrencyAmount(prices)),
            endTime: this.endTime,
            securitiesOutOfSale: this.isSecuritiesOutOfSale()
        };
    }

    private organizeSession() {
        this.updateAvailableData();

        this.currentPrices.forEach((price, securityIndex) => {
            this.bots.forEach((bot, botIndex) => {
                if (!bot.canBuy(price) && !bot.canSell(securityIndex)) {
                    return;
                }

                const { securityAmount, action } = bot.decide(this.currentTime, securityIndex, this.currentPrices, this.currentCandles);

                if (action === 'buy') {
                    bot.doBuy(this.currentTime, securityIndex, price, securityAmount);
                    this.log(`Бот ${botIndex} купил ${securityAmount} ${this.getSecurityId(securityIndex)} за ${price}`);
                } else if (action === 'sell') {
                    // todo почему-то не продают
                    bot.doSell(this.currentTime, securityIndex, price, securityAmount);
                    this.log(`Бот ${botIndex} продал ${securityAmount} ${this.getSecurityId(securityIndex)} за ${price}`);
                }

                if (action !== 'nothing') {
                    this.sessionsWithoutAction = 0;
                }
            })
        });

        this.candles.forEach((candles, securityIndex) => {
            const isSecurityOutOfSale = candles[candles.length - 1][CANDLE_INDEX_END] < this.currentTime;
            if (isSecurityOutOfSale && !this.disabledSecurities.has(securityIndex)) {
                this.currentCandles.delete(securityIndex);
                // Цену бумаги не чистим, даем возможность продать по последней цене

                this.log(`Продажи ${this.getSecurityId(securityIndex)} прекращены`);
                this.disabledSecurities.add(securityIndex);
            }
        });

        this.currentTime += this.timeStep
    }

    private updateAvailableData() {
        // Обновляем доступные свечи
        let currentCandlesChanged = false;
        while (true) {
            this.candles.forEach((candles, securityIndex) => {
                // Добавляем следующие доступные для ботов свечи 
                let index: number;
                let currentCandles: NormalizedCandle[];
                if (this.currentCandles.has(securityIndex)) {
                    currentCandles = this.currentCandles.get(securityIndex);
                    index = currentCandles.length;
                } else {
                    currentCandles = [];
                    index = 0;
                }

                for (; index < candles.length; index++) {
                    if (candles[index][CANDLE_INDEX_END] > this.currentTime) {
                        break;
                    }

                    currentCandles.push(candles[index]);
                    currentCandlesChanged = true;
                }

                if (currentCandles.length && !this.currentCandles.has(securityIndex)) {
                    this.currentCandles.set(securityIndex, currentCandles);
                }
            });

            if (!currentCandlesChanged) {
                this.currentTime += this.timeStep;
            } else {
                break;
            }
        }

        // Пересчитываем стоимости
        this.currentCandles.forEach((candles, securityIndex) => {
            if (this.disabledSecurities.has(securityIndex)) {
                return;
            }

            // Берем стоимость акции по цене закрытия последней доступной свечи
            this.currentPrices.set(securityIndex, candles[candles.length - 1][CANDLE_INDEX_CLOSE]);
        });

        // console.log(this.currentCandles);
        // process.exit();
    }

    private isSecuritiesOutOfSale() {
        return this.disabledSecurities.size === this.candles.length;
    }

    private getSecurityId(securityIndex: number): string {
        return this.normalizationContext.securityIdsMap[securityIndex];
    }

    private log(message: string) {
        if (this.logging) {
            console.log(`${new Date().toISOString()} ${message}`)
        }
    }
}