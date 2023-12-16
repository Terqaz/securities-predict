import { compare, floor, max } from "mathjs";
import { SecuritiesBag, SecurityAmounts } from "./securities-bag";
import { Brain } from "./brain";
import { CandlesMap, SecuritiesPrices } from "../exchange/exchange-simulator";

export type Action = 'buy' | 'sell' | 'nothing';

export type BotDecision = {
    securityIndex: number
    securityAmount: number
    action: Action,
}

export class ExchangeBot {
    private brain: Brain;
    private moneyAmount: number;
    public securities: SecuritiesBag;

    constructor(brain: Brain) {
        this.brain = brain;
    }

    prepareTrading(moneyAmount: number, securitiesCount: number) {
        this.moneyAmount = moneyAmount;
        this.securities = new SecuritiesBag(securitiesCount);
    }

    mutate(mutationRate: number) {
        this.brain = this.brain.mutate(mutationRate);
    }

    decide(
        currentTime: number,
        securityIndex: number,
        prices: SecuritiesPrices,
        candles: CandlesMap
    ): BotDecision {
        const decision = this.brain.decide(currentTime, this.moneyAmount, this.securities.getAmount(securityIndex), securityIndex, prices, candles);
        
        let action: Action = 'nothing';
        let securityAmount = 0;
        const actionProbability = max(decision.buyProbability, decision.sellProbability, decision.nothingProbability);
        if (compare(actionProbability, decision.buyProbability) === 0) {
            // Сделаем ограничение на покупку только целого кол-ва бумаги 
            securityAmount = floor(this.moneyAmount / prices.get(securityIndex) * decision.securityProportion)            
            if (securityAmount > 0) {
                action = 'buy';
            }
        } else if (compare(actionProbability, decision.sellProbability) === 0) {
            // Сделаем ограничение на продажу только целого кол-ва бумаги 
            securityAmount = floor(this.securities.getAmount(securityIndex) * decision.securityProportion);
            if (securityAmount > 0) {
                action = 'sell';
            }
        }

        return {
            securityIndex,
            securityAmount,
            action
        };
    }

    canBuy(securityPrice: number): boolean {
        return this.moneyAmount > securityPrice;
    }

    canSell(securityIndex: number): boolean {
        return this.securities.getAmount(securityIndex) > 0;
    }

    doBuy(time: number, securityIndex: number, price: number, securityAmount: number) {
        this.securities.buy(time, securityIndex, securityAmount);

        this.moneyAmount -= price * securityAmount;
    }

    doSell(time: number, securityIndex: number, price: number, securityAmount: number) {
        this.securities.sell(time, securityIndex, securityAmount);

        this.moneyAmount += price * securityAmount;
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

    getBrain() {
        return this.brain;
    }
}