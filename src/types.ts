export type Candle = [
    number, // 0: open
    number, // 1: close
    number, // 2: high
    number, // 3: low
    number, // 4: volume
    string, // 5: begin
    string, // 6: end
];

export type NormalizedCandle = [
    number, // 0: open
    number, // 1: close
    number, // 2: high
    number, // 3: low
    number, // 4: volume
    number, // 5: begin
    number, // 6: end
];

export const EMPTY_CANDLE: NormalizedCandle = [0, 0, 0, 0, 0, 0, 0];

export const CANDLE_INDEX_OPEN = 0;
export const CANDLE_INDEX_CLOSE = 1;
export const CANDLE_INDEX_HIGH = 2;
export const CANDLE_INDEX_LOW = 3;
export const CANDLE_INDEX_VOLUME = 4;
export const CANDLE_INDEX_BEGIN = 5;
export const CANDLE_INDEX_END = 6;

export const CANDLE_LENGTH = 7;

export type SecuritiesCandles = {
    [key: string]: Candle[]
};

export type NormalizationContext = {
    securityIdsMap: string[] // Названия ценных бумаг по порядковому номеру (индексу)
};

// Первый индекс - порядковый номер ценной бумаги
export type NormalizedSecuritiesCandles = NormalizedCandle[][];

export type NormalizationResult = {
    candles: NormalizedSecuritiesCandles,
    normalizationContext: NormalizationContext
}


export type TypedArray =
    | Int8Array
    | Uint8Array
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array
;

export type NumberArray = 
    | TypedArray
    | number[]
;