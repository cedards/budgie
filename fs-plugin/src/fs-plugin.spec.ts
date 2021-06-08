import * as os from "os"
import * as path from "path"
import { rm } from "fs/promises"
import {EventStream, StreamEvent} from "@budgie/planning"
import {FsEventStream} from "./index"

const TMPFILE_NAME = path.join(os.tmpdir(), "fs-plugin-spec-tmp-file.ndjson")

class TestEvent__V1 implements StreamEvent {
  type: string;
  version: number;
  thisOldValue: number
  thatOldValue: number

  constructor(thisValue: number, thatValue: number) {
    this.type = "TEST"
    this.version = 1
    this.thisOldValue = thisValue
    this.thatOldValue = thatValue
  }
}

class TestEvent implements StreamEvent {
  type: string;
  version: number;
  value: number

  constructor(value: number) {
    this.type = "TEST"
    this.version = 2
    this.value = value
  }
}

const TEST_EVENT_MIGRATIONS = {
  "TEST__1": (v1: TestEvent__V1) => new TestEvent(v1.thisOldValue + v1.thatOldValue)
}

describe("FsEventStream", () => {
  let eventStream: EventStream

  beforeEach(async () => {
    eventStream = await FsEventStream(
      TMPFILE_NAME,
      TEST_EVENT_MIGRATIONS
    )
  })

  afterEach(async () => {
    await rm(TMPFILE_NAME)
  })

  it("does EventStream things", async () => {
    await eventStream.append(new TestEvent__V1(4, 6))
    await eventStream.append(new TestEvent(2))
    await eventStream.append(new TestEvent(3))

    expect(
      await eventStream.project((result, next) => result + (next as TestEvent).value, 0)
    ).toEqual(15)
  })
})
