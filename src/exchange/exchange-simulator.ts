import { ExchangeBot } from '../bot/bot';
import { CANDLE_INDEX_CLOSE, CANDLE_INDEX_END, NormalizationContext, NormalizedSecuritiesCandles, NormalizedCandle } from '../types';
import { MAX_TIMESTAMP, shuffle } from '../utils';

export type SecurityId = number;
export type SecuritiesPrices = Map<SecurityId, number>;
export type CandlesMap = Map<SecurityId, NormalizedCandle[]>

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
    private readonly currentCandles: CandlesMap = new Map();
    private readonly currentPrices: SecuritiesPrices = new Map();

    private readonly disabledSecurities: Set<number> = new Set();

    private startTime: number;
    private endTime: number;
    private currentTime = 0;

    private maxSecuritiesCount: number;
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
        maxSecuritiesCount = Number.MAX_SAFE_INTEGER,
        maxSessionsWithoutAction = 12,
        startTime = 0,
        endTime = MAX_TIMESTAMP,
    ): SimulationResult {
        this.maxSecuritiesCount = maxSecuritiesCount;

        this.sessionsWithoutAction = 0;
        this.maxSessionsWithoutAction = maxSessionsWithoutAction;

        this.startTime = this.findProperStartTime(startTime);
        this.endTime = endTime;
        this.currentTime = this.startTime;

        bots.forEach((bot) => bot.prepareTrading(moneyAmount, this.candles.length));
        this.bots = bots;

        this.simulationStartRealTime = new Date();
        this.log();
        this.log(`Симуляция запущена в ${this.currentTime}`);

        while (
            !this.isSecuritiesOutOfSale()
            && this.currentTime < this.endTime
        ) {
            this.organizeSession();
            // todo добавить сколько еще осталось сессий

            if (this.sessionsWithoutAction >= this.maxSessionsWithoutAction) {
                this.log(`Количество сессий без действий стало ${this.maxSessionsWithoutAction}. Отмена симуляции...`)
                break;
            }

            if (this.sessionsWithoutAction > 0) {
                this.log(`Осталось сессий без действий: ${this.maxSessionsWithoutAction - this.sessionsWithoutAction}`)
            }

            ++this.sessionsWithoutAction;
        }

        this.currentCandles.clear();
        this.disabledSecurities.clear();

        const prices = new Map(this.currentPrices);
        this.currentPrices.clear();

        this.log('Симуляция завершена');
        this.log();

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

        // Перемешиваем, чтобы исключить влияние порядка бумаг 
        shuffle(Array.from(this.currentCandles)).forEach(([securityIndex, securityCandles]) => {
            this.bots.forEach((bot, botIndex) => {
                const price = this.currentPrices.get(securityIndex);

                if (!bot.canBuy(price, 1) && !bot.canSell(securityIndex, 1)) {
                    return;
                }

                const { securityAmount, action } = bot.securityDecide(this.currentTime, securityIndex, price, securityCandles);

                if (action === 'buy') {
                    if (bot.buy(this.currentTime, securityIndex, price, securityAmount)) {
                        this.log(`Бот ${botIndex} купил ${securityAmount} ${this.getSecurityId(securityIndex)} за ${price}`);
                    }
                } else if (action === 'sell') {
                    // todo почему-то не продают
                    if (bot.sell(this.currentTime, securityIndex, price, securityAmount)) {
                        this.log(`Бот ${botIndex} продал ${securityAmount} ${this.getSecurityId(securityIndex)} за ${price}`);
                    }
                }

                if (action !== 'nothing') {
                    this.sessionsWithoutAction = 0;
                }
            })
        });

        this.log();
        this.log('Остатки на счетах:')
        this.bots.forEach((bot, index) => {
            this.log(`Бот ${index}: ${bot.getMoneyAmount()}`)
        });

        this.currentCandles.forEach((securityCandles, securityIndex) => {
            const allSecurityCandles = this.candles[securityIndex];

            const isSecurityOutOfSale = allSecurityCandles[allSecurityCandles.length - 1][CANDLE_INDEX_END] < this.currentTime;
            if (
                isSecurityOutOfSale
                && !this.disabledSecurities.has(securityIndex)
            ) {
                this.currentCandles.delete(securityIndex);
                // Цену бумаги не чистим, даем возможность продать по последней цене

                this.log(`Продажи ${this.getSecurityId(securityIndex)} прекращены`);
                this.disabledSecurities.add(securityIndex);
            }
        });

        this.currentTime += this.timeStep

        this.log(`Торговая сессия завершена в ${this.currentTime}`);
        this.log();
    }

    private updateAvailableData() {
        // Обновляем доступные свечи
        let currentCandlesChanged = false;
        const newSecurities = new Set();
        while (true) {
            // Если настроено maxSecuritiesCount, то перемешиваем массив 
            const candles = this.maxSecuritiesCount === Number.MAX_SAFE_INTEGER
                ? this.candles
                : shuffle(this.candles);

            candles.forEach((securityCandles, securityIndex) => {
                if (this.disabledSecurities.has(securityIndex)) {
                    return;
                }

                // Добавляем следующие доступные для ботов свечи 
                let index: number;
                let currentCandles: NormalizedCandle[];
                if (this.currentCandles.has(securityIndex)) {
                    currentCandles = this.currentCandles.get(securityIndex);
                    index = currentCandles.length;
                } else {
                    if (this.currentCandles.size >= this.maxSecuritiesCount) {
                        return;
                    }
                    currentCandles = [];
                    index = 0;
                }

                for (; index < securityCandles.length; index++) {
                    if (securityCandles[index][CANDLE_INDEX_END] > this.currentTime) {
                        break;
                    }

                    currentCandles.push(securityCandles[index]);
                    currentCandlesChanged = true;
                }

                const isSecurityOutOfSale = securityCandles[securityCandles.length - 1][CANDLE_INDEX_END] < this.currentTime;
                if (
                    !isSecurityOutOfSale
                    && currentCandles.length
                    && !this.currentCandles.has(securityIndex)
                ) {
                    this.currentCandles.set(securityIndex, currentCandles);
                    newSecurities.add(this.getSecurityId(securityIndex));
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

        if (newSecurities.size > 0) {
            this.log(`Начались продажи: ${Array.from(newSecurities).join(', ')}`);
        }
    }

    private isSecuritiesOutOfSale() {
        return this.disabledSecurities.size === this.candles.length;
    }

    private getSecurityId(securityIndex: number): string {
        return this.normalizationContext.securityIdsMap[securityIndex];
    }

    private log(message?: string) {
        if (this.logging) {
            if (message) {
                console.log(`${new Date().toISOString()} ${message}`)
            } else {
                console.log();
            }
        }
    }
}