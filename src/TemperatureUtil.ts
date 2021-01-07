export function toCelsius(kelvin: number): number {
    return Math.round(kelvin - 273.15);
}

export function toFahrenheit(kelvin: number): number {
    return Math.round(((kelvin - 273.15) * 9) / 5 + 32);
}
