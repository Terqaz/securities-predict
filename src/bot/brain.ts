import * as tf from '@tensorflow/tfjs-node-gpu'

import { CANDLE_LENGTH, NormalizedCandle } from '../types';

export type BrainDecision = {
    buyProbability: number,
    sellProbability: number,
    nothingProbability: number,
    // процент количества бумаги по сделке от максимально доступного кол-ва в зависимости
    // от кол-ва доступных денег и кол-ва данной бумаги в наличии
    securityProportion: number,
};

export type Synapses = tf.LayersModel;

export class Brain {
    public readonly synapses: Synapses;
    private readonly stateSignalsCount: number;

    private constructor(synapses: Synapses, stateSignalsCount: number) {
        this.synapses = synapses;
        this.stateSignalsCount = stateSignalsCount;
    }
    
    static createRandom(stateSignalsCount: number): Brain {
        return new Brain(Brain.createModel(stateSignalsCount), stateSignalsCount);
    }

    static createFromModel(model: Synapses, stateSignalsCount: number): Brain {
        model.compile({ loss: 'categoricalCrossentropy', optimizer: 'sgd' });

        return new Brain(model, stateSignalsCount);
    }

    public mutate(mutationRate: number, mutationBias: number): Brain {
        const newWeights: tf.Tensor<tf.Rank>[] = [];

        this.synapses.getWeights().forEach(layer => {
            const newLayerSynapses = layer.dataSync().map(synapse => {
                if (Math.random() < mutationRate) {
                    return synapse + mutationBias * Math.random()
                }
                return synapse;
            });

            // todo layer.dispose();

            newWeights.push(tf.tensor(newLayerSynapses, layer.shape));
        });

        const newModel = Brain.createModel(this.stateSignalsCount);
        newModel.setWeights(newWeights);

        return new Brain(newModel, this.stateSignalsCount);
    }

    private static createModel(stateSignalsCount: number): tf.Sequential {
        const initializer = tf.initializers.randomNormal({});
        const model = tf.sequential();
        
        model.add(tf.layers.lstm({
            name: 'lstm',
            // кол-во чисел в передаваемом состоянии
            units: stateSignalsCount,
            // Текущие данные по состоянию: currentTime, moneyAmount, securityAmount, 
            // свеча
            inputShape: [null, 3 + CANDLE_LENGTH],
            returnSequences: false,
            dropout: 0.05,
            kernelInitializer: initializer,
        }));

        /** @see BrainDecision */
        model.add(tf.layers.dense({
            units: 4,
            activation: 'relu',
            kernelInitializer: initializer
        }));

        model.compile({ loss: 'categoricalCrossentropy', optimizer: 'sgd' });

        return model;
    }

    // Расчет на основе рекуррентной нейронки
    public decide(
        currentTime: number,
        moneyAmount: number,
        securityAmount: number,
        securityCandles: NormalizedCandle[]
    ): BrainDecision {
        const currentStateTensor = tf.tensor3d([[[currentTime, moneyAmount, securityAmount]]]);
        const securityCandlesTensor = tf.tensor3d([securityCandles]);

        const inputs = tf.concat([
            // Умножаем на каждую цену
            currentStateTensor.tile([1, securityCandles.length, 1]),
            securityCandlesTensor
        ], 2);

        /** @ts-ignore-next-line */
        const outputSignals = this.synapses.predict(inputs).dataSync();

        return {
            buyProbability: outputSignals[1],
            sellProbability: outputSignals[1],
            nothingProbability: outputSignals[2],
            securityProportion: outputSignals[3],
        };
    }
}