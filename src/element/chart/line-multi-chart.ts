import { ChartDataset } from "chart.js/auto";
import { ChartData, DataType, LabelType, MultiChart } from "./multi-chart";

type ChartType = 'line';

type Parameters = {
    name: 'text'
};

export class LineMultiChart extends MultiChart<ChartType, Parameters> {
    constructor(
        name: string,
        labels: LabelType[],
        linesData: ChartData<ChartType>[]
    ) {
        super(
            'line',
            {
                name: {
                    type: 'text',
                    value: name,
                    readonly: true,
                }
            },
            labels,
            linesData);
    }

    // todo
    protected createDatasetConfig(label: string, data: DataType<ChartType>): ChartDataset<ChartType, DataType<ChartType>> {
        return {
            type: this.chartType,
            label,
            data,
            parsing: false,
            pointRadius: 0,
            // animations: {
            //     x: false,
            //     colors: false,
            // },
            // transitions: {
            //     active: {
            //         animation: {
            //             duration: 100
            //         }
            //     }
            // }
        };
    }
}