import { Chart, ChartDataset, ChartOptions, ChartTypeRegistry, DefaultDataPoint, Point as ChartJsPoint } from "chart.js/auto";
import { Component, ParameterSettings } from "../component";

export type DataType<TChart extends keyof ChartTypeRegistry> = DefaultDataPoint<TChart>;
export type LabelType = string | number;

export type ChartData<TChart extends keyof ChartTypeRegistry> = {
    label: string,
    data: DataType<TChart>
};

/** @ts-ignore-next-line */
export interface Point extends ChartJsPoint {
    x: number | string,
    y: number
};
 
type Parameters = {
    name: 'text'
};

export abstract class MultiChart<
    TChart extends keyof ChartTypeRegistry,
    TParams extends Parameters
> extends Component<TParams> {
    protected readonly chartType: keyof ChartTypeRegistry;
    protected readonly chart: Chart<TChart, DataType<TChart>, LabelType>;

    constructor(
        chartType: TChart,
        params: ParameterSettings<TParams>,
        labels: LabelType[],
        linesData: ChartData<TChart>[],
        options?: ChartOptions<TChart>
    ) {
        super('chart', `chart--${chartType}`, params);

        this.chartType = chartType;

        const datasets = linesData.map(({ label, data }) => this.createDatasetConfig(label, data));

        this.chart = new Chart(this.$body.find<HTMLCanvasElement>('.chart__image')[0], {
            type: chartType,
            data: {
                labels,
                datasets,
            },
            options
        });
    }

    add(label: string, data: Point[]): void {
        this.chart.data.datasets.push(this.createDatasetConfig(label, data));

        this.postUpdate();
    }

    updateChart(updater: (chart: Chart<TChart, DataType<TChart>, LabelType>) => void) {
        updater(this.chart);

        this.postUpdate();
    }

    protected postUpdate(): void {
        this.chart.update();
    }

    protected abstract createDatasetConfig<TChart extends keyof ChartTypeRegistry>(
        label: string,
        data: Point[]
    ): ChartDataset<TChart, Point[]>;
}