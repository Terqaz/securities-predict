import $ from "jquery";

type ValueParameterType = 'text' | 'value';
type AttrParameterType = 'attr' | 'data-attr'; // Атрибуты на родительском элементе
export type ParameterType = ValueParameterType | AttrParameterType;

type Parameters = {
    [key: string]: ParameterType
};

type ValueParameterSetting = {
    type?: ValueParameterType, // todo как-то убрать тип отсюда т.к. он уже передается в Parameters
    value?: string | number,
    readonly?: boolean,
};

type AttrParameterSetting = {
    type?: AttrParameterType, // todo как-то убрать тип отсюда т.к. он уже передается в Parameters
    /** Название параметра, у которого будет проставляться атрибут. По-умолчанию - корень компонента */
    to?: string,
    value?: string | number,
    readonly?: boolean,
};


type ParameterSetting = ValueParameterSetting | AttrParameterSetting;

export type ParameterSettings<TParams> = {
    [key in keyof TParams]: ParameterSetting
};

export type UpdatedParameters<TParams> = { [param in keyof TParams]?: {
    value: string | number,
    type?: ParameterType
} };

export class Component<TParams extends Parameters> {
    protected type: string;
    protected className: string;
    protected params: ParameterSettings<TParams>;
    public $body: JQuery<HTMLElement>;

    constructor(type: string, className: string, params: ParameterSettings<TParams>) {
        this.type = type;
        this.className = className;
        this.params = params;

        this.createBody();
    }

    protected createBody(): void {
        const $prototype = $(`#elements > .${this.className}`);

        this.$body = $prototype.clone();

        Object.entries(this.params).forEach(([param, { value, type }]) =>
            this.setValue(param, value, type)
        );

        this.postCreate();
        this.postChange();
    }

    protected postCreate(): void {
    }

    update(params?: UpdatedParameters<TParams>): void {
        if (params) {
            Object.entries(params).forEach(([param, { value, type }]) => {
                this.updateValue(param, value, type);
            });
        }

        this.postUpdate();
        this.postChange();
    }

    protected postUpdate(): void {
    }

    protected postChange(): void {
    }

    private setValue(param: string, newValue: string | number, type: ParameterType) {
        if (['attr', 'data-attr'].includes(type)) {
            let $attrChangingElement = this.$body;

            const to = (this.params[param] as AttrParameterSetting)?.to;
            if (to) {
                $attrChangingElement = this.getElement(to);
            }

            if (type === 'attr') {
                $attrChangingElement.attr(param, newValue);
            } else if (type === 'data-attr') {
                $attrChangingElement.data(param, newValue);
            }

            return;
        }

        const $element = this.getElement(param);

        if (!type || type === 'text') {
            $element.text(newValue);
        } else if (type === 'value') {
            $element.val(newValue);
        }
    }

    /**
     * Обновить значение в HTML элементе. Можно задать новое значение и использовать другой тип подстановки значения, если значение не задано первоначально
     */
    protected updateValue<TParams extends Parameters>(param: keyof TParams, newValue: string | number | undefined, type: ParameterType = 'text'): void {
        if (typeof (param) !== 'string') {
            return;
        }

        if (!this.params[param]) {
            if (newValue === undefined) {
                throw new Error('Не задано новое значение для установки в компонент напрямую');
            }
            
            this.setValue(param, newValue, type);

            return;
        }

        const paramOptions = this.params[param];

        if (paramOptions?.readonly) {
            throw new Error(`Параметр ${this.type}.${param} установлен только для чтения`);
        }

        if (newValue === undefined) {
            newValue = paramOptions?.value;

            if (newValue === undefined) {
                throw new Error(`Значение ${this.type}.${param} не задано`);
            }
        }

        if (paramOptions?.type) {
            type = this.params[param].type;
        }

        this.setValue(param, newValue, type);
    }

    private getElement(name: string): JQuery<HTMLElement> {
        return this.$body.find(`.${this.type}__${name}`);
    }

    getValue(param: string): string | number {
        if (this.params[param]) {
            return this.params[param].value
        }

        throw new Error(`Параметр ${this.type}.${param} не существует`);
    }
}