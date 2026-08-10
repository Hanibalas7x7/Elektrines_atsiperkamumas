export function formatEuro(value: number): string {
  return new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

export function formatYears(value: number, yearsLabel: string): string {
  return `${value.toFixed(1)} ${yearsLabel}`
}

export function formatKwh(value: number): string {
  return `${new Intl.NumberFormat('lt-LT', { maximumFractionDigits: 0 }).format(value)} kWh`
}
