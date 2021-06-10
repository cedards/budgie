import {Cli, Commands} from "./cli";
import {FsEventStream} from "@budgie/fs-plugin";
import * as path from "path";
import * as os from "os";
import {EVENT_MIGRATIONS} from "@budgie/planning";

(async function() {
  const eventStream = await FsEventStream(
    path.join(os.homedir(), ".budgie", "event-stream.ndjson"),
    EVENT_MIGRATIONS,
  )
  let args = process.argv.splice(2)
  let commands = Commands(eventStream, console.log)

  await Cli(console.log, commands).execute(args)

})()
