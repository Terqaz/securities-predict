import { Candle } from "../types";
import { FFT } from "./fft/dsp";

export class CandlesAnalytics {
    static countFFT(candles: Candle[], bufferSize): typeof FFT {
        const start = candles.length - bufferSize;
        const end = candles.length;
        let closings = candles
            .slice(start, end)
            .map(candle => candle[1]);

        const fft = new FFT(bufferSize, 2 * bufferSize);
        fft.forward(closings);

        return fft;
    }

    static getClosestDownwardPower2(x: number): number {
        return Math.floor(Math.log2(x));
    }
}