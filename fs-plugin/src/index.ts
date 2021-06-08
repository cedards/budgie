import {EventStream, StreamEvent} from "@budgie/planning"
import { appendFile } from "fs/promises"
import * as lineReader from "line-reader"
import * as util from "util"

const eachLine = util.promisify((lineReader as any).eachLine)

export function FsEventStream(
  fileLocation: string,
  migrations: { [typeAndVersion: string]: (oldEvent) => StreamEvent} = {}
): EventStream {

  return {
    append(event: StreamEvent): Promise<void> {
      return appendFile(fileLocation, JSON.stringify(event)+"\n")
    },

    project<T>(fold: (result: T, event: StreamEvent) => T, initialValue: T): Promise<T> {
      let result: T = initialValue
      return eachLine(fileLocation, line => {
        let event = JSON.parse(line)
        while(migrations[`${event.type}__${event.version}`]) {
          event = migrations[`${event.type}__${event.version}`](event)
        }
        result = fold(result, event)
      }).then(() => result)
    }
  }
}
