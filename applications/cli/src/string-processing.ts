export const cents = (str: string) => Math.round(parseFloat(str) * 100)
export const formatAsDollars = (cents: number) => {
  const absoluteCents = Math.abs(cents)
  const baseString = `${Math.floor(absoluteCents / 100)}.${absoluteCents % 100 < 10 ? 0 : ''}${absoluteCents % 100}`
  return cents < 0
    ? `\x1b[91m-${baseString}\x1b[39m`
    : baseString
}
export const multichar = (char: string, num: number) => {
  let str = ""
  for (let i = 0; i < num; i++) str += char
  return str
}
export const removeColorCodes = str => str.replace(/\x1b\[\d+m/g, '')
export const pad = (str: string, length: number, spacer: string = ' ') => {
  return `${str}${multichar(spacer, length - removeColorCodes(str).length)}`
}
export const leftpad = (str: string, length: number, spacer: string = ' ') => {
  return `${multichar(spacer, length - removeColorCodes(str).length)}${str}`
}

export function parseAmount(amount: string) {
  if (amount.indexOf("=") === -1) return {"_": cents(amount)}
  return amount.split(",").reduce((itemizedAmounts, entry) => {
    const [target, subamount] = entry.split("=")
    return {
      ...itemizedAmounts,
      [target]: (itemizedAmounts[target] || 0) + cents(subamount)
    }
  }, {})
}
