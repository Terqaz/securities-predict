import axios, { AxiosInstance } from 'axios';
import CONFIG from '../app-config';
 
class MoexClient {
    baseUrl: string;
    api: AxiosInstance;

    constructor(baseUrl: string) {
        this.api = axios.create({
            baseURL: CONFIG.clients.moex.baseUrl
        });
    }

    get(path, params = {}) {
        params['iss.meta'] = 'off';

        return this.api.get(`${path}.json`, {
            params
        });
    }

    securities(engine, market, params) {
        return this.get(`/iss/engines/${engine}/markets/${market}/securities`, params);
    }

    candleborders(engine, market, security) {
        return this.get(`/iss/engines/${engine}/markets/${market}/securities/${security}/candleborders`);
    }

    candles(engine, market, security, params) {
        return this.get(`/iss/engines/${engine}/markets/${market}/securities/${security}/candles`, params);
    }

    securitiesIds(engine, market) {
        return this.securities(engine, market, {
            'iss.only': 'securities',
            'securities.columns': 'SECID'
        }).then(response => {
            return response.data.securities.data.map(security => security[0]);
        });
    }

    candles31(engine, market, security) {
        return this.candles(engine, market, security, {
            'iss.only': 'candles',
            'candles.columns': 'open,close,high,low,volume,begin,end',
            'interval': '31',
        });
    }
}

export const MOEX_CLIENT = new MoexClient(CONFIG.clients.moex.baseUrl);
