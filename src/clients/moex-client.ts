import axios, { AxiosInstance } from 'axios';
import CONFIG from '../app-config';
 
class MoexClient {
    baseUrl: string;
    api: AxiosInstance;

    constructor(baseUrl: string) {
        this.api = axios.create({
            baseURL: baseUrl,
            delayed: true
        });

        this.api.interceptors.request.use((config) => {
            if (config.delayed) {
              return new Promise(resolve => setTimeout(() => resolve(config), 5000));
            }
            return config;
          });
    }

    get(path, query: object = {}) {
        query['iss.meta'] = 'off';

        return this.api.get(`${path}.json`, {
            params: query
        });
    }

    securities(engine: string, market: string, query: object) {
        return this.get(`/iss/engines/${engine}/markets/${market}/securities`, query);
    }

    candleborders(engine: string, market: string, security: string) {
        return this.get(`/iss/engines/${engine}/markets/${market}/securities/${security}/candleborders`);
    }

    /** Возвращаются максимум 500 */
    candles(engine: string, market: string, security: string, query: object) {
        return this.get(`/iss/engines/${engine}/markets/${market}/securities/${security}/candles`, query);
    }

    securitiesIds(engine: string, market: string) {
        return this.securities(engine, market, {
            'iss.only': 'securities',
            'securities.columns': 'SECID'
        }).then(response => {
            return response.data.securities.data.map(security => security[0]);
        });
    }

    /** Возвращаются максимум 500 */
    monthCandles(engine: string, market: string, security: string) {
        return this.candles(engine, market, security, {
            'iss.only': 'candles',
            'candles.columns': 'open,close,high,low,volume,begin,end',
            'interval': '31',
        });
    }
    
    /** Возвращаются максимум 500 */
    dayCandles(engine: string, market: string, security: string, from: Date = undefined) {
        const query = {
            'iss.only': 'candles',
            'candles.columns': 'open,close,high,low,volume,begin,end',
            'interval': '24',
        };

        if (from) {
            // Записываем дату
            query['from'] = from.toISOString().slice(0, 10);
        }

        return this.candles(engine, market, security, query);
    }
}
 
const MOEX_CLIENT = new MoexClient(CONFIG.clients.moex.baseUrl);

export default MOEX_CLIENT;