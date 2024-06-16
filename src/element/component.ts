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

export type UpdatedParameters<TParams> = {
    [param in keyof TParams]?: string | number
};

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
            Object.entries(params).forEach(([param, value]) => {
                this.updateValue(param, value);
            });
        }

        this.postUpdate();
        this.postChange();
    }

    protected postUpdate(): void {
    }

    protected postChange(): void {
    }

    /**
     * Обновить значение в HTML элементе. Можно задать новое значение и использовать другой тип подстановки значения, если значение не задано первоначально
     */
    protected updateValue(param: keyof TParams, newValue: string | number | undefined, type: ParameterType = 'text'): void {
        if (!this.params[param]) {
            if (newValue === undefined) {
                throw new Error('Не задано новое значение для установки в компонент напрямую');
            }

            this.setValue(param, newValue, type);

            return;
        }

        const paramOptions = this.params[param];

        if (paramOptions?.readonly) {
            throw new Error(`Параметр ${this.type}.${String(param)} установлен только для чтения`);
        }

        if (newValue === undefined) {
            newValue = paramOptions?.value;

            if (newValue === undefined) {
                throw new Error(`Значение ${this.type}.${String(param)} не задано`);
            }
        }

        if (paramOptions?.type) {
            type = this.params[param].type;
        }

        this.setValue(param, newValue, type);
    }

    private setValue(param: keyof TParams, newValue: string | number, type: ParameterType) {
        if (this.params[String(param)]) {
            this.params[String(param)].value = newValue;
        }
        
        if (['attr', 'data-attr'].includes(type)) {
            let $attrChangingElement = this.$body;

            const to = (this.params[param] as AttrParameterSetting)?.to;
            if (to) {
                $attrChangingElement = this.getElement(to);
            }

            if (type === 'attr') {
                $attrChangingElement.attr(String(param), newValue);
            } else if (type === 'data-attr') {
                $attrChangingElement.data(String(param), newValue);
            }

            return;
        }

        const $element = this.getElement(String(param));

        if (!type || type === 'text') {
            $element.text(newValue);
        } else if (type === 'value') {
            // $element.value = newValue;
            $element.val(newValue);
        }
    }

    getElement(name: string): JQuery<HTMLElement> {
        return this.$body.find(`.${this.type}__${name}`);
    }

    getValue<TType extends string | number>(param: keyof TParams): TType {
        if (this.params[String(param)]) {
            return this.params[String(param)].value;
        }

        throw new Error(`Параметр ${this.type}.${String(param)} не существует`);
    }


}