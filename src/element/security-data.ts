import $ from "jquery";
import { Component } from "./component";
import { CANDLE_INDEX_CLOSE, CANDLE_INDEX_END, Candle } from "../types";
import { LineMultiChart } from "./chart/line-multi-chart";
import { Slider } from "./slider";
import { ScatterMultiChart } from "./chart/scatter-multi-chart";
import { FFT } from "../service/fft/dsp";
import { CandlesAnalytics } from "../service/candles-analytics";
import { Point } from "./chart/multi-chart";

const EPSILON = 0.00000001;
const PREDICT_COUNT = 3 * 365;

type GraphPlaceParams = {
    toEnd?: boolean
};

type SliderUpdates = {
    predictBasisBufferPower?: number
    minFrequencyValue?: number
};

type Parameters = {
    id: 'data-attr',
    name: 'text'
}

export class SecurityData extends Component<Parameters> {
    private candles: Candle[];

    private predictBasisBufferPower: number = 10;
    private minFrequencyValue?: number;

    private graphLabels: string[];
    private fft: typeof FFT;
    private frequencies: number[];
    private amplitudes: number[];

    constructor(
        securityId: string,
        candles: Candle[],
    ) {
        super('security-data', 'security-data', {
            id: {
                type: 'data-attr',
                value: securityId,
                readonly: true
            },
            name: {
                type: 'text',
                value: `${securityId} >`,
            }
        });

        this.candles = candles;
    }

    postCreate(): void {
        this.$body.find('.security-data__name')
            .on('click', this.updateTitle.bind(this))
            .on('click', this.toggleCharts.bind(this));
            
        this.$body.find(`.${this.type}__auto-count`)
            .on('click', this.autoCount.bind(this))
    }

    private updateTitle(e): void {
        const $target = $(e.target);

        this.updateValue(
            'name',
            `${this.$body.data('id')} ${$target.text().endsWith('<') ? '>' : '<'}`
        );
    }

    private toggleCharts(e): void {
        this.$body.find(`.${this.type}__body`).toggleClass('hide');

        if (this.$body.data('chartsDisplayed')) {
            return;
        }
        this.$body.data('chartsDisplayed', true);

        this.graphLabels = SecurityData.getExtendedGraphLabels(
            this.candles.map(candle =>
                candle[CANDLE_INDEX_END].slice(0, 10)
            ),
            PREDICT_COUNT
        );

        const graphChart = new LineMultiChart(
            'График',
            this.graphLabels,
            [{
                label: 'График',
                /** @ts-ignore-next-line */
                data: SecurityData.formatGraphData(
                    this.candles.map(candle => candle[CANDLE_INDEX_CLOSE]),
                    this.graphLabels
                )
            }]
        );
        graphChart.$body.appendTo(this.$body.find(`.${this.type}__charts`));

        const {
            approximationGraph,
            frequencies,
            amplitudes
        } = this.updateFFTApproximation();

        const frequenciesChart = new ScatterMultiChart('Частоты', [{
            label: 'Частоты',
            data: SecurityData.formatGraphData(amplitudes, frequencies)
        }]);
        frequenciesChart.$body.appendTo(this.$body.find('.charts'));

        /** @ts-ignore-next-line */
        graphChart.add('Аппроксимация', approximationGraph);

        const maxAmplitude = Math.max(...this.amplitudes);
        const avgAmplitude = maxAmplitude / (this.fft.bufferSize >> 1);

        const minFrequencySlider = new Slider(
            'Минимальная амплитуда',
            avgAmplitude * 40,
            0,
            maxAmplitude / 1000,
            avgAmplitude * 50
        );

        minFrequencySlider.$body.find('.slider__input').on('change', e => {
            const $target = $(e.target)
            const minFrequencyValue = +$target.val();

            minFrequencySlider.update();

            const {
                approximationGraph,
                frequencies,
                amplitudes
            } = this.updateFFTApproximation({ minFrequencyValue });

            graphChart.updateChart(chart => {
                /** @ts-ignore-next-line */
                chart.data.datasets[1].data = approximationGraph;
            });

            frequenciesChart.updateChart(chart => {
                /** @ts-ignore-next-line */
                chart.data.datasets[0].data = SecurityData.formatGraphData(
                    amplitudes,
                    frequencies
                );
            });
        });

        const predictBasisBufeerPowerSlider = new Slider(
            'Степень буфера для предсказания',
            this.predictBasisBufferPower,
            7,
            1,
            CandlesAnalytics.getClosestDownwardPower2(this.candles.length)
        );

        predictBasisBufeerPowerSlider.$body.find('.slider__input').on('change', e => {
            const $target = $(e.target)
            const predictBasisBufferPower = +$target.val();

            predictBasisBufeerPowerSlider.update();

            const {
                approximationGraph,
                frequencies,
                amplitudes
            } = this.updateFFTApproximation({ predictBasisBufferPower });

            const maxAmplitude = Math.max(...this.amplitudes);
            const avgAmplitude = maxAmplitude / (this.fft.bufferSize >> 1);

            minFrequencySlider.update({
                input: { value: avgAmplitude * 40 },
                min: { value: 0 },
                step: { value: maxAmplitude / 1000 },
                max: { value: avgAmplitude * 50 }
            });

            graphChart.updateChart(chart => {
                /** @ts-ignore-next-line */
                chart.data.datasets[1].data = approximationGraph;
            });

            frequenciesChart.updateChart(chart => {
                chart.data.datasets[0].data = SecurityData.formatGraphData(
                    amplitudes,
                    frequencies
                );
            });
        });

        const $securityDataBody = this.$body.find(`.${this.type}__body`);
        $securityDataBody.prepend(predictBasisBufeerPowerSlider.$body);
        $securityDataBody.prepend(minFrequencySlider.$body);
    }

    private static getExtendedGraphLabels(initialDates: string[], predictCount: number): string[] {
        const dateGenerator = (function* (startDate: Date, count: number): Generator<string> {
            let nextDate = new Date(startDate);
            while (count > 0) {
                nextDate.setUTCDate(nextDate.getUTCDate() + 1);

                yield nextDate.toISOString().slice(0, 10);
                --count;
            }
        })(
            new Date(initialDates[initialDates.length - 1]),
            predictCount
        );

        return [...initialDates, ...dateGenerator];
    }

    private autoCount(e) {

    }

    private updateFFTApproximation(updates?: SliderUpdates): {
        approximationGraph: Point[],
        frequencies: number[],
        amplitudes: number[],
    } {
        const newPredictBasisBufferPower = updates?.predictBasisBufferPower || this.predictBasisBufferPower;
        let newMinFrequencyValue = updates?.minFrequencyValue || this.minFrequencyValue;

        const firstTime = !newMinFrequencyValue;
        let needFrequenciesFilter = false;

        if (firstTime || this.predictBasisBufferPower !== newPredictBasisBufferPower) {
            this.predictBasisBufferPower = newPredictBasisBufferPower;
            needFrequenciesFilter = true;

            const bufferSize = 2 ** newPredictBasisBufferPower;
            const halfBufferSize = bufferSize >> 1;

            this.fft = CandlesAnalytics.countFFT(this.candles, bufferSize);

            if (this.frequencies) {
                this.frequencies.length = 0;
            }
            if (this.amplitudes) {
                this.amplitudes.length = 0;
            }

            this.frequencies = new Array<number>(halfBufferSize);
            this.amplitudes = new Array<number>(halfBufferSize);
            this.fft.spectrum.forEach((x, i) => {
                this.frequencies[i] = i;
                this.amplitudes[i] = x;
            });

            if (firstTime) {
                const maxAmplitude = Math.max(...this.amplitudes);
                const avgAmplitude = maxAmplitude / halfBufferSize;
                this.minFrequencyValue = newMinFrequencyValue = avgAmplitude * 25;
            }
        }

        let frequencies = this.frequencies;
        let amplitudes = this.amplitudes;
        if (
            needFrequenciesFilter
            || this.minFrequencyValue !== newMinFrequencyValue
        ) {
            this.minFrequencyValue = newMinFrequencyValue;

            if (newMinFrequencyValue > EPSILON) {
                frequencies = this.frequencies.filter((_, i) =>
                    this.amplitudes[i] >= newMinFrequencyValue
                );

                amplitudes = this.amplitudes.filter(x =>
                    x >= newMinFrequencyValue
                );
            }
        }

        const approximationGraph = SecurityData.formatGraphData(
            this.getApproximationGraph(PREDICT_COUNT, frequencies),
            this.graphLabels,
            { toEnd: true }
        );

        return {
            approximationGraph,
            frequencies,
            amplitudes,
        };
    };

    /** Берем последние predictCount свеч из графика и экстраполируем на predictCount периодов */
    private getApproximationGraph(predictCount: number, frequencies: number[]): Float64Array {
        const TWO_PI = 2 * Math.PI;

        const halfBufferSize = this.fft.real.length;
        
        // const halfBufferSize = this.fft.bufferSize;
        const real = this.fft.real;
        const imag = this.fft.imag;

        const bSi = 2 / halfBufferSize;
        const approximationGraph = new Float64Array(halfBufferSize + predictCount);

        if (frequencies[0] === 0) {
            // Значение 0 в массиве частот - смещение графика по y
            const yBias = bSi / 2 * Math.sqrt(real[0] * real[0] + imag[0] * imag[0]);
            
            approximationGraph.forEach((_, i) => {
                approximationGraph[i] += yBias;
            });
        }

        approximationGraph.forEach((y, x) => {
            frequencies.forEach(frequency => {
                if (frequency === 0) {
                    return;
                }

                const argument = (TWO_PI * frequency / halfBufferSize) * x;
                approximationGraph[x] += bSi * (real[frequency] * Math.cos(argument) - imag[frequency] * Math.sin(argument));
            });
        });

        return approximationGraph;
    }

    private static formatGraphData(data: number[] | Float64Array, labels: (number | string)[], params?: GraphPlaceParams): Point[] {
        const graph = new Array<Point>(data.length);

        let start = 0;
        let end = data.length;

        if (params?.toEnd) {
            start = labels.length - 1 - data.length;
            end = labels.length - 1;
        }

        for (let i = start, j = 0; i < end; i++, j++) {
            graph[j] = {
                x: labels[i],
                y: data[j]
            };
        }

        return graph;
    }
}