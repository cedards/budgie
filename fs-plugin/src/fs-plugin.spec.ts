import * as os from "os"
import * as path from "path"
import { rm } from "fs/promises"
import {EventStream, StreamEvent} from "@budgie/planning"
import {FsEventStream} from "./index"

const TMPFILE_NAME = path.join(os.tmpdir(), "fs-plugin-spec-tmp-file.ndjson")

class TestEvent implements StreamEvent {
  type: string;
  version: number;
  value: number

  constructor(value: number) {
    this.type = "TEST"
    this.version = 1
    this.value = value
  }
}

describe("FsEventStream", () => {
  let eventStream: EventStream

  beforeEach(async () => {
    eventStream = await FsEventStream(TMPFILE_NAME)
  })

  afterEach(async () => {
    await rm(TMPFILE_NAME)
  })

  it("does EventStream things", async () => {
    await eventStream.append(new TestEvent(1))
    await eventStream.append(new TestEvent(2))
    await eventStream.append(new TestEvent(3))

    expect(
      await eventStream.project((result, next) => result + (next as TestEvent).value, 0)
    ).toEqual(6)
  })
})
