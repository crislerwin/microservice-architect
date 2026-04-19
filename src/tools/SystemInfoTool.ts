import { DynamicTool } from "@langchain/core/tools";
import * as os from "node:os";

export class SystemInfoTool extends DynamicTool {
  constructor() {
    super({
      name: "get_system_info",
      description:
        "Returns information about the running system including OS, platform, and Node version.",
      func: async () => {
        return JSON.stringify(
          {
            platform: os.platform(),
            release: os.release(),
            type: os.type(),
            arch: os.arch(),
            nodeVersion: process.version,
            cpus: os.cpus().length,
            totalMem: os.totalmem(),
            freeMem: os.freemem(),
          },
          null,
          2
        );
      },
    });
  }
}
