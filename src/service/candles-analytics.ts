import { Candle, NumberArray } from "../types";
import { FFT } from "./fft/dsp";

export class CandlesAnalytics {
    static countFFT(candles: Candle[]): typeof FFT {
        const closings = candles.map(candle => candle[1]);

        const fft = new FFT(closings.length, 2 * closings.length);
        fft.forward(closings);

        return fft;
    }

    static getClosestDownwardPower2(x: number): number {
        return Math.floor(Math.log2(x));
    }

    static countRootMeanSquareError(a: NumberArray, b: NumberArray): number {
        return Math.sqrt(CandlesAnalytics.countAverage(a.map((x, i) => Math.pow((x - b[i]), 2))));
    }

    static countPearsonCorrelation(a: NumberArray, b: NumberArray): number {
        const aAvg = CandlesAnalytics.countAverage(a);
        const bAvg = CandlesAnalytics.countAverage(b);

        // Стандартные отклонения
        const aDev = Math.sqrt(CandlesAnalytics.countSum(a.map(x => Math.pow((x - aAvg), 2))));
        const bDev = Math.sqrt(CandlesAnalytics.countSum(a.map(x => Math.pow((x - aAvg), 2))));

        const covariance = a.reduce(
            (prev, curr, i) => prev + (curr - aAvg) * (b[i] - bAvg),
            0
        );

        return covariance / (aDev * bDev);
    }

    static countAverage(a: NumberArray): number {
        return CandlesAnalytics.countSum(a) / a.length;
    }

    static countSum(a: NumberArray): number {
        return a.reduce((prev, current) => prev + current);
    }
}