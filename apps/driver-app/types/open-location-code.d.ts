declare module 'open-location-code' {
  export function encode(lat: number, lng: number, length?: number): string;
  export function decode(code: string): {
    code: string;
    latitudeLo: number;
    longitudeLo: number;
    latitudeHi: number;
    longitudeHi: number;
  };
  export function isValid(code: string): boolean;
  export function isShort(code: string): boolean;
  export function isFull(code: string): boolean;
}