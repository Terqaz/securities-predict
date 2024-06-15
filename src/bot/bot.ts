import { SecuritiesBag, SecurityAmounts } from "./securities-bag";
import { Brain, BrainDecision } from './brain';
import { SecuritiesPrices, SecurityId } from "../exchange/exchange-simulator";
import { compare } from "../utils";
import { NormalizedCandle } from '../types';

export type Action = 'buy' | 'sell' | 'nothing';

export type BotDecision = {
    securityAmount: number
    action: Action,
}

export class ExchangeBot {
    public brain: Brain;
    private moneyAmount: number;
    public securities: SecuritiesBag;

    constructor(brain: Brain) {
        this.brain = brain;
    }

    prepareTrading(moneyAmount: number, securitiesCount: number) {
        this.moneyAmount = moneyAmount;
        this.securities = new SecuritiesBag(securitiesCount);
    }

    mutate(mutationRate: number, mutationBias: number): ExchangeBot {
        this.brain = this.brain.mutate(mutationRate, mutationBias);
        return this;
    }

    securityDecide(
        currentTime: number,
        index: SecurityId,
        price: number,
        securityCandles: NormalizedCandle[]
    ): BotDecision {
        const availableAmount = this.securities.getAmount(index);
        const decision = this.brain.decide(currentTime, this.moneyAmount, availableAmount, securityCandles);

        return this.handleBrainDecision(decision, price, availableAmount);
    }

    handleBrainDecision(decision: BrainDecision, price: number, availableAmount: number): any {
        let action: Action = 'nothing';
        let securityAmount = 0;
        const actionProbability = Math.max(decision.buyProbability, decision.sellProbability, decision.nothingProbability);
        if (compare(actionProbability, decision.buyProbability) === 0) {
            // Сделаем ограничение на покупку только целого кол-ва бумаги 
            securityAmount = Math.floor(this.moneyAmount / price * decision.securityProportion)            
            if (securityAmount > 0 && this.canBuy(price, securityAmount)) {
                action = 'buy';
            }
        } else if (compare(actionProbability, decision.sellProbability) === 0) {
            // Сделаем ограничение на продажу только целого кол-ва бумаги 
            securityAmount = Math.floor(availableAmount * decision.securityProportion);
            if (securityAmount > 0 && this.canSell(price, securityAmount)) {
                action = 'sell';
            }
        }

        return {
            securityAmount,
            action
        };
    }

    canBuy(securityPrice: number, amount = 1): boolean {
        return this.moneyAmount > securityPrice * amount;
    }

    canSell(securityIndex: SecurityId, amount = 1): boolean {
        return this.securities.getAmount(securityIndex) >= amount;
    }

    buy(time: number, securityIndex: SecurityId, price: number, securityAmount: number): boolean {
        if (!this.canBuy(price, securityAmount)) {
            return false;
        }
        
        this.securities.buy(time, securityIndex, securityAmount);
        this.moneyAmount -= price * securityAmount;

        return true;
    }

    sell(time: number, securityIndex: SecurityId, price: number, securityAmount: number): boolean {
        if (!this.canSell(price, securityAmount)) {
            return false;
        }

        this.securities.sell(time, securityIndex, securityAmount);
        this.moneyAmount += price * securityAmount;

        return true;
    }

    getSecuritiesCurrencyAmount(prices: SecuritiesPrices): number {
        return this.securities.getSecuritiesCurrencyAmount(prices);
    }

    getSecurities(): SecurityAmounts {
        return this.securities.amounts;
    }

    getMoneyAmount(): number {
        return this.moneyAmount;
    }
}