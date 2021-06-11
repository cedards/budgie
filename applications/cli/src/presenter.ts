import {leftpad, multichar, pad, removeColorCodes} from "./string-processing";

export function Presenter(out: (...strings: string[]) => any,) {
  return {
    printAsLedger<T>(title: string, data: { string: T }, valueFormatter: (value: T) => string = (value: T) => value.toString()) {
      const leftColumnWidth = Object.keys(data).reduce((max, next) => next.length > max ? next.length : max, 0) + 2
      const rightColumnWidth = Object.keys(data).reduce((max, next) => {
        const thisWidth = removeColorCodes(valueFormatter(data[next])).length;
        return thisWidth > max ? thisWidth : max
      }, 0)
      out(`\n${title}:`)
      Object.keys(data).forEach(item => {
        out(`  ${pad(item, leftColumnWidth, '.')}${leftpad(valueFormatter(data[item]), rightColumnWidth, '.')}`)
      })
      out("")
    },

    printAsTable<T>(title: string, data: T[], columns: Array<[string, (record: T) => string, "left" | "right"] | [string, (record: T) => string]>) {
      const columnWidths = data.reduce((widths, record) => {
        return columns.reduce((newWidths, [heading, getter]) => {
          const cellContents = getter(record);
          const columnWidthForThisRow = cellContents !== null && cellContents !== undefined
            ? removeColorCodes(cellContents).length
            : 0

          return {
            ...newWidths,
            [heading]: columnWidthForThisRow > newWidths[heading] ? columnWidthForThisRow : newWidths[heading]
          }
        }, widths)
      }, columns.reduce((initialWidths, [heading]) => (
        {...initialWidths, [heading]: heading.length}
      ), {}))

      const padders = {
        "left": pad,
        "right": leftpad
      }

      out(`${title}:\n`)
      out(columns.map(([heading, _, alignment = "left"]) => padders[alignment](heading, columnWidths[heading])).join(" | "))
      out(columns.map(([heading]) => multichar("-", columnWidths[heading])).join("-|-"))
      data.forEach(record => {
        out(columns.map(([heading, getter, alignment = "left"]) => padders[alignment](getter(record), columnWidths[heading])).join(" | "))
      })
    }
  }
}
