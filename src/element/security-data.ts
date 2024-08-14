import $ from "jquery";
import { Component } from "./component";
import { CANDLE_INDEX_CLOSE, CANDLE_INDEX_END, Candle, NumberArray } from "../types";
import { LineMultiChart } from "./chart/line-multi-chart";
import { Slider } from "./slider";
import { ScatterMultiChart } from "./chart/scatter-multi-chart";
import { FFT } from "../service/fft/dsp";
import { CandlesAnalytics } from "../service/candles-analytics";
import { Point } from "./chart/multi-chart";

const EPSILON = 0.00000001;
const PREDICT_COUNT = 365;
const MOVING_AVERAGE_PERIOD = 90;

type GraphPlaceParams = {
    fromEnd?: boolean,
    bias?: number
};

type ChartsUpdates = {
    frequencies?: number[],
    amplitudes?: number[],
    approximationFFTProportion?: number
};

type ApproximationUpdates = {
    predictBasisBufferPower?: number,
    minAmplitudeValue?: number,
    dateBias?: number,
};

enum Charts {
    Closings,
    FFTApproximation,
    ClosingsMovingAverage,
    Approximation,
    ForecastRest,
};

type Parameters = {
    id: 'data-attr',
    name: 'text'
}

export class SecurityData extends Component<Parameters> {
    private candles: Candle[];

    private predictBasisBufferPower: number = 6;
    private dateBias: number = 0;
    private minAmplitudeValue: number | undefined;
    private approximationFFTProportion: number = 0.5;

    private predictBasisBufferPowerSlider: Slider;
    private approximationDateBiasSlider: Slider;
    private minAmplitudeSlider: Slider;
    private approximationFFTProportionSlider: Slider;

    private graphLabels: string[];

    private fft: typeof FFT;
    private frequencies: number[];
    private amplitudes: number[];

    private closings: number[];
    private fftApproximation: Float64Array;
    private movingAverage: Float64Array;
    private approximation: Float64Array;

    private graphChart: LineMultiChart;
    private frequenciesChart: ScatterMultiChart;

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

        this.closings = candles.map(candle => candle[CANDLE_INDEX_CLOSE]);
    }

    postCreate(): void {
        this.$body.find('.security-data__name')
            .on('click', this.updateTitle.bind(this))
            .on('click', this.toggleCharts.bind(this));

        this.getElement('auto-count')
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
        this.getElement('body').toggleClass('hide');

        if (this.$body.data('chartsDisplayed')) {
            return;
        }
        this.$body.data('chartsDisplayed', true);

        this.graphLabels = SecurityData.getExtendedGraphLabels(
            this.candles.map(candle => candle[CANDLE_INDEX_END].slice(0, 10)),
            PREDICT_COUNT
        );

        const {
            frequencies,
            amplitudes
        } = this.updateFFTApproximationData();

        this.graphChart = new LineMultiChart(
            'График',
            this.graphLabels,
            [{
                label: 'График',
                /** @ts-ignore-next-line */
                data: this.getClosingsGraph()
            }, {
                label: 'Обратное FFT',
                /** @ts-ignore-next-line */
                data: this.getFFTApproximationGraph(PREDICT_COUNT, frequencies)
            }, {
                label: 'Скользящая кривая',
                /** @ts-ignore-next-line */
                data: this.getClosingsMovingAverageGraph(MOVING_AVERAGE_PERIOD)
            }, {
                label: 'Аппроксимация',
                /** @ts-ignore-next-line */
                data: this.getApproximationGraph()
            }, {
                label: 'Остаток при предсказании',
                /** @ts-ignore-next-line */
                data: this.getForecastRestGraph()
            }]
        );

        this.frequenciesChart = new ScatterMultiChart('Частоты', [{
            label: 'Частоты',
            data: SecurityData.formatGraphData(amplitudes, frequencies)
        }]);

        const maxAmplitude = Math.max(...this.amplitudes);
        const avgAmplitude = maxAmplitude / (this.fft.bufferSize >> 1);
        this.minAmplitudeSlider = new Slider(
            'Минимальная амплитуда',
            avgAmplitude * 40,
            0,
            maxAmplitude / 1000,
            avgAmplitude * 50
        );

        this.minAmplitudeSlider.getElement('input').on('change', e => {
            const $target = $(e.target)
            const minAmplitudeValue = +$target.val();

            // todo
            this.minAmplitudeSlider.update({ input: minAmplitudeValue });

            const {
                frequencies,
                amplitudes
            } = this.updateFFTApproximationData({ minAmplitudeValue });

            this.updateCharts({ frequencies, amplitudes });
        });

        const bufferSize = Math.pow(2, this.predictBasisBufferPower);
        this.approximationDateBiasSlider = new Slider(
            'Смещение аппроксимации',
            0,
            -Math.min(bufferSize, this.candles.length - bufferSize),
            14,
            0
        );

        this.approximationDateBiasSlider.getElement('input').on('change', e => {
            const $target = $(e.target)
            const bias = +$target.val();

            // todo
            this.approximationDateBiasSlider.update({ input: bias });

            const {
                frequencies,
                amplitudes
            } = this.updateFFTApproximationData({ dateBias: bias });

            this.updateMinFrequencySlider();
            this.updateCharts({ frequencies, amplitudes });
        });

        this.predictBasisBufferPowerSlider = new Slider(
            'Степень буфера для предсказания',
            this.predictBasisBufferPower,
            6,
            1,
            CandlesAnalytics.getClosestDownwardPower2(this.candles.length)
        );

        this.predictBasisBufferPowerSlider.getElement('input').on('change', e => {
            const $target = $(e.target)
            const power = +$target.val();

            // todo
            this.predictBasisBufferPowerSlider.update({ input: power });

            this.updateMinFrequencySlider();
            this.updateApproximationDateBiasSlider();

            const {
                frequencies,
                amplitudes
            } = this.updateFFTApproximationData({
                predictBasisBufferPower: power,
                dateBias: this.approximationDateBiasSlider.getValue<number>('input'),
                minAmplitudeValue: this.minAmplitudeSlider.getValue<number>('input')
            });

            this.updateCharts({ frequencies, amplitudes });
        });

        this.approximationFFTProportionSlider = new Slider('Доля FFT в аппроксимации', 0.5, 0, 0.01, 1);

        this.approximationFFTProportionSlider.getElement('input').on('change', e => {
            const $target = $(e.target)
            const proportion = +$target.val();

            // todo
            this.approximationFFTProportionSlider.update({ input: proportion });

            this.updateCharts({ approximationFFTProportion: proportion });
        });

        this.getElement('charts').append(
            this.graphChart.$body,
            this.frequenciesChart.$body
        );

        this.getElement('body').prepend(
            this.predictBasisBufferPowerSlider.$body,
            this.approximationDateBiasSlider.$body,
            this.minAmplitudeSlider.$body,
            this.approximationFFTProportionSlider.$body,
        );
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
        const $autoCountStatus = this.getElement('auto-count-status');

        const updateAutoCountPercent = (percent) => $autoCountStatus.text(`Подсчет ${percent}%...`);

        updateAutoCountPercent(0);
        $autoCountStatus.removeClass('hide');

        const MIN_POWER = this.predictBasisBufferPowerSlider.getValue<number>('min');
        const MAX_POWER = this.predictBasisBufferPowerSlider.getValue<number>('max');
        const MIN_DATE_BIAS = -320;
        const DATE_BIAS_DIFF = -28;

        let bestResult: any = {
            error: Number.MAX_VALUE
        };

        for (let power = MIN_POWER, i = 0; power <= MAX_POWER; power++, i++) {
            // Либо проходимся по всему буферу, либо до конца свеч
            const bufferSize = Math.pow(2, power);
            const maxDateBias = -Math.min(
                this.candles.length - bufferSize - MOVING_AVERAGE_PERIOD,
                2 * bufferSize - MOVING_AVERAGE_PERIOD
            );

            for (let dateBias = MIN_DATE_BIAS; dateBias > maxDateBias; dateBias += DATE_BIAS_DIFF) {
                this.updateFFTApproximationData({
                    predictBasisBufferPower: power,
                    dateBias
                });

                const movingAverageChunk = this.movingAverage.slice(
                    this.movingAverage.length + dateBias,
                    this.movingAverage.length
                );

                const maxAmplitude = Math.max(...this.amplitudes);
                const avgAmplitude = maxAmplitude / (this.fft.bufferSize >> 1);

                let prevFrequenciesCount = this.fft.real.length;
                for (
                    let minAmplitudeMultiplier = 1;
                    avgAmplitude * minAmplitudeMultiplier < maxAmplitude;
                    minAmplitudeMultiplier += 1
                ) {
                    const { frequencies } = this.updateFFTApproximationData({
                        minAmplitudeValue: avgAmplitude * minAmplitudeMultiplier
                    });

                    if (frequencies.length === prevFrequenciesCount) {
                        continue;
                    }
                    prevFrequenciesCount = frequencies.length;

                    if (frequencies.length <= 2) {
                        break;
                    }

                    for (let fftProportion = 0; fftProportion < 1; fftProportion += 0.1) {
                        let approximation = movingAverageChunk;

                        if (fftProportion > 0) {
                            approximation = this.getFFTApproximation(-dateBias, frequencies);

                            if (Math.abs(fftProportion - 1) > EPSILON) {
                                approximation = approximation.map((x, i) =>
                                    fftProportion * x
                                    + (1 - fftProportion) * movingAverageChunk[i]
                                );
                            }
                        }

                        const error = CandlesAnalytics.countRootMeanSquareError(
                            this.closings.slice(this.candles.length + dateBias),
                            approximation
                        );

                        // console.log({error, power, dateBias, minAmplitudeMultiplier, frequenciesLength: frequencies.length});

                        if (error < bestResult.error) {
                            bestResult = {
                                error,
                                power,
                                dateBias,
                                minAmplitudeMultiplier,
                                fftProportion,
                                fft: this.fft,
                                frequencies: this.frequencies,
                                amplitudes: this.amplitudes,
                            };

                            console.log(error, fftProportion);
                        }
                    }
                }
            }

            updateAutoCountPercent(i / (MAX_POWER - MIN_POWER));
        }

        if (bestResult.error > 10) {
            $autoCountStatus.text('Не удалось подобрать значения');

            return;
        }

        $autoCountStatus.text(`Ошибка аппроксимации ${bestResult.error}`);

        
        // Подставляем сохраненные данные, чтобы не пересчитывать fft
        this.predictBasisBufferPower = bestResult.power;
        this.predictBasisBufferPowerSlider.update({ input: bestResult.power });
        this.minAmplitudeValue = undefined;

        this.dateBias = bestResult.dateBias;

        this.fft = bestResult.fft;
        this.frequencies = bestResult.frequencies;
        this.amplitudes = bestResult.amplitudes;

        const { maxAmplitude, avgAmplitude } = this.updateMinFrequencySlider();

        this.approximationDateBiasSlider.update({ input: this.dateBias });
        this.updateApproximationDateBiasSlider();

        this.approximationFFTProportion = bestResult.fftProportion;
        this.approximationFFTProportionSlider.update({ input: bestResult.fftProportion });

        // Заново фильтруем частоты
        const {
            frequencies,
            amplitudes
        } = this.updateFFTApproximationData({
            minAmplitudeValue: avgAmplitude * bestResult.minAmplitudeMultiplier
        });

        this.updateCharts({ amplitudes, frequencies });
    }

    private updateFFTApproximationData(updates?: ApproximationUpdates): {
        frequencies: number[],
        amplitudes: number[],
    } {
        const newPredictBasisBufferPower = updates?.predictBasisBufferPower || this.predictBasisBufferPower;
        let newMinAmplitudeValue = updates?.minAmplitudeValue || this.minAmplitudeValue;
        let dateBias = updates?.dateBias || this.dateBias;

        const firstTime = !newMinAmplitudeValue;
        let needUpdateFrequenciesFilter = false;

        if (
            firstTime
            || this.predictBasisBufferPower !== newPredictBasisBufferPower
            || this.dateBias !== dateBias
        ) {
            this.predictBasisBufferPower = newPredictBasisBufferPower;
            this.dateBias = dateBias;
            needUpdateFrequenciesFilter = true;

            const bufferSize = Math.pow(2, newPredictBasisBufferPower);
            const halfBufferSize = bufferSize >> 1;
            
            this.fft = CandlesAnalytics.countFFT(this.candles.slice(
                this.candles.length - bufferSize + dateBias,
                this.candles.length + dateBias
            ));

            this.frequencies = new Array<number>(halfBufferSize);
            this.amplitudes = new Array<number>(halfBufferSize);
            this.fft.spectrum.forEach((x, i) => {
                this.frequencies[i] = i;
                this.amplitudes[i] = x;
            });

            if (firstTime) {
                const maxAmplitude = Math.max(...this.amplitudes);
                const avgAmplitude = maxAmplitude / halfBufferSize;
                this.minAmplitudeValue = newMinAmplitudeValue = avgAmplitude * 25;
            }
        }

        let frequencies = this.frequencies;
        let amplitudes = this.amplitudes;
        if (
            needUpdateFrequenciesFilter
            || this.minAmplitudeValue !== newMinAmplitudeValue
        ) {
            this.minAmplitudeValue = newMinAmplitudeValue;

            if (newMinAmplitudeValue > EPSILON) {
                frequencies = this.frequencies.filter((_, i) =>
                    this.amplitudes[i] >= newMinAmplitudeValue
                );

                amplitudes = this.amplitudes.filter(x =>
                    x >= newMinAmplitudeValue
                );
            }
        }

        return {
            frequencies,
            amplitudes,
        };
    };

    private updateCharts(updates: ChartsUpdates): void {
        const approximationFFTProportion = updates.approximationFFTProportion || this.approximationFFTProportion;

        this.graphChart.updateChart(chart => {
            const datasets = chart.data.datasets;

            if (updates.frequencies || updates.amplitudes) {
                datasets[Charts.FFTApproximation].data = this.getFFTApproximationGraph(PREDICT_COUNT, updates.frequencies);
                datasets[Charts.Approximation].data = this.getApproximationGraph(approximationFFTProportion);
                datasets[Charts.ForecastRest].data = this.getForecastRestGraph();

                return;
            }

            if (
                updates.approximationFFTProportion 
                && Math.abs(updates.approximationFFTProportion - this.approximationFFTProportion) > EPSILON
            ) {
                datasets[Charts.Approximation].data = this.getApproximationGraph(approximationFFTProportion);
                datasets[Charts.ForecastRest].data = this.getForecastRestGraph();
            }
        });

        if (updates.frequencies || updates.amplitudes) {
            this.frequenciesChart.updateChart(chart => {
                /** @ts-ignore-next-line */
                chart.data.datasets[0].data = SecurityData.formatGraphData(updates.amplitudes, updates.frequencies);
            });
        }
    }

    private updateMinFrequencySlider(): {
        maxAmplitude: number,
        avgAmplitude: number,
    } {
        const maxAmplitude = Math.max(...this.amplitudes);
        const avgAmplitude = maxAmplitude / (this.fft.bufferSize >> 1);
        this.minAmplitudeSlider.update({
            input: avgAmplitude * 40,
            step: maxAmplitude / 1000,
            max: avgAmplitude * 50,
        });

        return {
            maxAmplitude,
            avgAmplitude,
        }
    }

    private updateApproximationDateBiasSlider(): void {
        const bufferSize = Math.pow(2, this.predictBasisBufferPower);
        const minValue = bufferSize - this.candles.length;

        this.approximationDateBiasSlider.update({
            input: Math.max(
                minValue,
                this.approximationDateBiasSlider.getValue<number>('input')
            ),
            min: minValue,
        });
    }

    private getClosingsGraph(): Point[] {
        return SecurityData.formatGraphData(
            this.closings,
            this.graphLabels
        );
    }

    private getClosingsMovingAverageGraph(period: number): Point[] {
        this.movingAverage = new Float64Array(this.closings.length - period);

        let periodSum = this.closings.slice(0, period).reduce((a, b) => a + b);

        for (let i = 0, k = period; k < this.closings.length; i++, k++) {
            this.movingAverage[i] = periodSum / period;

            if (k < this.closings.length - 1) {
                periodSum = periodSum - this.closings[i] + this.closings[k + 1];
            }
        }

        return SecurityData.formatGraphData(
            this.movingAverage,
            this.graphLabels,
            { bias: period }
        );
    }

    private getApproximationGraph(fftProportion: number) {
        if (this.dateBias === 0) {
            return [];
        }

        this.approximation = new Float64Array(-this.dateBias);
        for (let i = 0; i < this.approximation.length; i++) {
            this.approximation[i] =
                (1 - fftProportion) * this.movingAverage.at(this.dateBias + i)
                + fftProportion * this.fftApproximation[this.fft.real.length + i];
        }

        return SecurityData.formatGraphData(
            this.approximation,
            this.graphLabels,
            { bias: this.closings.length - this.approximation.length }
        );
    }

    private getForecastRestGraph(): Point[] {
        if (this.dateBias === 0) {
            return [];
        }

        const forecastRest = new Float64Array(-this.dateBias);
        for (let i = 0; i < forecastRest.length; i++) {
            forecastRest[i] = this.closings.at(this.dateBias + i)
                - this.approximation.at(i);
        }

        return SecurityData.formatGraphData(
            forecastRest,
            this.graphLabels,
            { bias: this.closings.length - forecastRest.length }
        );
    }

    /** Берем последние predictCount свеч из графика и экстраполируем на predictCount периодов */
    private getFFTApproximationGraph(predictCount: number, frequencies: number[]): Point[] {
        const halfBufferSize = this.fft.real.length;
        this.fftApproximation = this.getFFTApproximation(halfBufferSize + predictCount - this.dateBias, frequencies);

        return SecurityData.formatGraphData(
            this.fftApproximation,
            this.graphLabels,
            { fromEnd: true }
        );
    }

    private getFFTApproximation(length: number, frequencies: number[]): Float64Array {
        const TWO_PI = 2 * Math.PI;

        const halfBufferSize = this.fft.real.length;
        const real = this.fft.real;
        const imag = this.fft.imag;
        const bSi = 2 / halfBufferSize;

        const approximation = new Float64Array(length);

        // Ф-ция периодическая, поэтому вычисляем максимум до halfBufferSize, а дальше копируем если нужно
        const countLength = Math.min(length, halfBufferSize);

        if (frequencies[0] === 0) {
            // Значение 0 в массиве частот - смещение графика по y
            const yBias = bSi / 2 * Math.sqrt(real[0] * real[0] + imag[0] * imag[0]);

            for (let x = 0; x < countLength; x++) {
                approximation[x] += yBias;
            }
        }

        for (let x = 0; x < countLength; x++) {
            frequencies.forEach(frequency => {
                if (frequency === 0) {
                    return;
                }

                const argument = (TWO_PI * frequency / halfBufferSize) * x;
                approximation[x] += bSi * (real[frequency] * Math.cos(argument) - imag[frequency] * Math.sin(argument));
            });
        }

        if (length > countLength) {
            for (let x = countLength; x < length; x++) {
                approximation[x] = approximation[x % countLength];
            }
        }

        return approximation;
    }

    private static formatGraphData(data: NumberArray, labels: (number | string)[], params?: GraphPlaceParams): Point[] {
        const graph = new Array<Point>(data.length);

        let start = 0;
        let end = data.length;

        if (params?.fromEnd) {
            start = labels.length - 1 - data.length;
            end = labels.length - 1;
        }

        if (params?.bias) {
            start += params.bias;
            end += params.bias;
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