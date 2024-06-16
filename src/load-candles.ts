// Пример: npm run load-candles 2014-01-01

import { getDaySecuritiesCandles } from "./service/moex-service";

let dateFrom: any = process.argv[2];
if (dateFrom) {
    dateFrom = new Date(dateFrom);
}

getDaySecuritiesCandles(new Date(dateFrom), true);
