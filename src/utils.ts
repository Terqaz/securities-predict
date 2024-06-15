import * as fs from 'fs';
import * as path from 'path';

export const MAX_TIMESTAMP = 2147483648;

const EPSILON = 1e-12;
const DBL_EPSILON = Number.EPSILON || 2.2204460492503130808472633361816E-16

export function compare(x: number, y: number) {
  return nearlyEqual(x, y)
    ? 0
    : (x > y ? 1 : -1)
}

function nearlyEqual(x: number, y: number): boolean {
  const diff = Math.abs(x - y)
  if (diff <= DBL_EPSILON) {
    return true
  }

  // use relative error
  return diff <= Math.max(Math.abs(x), Math.abs(y)) * EPSILON;
}

/**
 * Fisher-Yates Algorithm
 */
export function shuffle<Type>(array: Type[]): Type[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }

  return array;
};

export function writeJsonFile(filepath: string, data: any, beautify: boolean = false): void {
  const dir = path.dirname(filepath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, JSON.stringify(data, null, beautify ? 2 : null))
}

export function readJsonFile(filepath: string) {
  return JSON.parse(fs.readFileSync(filepath).toString())
}

export function logExit(message: any) {
  console.log(message);
  process.exit(0);
}