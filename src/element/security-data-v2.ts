import $ from "jquery";
import { Component, ParameterSettings } from "./component";
import { CANDLE_INDEX_CLOSE, CANDLE_INDEX_END, Candle } from "../types";
import { Dots } from "../service/candles-analytics";
import { LineMultiChart } from "./chart/line-multi-chart";
import { Slider } from "./slider";
import { ScatterMultiChart } from "./chart/scatter-multi-chart";
import { FFT } from "../service/fft/dsp";
import { DefaultDataPoint } from "chart.js";

type Parameters = {
    id: 'data-attr',
    name: 'text'
}

export class SecurityData extends Component<Parameters> {
    private candles: Candle[];
    private frequenciesDots: Dots;
    private fft: typeof FFT;

    private minFrequencySlider: Slider;
    private predictCountSlider: Slider;

    constructor(
        securityId: string,
        candles: Candle[],
        frequenciesDots: Dots,
        fft: typeof FFT
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
        this.frequenciesDots = frequenciesDots;
        this.fft = fft;
    }

    postCreate(): void {
        this.$body
            .find('.security-data__name')
            .on('click', this.updateTitle.bind(this))
            .on('click', this.toggleCharts.bind(this));
    }

    private updateTitle(e): void {
        const $target = $(e.target);

        this.updateValue(
            'name',
            `${this.$body.data('id')} ${$target.text().endsWith('<') ? '>' : '<'}`
        );
    }

    private toggleCharts(e): void {
        if (this.$body.data('chartsDisplayed')) {
            this.$body.find(`.${this.type}__body`).toggleClass('hide');
            return;
        }
        this.$body.data('chartsDisplayed', true);

        this.predictCountSlider = new Slider('Дней предсказания', 30, 0, 1, 365);

        const initialGraphChartLabels = this.candles.map(candle => candle[CANDLE_INDEX_END].slice(0, 10));

        const graphChart = new LineMultiChart(
            'График',
            this.getExtendedGraphLabels(initialGraphChartLabels),
            [{
                label: 'График',
                /** @ts-ignore-next-line */
                data: this.candles.map(candle => candle[CANDLE_INDEX_CLOSE])
            }]
            // []
        );
        graphChart.$body.appendTo(this.$body.find('.charts'));

        const frequencies = this.frequenciesDots.map(dot => dot[0]);
        const amplitudes = this.frequenciesDots.map(dot => dot[1]);
        const maxAmplitude = Math.max(...amplitudes);
        const avgAmplitude = maxAmplitude / this.frequenciesDots.length;

        this.minFrequencySlider = new Slider(
            'Минимальная амплитуда',
            avgAmplitude * 25,
            0,
            maxAmplitude / 1000,
            avgAmplitude * 50
        );

        const filteredFrequenciesData = this.getFilteredFrequenciesData(frequencies, amplitudes);

        const frequenciesChart = new ScatterMultiChart('Частоты', filteredFrequenciesData[0], [{
            label: 'Частоты',
            data: filteredFrequenciesData[1]
        }]);
        frequenciesChart.$body.appendTo(this.$body.find('.charts'));

        const approximationGraph = this.getApproximationGraph(filteredFrequenciesData[0], this.fft);

        /** @ts-ignore-next-line */
        graphChart.add('Аппроксимация', approximationGraph);

        this.minFrequencySlider.$body.on('change', e => {
            e.stopPropagation();
            e.preventDefault();
            this.minFrequencySlider.update({
                input: {value: +$(e.target).val()}
            });

            console.log(+this.predictCountSlider.getValue('input'));
            

            const filteredFrequenciesData = this.getFilteredFrequenciesData(frequencies, amplitudes);

            graphChart.updateChart(chart => {
                /** @ts-ignore-next-line */
                chart.data.datasets[1].data = this.getApproximationGraph(filteredFrequenciesData[0], this.fft);
            });

            frequenciesChart.updateChart(chart => {
                [chart.data.labels, chart.data.datasets[0].data] = filteredFrequenciesData;
            });
        });

        this.predictCountSlider.$body.on('change', e => {
            graphChart.updateChart(chart => {
                /** @ts-ignore-next-line */
                chart.data.labels = this.getExtendedGraphLabels(initialGraphChartLabels);

                /** @ts-ignore-next-line */
                chart.data.datasets[1].data = this.getApproximationGraph(
                    filteredFrequenciesData[0],
                    this.fft
                );
            });
        });

        const $securityDataBody = this.$body.find(`.${this.type}__body`);
        $securityDataBody.prepend(this.predictCountSlider.$body);
        $securityDataBody.prepend(this.minFrequencySlider.$body);
    }

    private getExtendedGraphLabels(initialDates: string[]): string[] {
        const predictCount = +this.predictCountSlider.getValue('input');

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

    private getFilteredFrequenciesData(frequencies: number[], amplitudes: number[]): [number[], number[]] {
        const minValue = +this.minFrequencySlider.getValue('input');

        return [
            minValue > 0.00000001
                ? frequencies.filter((_, i) =>
                    amplitudes[i] >= minValue
                )
                : frequencies,

            minValue > 0.00000001
                ? amplitudes.filter(x =>
                    x >= minValue
                )
                : amplitudes
        ]
    };

    private getApproximationGraph1(frequencies: number[], amplitudes: number[]): Float64Array {
        const approximationGraph = new Float64Array(length);

        if (frequencies[0] === 0) {
            // Значение 0 в массиве частот - смещение графика по y
            const yBias = amplitudes[0];

            approximationGraph.forEach((_, i) => {
                approximationGraph[i] += yBias;
            });
        }

        approximationGraph.forEach((x, i) => {
            frequencies.forEach((frequency, frequencyI) => {
                if (frequency === 0) {
                    return;
                }

                const amplitude = amplitudes[frequencyI];
                const argument = (2 * Math.PI / frequency) * i;
                approximationGraph[i] += amplitude * (Math.sin(argument));
                // approximationGraph[i] += amplitude * (Math.cos(argument) + Math.sin(argument));
            });
        });

        return approximationGraph;
    }

    private getApproximationGraph2(frequencies: number[], fft: typeof FFT): Float64Array {
        const bufferSize = fft.real.length;
        const real = new Float64Array(fft.real);
        const imag = new Float64Array(fft.imag);

        const frequenciesSet = new Set(frequencies);
        real.slice(0, bufferSize / 2).forEach((x, i) => {
            if (!frequenciesSet.has(i)) {
                real[i] = 0;
                imag[i] = 0;

                if (i > 0) {
                    real[bufferSize - i] = 0;
                    imag[bufferSize - i] = 0;
                }
            }
        })

        return fft.inverse(real, imag);
    }

    private getApproximationGraph(frequencies: number[], fft: typeof FFT): Float64Array {
        const predictCount = +this.predictCountSlider.getValue('input');

        const TWO_PI = 2 * Math.PI;

        const bufferSize = fft.real.length;
        const real = fft.real;
        const imag = fft.imag;

        const bSi = 2 / bufferSize;
        const approximationGraph = new Float64Array(bufferSize + predictCount);

        if (frequencies[0] === 0) {
            // Значение 0 в массиве частот - смещение графика по y
            // const yBias = bSi * Math.sqrt(real[0] * real[0] + imag[0] * imag[0]);
            const yBias = bSi / 2;

            approximationGraph.forEach((_, i) => {
                approximationGraph[i] += yBias;
            });
        }

        approximationGraph.forEach((y, x) => {
            frequencies.forEach(frequency => {
                if (frequency === 0) {
                    return;
                }

                const argument = (TWO_PI * frequency / bufferSize) * x;
                approximationGraph[x] += bSi * (real[frequency] * Math.cos(argument) - imag[frequency] * Math.sin(argument));
            });
        });

        return approximationGraph;
    }
}