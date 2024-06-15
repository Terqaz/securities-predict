import { Component, ParameterSettings } from "./component";

type Parameters = {
    name: 'text',
    min: 'attr',
    step: 'attr',
    max: 'attr',
    input: 'value'
};

export class Slider extends Component<Parameters> {
    constructor(
        name: string,
        input: number,
        min = 0,
        step = 1,
        max = 100
    ) {
        super('slider', `slider`, {
            name: {
                value: name,
                readonly: true,
            },
            min: {
                type: 'attr',
                to: 'input',
                value: min,
            },
            step: {
                type: 'attr',
                to: 'input',
                value: step,
            },
            max: {
                type: 'attr',
                to: 'input',
                value: max,
            },
            input: {
                type: 'value',
                value: input
            },
        });
    }

    protected postChange(): void {        
        this.updateValue('value', this.params.input.value, 'text');
    }
}
