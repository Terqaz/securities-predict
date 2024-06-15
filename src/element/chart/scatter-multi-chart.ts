import { ChartDataset } from "chart.js/auto";
import { ChartData, DataType, LabelType, MultiChart } from "./multi-chart";

type ChartType = 'scatter';

type Parameters = {
    name: 'text'
};

export class ScatterMultiChart extends MultiChart<ChartType, Parameters> {
    constructor(
        name: string,
        linesData: ChartData<ChartType>[]
    ) {
        super(
            'scatter',
            {
                name: {
                    type: 'text',
                    value: name,
                    readonly: true,
                }
            },
            [],
            linesData,
            {
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom'
                    }
                },
                // responsive: false,
                // maintainAspectRatio: false,
                // resizeDelay: 500
            },
        );
    }

    // todo
    protected createDatasetConfig(label: string, data: DataType<ChartType>): ChartDataset<ChartType, DataType<ChartType>> {
        return {
            type: this.chartType,
            label,
            data,
            parsing: false,
            pointRadius: 2,
            animations: {
                x: false,
                colors: false,
            },
            transitions: {
                active: {
                    animation: {
                        duration: 0
                    }
                }
            }
        };
    }
}