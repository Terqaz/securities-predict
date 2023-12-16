import { compare } from "mathjs";
import { SecuritiesPrices } from "../exchange/exchange-simulator";

export type SecurityAmounts = Map<number, number>;

export type Transaction = {
    time: number,
    securityIndex: number,
    amount: number
}

export class SecuritiesBag {
    private readonly bag: SecurityAmounts;
    public readonly history: Transaction[] = [];

    constructor(securitiesCount: number) {
        this.bag = new Map();
    }

    buy(time, securityIndex, amount) {
        if (!this.bag.has(securityIndex)) {
            this.bag.set(securityIndex, amount);
        } else {
            this.bag.set(securityIndex, this.bag.get(securityIndex) + amount);
        }

        this.history.push({
            time,
            securityIndex,
            amount
        });
    }

    sell(time: number, securityIndex: number, amount: number) {
        if (!this.bag.has(securityIndex) || this.bag.get(securityIndex) < amount) {
            throw new Error(`Недостаточно кол-ва бумаги ${securityIndex} для продажи`);
        }

        this.bag.set(securityIndex, this.bag.get(securityIndex) - amount);

        this.history.push({
            time,
            securityIndex,
            amount: -amount
        });
    }

    getAmount(securityIndex: number): number {
        return this.bag.has(securityIndex) ? this.bag.get(securityIndex) : 0
    }

    getSecuritiesCurrencyAmount(prices: SecuritiesPrices): number {
        let currencyAmount = 0;
        this.amounts
            .forEach((amount, securityIndex) => {
                if (compare(amount, 0) === 0) {
                    return;
                }

                currencyAmount += amount * prices.get(securityIndex);
            });

        return currencyAmount;
    }

    get amounts(): SecurityAmounts {
        return this.bag;
    }
}