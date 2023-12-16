import { Matrix, e, matrix, multiply } from "mathjs";
import { CANDLE_LENGTH, EMPTY_CANDLE } from '../types';
import { CandlesMap, SecuritiesPrices } from '../exchange/exchange-simulator';

export type BrainDecision = {
    buyProbability: number,
    sellProbability: number,
    nothingProbability: number,
    // процент количества бумаги по сделке от максимально доступного кол-ва в зависимости
    // от кол-ва доступных денег и кол-ва данной бумаги в наличии
    securityProportion: number,
};

export type Synapses = Matrix[];

export class Brain {
    private synapses: Synapses;

    /** 
     * Коэффициенты слоев нейронной сети 
     * 
     * @see valuableInputSignalsCount
     * @see valuableOutputSignalsCount
     * @see currentDataSignalsCount
     */
    constructor(synapses: Synapses) {
        this.synapses = synapses;

        if (this.currentInputSignalsCount <= Brain.valuableInputSignalsCount) {
            throw new Error(`Кол-во входных сигналов должно быть больше ${Brain.valuableInputSignalsCount}`);
        }

        if (this.currentDataSignalsCount !== this.currentOutputSignalsCount - Brain.valuableOutputSignalsCount) {
            throw new Error(`Кол-во выходных сигналов на основе кол-ва входных должно быть равно ${this.currentOutputSignalsCount - Brain.valuableOutputSignalsCount}`);
        }
    }

    public static createRandom(dataSignalsCount: number, layerNeuronsCounts: number[]): Brain {
        const synapses: Synapses = [];
    
        let i = 0;
        synapses.push(matrix().resize([layerNeuronsCounts[i], Brain.valuableInputSignalsCount + dataSignalsCount]));
        for (; i < layerNeuronsCounts.length - 1; i++) {
            synapses.push(matrix().resize([layerNeuronsCounts[i + 1], layerNeuronsCounts[i]]));
        }
        synapses.push(matrix().resize([Brain.valuableOutputSignalsCount + dataSignalsCount, layerNeuronsCounts[i]]));
    
        return new Brain(synapses.map(layer => 
            layer.map(synapse => Brain.createRandomSynapse())));
    }

    public static fromFileData(data: any[]): Brain {
        const synapses: Synapses = [];

        data.forEach(layer => synapses.push(matrix(layer.data)));

        return new Brain(synapses);
    }

    public mutate(mutationRate: number): Brain {
        const newSynapses = this.synapses.map((layer) =>
            layer.map(synapse => {
                if (Math.random() < mutationRate) {
                    return Brain.createRandomSynapse();
                }
                return synapse;
            })
        );

        return new Brain(newSynapses);
    }

    private static createRandomSynapse(): number {
        return (Math.random() - Math.random()) / 100;
    }

    // Расчет на основе рекуррентной нейронки
    public decide(
        currentTime: number,
        moneyAmount: number,
        securityAmount: number,
        prices: SecuritiesPrices,
        candles: CandlesMap
    ): BrainDecision {
        const signals = matrix().resize([this.currentInputSignalsCount]);
        let outputSignals: Matrix;

        let signalsIndex = 0;
        signals.set([signalsIndex++], currentTime);
        signals.set([signalsIndex++], moneyAmount);

        prices.forEach((price, securityIndex) => {
            signals.set([signalsIndex++], price);
            signals.set([signalsIndex++], securityAmount);

            // EMPTY_CANDLE, если продажи ценной бумаги прекращены
            (candles.get(securityIndex) || [EMPTY_CANDLE]).forEach((candle) => {
                for (let i = 0; i < CANDLE_LENGTH; i++) {
                    signals.set([i + signalsIndex++], candle[i]);
                }
                 
                outputSignals = this.calculateDecision(signals);

                for (let i = Brain.valuableOutputSignalsCount; i < outputSignals.size()[0]; i++) {
                    // Копируем полученные сигналы данных во входные
                    signals.set([signalsIndex++], outputSignals.get([i]));
                }

                signalsIndex = Brain.valuableInputSignalsCount - CANDLE_LENGTH;
            });

            signalsIndex -= 2;
        });

        return {
            buyProbability: outputSignals.get([0]),
            sellProbability: outputSignals.get([1]),
            nothingProbability: outputSignals.get([2]),
            securityProportion: outputSignals.get([3]),
        };
    }

    private calculateDecision(inputSignals: Matrix): Matrix {
        let outputSignals = this.synapses.reduce(
            (vector, matrix) => multiply(matrix, vector),
            inputSignals
        );

        return outputSignals.map(Brain.applySigmoid);
    }

    private static applySigmoid(x: number): number {
        return 1.0 / (1.0 + Math.pow(e, -0.1 * x));
    }

    /**
     * @see decide
     */
    static get valuableInputSignalsCount(): number {
        return 3 + 2 + CANDLE_LENGTH;
    }

    /**
     * @see BrainDecision
     */
    static get valuableOutputSignalsCount(): number {
        return 4;
    }

    get currentDataSignalsCount(): number {
        return this.synapses[0].size()[1] - Brain.valuableInputSignalsCount;
    }

    get currentInputSignalsCount(): number {
        return this.synapses[0].size()[1]; // кол-во столбцов в первой матрице
    }

    get currentOutputSignalsCount(): number {
        return this.synapses[this.synapses.length - 1].size()[0]; // кол-во строк в последней матрице
    }

    getSynapses(): Synapses {
        return this.synapses;
    }
}